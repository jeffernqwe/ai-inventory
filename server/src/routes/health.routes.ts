import { Router } from 'express';

import { buildInfo } from '../config/deploymentReadiness.ts';
import { getDatabaseState, isDatabaseReady } from '../config/db.ts';

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
 */
export function createHealthRouter({
  getState = getDatabaseState,
  isReady = isDatabaseReady,
  build = buildInfo,
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
