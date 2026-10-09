#!/usr/bin/env node
/**
 * Access audit — checks that this repository is still private and owner-only.
 *
 * WHY THIS EXISTS
 * The intended policy is: this repository stays **private**, the owner is the
 * **only human** with access, and no copy exists. Nothing enforces that policy on
 * this plan — branch protection and rulesets answer `403`, secret scanning is a
 * public-repository-only feature, and the daily `access-guard` workflow was removed
 * on 2026-10-09 to keep the workflow minimal. So this script IS the access check:
 * a credential that can read the `Administration`-level endpoints (collaborators,
 * invitations, deploy keys, webhooks) is required, which is why it runs against the
 * owner's own authenticated `gh` session instead of in CI, where `GITHUB_TOKEN`
 * answers 403 for all of them. Run it by hand — ideally before and after anything
 * that touches repository settings, and whenever access is on your mind.
 *
 * WHAT IT ASSERTS (exit 1 on any violation)
 *   * the repository is private
 *   * the only collaborator is the owner
 *   * there are no pending invitations
 *   * there are no deploy keys
 *   * there are no webhooks
 *   * it has no forks and no fork network
 *
 * WHAT IT ONLY REPORTS (never fails)
 * Things that are legitimate but worth seeing: Actions secrets, environments, the
 * Actions policy, and the private-repository sharing level. Also reported are the
 * settings this plan cannot provide at all — branch protection, repository
 * rulesets, secret scanning — so their absence is visible rather than forgotten.
 * Secret VALUES are never read or printed; only names.
 *
 * WHAT IT CANNOT DO
 * It cannot see GitHub Apps with repository access (`GET /user/installations`
 * needs a token authorised to an App, and the repository installation endpoint
 * needs an App JWT), it cannot list SSH/GPG keys or classic personal access tokens
 * without extra OAuth scopes, and it cannot see account 2FA state. Those are
 * owner-side checks in docs/SOURCE_PROTECTION.md.
 *
 * USAGE
 *   node scripts/audit-access.mjs            # audit the origin remote's repository
 *   node scripts/audit-access.mjs owner/repo # audit an explicit repository
 *
 * It is NOT wired into CI on purpose: in CI every administration-level endpoint answers
 * 403, so it could only report "not verified", which is worse than an honest manual run.
 *
 * Exit codes: 0 clean, 1 violation, 2 could not run.
 */

import { execFileSync } from 'node:child_process';

const violations = [];
const notes = [];

function gh(args) {
  try {
    const out = execFileSync('gh', ['api', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 200, data: out.trim() === '' ? null : JSON.parse(out) };
  } catch (error) {
    const text = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/command not found|ENOENT/.test(String(error.message))) {
      console.error('Could not run: the GitHub CLI (`gh`) is not available.');
      process.exit(2);
    }
    const match = /HTTP (\d{3})/.exec(text);
    if (/auth login|not logged in|authentication/i.test(text) && !match) {
      console.error('Could not run: `gh` is not authenticated. Run `gh auth login` first.');
      process.exit(2);
    }
    return { status: match ? Number(match[1]) : 0, data: null };
  }
}

function repositorySlug() {
  const explicit = process.argv[2];
  if (explicit) return explicit;
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const match = /github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/.exec(remote);
    if (match) return match[1];
  } catch {
    /* fall through to the error below */
  }
  console.error('Could not determine the repository. Pass it explicitly: node scripts/audit-access.mjs owner/repo');
  process.exit(2);
}

const repo = repositorySlug();
const owner = repo.split('/')[0];

function pass(label, detail) {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail) {
  violations.push(label);
  console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}
function info(label, detail) {
  console.log(`  INFO  ${label}${detail ? ` — ${detail}` : ''}`);
}
function notVerifiable(label, status) {
  notes.push(label);
  console.log(`  ????  ${label} — not verifiable here (HTTP ${status || 'request failed'})`);
}

console.log(`\nAccess audit · ${repo}\n`);

// --- Visibility and copies (the surface CI can also see) ---------------------

console.log('Visibility and copies');

const meta = gh([`repos/${repo}`]);
if (meta.status !== 200 || !meta.data) {
  console.error(`Could not read the repository (HTTP ${meta.status}).`);
  process.exit(2);
}

if (meta.data.private === true) {
  pass('repository is private', `visibility=${meta.data.visibility}`);
} else {
  fail('repository is NOT private', `visibility=${meta.data.visibility} — the source is exposed`);
}

const forks = meta.data.forks_count ?? 0;
const network = meta.data.network_count ?? 0;
if (forks === 0 && network === 0) {
  pass('no forks and no fork network', 'forks_count=0, network_count=0');
} else {
  fail('a fork or fork network exists', `forks_count=${forks}, network_count=${network}`);
}

if (meta.data.allow_forking === true) {
  info(
    'allow_forking is on and cannot be turned off',
    'the API answers 422 for personal private repositories; forking still requires read access',
  );
}
if (meta.data.owner?.type === 'Organization') {
  info('owned by an organization', meta.data.owner.login);
}

// --- Humans with access ------------------------------------------------------

console.log('\nHuman access');

