#!/usr/bin/env node
/**
 * Secret guard — fails when a credential-shaped string enters the tracked tree.
 *
 * WHY THIS EXISTS
 * GitHub's secret scanning and push protection are free only on **public** repositories;
 * this repository is **private**, where they need GitHub Secret Protection. Rather than
 * pay for them, the same job is done here, at the level that matters for this project:
 * a change that would commit a real credential fails CI instead of being noticed later.
 *
 * WHAT IT IS NOT
 * It is pattern matching over tracked file contents. It cannot see a credential that is
 * committed *obfuscated*, split across lines, or stored in a value that looks like data.
 * It is a net for the common, high-signal shapes — not a proof that a commit is clean.
 * See docs/SOURCE_PROTECTION.md for what this does and does not protect.
 *
 * DESIGN NOTES, all deliberate:
 *   * High-signal patterns only. A generic "assignment to something called SECRET" rule
 *     was rejected because the suites contain fixed, non-secret test values on purpose
 *     (e.g. JWT_SECRET in .github/workflows/ci.yml), and a scanner that red-lights
 *     deliberate fixtures is a scanner people learn to bypass.
 *   * A private key block is judged by its BODY LENGTH, not its header: the Firebase
 *     suites legitimately carry dummy PEM blocks with bodies like `abc` or `MIIabc`,
 *     while a real key body is well over a thousand characters.
 *   * Every finding can be waived **on the line itself** with `secret-guard:allow`, so a
 *     deliberate exception is visible in review instead of being hidden in a list here.
 *
 * USAGE
 *   node scripts/check-secrets.mjs              # every tracked file (what CI runs)
 *   node scripts/check-secrets.mjs path...      # explicit files (used by the tests)
 *
 * Exit codes: 0 clean, 1 findings, 2 could not run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const WAIVER = /secret-guard:allow/;

/** Skip content that cannot be a credential and is expensive to scan. */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svgz', 'ttf', 'otf', 'woff', 'woff2',
  'eot', 'zip', 'gz', 'tgz', 'bz2', 'xz', 'pdf', 'jar', 'apk', 'aab', 'ipa', 'so', 'dylib',
  'dll', 'exe', 'bin', 'class', 'jks', 'keystore', 'p12', 'pfx', 'xlsx', 'docx', 'mp4', 'mov',
]);
const MAX_BYTES = 2 * 1024 * 1024;

/** A PEM block is only a real key when its body is long enough to be one. */
const MIN_KEY_BODY = 200;

const RULES = [
  { name: 'private-key-block', re: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/, pem: true },
  { name: 'mongodb-uri-with-credentials', re: /mongodb(?:\+srv)?:\/\/[^\s:'"`/]+:[^\s@'"`]+@/ },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'aws-access-key-id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'openai-or-anthropic-key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'resend-key', re: /\bre_[A-Za-z0-9_]{20,}\b/ },
  { name: 'brevo-key', re: /\bxkeysib-[A-Za-z0-9-]{20,}\b/ },
  { name: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { name: 'github-token', re: /\b(?:ghp|gho|ghs|ghr|ghu)_[A-Za-z0-9]{30,}\b/ },
  { name: 'github-fine-grained-pat', re: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'stripe-secret-key', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  {
    name: 'firebase-service-account',
    re: /"type"\s*:\s*"service_account"/,
  },
  {
    name: 'signed-jwt',
    re: /\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  },
];

/** A tracked env file is a finding regardless of content — `.env.example` is the exception. */
function isForbiddenEnvFile(path) {
  const parts = path.split(/[\\/]/);
  const base = parts[parts.length - 1];
  if (base === '.env.example') return false;
  return /^\.env(\..+)?$/.test(base);
}

function mask(value) {
  const cleaned = value.trim();
  return cleaned.length <= 8 ? cleaned : `${cleaned.slice(0, 4)}…(${cleaned.length} chars)`;
}

/** A PEM header is only reported when a real body follows it. */
function pemBodyIsReal(content, index) {
  const rest = content.slice(index);
  const end = rest.indexOf('-----END');
  const body = (end === -1 ? rest : rest.slice(0, end)).replace(/[^A-Za-z0-9+/=]/g, '');
  return body.length >= MIN_KEY_BODY;
}

function relative(path) {
  return path.startsWith('./') ? path.slice(2) : path;
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

function scanFile(displayPath, findings) {
  const ext = displayPath.split('.').pop().toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return;

  let content;
  try {
    const stat = readFileSync(displayPath, { encoding: 'utf8', flag: 'r' });
    content = stat;
  } catch {
    return; // unreadable (deleted, binary-as-UTF8 failure) — not this tool's concern
  }
  if (content.length > MAX_BYTES) return;

  const lines = content.split(/\r\n|\n|\r/);
  let searchFrom = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Locate each line by searching, rather than by arithmetic. The first version of
    // this file assumed LF endings and advanced the offset by `line.length + 1`, which
    // drifts by one character per preceding CRLF line — on this repository that made the
    // private-key body test read from the wrong offset and report a dummy
    // `-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----` fixture as a real key.
    // Found by running the guard against the real tree, not by reading it.
    const found = content.indexOf(line, searchFrom);
    const lineIndexInContent = found === -1 ? searchFrom : found;
    searchFrom = lineIndexInContent + line.length;
    if (WAIVER.test(line)) continue;

    for (const rule of RULES) {
      const match = rule.re.exec(line);
      if (!match) continue;
      if (rule.pem && !pemBodyIsReal(content, lineIndexInContent + match.index)) continue;
      findings.push({
        path: displayPath,
        line: i + 1,
        rule: rule.name,
        preview: mask(match[0]),
      });
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const explicit = args.filter((a) => !a.startsWith('-'));
  const files = explicit.length > 0 ? explicit.map(relative) : trackedFiles();

  const findings = [];
  for (const path of files) {
    if (isForbiddenEnvFile(path)) {
      findings.push({ path, line: 1, rule: 'tracked-env-file', preview: 'a real .env must never be tracked' });
      continue;
    }
    scanFile(path, findings);
  }

  console.log(`secret-guard: scanned ${files.length} file(s)`);
  if (findings.length === 0) {
    console.log('secret-guard: no credential-shaped content found');
    return 0;
  }

  for (const f of findings) {
    console.log(`::error file=${f.path},line=${f.line}::${f.rule} in ${f.path}:${f.line} (${f.preview})`);
  }
  console.log('');
  console.log(`secret-guard: ${findings.length} finding(s).`);
  console.log('If a finding is a deliberate test fixture, add `secret-guard:allow` to that line;');
  console.log('otherwise remove the credential, rotate it, and assume it was exposed.');
  return 1;
}

process.exitCode = main();
