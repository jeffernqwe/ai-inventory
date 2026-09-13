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

import type { Server } from 'node:http';

import env from './env.ts';

/**
 * The listener type the events below are registered with, taken from
 * `http.Server`'s own declaration rather than written out by hand.
 *
 * The usual way to write "accepts any callback" is `(...args: never[]) => void`,
 * but that is deliberately NOT used here: under `strictFunctionTypes` a function
 * whose parameters are `any[]` is not assignable to one whose parameters are
 * `never[]` (`any` is not assignable to `never`), so a hand-written version
 * would have rejected the real `http.Server` this module is handed. Deriving the
 * type from the library keeps the two in exact agreement, and every listener
 * registered below satisfies it — a function declared with specific parameters
 * is assignable to one that accepts anything.
 */
type ServerListener = Parameters<Server['once']>[1];

/**
 * The slice of `http.Server` the shutdown path touches. Structural on purpose:
 * the handler is dependency-injected and the suites pass partial fakes rather
 * than real sockets, which is why the calls below sit behind `typeof` guards.
 * Typing this as the concrete `http.Server` would compile, but it would state a
 * requirement the code deliberately does not have.
 *
 * `once` and `removeListener` are the two members called WITHOUT a guard, so
 * they are the two the type declares as required — the type says what the code
 * actually needs, no more and no less.
 */
export type ShutdownServer = {
  listening?: boolean;
  on?(event: string, listener: ServerListener): unknown;
  once(event: string, listener: ServerListener): unknown;
  removeListener(event: string, listener: ServerListener): unknown;
  close?(callback?: (err?: Error) => void): unknown;
  closeIdleConnections?(): void;
};

/** The logging surface this module uses. `console` satisfies it. */
export type Logger = { log: (message: string) => void; error: (message: string) => void };

/** The `process` behaviour `registerSignalHandlers` needs. Structural: tests inject a fake. */
export type SignalTarget = {
  on?(signal: string, listener: ShutdownHandler): unknown;
  listeners?(signal: string): readonly unknown[];
};

/** The composed shutdown routine, callable with or without the signal name. */
export type ShutdownHandler = (signal?: string) => unknown;

/**
 * `${err && err.message ? err.message : err}`, narrowed. The original
 * interpolated into a template, so `String()` here reproduces exactly what the
 * template did to whichever branch was taken — the logged text is unchanged for
 * every value, including a thrown non-Error. The `err &&` short-circuit is
 * reproduced by optional property access, so a thrown `null`/`undefined` still
 * falls back to `String(err)` instead of throwing inside the catch.
 */
function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return message ? String(message) : String(err);
}

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
}: {
  server?: ShutdownServer;
  closeDatabase?: () => unknown;
  timeoutMs?: number;
  logger?: Logger;
  exit?: (code: number) => void;
} = {}) {
  const exitFn = exit || ((code: number) => process.exit(code));
  let started = false;
  let finished = false;

  // server.close() stops accepting NEW connections but still waits for every
  // existing connection to end — including idle keep-alive sockets, which would
  // otherwise hold the drain open until their keep-alive timeout. So track
  // in-flight requests and, once they all finish, drop the (now idle) keep-alive
  // sockets so the drain completes as soon as real work is done.
  const activeRequests = new Set<unknown>();
  let draining = false;
  const requestListener = (req: unknown, res: { once(event: string, listener: () => void): unknown }) => {
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

  return async function shutdown(signal = 'shutdown'): Promise<void> {
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

    const finish = (code: number, message?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      if (server && typeof server.removeListener === 'function') server.removeListener('request', requestListener);
      if (message) logger.log(message);
      exitFn(code);
    };

    try {
      // 1) + 2) stop accepting; resolve once every connection has closed.
      await new Promise<void>((resolve, reject) => {
        if (!server || typeof server.close !== 'function' || server.listening === false) {
          return resolve();
        }
        let settled = false;
        const settle = (err?: Error) => {
          if (settled) return;
          settled = true;
          server.removeListener('error', onError);
          if (err) reject(err);
          else resolve();
        };
        const onError = (err: Error) => settle(err);
        server.once('error', onError);
        try {
          server.close(() => settle());
          // Node >= 18.2: drop sockets that are sitting idle on keep-alive so a
          // drained server does not wait out their keep-alive timeout. Sockets
          // still mid-request are untouched (they finish, then requestListener
          // above drops them the moment they go idle).
          if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
        } catch (err) {
          settle(err as Error);
        }
      });

      // 3) MongoDB closes only after the HTTP server stopped accepting.
      if (closeDatabase) await closeDatabase();

      finish(0, '[shutdown] complete');
    } catch (err) {
      logger.error(`[shutdown] failed during drain: ${errorMessage(err)}`);
      finish(1);
    }
  };
}

/**
 * Register shutdown on SIGINT + SIGTERM without ever registering the same
 * handler twice (guards against hot-reload / repeated install). Returns how many
 * handlers were newly registered.
 */
export function registerSignalHandlers(
  target: SignalTarget = process,
  handler: ShutdownHandler
): number {
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
