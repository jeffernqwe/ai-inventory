/**
 * Server startup orchestration (Phase 07D / H7 + H8 + M2).
 *
 * Order of operations is deliberate:
 *   1. Production configuration is validated FIRST — a broken deploy exits
 *      non-zero before it ever binds a port or accepts a request.
 *   2. MongoDB connect is attempted before listening. In production a failed
 *      connect is fatal (exit non-zero) so the app is never alive-but-useless.
 *      Outside production the process stays reachable for diagnostics, but the
 *      readiness endpoint reports not-ready and every database request answers
 *      503 (see errorHandler) instead of buffering/hanging.
 *   3. Only then does the HTTP server start accepting traffic, and shutdown
 *      handlers (SIGINT/SIGTERM) are installed for a bounded graceful drain.
 *
 * Every side-effecting dependency is injectable so tests exercise fail-fast,
 * dev-leniency, and readiness deterministically without real sockets or exits.
 */

import app from '../app.js';
import env from './env.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { createShutdownHandler, registerSignalHandlers } from './shutdown.js';
import { validateProductionConfig } from './validateConfig.js';

/**
 * Boot the server.
 *
 * @param {object}  [options]
 * @param {object}  [options.appInstance]      Express app to listen on
 * @param {string}  [options.nodeEnv]          'production' enables fail-fast gating
 * @param {number}  [options.port]             listen port
 * @param {Function}[options.connectFn]        async DB connect (true/false or throws)
 * @param {Function}[options.closeFn]          async DB close (shutdown)
 * @param {Function}[options.validator]        () => [{ variable, message }]
 * @param {Function}[options.exit]             default process.exit (inject to capture)
 * @param {object}  [options.logger]           { log, error }
 * @param {object}  [options.signalTarget]     default process
 * @param {number}  [options.shutdownTimeoutMs]graceful-shutdown grace period
 * @returns {Promise<{ server, shutdown, connected } | null>} null when production
 *          validation/connect failed (the process exits in real boots).
 */
export async function startServer({
  appInstance = app,
  nodeEnv = env.nodeEnv,
  port = env.port,
  connectFn = connectDatabase,
  closeFn = disconnectDatabase,
  validator = validateProductionConfig,
  exit,
  logger = console,
  signalTarget = process,
  shutdownTimeoutMs = env.shutdownTimeoutMs,
} = {}) {
  const exitFn = exit || ((code) => process.exit(code));

  // H7 — production fail-fast on invalid configuration.
  if (nodeEnv === 'production') {
    const problems = validator();
    if (problems.length > 0) {
      for (const problem of problems) {
        logger.error(`[config] ${problem.message}`);
      }
      logger.error('[config] refusing to start in production with invalid configuration');
      exitFn(1);
      return null;
    }
  }

  // H8 — connect before accepting traffic. Production treats a failed connect
  // as fatal (the app must never sit alive while every request 500s/buffers);
  // non-production stays reachable for diagnostics with readiness reporting
  // not-ready. connectDatabase logs failures in sanitized form.
  let connected = false;
  try {
    connected = (await connectFn()) === true;
  } catch (err) {
    if (nodeEnv === 'production') {
      logger.error(`[db] could not connect to MongoDB at startup (${err && err.name ? err.name : 'Error'}) — exiting`);
      exitFn(1);
      return null;
    }
    logger.error(
      '[db] could not connect to MongoDB at startup — the API stays up for diagnostics, ' +
        'but readiness will report not ready and database requests will return 503. ' +
        'Restart once MongoDB is reachable.'
    );
  }

  const server = appInstance.listen(port, () => {
    logger.log(
      `[server] environment=${nodeEnv} listening on http://localhost:${port}` +
        (connected ? '' : ' (MongoDB NOT connected — /api/health/ready reports not ready)')
    );
  });

  // M2 — bounded, idempotent graceful shutdown.
  const shutdown = createShutdownHandler({
    server,
    closeDatabase: closeFn,
    timeoutMs: shutdownTimeoutMs,
    logger,
    exit: exitFn,
  });
  registerSignalHandlers(signalTarget, shutdown);

  return { server, shutdown, connected };
}

export default { startServer };