const collaborators = gh([`repos/${repo}/collaborators?affiliation=all&per_page=100`]);
if (collaborators.status === 200 && Array.isArray(collaborators.data)) {
  const others = collaborators.data.filter((entry) => entry.login !== owner);
  const ownerEntry = collaborators.data.find((entry) => entry.login === owner);
  if (others.length === 0) {
    pass('the owner is the only collaborator', `admin=${ownerEntry ? ownerEntry.permissions?.admin === true : 'unread'}`);
  } else {
    fail('another account has access', others.map((entry) => `${entry.login} (${entry.role_name})`).join(', '));
  }
} else {
  notVerifiable('collaborators', collaborators.status);
}

const invitations = gh([`repos/${repo}/invitations?per_page=100`]);
if (invitations.status === 200 && Array.isArray(invitations.data)) {
  if (invitations.data.length === 0) {
    pass('no pending invitations');
  } else {
    fail('pending invitations exist', invitations.data.map((entry) => entry.invitee?.login).join(', '));
  }
} else {
  notVerifiable('pending invitations', invitations.status);
}

const twoFactor = gh([`users/${owner}`]);
if (twoFactor.status === 200 && twoFactor.data) {
  if (twoFactor.data.two_factor_authentication === true) {
    pass('account 2FA is enabled');
  } else {
    notes.push('Account 2FA could not be confirmed over the API — check https://github.com/settings/security');
    info(
      'account 2FA is not confirmable over the API',
      'the field is null for this token; verify it in Settings → Password and authentication',
    );
  }
}

// --- Machine access ----------------------------------------------------------

console.log('\nMachine access');

for (const [label, path] of [
  ['deploy keys', `repos/${repo}/keys?per_page=100`],
  ['webhooks', `repos/${repo}/hooks?per_page=100`],
]) {
  const result = gh([path]);
  if (result.status === 200 && Array.isArray(result.data)) {
    if (result.data.length === 0) {
      pass(`no ${label}`);
    } else {
      fail(`${label} exist`, result.data.map((entry) => entry.title ?? entry.config?.url ?? entry.id).join(', '));
    }
  } else {
    notVerifiable(label, result.status);
  }
}

const secrets = gh([`repos/${repo}/actions/secrets?per_page=100`]);
if (secrets.status === 200 && Array.isArray(secrets.data?.secrets)) {
  info(
    'Actions secrets',
    secrets.data.secrets.length === 0
      ? 'none (no credential exists in this repository)'
      : secrets.data.secrets.map((entry) => entry.name).join(', '),
  );
} else {
  notVerifiable('Actions secrets', secrets.status);
}

const environments = gh([`repos/${repo}/environments?per_page=100`]);
if (environments.status === 200 && Array.isArray(environments.data?.environments)) {
  info(
    'deployment environments',
    environments.data.environments.length === 0
      ? 'none'
      : environments.data.environments.map((entry) => entry.name).join(', '),
  );
} else {
  notVerifiable('deployment environments', environments.status);
}

// --- Workflow trust surface --------------------------------------------------

console.log('\nWorkflow trust surface');

const actionsPolicy = gh([`repos/${repo}/actions/permissions`]);
if (actionsPolicy.status === 200 && actionsPolicy.data) {
  info(
    'allowed actions',
    `${actionsPolicy.data.allowed_actions}, sha_pinning_required=${actionsPolicy.data.sha_pinning_required}`,
  );
} else {
  notVerifiable('Actions policy', actionsPolicy.status);
}

const workflowDefault = gh([`repos/${repo}/actions/permissions/workflow`]);
if (workflowDefault.status === 200 && workflowDefault.data) {
  info(
    'default GITHUB_TOKEN permissions',
    `${workflowDefault.data.default_workflow_permissions}, can_approve_pull_request_reviews=${workflowDefault.data.can_approve_pull_request_reviews}`,
  );
} else {
  notVerifiable('workflow token default', workflowDefault.status);
}

const sharing = gh([`repos/${repo}/actions/permissions/access`]);
if (sharing.status === 200 && sharing.data) {
  info('actions shared with other repositories', sharing.data.access_level);
} else {
  notVerifiable('private-repository sharing', sharing.status);
}

// --- Protections this plan cannot provide ------------------------------------

console.log('\nPlatform protections (measured, not assumed)');

const protection = gh([`repos/${repo}/branches/${meta.data.default_branch}/protection`]);
const rulesets = gh([`repos/${repo}/rulesets`]);
const scanning = meta.data.security_and_analysis;

for (const [label, result] of [
  ['branch protection', protection],
  ['repository rulesets', rulesets],
]) {
  if (result.status === 200) {
    info(`${label} available`, 'GET succeeded');
  } else if (result.status === 403) {
    notes.push(`${label} is unavailable on this plan (403)`);
    info(`${label} unavailable`, 'HTTP 403 — expected on this plan for a private repository');
  } else {
    notVerifiable(label, result.status);
  }
}

if (scanning === null || scanning === undefined) {
  notes.push('secret scanning and push protection are unavailable (public-repository-only features)');
  info('secret scanning / push protection', 'unavailable on this plan — replaced by scripts/check-secrets.mjs');
} else {
  info('secret scanning', JSON.stringify(scanning));
}

// --- Verdict -----------------------------------------------------------------

const summary = [];
summary.push(violations.length === 0 ? 'No policy violations found.' : `${violations.length} violation(s):`);
for (const violation of violations) summary.push(`  - ${violation}`);
if (notes.length > 0) {
  summary.push('Unverified or unavailable (not a pass):');
  for (const note of notes) summary.push(`  - ${note}`);
}
console.log(`\n${summary.join('\n')}\n`);

process.exit(violations.length === 0 ? 0 : 1);
