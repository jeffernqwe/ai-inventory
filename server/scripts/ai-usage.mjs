// `npm run ai:usage` — the assistant's own usage and failure report, READ-ONLY.
//
// WHY THIS EXISTS. The decision that is still open (ISS-22: whether the assistant stays on
// the free tier) needs one kind of evidence: how much of the allowance real turns spend, and
// what is failing. The tools that existed could not supply it. `perf:turns` measures real
// turns and SPENDS quota (~50 free requests a day IN TOTAL, §27BF) — the instrument consumes
// the thing being measured; the per-turn cost line (`[ai] turn …`, AI-5) records what every
// real turn actually cost, but nothing read those lines back. This script reads them, and
// asks the provider's own account how much of the allowance is left.
//
// IT MEASURES TWO THINGS AND JOINS THEM:
//   1. THE LOG, from `[ai] turn …` lines (AI-5) — turns, outcomes, provider requests, tool
//      rounds, empty completions, tokens, the model, and the provider/tool time split. The
//      number that matters most for a REQUEST-counting allowance is `calls`, summed: a
//      single member turn costs 1–3 provider requests (a tool round costs another call), so
//      "turns per day" is only derivable from the log.
//   2. THE PROVIDER, from `GET {OPENROUTER_BASE_URL}/v1/key` — the authoritative daily
//      free-model counter (`free_model_daily_requests`) and whether this key is on the free
//      tier at all. A GET is free and reads no model.
//
// IT IS READ-ONLY IN BOTH DIRECTIONS, and that is the whole point: no model is called, no
// database is touched, nothing is written, and no request spends quota — which is what makes
// it safe to run whenever the question comes up, rather than once.
//
// NO CREDENTIAL CAN REACH THE OUTPUT. The key is read from the environment and sent only in
// the request header. The provider's own body carries a masked `label`, which is omitted
// here rather than echoed, and nothing from the log is reprinted verbatim — a log line can
// contain a credential (a bad `.env` echo or a crash dump), and this tool prints NUMBERS it
// has parsed out of lines, never the lines.
//
// HOW TO RUN. `npm run ai:usage -- --log=<path>` reads a saved log; with no `--log` it reads
// stdin, so `npm start > server.log` (or a pipe) works. `--no-provider` skips the network.
// `--json` prints the same figures as one object. `--self-test` runs the controls only.
//
// EXIT CODES, kept apart for the reason §27BP gives — each one is a distinct claim:
//   0  a report was produced (an UNREADABLE provider section is a row in it, never a failure)
//   1  a control failed, so the report was not produced at all
//   2  NOT VERIFIED — no log could be read (a missing path, or no `--log` on a terminal), so
//      nothing was measured. Reporting zero turns here would read as "never used".
//
// ABSENT IS NOT ZERO, in both directions: a turn line missing a field contributes NOTHING to
// that sum (and is counted as malformed so the reader knows the columns are partial), and a
// provider body missing a counter reports `null` rather than 0. That rule is AI-10's, applied
// to a report whose entire job is to be trusted: "not measured" must never print as "none".

import 'dotenv/config';
import fs from 'node:fs';
import process from 'node:process';

/** Every field a complete `[ai] turn` line carries (AI-5's shape, in ai.service.ts). */
const TURN_FIELDS = [
  'outcome',
  'total',
  'providerMs',
  'toolMs',
  'calls',
  'toolRuns',
  'empty',
  'in',
  'out',
  'model',
  'iterations',
  'tools',
];

const DEFAULT_BASE_URL = 'https://openrouter.ai/api';

/** First match of `name=<value>` in a line, or null. Values stop at whitespace. */
function field(line, name) {
  const m = new RegExp(`(?:^|\\s)${name}=([^\\s]+)`).exec(line);
  return m ? m[1] : null;
}

/** First match of `name=<digits>` in a line as a number, or null when absent. */
function numField(line, name) {
  const raw = field(line, name);
  if (raw === null) return null;
  const stripped = raw.endsWith('ms') ? raw.slice(0, -2) : raw;
  if (!/^\d+$/.test(stripped)) return null;
  return Number.parseInt(stripped, 10);
}

/**
 * Parse a log (or any text) into the turns it recorded.
 *
 * A `[ai] turn` line is counted even when it is incomplete — a restart can cut one in half,
 * and dropping it would UNDERSTATE usage, which is the one direction a quota report must not
 * err in. Its present fields are used; its absent ones contribute nothing; and it is named in
 * `malformed` so a reader knows some columns are partial.
 *
 * `[ai] degraded turn …` (AI-2) is deliberately NOT a turn: it is a second line about a turn
 * already recorded, so counting it would inflate the turn count on exactly the turns that had
 * trouble.
 */
