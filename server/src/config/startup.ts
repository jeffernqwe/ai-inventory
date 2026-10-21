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

import app from '../app.ts';
import env from './env.ts';
import { connectDatabase, disconnectDatabase } from './db.ts';
import { deploymentLine, deploymentNotes, integrationReport } from './deploymentReadiness.ts';
import type { IntegrationReport } from './deploymentReadiness.ts';
import {
  createShutdownHandler,
  registerSignalHandlers,
} from './shutdown.ts';
import type { Logger, ShutdownHandler, ShutdownServer, SignalTarget } from './shutdown.ts';
import { validateProductionConfig } from './validateConfig.ts';
import type { ConfigProblem } from './validateConfig.ts';
import { INSTANCE_ID } from './instanceIdentity.ts';
import { checkModelCatalogue } from '../services/ai/modelCheck.ts';
import type { CatalogueResult } from '../services/ai/modelCheck.ts';
import { refreshModelCapabilities, declaresToolSupport } from '../services/ai/modelCapabilities.ts';
import { aiConfig } from '../services/ai/aiConfig.ts';
import { boundPortOf, verifyBoundPort } from './portGuard.ts';
import type { PortProbeResult } from './portGuard.ts';

/**
 * Everything `startServer` reaches the outside world through, injectable so the
 * fail-fast, dev-leniency and readiness paths are exercised deterministically
 * without real sockets or process exits.
 *
 * `appInstance` is structural rather than `Express` for the same reason
 * `ShutdownServer` is: the only thing this module does with it is `listen`, and
 * a test fake supplies exactly that.
 */
