import { Router } from 'express';

import { buildInfo } from '../config/deploymentReadiness.ts';
import { getDatabaseState, isDatabaseReady } from '../config/db.ts';
import { operationalCounters } from '../config/operationalCounters.ts';

/**
 * Health endpoints (Phase 07D / M1). Three complementary signals:
 *
 *   GET /api/health        (legacy, unchanged) 200 always — process is up and
 *                          reports the current database state for observability.
 *                          It is a liveness signal, NOT a readiness gate.
 *                          Since 2026-10-15 it also reports WHICH BUILD is
 *                          answering — the deployed commit and the process
 *                          uptime.
 *   GET /api/health/live   200 always — process is alive. Never consults MongoDB.
 *   GET /api/health/ready  200 only when MongoDB is reachable right now, else
 *                          503. This is the operational readiness gate a load
 *                          balancer / orchestrator should poll.
 *
 * None of these expose the MongoDB URI, credentials, driver internals, or stack
 * traces; /ready is a cheap local check of the driver's connection state (no
 * round-trip, no extra connections, no polling).
 *
 * OPS-2 — WHY `/api/health` ALSO CARRIES COUNTERS, AND WHY THE OTHER TWO DO NOT.
 *
 * Liveness and readiness answer a question about the process and the database; neither can say
 * whether requests are **succeeding**. Nothing outside the hosting dashboard could, which left
 * "is it failing right now?" answerable only by reading logs a person had to go and read. The
 * legacy endpoint publishes the counts since boot — total responses, by status class, and the 5xx
 * count with the time of the most recent one — so an uptime watcher can alert on the second
 * consecutive 5xx rather than on the process merely being up. It is the same endpoint and the same
 * exposure class as the commit id already published there, for the same reason: it identifies
 * behaviour, not people. No path, no identifier, no duration and no message is published, and
 * `/live` and `/ready` stay exactly what they were — a dependency-free probe and a gate.
 *
 * WHY THE LEGACY ENDPOINT CARRIES A COMMIT ID, AND WHY NOTHING ELSE DOES.
 *
 * The question "is the deployed build the one I just merged?" had no answer from outside the
 * hosting dashboard, and this project has already paid for a stale-build assumption twice —
 * once when a device run was measuring an old bundle until a reload was produced (§27CE), and
 * once when a healthy-looking service was inferred to be routing somewhere it was not
 * (§27CE's correction). A commit id is not a credential, not a host name, not a tenant and
 * not a configuration value: it identifies a build, and it is published **only** here.
 *
 * The narrow scope is deliberate. `/ready` stays a gate that reports readiness and nothing
 * else, `/live` stays dependency-free, and the deployment's *integration* state (which
 * optional services are configured) is deliberately NOT published: those states are already
 * observable, precisely and per-flow, by the callers they affect (`503 MAIL_NOT_CONFIGURED`),
 * and a public inventory of what a server has switched on would widen the surface for
 * convenience alone. The boot line in `config/deploymentReadiness.ts` states it to the
 * operator instead, where it belongs.
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Build a health router. Defaults read the real MongoDB connection state; tests
 * inject stubs to exercise the 200/503 readiness branches deterministically
 * without a database.
 *
 * @param {object} [options]
 * @param {() => string} [options.getState]     Human-readable db state
 * @param {() => boolean} [options.isReady]     true when MongoDB is reachable
 * @param {() => {commit: string, uptimeSeconds: number}} [options.build]
 *        Which build is answering (commit + process uptime). Injectable for
 *        the same reason the database state is: a suite pins both halves
 *        without depending on the environment it runs in.
 * @param {() => object} [options.counters]
 *        The OPS-2 response counters. Injectable so a suite can pin the payload
 *        shape without manufacturing traffic, and so the number it asserts on is
 *        the number the route published rather than one it counted itself.
 */
export function createHealthRouter({
  getState = getDatabaseState,
  isReady = isDatabaseReady,
  build = buildInfo,
  counters = operationalCounters,
} = {}) {
  const router = Router();

  // Legacy liveness + db state (kept for compatibility).
  router.get('/', (req, res) => {
    const { commit, uptimeSeconds } = build();
    res.status(200).json({
      status: 'ok',
      db: getState(),
      commit,
      uptimeSeconds,
      counters: counters(),
      timestamp: timestamp(),
    });
  });

  // Liveness: the process is up. No database involvement.
  router.get('/live', (req, res) => {
    res.status(200).json({ status: 'live', timestamp: timestamp() });
  });

  // Readiness: MongoDB reachable? 200 when ready, 503 otherwise.
  router.get('/ready', (req, res) => {
    if (isReady()) {
      return res.status(200).json({
        status: 'ready',
        db: getState(),
        timestamp: timestamp(),
      });
    }
    return res.status(503).json({
      status: 'not ready',
      db: getState(),
      timestamp: timestamp(),
    });
  });

  return router;
}

const router = createHealthRouter();

export default router;
