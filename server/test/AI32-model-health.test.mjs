/**
 * AI-32 — a model's live endpoint health is read, not remembered.
 *
 * WHY THIS EXISTS. AI-28 made a missing model visible and AI-29/30/31 made a broken one
 * survivable, but choosing the order of the chain was still a manual exercise: the operator
 * ran a one-off script against the provider's endpoints API and copied the numbers into
 * `.env`. That is exactly how a stale order survives — the files record one measurement,
 * and nothing in the repository can repeat it.
 *
 * The provider publishes per-model endpoint health at
 * `GET /v1/models/{author}/{slug}/endpoints`: an endpoint's `status`, and its uptime over
 * the last 5 minutes, 30 minutes and 1 day. Reading it is FREE — no completion, so no
 * request from a metered allowance — which is why `npm run ai:models` may do it every time.
 *
 * WHAT THIS FILE PINS:
 *
 *   * every endpoint is returned, in provider order, with its numeric health fields;
 *   * a missing or non-numeric field is `null`, never a fabricated zero or `NaN`;
 *   * a 404 is `not_found` (the model is not published), while any other refusal or a
 *     transport error is `unreachable` — neither is a claim that the model is unhealthy;
 *   * a model with no endpoints is `no_endpoints`, not a healthy model with zero data;
 *   * a deployment without AI contacts no provider at all;
 *   * the model may be overridden, which is what `--check=<id>` needs;
 *   * the key travels in the header only and never appears in a logged result;
 *   * a base URL that already ends in `/v1` is not doubled.
 *
 * No network is used: every case injects its own `fetchImpl`.
 */

import { it, describe } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';
import { readModelHealth } from '../src/services/ai/modelCheck.ts';

const MODEL = 'vendor/model-one:free';
const OTHER = 'other/model-two:free';
const BASE = 'https://openrouter.example/api';
const KEY = 'sk-or-v1-super-secret-value'; // secret-guard:allow — a deliberate non-working fixture

/** The environment a configured OpenRouter deployment has. */
const env = (over = {}) => ({
  AI_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: KEY,
  OPENROUTER_BASE_URL: BASE,
  AI_MODEL_OPENROUTER: MODEL,
  ...over,
});

/** One endpoint row as the provider publishes it. */
function endpoint(over = {}) {
  return {
    name: 'Vendor | model-one-20260807:free',
    provider_name: 'Vendor',
    status: 0,
    uptime_last_5m: 100,
    uptime_last_30m: 99.5,
    uptime_last_1d: 98.25,
    ...over,
  };
}

/** A successful endpoints response. */
function healthy(endpoints = [endpoint()], { status = 200 } = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data: { id: MODEL, endpoints } }),
  });
}