export function parseLog(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const turns = [];
  let malformed = 0;
  let degradedWarnings = 0;

  for (const line of lines) {
    if (line.includes('[ai] degraded turn')) {
      degradedWarnings += 1;
      continue;
    }
    if (!line.includes('[ai] turn outcome=')) continue;

    const record = {};
    for (const name of TURN_FIELDS) record[name] = name === 'tools' ? (field(line, 'tools') ?? null) : numField(line, name);
    record.outcome = field(line, 'outcome');
    record.model = field(line, 'model');
    record.tools = field(line, 'tools');
    const complete = TURN_FIELDS.every((name) => record[name] !== null && record[name] !== '');
    if (!complete) malformed += 1;
    record.malformed = !complete;
    turns.push(record);
  }

  return { turns, malformed, degradedWarnings };
}

const sum = (values) => values.reduce((a, b) => a + b, 0);

/**
 * The figures a reader wants, computed from the parsed turns.
 *
 * `providerShare` is the ratio of the two SUMS rather than the average of per-turn shares:
 * it answers "where did this member's waiting go overall", and averaging per-turn shares
 * would let a 200 ms turn weigh as much as a 20 s one.
 */
export function summarize(parsed) {
  const turns = parsed.turns;
  const outcomeCounts = {};
  for (const t of turns) {
    const key = t.outcome ?? 'UNKNOWN';
    outcomeCounts[key] = (outcomeCounts[key] ?? 0) + 1;
  }
  const providerMs = sum(turns.map((t) => t.providerMs ?? 0));
  const toolMs = sum(turns.map((t) => t.toolMs ?? 0));
  const totalMs = sum(turns.map((t) => t.total ?? 0));
  const providerRequests = sum(turns.map((t) => t.calls ?? 0));
  const models = [...new Set(turns.map((t) => t.model).filter((m) => m && m !== 'unknown'))].sort();

  return {
    turns: turns.length,
    outcomes: outcomeCounts,
    malformed: parsed.malformed,
    degradedWarnings: parsed.degradedWarnings,
    providerRequests,
    toolRuns: sum(turns.map((t) => t.toolRuns ?? 0)),
    emptyResponses: sum(turns.map((t) => t.empty ?? 0)),
    tokens: { input: sum(turns.map((t) => t.in ?? 0)), output: sum(turns.map((t) => t.out ?? 0)) },
    providerMs,
    toolMs,
    totalMs,
    providerShare: totalMs ? Number((providerMs / totalMs).toFixed(4)) : null,
    requestsPerTurn: turns.length ? Number((providerRequests / turns.length).toFixed(2)) : null,
    models,
  };
}

/** A number, or `null` when the provider did not report one — never a zero. */
function numOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The safe slice of the provider's `/v1/key` body.
 *
 * `label` is DELIBERATELY NOT RETURNED. The provider masks it as `sk-or-v1-e38...8ec`, but a
 * masked credential is still a credential fragment, and this report is written to be
 * pasted into a record.
 */
export function providerUsage(body) {
  const d = body?.data ?? body ?? {};
  const daily = d.free_model_daily_requests ?? null;
  return {
    isFreeTier: typeof d.is_free_tier === 'boolean' ? d.is_free_tier : null,
    daily: daily
      ? {
          used: numOrNull(daily.used),
          limit: numOrNull(daily.limit),
          remaining: numOrNull(daily.remaining),
        }
      : null,
    paidUsage: numOrNull(d.usage),
    paidUsageDaily: numOrNull(d.usage_daily),
    paidUsageMonthly: numOrNull(d.usage_monthly),
    creditLimit: numOrNull(d.limit),
    creditRemaining: numOrNull(d.limit_remaining),
  };
}

/** How many whole turns the remaining allowance buys at the measured cost per turn. */
export function capacity(remaining, requestsPerTurn) {
  if (!Number.isFinite(remaining) || remaining < 0) return null;
  if (!Number.isFinite(requestsPerTurn) || requestsPerTurn <= 0) return null;
  return Math.floor(remaining / requestsPerTurn);
}

/**
 * Ask the provider's own account. A GET, so it is free and reads no model.
 *
 * Nothing here can throw: an unreachable or undecodable answer is `UNREADABLE`, which the
 * report prints as a row. That is the same rule the upgrade watches follow — a reading that
 * failed must not look like a reading that came back clean.
 */
