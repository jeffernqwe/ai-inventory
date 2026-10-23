/**
 * AI-37 — the deployment RETURNS to the operator's configured model once the provider says it is
 * healthy again, so a promotion is a temporary fact rather than a permanent one.
 *
 * WHY THIS EXISTS. AI-31 promotes the model that answered while the configured one was cooling.
 * That promotion is deliberately sticky: without a stable active model, one transient 404 would
 * churn which model every future request starts with. But sticky also meant the promotion only
 * ended at a restart — or when the promoted model itself failed five times. If the configured
 * model recovered ten minutes later, the deployment kept using the fallback for the life of the
 * process, and the operator's choice silently stopped mattering.
 *
 * WHAT IS PINNED HERE:
 *
 *   * ONE healthy reading is a sample, not a recovery: the promotion stands;
 *   * TWO CONSECUTIVE healthy readings of the CONFIGURED model end the promotion and log it once;
 *   * a non-healthy reading in between resets the count (degraded or unavailable is not a pass);
 *   * a healthy FALLBACK never ends the promotion; only the configured primary does;
 *   * with no promotion nothing changes and nothing is logged;
 *   * the return is observable in model selection, and the health gate is clear at the same time.
 *
 * No network: every case injects its own `readHealth`.
 */

import { it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';
import { createHealthWatcher, DEFAULT_THRESHOLDS } from '../src/services/ai/healthWatch.ts';
import {
  isModelHealthBlocked,
  markModelUnavailable,
  resetModelHealthGate,
} from '../src/services/ai/modelHealthGate.ts';
import { promoteModel, promotedModel, resetModelSelection } from '../src/services/ai/modelSelection.ts';

const PRIMARY = 'vendor/primary:free';
const FALLBACK = 'vendor/fallback:free';

const ENV = {
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'test-key-not-real', // secret-guard:allow — a fixture, never used
  OPENROUTER_BASE_URL: 'https://openrouter.example/api',
  AI_MODEL_OPENROUTER: PRIMARY,
  AI_FALLBACK_MODELS_OPENROUTER: FALLBACK,
};

function endpoint(over = {}) {
  return { provider: 'Vendor', status: 0, uptime5m: 100, uptime30m: 100, uptime1d: 100, ...over };
}

function health(model, over = {}) {
  return { status: 'ok', model, message: 'the provider published endpoint health', endpoints: [endpoint()], ...over };
}

/**
 * A watcher over a per-model script. Each run takes the next reading for each model, so the third
 * run keeps the last value — the same shape AI-34's sequence helper uses.
 */
function watcherWith(readings) {
  const positions = new Map();
  const lines = [];
  const readHealth = async ({ model }) => {
    const values = readings[model] ?? [health(model)];
    const index = positions.get(model) ?? 0;
    positions.set(model, index + 1);
    return values[Math.min(index, values.length - 1)];
  };
  const watcher = createHealthWatcher({
    env: ENV,
    readHealth,
    sendAlert: async () => 'log',
    logger: { log: (line) => lines.push(line), error: (line) => lines.push(line) },
    thresholds: DEFAULT_THRESHOLDS,
  });
  return { watcher, lines };
}

const ok = (model) => health(model);
const degraded = (model) =>
  health(model, { endpoints: [{ ...endpoint(), status: -2, uptime5m: 100, uptime30m: 90 }] });
const unavailable = (model) =>
  health(model, { endpoints: [{ ...endpoint(), status: -5, uptime5m: 0, uptime30m: 0, uptime1d: 60 }] });

function promotedToFallback() {
  assert.equal(promoteModel(FALLBACK, PRIMARY), true);
  assert.equal(promotedModel(), FALLBACK);
}

afterEach(() => {
  resetModelSelection();
  resetModelHealthGate();
});

unitSuite('AI-37 return to the configured model', () => {
  it('does not return on a single healthy reading', async () => {
    promotedToFallback();
    const { watcher } = watcherWith({ [PRIMARY]: [ok(PRIMARY)] });

    await watcher.run();

    assert.equal(promotedModel(), FALLBACK, 'one reading is a sample, not a recovery');
  });

  it('returns after two consecutive healthy readings, and says so once', async () => {
    promotedToFallback();
    const { watcher, lines } = watcherWith({ [PRIMARY]: [ok(PRIMARY)] });

    await watcher.run();
    assert.equal(promotedModel(), FALLBACK);
    await watcher.run();

    assert.equal(promotedModel(), null, 'the configured model is active again');
    const returns = lines.filter((line) => line.includes('returning to it'));
    assert.equal(returns.length, 1);
    assert.ok(returns[0].includes(PRIMARY), 'the log names the model the deployment returned to');

    await watcher.run();
    assert.equal(
      lines.filter((line) => line.includes('returning to it')).length,
      1,
      'a third check does not repeat the message',
    );
  });

  it('resets the count when a reading in between is not healthy', async () => {
    promotedToFallback();
    const { watcher } = watcherWith({
      [PRIMARY]: [ok(PRIMARY), degraded(PRIMARY), ok(PRIMARY)],
    });

    await watcher.run();
    await watcher.run();
    assert.equal(promotedModel(), FALLBACK, 'the streak was broken by the degraded reading');
    await watcher.run();
    assert.equal(promotedModel(), FALLBACK, 'one healthy reading after a break is still one');
  });

  it('never returns on an unavailable primary, however many checks run', async () => {
    promotedToFallback();
    const { watcher } = watcherWith({ [PRIMARY]: [unavailable(PRIMARY)] });

    for (let i = 0; i < 4; i += 1) await watcher.run();

    assert.equal(promotedModel(), FALLBACK);
  });

  it('only the CONFIGURED model can end a promotion', async () => {
    promotedToFallback();
    // The primary is degraded; the fallback (the promoted model) is healthy. A healthy fallback
    // must never be read as "the primary recovered".
    const { watcher } = watcherWith({
      [PRIMARY]: [degraded(PRIMARY)],
      [FALLBACK]: [ok(FALLBACK)],
    });

    await watcher.run();
    await watcher.run();

    assert.equal(promotedModel(), FALLBACK);
  });

  it('changes nothing when there is no promotion', async () => {
    const { watcher, lines } = watcherWith({ [PRIMARY]: [ok(PRIMARY)] });

    await watcher.run();
    await watcher.run();

    assert.equal(promotedModel(), null);
    assert.equal(lines.filter((line) => line.includes('returning to it')).length, 0);
  });

  it('clears the health gate at the same moment it returns', async () => {
    promotedToFallback();
    markModelUnavailable(PRIMARY, { reason: 'a previous reading' });
    const { watcher } = watcherWith({ [PRIMARY]: [ok(PRIMARY)] });

    await watcher.run();
    await watcher.run();

    assert.equal(promotedModel(), null);
    assert.equal(isModelHealthBlocked(PRIMARY), false, 'the model is tryable on the very next turn');
  });
});
