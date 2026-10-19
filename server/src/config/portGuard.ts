/**
 * The port-ownership guard (2026-10-18).
 *
 * A server that is LISTENING is not necessarily the server that is ANSWERING. On Windows a second process can
 * bind a port that is already in use, log exactly what a healthy boot logs, and receive none of the traffic —
 * every request keeps going to whoever bound it first. That was measured on 2026-10-17 (§27CW), and it cost real
 * provider requests because an environment override aimed at a local stub appeared to be ignored while the old
 * process happily called the deployed gateway.
 *
 * A readiness probe cannot tell these apart: both processes answer `{"status":"ready"}`, because the answer is
 * being written by the same process in both cases. The only thing that distinguishes a boot from the boot is an
 * identity the acting process chose itself. So every response carries `X-Instance-ID` (config/instanceIdentity.ts),
 * and a boot asks the port it just bound to say its own name:
 *
 *   * same id          → this process is the one serving. Silent.
 *   * a different id   → another Inventory AI server owns the port. Fatal: exit 1. A process that is listening
 *                        but not serving is worse than one that refused to start, because it looks healthy.
 *   * unreachable, or no id at all → INCONCLUSIVE. Logged and startup continues: a loopback probe can fail for
 *                        reasons that are not the trap (slow host, an app built without the middleware, a test's
 *                        bare Express instance), and refusing to boot on an inconclusive probe would break real
 *                        deployments to catch a hypothetical one.
 *
 * The guard never throws, never blocks a successful boot, and never fails the boot it cannot decide.
 */
import { INSTANCE_ID, INSTANCE_ID_HEADER } from './instanceIdentity.ts';

/** Where the probe asks. Loopback only — this is a question about our own process, not about a deployment. */
const PROBE_HOST = '127.0.0.1';

/**
 * How long the probe waits for its own answer. Deliberately short: it runs once, on the boot path, against a
 * listener in the same process, and an inconclusive answer is not a failure.
 */
export const DEFAULT_PROBE_TIMEOUT_MS = 1500;

export type PortProbeResult = {
  reachable: boolean;
  instanceId: string | null;
};

export type PortGuardLogger = {
  log(message: string): void;
  error(message: string): void;
};

export type PortGuardResult = {
  /** false ONLY for the measured trap — the port is answered by a different instance. */
  ok: boolean;
  /** true only when the port was proven to be this process's. */
  verified: boolean;
  skipped?: boolean;
};

type AddressInfo = { port?: unknown };

/**
 * Ask whatever is serving `port` to identify itself.
 *
 * `/api/health/live` is used rather than `/api/health` or `/ready` on purpose: it is the one endpoint that
 * answers without touching MongoDB, so the probe cannot be slow or fail because the database is down — the
 * question is "who is there", not "is it healthy".
 */
export async function probePortOwnership(
  port: number,
  { timeoutMs = DEFAULT_PROBE_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<PortProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const res = await fetch(`http://${PROBE_HOST}:${port}/api/health/live`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const raw = res.headers.get(INSTANCE_ID_HEADER);
    return { reachable: true, instanceId: raw && raw.trim() ? raw.trim() : null };
  } catch {
    // A refused connection, a timeout and a malformed response are all the same fact here: not decidable.
    return { reachable: false, instanceId: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compare the port's answer with this process's identity and act on it.
 *
 * Every dependency is injectable so the three outcomes can be pinned without a socket, and `exit` is injected
 * for the same reason `startup.ts` injects it — so a failing boot can be observed instead of killing the test
 * runner.
 */
export async function verifyPortOwnership({
  port,
  probe = probePortOwnership,
  logger = console,
  exit,
  instanceId = INSTANCE_ID,
}: {
  port: number;
  probe?: (port: number) => Promise<PortProbeResult>;
  logger?: PortGuardLogger;
  exit?: (code: number) => void;
  instanceId?: string;
}): Promise<PortGuardResult> {
  let result: PortProbeResult;
  try {
    result = await probe(port);
  } catch {
    result = { reachable: false, instanceId: null };
  }

  if (result.reachable && result.instanceId === instanceId) {
    return { ok: true, verified: true };
  }

  if (result.reachable && result.instanceId) {
    logger.error(
      `[server] port ${port} is answered by a DIFFERENT server instance (${result.instanceId}), not this one ` +
        `(${instanceId}) — this process is listening but NOT serving, and every request is going to the other one. ` +
        `Stop the stale process and start again: netstat -ano | findstr :${port}, then taskkill /PID <pid> /F ` +
        `(on macOS/Linux: lsof -nP -iTCP:${port} -sTCP:LISTEN).`
    );
    exit?.(1);
    return { ok: false, verified: false };
  }

  // Inconclusive. Say so, because an operator who later wonders why a stale server went unnoticed deserves to
  // know this boot could not tell — but never refuse to start over it.
  logger.error(
    `[server] could not confirm that port ${port} is served by this process ` +
      `(${result.reachable ? 'an answer arrived with no instance id' : 'nothing answered on loopback'}); ` +
      `continuing, but a stale server on this port would be indistinguishable from this one by readiness alone.`
  );
  return { ok: true, verified: false };
}

/**
 * Read the port a listening server actually bound (an ephemeral `0` in the config becomes a real number here)
 * and run the guard against it.
 *
 * A server that exposes no bound address is skipped rather than failed: that is a structural limitation of the
 * object handed in (a test fake, a transport without `address()`), not evidence about the port.
 */
export async function verifyBoundPort({
  server,
  probe = probePortOwnership,
  logger = console,
  exit,
  instanceId = INSTANCE_ID,
}: {
  server: { address?: () => unknown } | null | undefined;
  probe?: (port: number) => Promise<PortProbeResult>;
  logger?: PortGuardLogger;
  exit?: (code: number) => void;
  instanceId?: string;
}): Promise<PortGuardResult> {
  const port = boundPortOf(server);
  if (!port) return { ok: true, verified: false, skipped: true };
  return verifyPortOwnership({ port, probe, logger, exit, instanceId });
}

/** The bound port, or null when this server object cannot report one. */
export function boundPortOf(server: { address?: () => unknown } | null | undefined): number | null {
  if (!server || typeof server.address !== 'function') return null;
  let address: unknown;
  try {
    address = server.address();
  } catch {
    return null;
  }
  if (!address || typeof address !== 'object') return null;
  const { port } = address as AddressInfo;
  return typeof port === 'number' && port > 0 ? port : null;
}

export default { probePortOwnership, verifyPortOwnership, verifyBoundPort, boundPortOf };
