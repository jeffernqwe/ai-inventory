import { Router } from 'express';

import { getDatabaseState, isDatabaseReady } from '../config/db.ts';

/**
 * Health endpoints (Phase 07D / M1). Three complementary signals:
 *
 *   GET /api/health        (legacy, unchanged) 200 always — process is up and
 *                          reports the current database state for observability.
 *                          It is a liveness signal, NOT a readiness gate.
 *   GET /api/health/live   200 always — process is alive. Never consults MongoDB.
 *   GET /api/health/ready  200 only when MongoDB is reachable right now, else
 *                          503. This is the operational readiness gate a load
 *                          balancer / orchestrator should poll.
 *
 * None of these expose the MongoDB URI, credentials, driver internals, or stack
 * traces; /ready is a cheap local check of the driver's connection state (no
 * round-trip, no extra connections, no polling).
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
 */
export function createHealthRouter({ getState = getDatabaseState, isReady = isDatabaseReady } = {}) {
  const router = Router();

  // Legacy liveness + db state (kept for compatibility).
  router.get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      db: getState(),
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
