// `npm run ai:health` — one quota-free model-health check, in the terminal.
//
// WHY THIS EXISTS. The scheduled watchdog (AI-34) runs inside the server in production. This
// command is the same check, once, for an operator or an external scheduler:
//
//   npm run ai:health            print the state; send nothing
//   npm run ai:health -- --alert  send the alert too (if a problem was found)
//
// It reads only `GET /v1/models/{author}/{slug}/endpoints`, so it spends no completion and no
// request from the free tier's allowance. It never probes a model (that costs one request).
//
// Exit codes: 0 healthy, 1 a model is unavailable or degraded, 2 the check could not run.
// A 2 is never a pass; it says the health record was unreadable, not that the model is down.

import 'dotenv/config';

import { runAiHealthWatch } from '../src/services/ai/healthWatch.ts';

function percent(value) {
  if (value === null || value === undefined) return 'n/a';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function endpointLine(endpoint) {
  return (
    `${endpoint.provider} | status ${endpoint.status === null ? 'n/a' : endpoint.status} | ` +
    `5m ${percent(endpoint.uptime5m)} | 30m ${percent(endpoint.uptime30m)} | 1d ${percent(endpoint.uptime1d)}`
  );
}

const withAlert = process.argv.includes('--alert');
let result;

try {
  result = await runAiHealthWatch(
    withAlert
      ? {}
      : {
          // A manual read must not send operator mail unless asked. The scheduled watchdog is
          // the place that alerts; this command's default is a look, not a notification.
          sendAlert: async () => 'none',
        },
  );
} catch (error) {
  console.error(`[ai:health] NOT VERIFIED — the check threw (${error?.name || 'Error'}).`);
  process.exit(2);
}

if (result.skipped) {
  console.log(`[ai:health] skipped: ${result.skipped}.`);
  process.exit(0);
}

let worst = 0;
for (const verdict of result.verdicts) {
  console.log(`[ai:health] ${verdict.role.padEnd(8)} ${verdict.model}`);
  console.log(`[ai:health]          ${verdict.level} — ${verdict.reason}`);
  for (const endpoint of verdict.endpoints) {
    console.log(`[ai:health]          ${endpointLine(endpoint)}`);
  }
  if (verdict.level === 'unavailable' || verdict.level === 'degraded') worst = Math.max(worst, 1);
  else if (verdict.level === 'unknown') worst = Math.max(worst, 2);
}

const problems = result.verdicts.filter(
  (verdict) => verdict.level === 'unavailable' || verdict.level === 'degraded',
).length;
if (problems > 0) {
  console.log('');
  console.log(`[ai:health] ${problems} model(s) need attention (one-shot check; no prior state to compare).`);
}

if (result.alert) {
  console.log('');
  console.log(`[ai:health] ${result.alert.subject}`);
  if (withAlert) {
    console.log(`[ai:health] delivered: ${result.delivered}`);
  } else {
    console.log('[ai:health] not sent — run with --alert to send it.');
  }
}

if (worst === 0) {
  console.log('');
  console.log('[ai:health] OK — every configured model reports a healthy endpoint.');
} else if (worst === 1) {
  console.log('');
  console.log('[ai:health] ATTENTION — a configured model is unavailable or degraded.');
} else {
  console.log('');
  console.log('[ai:health] NOT VERIFIED — a model health record could not be read.');
}

process.exit(worst);