export async function readProviderUsage({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch } = {}) {
  const key = (apiKey ?? '').trim();
  if (!key) return { status: 'NOT_CONFIGURED', detail: 'OPENROUTER_API_KEY is not set in this environment' };
  const url = `${String(baseUrl).trim().replace(/\/+$/, '')}/v1/key`;
  try {
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) return { status: 'UNREADABLE', detail: `HTTP ${res.status}` };
    let body;
    try {
      body = await res.json();
    } catch {
      return { status: 'UNREADABLE', detail: 'the answer was not JSON' };
    }
    return { status: 'OK', ...providerUsage(body) };
  } catch (err) {
    return { status: 'UNREADABLE', detail: `the request failed (${err?.name ?? 'error'})` };
  }
}

/** The human report. Reads `summary` and `provider`; never reads the log or the key. */
export function formatReport({ summary, provider, source }) {
  const out = [];
  const dash = (v) => (v === null || v === undefined ? 'n/a' : String(v));
  out.push('[ai-usage] read-only report — no model was called and no quota was spent');
  out.push(`  source: ${source}`);
  out.push('');
  out.push(`  turns: ${summary.turns}${summary.malformed ? ` (${summary.malformed} malformed — counted, with partial columns)` : ''}`);
  const outcomes = Object.entries(summary.outcomes).sort((a, b) => b[1] - a[1]);
  out.push(`  outcomes: ${outcomes.length ? outcomes.map(([k, v]) => `${k}=${v}`).join(' ') : 'none'}`);
  out.push(`  provider requests: ${summary.providerRequests} across ${summary.turns} turn(s) → ${dash(summary.requestsPerTurn)} per turn`);
  out.push(`  tool rounds: ${summary.toolRuns} · empty completions: ${summary.emptyResponses} · degraded warnings: ${summary.degradedWarnings}`);
  out.push(`  time: provider ${summary.providerMs} ms · tools ${summary.toolMs} ms · total ${summary.totalMs} ms (provider share ${summary.providerShare === null ? 'n/a' : summary.providerShare})`);
  out.push(`  tokens: in ${summary.tokens.input} · out ${summary.tokens.output}`);
  out.push(`  models: ${summary.models.length ? summary.models.join(', ') : 'none named'}`);
  out.push('');
  if (provider.status === 'OK') {
    out.push('  provider account (GET /v1/key — read-only):');
    out.push(`    free tier: ${dash(provider.isFreeTier)}`);
    if (provider.daily) {
      out.push(`    free-model requests today: ${dash(provider.daily.used)} used of ${dash(provider.daily.limit)} · ${dash(provider.daily.remaining)} remaining`);
      const turns = capacity(provider.daily.remaining, summary.requestsPerTurn);
      out.push(
        `    → at ${dash(summary.requestsPerTurn)} request(s) per turn, the remaining allowance is about ${dash(turns)} more turn(s)`,
      );
    } else {
      out.push('    the provider reported no daily free-model counter (the key may not be on the free tier)');
    }
    out.push(`    paid usage: ${dash(provider.paidUsage)} (today ${dash(provider.paidUsageDaily)}, this month ${dash(provider.paidUsageMonthly)})`);
  } else {
    // Reported, never counted as a pass — and deliberately not fatal: the log half of the
    // report is still a real measurement.
    out.push(`  provider account: ${provider.status} — ${provider.detail}`);
  }
  out.push('');
  // The one place this report could mislead, said out loud: the ratio is from the given log.
  out.push('  The provider counter is authoritative and its day boundary is UTC; the figures');
  out.push('  from the log describe only the log this was given. The requests-per-turn ratio comes');
  out.push('  from that same log — a turn that runs a tool costs more than one request, so a log of');
  out.push('  cheap turns overstates how many turns the remaining allowance buys.');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Controls. A report whose arithmetic nobody checks is a comfortable fiction, so every
// property this tool claims is one case here, labelled by what it asserts.
// ---------------------------------------------------------------------------

const PLANTED_KEY = 'sk-or-v1-PLANTED-0000000000000000000000000000000000000000';

function runControls() {
  const failures = [];
  const mustFire = [];
  const mustNotFire = [];
  const check = (list, name, fn) => {
    try {
      fn();
      list.push(name);
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
    }
  };
  const mustFireCase = (name, fn) => check(mustFire, name, fn);
  const mustNotFireCase = (name, fn) => check(mustNotFire, name, fn);
  const eq = (actual, expected, label) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${label ?? 'value'} expected ${e}, got ${a}`);
  };

  const healthy =
    '[ai] turn outcome=ok total=12598ms providerMs=11973ms calls=3 toolMs=625ms toolRuns=1 tools=getInventorySummary empty=1 in=3399 out=499 model=stub/model iterations=3';

  mustFireCase('a complete turn line is parsed', () => {
    const s = summarize(parseLog(healthy));
    eq(s.turns, 1, 'turns');
    eq(s.providerRequests, 3, 'requests');
    eq(s.tokens, { input: 3399, output: 499 }, 'tokens');
    eq(s.models, ['stub/model'], 'models');
  });

  mustNotFireCase('a degraded warning is not a second turn', () => {
    const p = parseLog(`[ai] degraded turn reason=EMPTY_COMPLETION attempts=3 empty=2 model=stub/model\n${healthy}`);
    eq(p.turns.length, 1, 'turns');
    eq(p.degradedWarnings, 1, 'degraded warnings');
  });

  mustNotFireCase('an access-log line is not a turn', () => {
    eq(parseLog('{"type":"http","path":"/api/ai/chat","status":201}').turns.length, 0, 'turns');
  });

  mustFireCase('a turn with no provider call (an abandoned turn) still counts', () => {
    const s = summarize(
      parseLog('[ai] turn outcome=AI_ABANDONED total=12794ms providerMs=12794ms calls=0 toolMs=0ms toolRuns=0 tools=none empty=0 in=0 out=0 model=unknown iterations=1'),
    );
    eq(s.turns, 1, 'turns');
    eq(s.outcomes, { AI_ABANDONED: 1 }, 'outcomes');
  });

  mustFireCase('a truncated turn line is counted AND reported malformed', () => {
    const p = parseLog('[ai] turn outcome=ok total=905ms providerMs=900ms calls=2 toolMs=5ms toolRuns=1 tools=');
    eq(p.turns.length, 1, 'turns');
    eq(p.malformed, 1, 'malformed');
    eq(summarize(p).providerRequests, 2, 'requests');
  });

  mustNotFireCase('an absent field contributes nothing to a sum (absent, never zeroed)', () => {
    const p = parseLog('[ai] turn outcome=ok total=905ms providerMs=900ms calls=2 toolMs=5ms toolRuns=1 tools=');
    eq(summarize(p).tokens, { input: 0, output: 0 }, 'tokens');
  });

  mustFireCase('an unknown outcome is still counted as a turn', () => {
    eq(summarize(parseLog('[ai] turn outcome=SOMETHING_NEW total=1ms providerMs=1ms calls=1 toolMs=0ms toolRuns=0 tools=none empty=0 in=1 out=1 model=m iterations=1')).outcomes, { SOMETHING_NEW: 1 }, 'outcomes');
  });

  mustFireCase('requests per turn is the measured ratio', () => {
    const seven = `${healthy}\n[ai] turn outcome=ok total=1ms providerMs=1ms calls=1 toolMs=0ms toolRuns=0 tools=none empty=0 in=1 out=1 model=m iterations=1`;
    const four = `${seven}\n[ai] turn outcome=ok total=1ms providerMs=1ms calls=1 toolMs=0ms toolRuns=0 tools=none empty=0 in=1 out=1 model=m iterations=1\n[ai] turn outcome=ok total=1ms providerMs=1ms calls=2 toolMs=0ms toolRuns=0 tools=none empty=0 in=1 out=1 model=m iterations=1`;
    // 3+1+1+2 requests over four turns.
    eq(summarize(parseLog(four)).requestsPerTurn, 1.75, 'requests per turn');
  });

  mustFireCase('the provider share is the ratio of the sums, not an average of shares', () => {
    const log = `${healthy}\n[ai] turn outcome=AI_ABANDONED total=12794ms providerMs=12794ms calls=1 toolMs=0ms toolRuns=0 tools=none empty=0 in=0 out=0 model=unknown iterations=1\n[ai] turn outcome=AI_OUTPUT_LIMIT total=213ms providerMs=213ms calls=1 toolMs=0ms toolRuns=0 tools=none empty=0 in=1200 out=800 model=stub/model iterations=1\n[ai] turn outcome=ok total=905ms providerMs=900ms calls=2 toolMs=5ms toolRuns=1 tools=`;
    const s = summarize(parseLog(log));
    eq(s.providerShare, 0.9762, 'provider share');
    eq(s.turns, 4, 'turns');
    eq(s.malformed, 1, 'malformed');
  });

  mustNotFireCase('the report cannot print a credential planted in the log', () => {
    const text = formatReport({
      summary: summarize(parseLog(`OPENROUTER_API_KEY=${PLANTED_KEY}\n${healthy}`)),
      provider: { status: 'NOT_CONFIGURED', detail: 'OPENROUTER_API_KEY is not set in this environment' },
      source: 'stdin',
    });
    if (text.includes(PLANTED_KEY)) throw new Error('the report echoed the planted key');
    if (/sk-or-v1-[A-Za-z0-9-]{10,}/.test(text)) throw new Error('a key-shaped string reached the report');
  });

  mustFireCase('the provider counters are read, and the masked label is dropped', () => {
    const u = providerUsage({
      data: {
        label: 'sk-or-v1-e38...8ec',
        is_free_tier: true,
        free_model_daily_requests: { used: 37, limit: 50, remaining: 13 },
        usage: 0,
        usage_daily: 0,
        usage_monthly: 0,
        limit: null,
        limit_remaining: null,
      },
    });
    eq(u.daily, { used: 37, limit: 50, remaining: 13 }, 'daily');
    eq(u.isFreeTier, true, 'free tier');
    if ('label' in u) throw new Error('the provider label is returned and would be printed');
  });

  mustNotFireCase('a counter the provider omitted stays null, never zero', () => {
    const u = providerUsage({ data: { is_free_tier: true, free_model_daily_requests: { used: 4 } } });
    eq(u.daily, { used: 4, limit: null, remaining: null }, 'daily');
  });

  mustNotFireCase('capacity is null rather than a division by an unmeasured zero', () => {
    eq(capacity(null, 1.75), null, 'no remaining');
    eq(capacity(13, 0), null, 'no turns measured');
    eq(capacity(13, 1.75), 7, 'capacity');
  });

  mustNotFireCase('the report is produced when the provider section is unreadable', () => {
    const text = formatReport({
      summary: summarize(parseLog(healthy)),
      provider: { status: 'UNREADABLE', detail: 'HTTP 429' },
      source: 'server.log',
    });
    if (!text.includes('UNREADABLE')) throw new Error('an unreadable provider section was not reported');
    if (!text.includes('turns: 1')) throw new Error('the log half of the report was dropped');
  });

  return { failures, mustFire, mustNotFire };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

/** Where the log comes from: a named file, or stdin — and a refusal when neither can work. */
export async function readSource({ logPath, stdinIsTty, readFile, readInput }) {
  if (logPath) {
    try {
      return { ok: true, source: logPath, text: await readFile(logPath, 'utf8') };
    } catch (err) {
      return { ok: false, detail: `the log at ${logPath} could not be read (${err?.code ?? 'error'})` };
    }
  }
  if (stdinIsTty) {
    return { ok: false, detail: 'no --log was given and stdin is a terminal, so there is nothing to read' };
  }
  return { ok: true, source: 'stdin', text: await readInput() };
}

async function main() {
  const controls = runControls();
  if (process.argv.includes('--self-test') || controls.failures.length) {
    const total = controls.mustFire.length + controls.mustNotFire.length;
    if (controls.failures.length) {
      console.error(`[ai-usage] ${controls.failures.length} control(s) FAILED — the report was not produced:`);
      for (const failure of controls.failures) console.error(`  - ${failure}`);
      process.exit(1);
    }
    console.log(
      `[ai-usage] ${total} control(s) passed (${controls.mustFire.length} must-fire, ${controls.mustNotFire.length} must-not-fire)`,
    );
    process.exit(0);
  }

  const read = await readSource({
    logPath: argValue('--log'),
    stdinIsTty: Boolean(process.stdin.isTTY),
    readFile: fs.promises.readFile,
    readInput: readStdin,
  });
  if (!read.ok) {
    console.error(`[ai-usage] NOT VERIFIED — ${read.detail}.`);
    process.exit(2);
  }

  const summary = summarize(parseLog(read.text));
  const provider = process.argv.includes('--no-provider')
    ? { status: 'SKIPPED', detail: 'not requested (--no-provider)' }
    : await readProviderUsage({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL,
      });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ readAt: new Date().toISOString(), source: read.source, ...summary, provider }, null, 2));
    process.exit(0);
  }

  console.log(formatReport({ summary, provider, source: read.source }));
  process.exit(0);
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('ai-usage.mjs');
if (invokedDirectly) {
  await main();
}