type StartServerOptions = {
  appInstance?: { listen(port: number, callback: () => void): ShutdownServer };
  nodeEnv?: string;
  port?: number;
  connectFn?: () => unknown;
  closeFn?: () => unknown;
  validator?: () => ConfigProblem[];
  readiness?: () => IntegrationReport;
  exit?: (code: number) => void;
  logger?: Logger;
  signalTarget?: SignalTarget;
  shutdownTimeoutMs?: number;
  probe?: (port: number) => Promise<PortProbeResult>;
  /**
   * AI-28 — the boot-time question "is the configured AI model still one the provider lists?"
   *
   * Injectable for the same reason the port probe is: a test must be able to answer it without a
   * network. `null` means "do not check", which is what `NODE_ENV=test` defaults to so the suite
   * never contacts a provider.
   */
  modelCheck?: (() => Promise<CatalogueResult>) | null;
  /**
   * AI-29 — the boot-time read of which models the provider DECLARES can call tools.
   *
   * Same contract as `modelCheck`: unawaited, non-fatal, and `null` means "do not read", which is
   * the `NODE_ENV=test` default so a suite never contacts a provider. It is free (no completion, so
   * no quota), and the turn loop reads the resulting cache synchronously to skip a fallback that
   * could never have grounded an answer.
   */
  capabilities?: (() => Promise<unknown>) | null;
};

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
 * @param {Function}[options.readiness]        () => IntegrationReport (boot line + warnings)
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
  readiness = integrationReport,
  exit,
  logger = console,
  signalTarget = process,
  shutdownTimeoutMs = env.shutdownTimeoutMs,
  probe,
  modelCheck,
  capabilities,
}: StartServerOptions = {}): Promise<{
  server: ShutdownServer;
  shutdown: ShutdownHandler;
  connected: boolean;
} | null> {
  const exitFn = exit || ((code: number) => process.exit(code));

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

  // What this deployment IS, and what it cannot do — said once, before anything else is
  // attempted. Validation above refuses to boot on a configuration that is outright broken;
  // this reports the states that are legal, silent and unusable instead (see
  // config/deploymentReadiness.ts). It is deliberately a WARNING and never a failure: an
  // optional integration that cannot work degrades a feature, and refusing to boot over one
  // would turn that into a dead deployment on its next restart.
  const report = readiness();
  logger.log(deploymentLine(report));
  for (const note of deploymentNotes(report)) {
    logger.error(`[config] warning: ${note}`);
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
      // `${err && err.name ? err.name : 'Error'}`, narrowed. The original
      // interpolated into a template, which stringifies the branch it took, so
      // `String()` yields the same text for every value; the `err &&`
      // short-circuit is reproduced by the optional access.
      const name = (err as { name?: unknown } | null | undefined)?.name;
      logger.error(
        `[db] could not connect to MongoDB at startup (${name ? String(name) : 'Error'}) — exiting`
      );
      exitFn(1);
      return null;
    }
    // The message states what the connect actually did before giving up. In development
    // `connectDatabase` has already retried (3 attempts, 30 s bound each) because this host
    // measured 15.8 s to select; in test it made its single attempt. Either way, mongoose
    // does not retry a REJECTED initial connect, so a restart really is the remedy — the
    // sentence has to say so rather than pretend the process will recover on its own.
    logger.error(
      '[db] could not connect to MongoDB at startup, after every boot attempt — the API stays ' +
        'up for diagnostics, but readiness will report not ready and database requests will ' +
        'return 503. Restart once MongoDB is reachable.'
    );
  }

  type BootServer = {
    on?: (event: string, handler: (err: { code?: unknown; message?: unknown }) => void) => unknown;
    listening?: boolean;
    once?: (event: string, handler: () => void) => unknown;
    address?: () => unknown;
  };
  // Declared before `listen` because the listening callback may run inside it (a test fake calls it synchronously),
  // and filling in `server` afterwards is what lets that callback read the port actually bound.
  const bootRef: { server?: BootServer; listening: boolean } = { listening: false };

  const server = appInstance.listen(port, () => {
    // An ephemeral `0` becomes a real number here, and the boot line should name the port that was actually taken —
    // `localhost:0` tells an operator nothing, and this line is what a stale server imitates.
    const bound = boundPortOf(bootRef.server);
    bootRef.listening = true;
    logger.log(
      `[server] environment=${nodeEnv} listening on http://localhost:${bound ?? port} instance=${INSTANCE_ID}` +
        (connected ? '' : ' (MongoDB NOT connected — /api/health/ready reports not ready)')
    );
  });
  bootRef.server = server as unknown as BootServer;
  const bootServer = bootRef.server;

  // A port this process could not take at all is a boot failure, and it must read as one instead of as an
  // unhandled 'error' event.
  //
  // EADDRINUSE IS ALWAYS FATAL, INCLUDING AFTER THE 'listening' CALLBACK — measured on this host on 2026-10-18, and
  // the measurement is the whole reason that clause exists. The second boot printed `listening on
  // http://localhost:4011 instance=521c…` (its listening callback really did fire), and the EADDRINUSE error
  // arrived AFTERWARDS; treating "already listening" as proof of serving let that process stay up for 30 s as a
  // zombie with no working listener — precisely the trap this guard exists to prevent, wearing the guard's own
  // exemption. A port that cannot be taken is never a normal runtime event, so its code is decisive.
  //
  // Other codes remain non-fatal once the socket is listening: killing a server that is genuinely serving over a
  // stray socket error would be its own defect, so they are logged and the process keeps running.
  if (bootServer && typeof bootServer.on === 'function') {
    bootServer.on('error', (err) => {
      const code = err && typeof err.code === 'string' ? err.code : 'UNKNOWN';
      if (code === 'EADDRINUSE') {
        logger.error(
          `[server] port ${port} is already in use — refusing to start. Find the owner with ` +
            `netstat -ano | findstr :${port} (or lsof -nP -iTCP:${port} -sTCP:LISTEN) and stop it.`
        );
        exitFn(1);
        return;
      }
      if (bootRef.listening) {
        logger.error(`[server] the HTTP server reported an error after it was listening (${code}).`);
        return;
      }
      logger.error(`[server] the HTTP server could not start (${code}) — refusing to start.`);
      exitFn(1);
    });
  }

  // AI-28 — the model check, fired unawaited for the same reason the port guard is: a boot must not
  // wait on an outbound request, and a wrong model is a warning rather than a reason to refuse to
  // start. It was added after every assistant turn failed with `model=unknown` and nothing in the
  // deployment said which model — the id is the one fact an operator needs when the assistant stops
  // answering, and this is the earliest place it can be questioned.
  //
  // `NODE_ENV=test` defaults to no check at all: a unit suite must not reach a provider, and a
  // check that silently spent a free-tier request per test file would be a cost, not a guard.
  const resolvedModelCheck = modelCheck === undefined ? (nodeEnv === 'test' ? null : checkModelCatalogue) : modelCheck;
  if (resolvedModelCheck) {
    void (async () => {
      const result = await resolvedModelCheck();
      // ONLY a model the provider does not list is worth a line. `unreachable` means the check could
      // not run, which is not evidence of anything and would train an operator to ignore the line.
      if (result?.status === 'missing') {
        logger.error(`[config] warning: ${result.message}`);
      }
    })().catch(() => {
      // A check that cannot run must never be the reason a server is down.
    });
  }

  // AI-29 — the fallback capability map, fired unawaited next to the model check and for the same
  // reason: a boot must not wait on an outbound request. A candidate the catalogue says cannot call
  // tools is skipped by the turn loop instead of being spent on, and the ONE thing worth a boot line
  // is a configured fallback that is in that state — it is otherwise discovered only on the day the
  // primary breaks, which is the worst possible day to learn it.
  const resolvedCapabilities =
    capabilities === undefined ? (nodeEnv === 'test' ? null : refreshModelCapabilities) : capabilities;
  if (resolvedCapabilities) {
    void (async () => {
      const status = await resolvedCapabilities();
      // `unreachable` is silence: it says nothing about any model, and a line that fires when the check
      // could not run trains an operator to ignore the line that matters.
      if (status !== 'ok') return;
      const ai = aiConfig();
      const unusable = ai.fallbackModels.filter(
        (id) => id !== ai.openrouterModel && declaresToolSupport(id) === false,
      );
      if (unusable.length > 0) {
        logger.error(
          `[config] warning: fallback model(s) declare no tool support and will be skipped: ${unusable.join(', ')}`,
        );
      }
    })().catch(() => {
      // A capability read that cannot run must never be the reason a server is down.
    });
  }

  // The port-ownership guard (2026-10-18). Fired unawaited, after the socket is listening, because a boot must
  // not wait on a loopback round trip; it exits the process only on the one unambiguous outcome (another
  // instance answering), and is silent when this process is provably the owner.
  void (async () => {
    await waitForListening(bootRef.server ?? {});
    await verifyBoundPort({
      server: bootServer,
      logger,
      exit: exitFn,
      ...(probe ? { probe } : {}),
    });
  })().catch(() => {
    // A guard that cannot run must never be the reason a server is down.
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

/**
 * Resolve once the server is listening.
 *
 * The guard needs `address()`, which is null until the socket binds, and the boot must not block on the loopback
 * probe, so this is awaited inside the unawaited guard rather than in the boot path. A server that already reports
 * `listening` resolves immediately; one that never becomes listening (a fake) simply never probes, which is the
 * same outcome as having no bound address.
 */
function waitForListening(server: { listening?: boolean; once?: (e: string, h: () => void) => unknown }) {
  if (server.listening === true) return Promise.resolve();
  if (typeof server.once !== 'function') return Promise.resolve();
  return new Promise<void>((resolve) => server.once!('listening', resolve));
}

export default { startServer };
