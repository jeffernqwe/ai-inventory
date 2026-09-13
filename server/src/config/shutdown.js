/**
 * Graceful shutdown orchestration (Phase 07D / M2).
 *
 * On SIGTERM / SIGINT the server must, in order:
 *   1. stop accepting NEW connections (server.close()),
 *   2. let in-flight requests finish and drop idle keep-alives,
 *   3. close MongoDB cleanly (only after the HTTP server stopped accepting),
 *   4. exit 0 — unless the grace period elapses, then force-exit 1 so a stuck
 *      request can never hold a deploy/restart hostage.
 *
 * The handler is idempotent: a second signal during shutdown is ignored, and no
 * timers/listeners survive completion. All heavy dependencies (the http server,
 * the database close, the exit) are injectable so the orchestration is testable
 * without real sockets or a real process exit.
 */

import env from './env.ts';

/**
 * Build the shutdown handler bound to a started http server.
 *
 * @param {object}  options
 * @param {object}  options.server            started http.Server (or injectable fake)
 * @param {Function} [options.closeDatabase]  async, closes MongoDB
 * @param {number}  [options.timeoutMs]       grace period before force-exit
 * @param {object}  [options.logger]          { log, error }
 * @param {Function} [options.exit]           default process.exit — inject to capture
 * @returns {(signal?: string) => Promise<void>}
 */
export function createShutdownHandler({
  server,
  closeDatabase,
  timeoutMs = env.shutdownTimeoutMs,
  logger = console,
  exit,
} = {}) {
  const exitFn = exit || ((code) => process.exit(code));
  let started = false;
  let finished = false;

  // server.close() stops accepting NEW connections but still waits for every
  // existing connection to end — including idle keep-alive sockets, which would
  // otherwise hold the drain open until their keep-alive timeout. So track
  // in-flight requests and, once they all finish, drop the (now idle) keep-alive
  // sockets so the drain completes as soon as real work is done.
  const activeRequests = new Set();
  let draining = false;
  const requestListener = (req, res) => {
    activeRequests.add(res);
    const done = () => {
      activeRequests.delete(res);
      if (draining && activeRequests.size === 0 && server && typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }
    };
    res.once('finish', done);
    res.once('close', done);
  };
  if (server && typeof server.on === 'function') server.on('request', requestListener);

  return async function shutdown(signal = 'shutdown') {
    // Idempotent: a second SIGTERM/SIGINT during shutdown is a no-op.
    if (started || finished) return;
    started = true;
    draining = true;

    logger.log(`[shutdown] ${signal} — stopping new requests and draining in-flight work`);

    const forceTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      logger.error(`[shutdown] grace period (${timeoutMs}ms) elapsed — forcing exit`);
      exitFn(1);
    }, timeoutMs);
    // Do not let the timer alone keep the process alive if shutdown completes
    // through a different path.
    if (forceTimer && typeof forceTimer.unref === 'function') forceTimer.unref();

    const finish = (code, message) => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      if (server && typeof server.removeListener === 'function') server.removeListener('request', requestListener);
      if (message) logger.log(message);
      exitFn(code);
    };

    try {
      // 1) + 2) stop accepting; resolve once every connection has closed.
      await new Promise((resolve, reject) => {
        if (!server || typeof server.close !== 'function' || server.listening === false) {
          return resolve();
        }
        let settled = false;
        const settle = (err) => {
          if (settled) return;
          settled = true;
          server.removeListener('error', onError);
          if (err) reject(err);
          else resolve();
        };
        const onError = (err) => settle(err);
        server.once('error', onError);
        try {
          server.close(() => settle());
          // Node >= 18.2: drop sockets that are sitting idle on keep-alive so a
          // drained server does not wait out their keep-alive timeout. Sockets
          // still mid-request are untouched (they finish, then requestListener
          // above drops them the moment they go idle).
          if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
        } catch (err) {
          settle(err);
        }
      });

      // 3) MongoDB closes only after the HTTP server stopped accepting.
      if (closeDatabase) await closeDatabase();

      finish(0, '[shutdown] complete');
    } catch (err) {
      logger.error(`[shutdown] failed during drain: ${err && err.message ? err.message : err}`);
      finish(1);
    }
  };
}

/**
 * Register shutdown on SIGINT + SIGTERM without ever registering the same
 * handler twice (guards against hot-reload / repeated install). Returns how many
 * handlers were newly registered.
 */
export function registerSignalHandlers(target = process, handler) {
  let registered = 0;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    if (!target || typeof target.on !== 'function' || typeof target.listeners !== 'function') continue;
    if (!target.listeners(signal).includes(handler)) {
      target.on(signal, handler);
      registered += 1;
    }
  }
  return registered;
}

export default { createShutdownHandler, registerSignalHandlers };