unitSuite('AI-32 model endpoint health (DB-free)', () => {
  describe('readModelHealth — what the provider publishes now', () => {
    it('★ returns every endpoint with its status and three uptime windows', async () => {
      const second = endpoint({
        provider_name: 'Backup Vendor',
        status: -2,
        uptime_last_5m: 60,
        uptime_last_30m: 86.66666666666667,
        uptime_last_1d: 92.22222222222223,
      });

      const result = await readModelHealth({
        env: env(),
        fetchImpl: healthy([endpoint(), second]),
      });

      assert.equal(result.status, 'ok');
      assert.equal(result.model, MODEL);
      assert.equal(result.endpoints.length, 2);
      assert.deepEqual(result.endpoints[0], {
        provider: 'Vendor',
        status: 0,
        uptime5m: 100,
        uptime30m: 99.5,
        uptime1d: 98.25,
      });
      assert.deepEqual(result.endpoints[1], {
        provider: 'Backup Vendor',
        status: -2,
        uptime5m: 60,
        uptime30m: 86.66666666666667,
        uptime1d: 92.22222222222223,
      });
    });

    it('★ keeps missing or non-numeric fields as null instead of inventing health', async () => {
      const result = await readModelHealth({
        env: env(),
        fetchImpl: healthy([
          {
            provider_name: 'Vendor',
            status: '0',
            uptime_last_5m: null,
            uptime_last_30m: '99',
            // uptime_last_1d is absent
          },
        ]),
      });

      assert.equal(result.status, 'ok');
      assert.deepEqual(result.endpoints[0], {
        provider: 'Vendor',
        status: null,
        uptime5m: null,
        uptime30m: null,
        uptime1d: null,
      });
    });

    it('★ names an unknown provider rather than leaving the row anonymous', async () => {
      const result = await readModelHealth({
        env: env(),
        fetchImpl: healthy([{ status: 0, uptime_last_5m: 100 }]),
      });

      assert.equal(result.endpoints[0].provider, 'unknown');
    });

    it('★ reports a model the provider does not publish as not_found, naming it', async () => {
      const result = await readModelHealth({
        env: env(),
        fetchImpl: healthy([], { status: 404 }),
      });

      assert.equal(result.status, 'not_found');
      assert.equal(result.model, MODEL);
      assert.match(result.message, new RegExp(MODEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('★ reports a model with an empty endpoint list as no_endpoints, not as healthy', async () => {
      const result = await readModelHealth({
        env: env(),
        fetchImpl: healthy([]),
      });

      assert.equal(result.status, 'no_endpoints');
      assert.equal(result.endpoints.length, 0);
    });

    it('★ treats another HTTP refusal as unreachable, with the status for the operator', async () => {
      const result = await readModelHealth({
        env: env(),
        fetchImpl: healthy([], { status: 503 }),
      });

      assert.equal(result.status, 'unreachable');
      assert.equal(result.httpStatus, 503);
      assert.match(result.message, /HTTP 503/);
    });

    it('★ never throws when the provider cannot be reached', async () => {
      const result = await readModelHealth({
        env: env(),
        fetchImpl: async () => {
          throw new Error('getaddrinfo ENOTFOUND openrouter.example');
        },
      });

      assert.equal(result.status, 'unreachable');
      // The upstream message is not relayed: it can carry a host an operator did not intend
      // to publish, and this result is logged.
      assert.ok(!result.message.includes('ENOTFOUND'));
      assert.ok(!result.message.includes(KEY));
    });

    it('★ does nothing at all when the provider is not configured', async () => {
      let called = false;
      const result = await readModelHealth({
        env: {},
        fetchImpl: async () => {
          called = true;
          throw new Error('must not be consulted');
        },
      });

      assert.equal(result.status, 'not_applicable');
      assert.equal(called, false, 'a deployment without AI must not contact a provider');
    });

    it('★ reads an overridden model, and the key stays in the header only', async () => {
      let seenUrl = null;
      let seenKey = null;
      const result = await readModelHealth({
        env: env(),
        model: OTHER,
        fetchImpl: async (url, init) => {
          seenUrl = String(url);
          seenKey = init?.headers?.authorization;
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: { id: OTHER, endpoints: [endpoint()] } }),
          };
        },
      });

      assert.equal(seenUrl, `${BASE}/v1/models/other/model-two%3Afree/endpoints`);
      assert.equal(seenKey, `Bearer ${KEY}`);
      assert.equal(result.status, 'ok');
      assert.equal(result.model, OTHER);
      assert.ok(!JSON.stringify(result).includes(KEY), 'the result is logged and may not carry the key');
    });

    it('does not double /v1 when the base URL already names it', async () => {
      let seenUrl = null;
      await readModelHealth({
        env: env({ OPENROUTER_BASE_URL: `${BASE}/v1` }),
        fetchImpl: async (url) => {
          seenUrl = String(url);
          return { ok: true, status: 200, json: async () => ({ data: { endpoints: [endpoint()] } }) };
        },
      });

      assert.equal(seenUrl, `${BASE}/v1/models/vendor/model-one%3Afree/endpoints`);
    });
  });
});
