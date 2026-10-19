/**
 * The running process's own response identity (2026-10-18).
 *
 * WHY THIS EXISTS — it is written from a measured trap, not an imagined one. On 2026-10-17 four
 * `node src/index.ts` processes were alive on the development machine and the one that owned `:4000` was not the
 * one just started: **Windows let the second bind succeed**, so the new process printed
 * `[server] … listening on http://localhost:4000` and `/api/health/ready` answered `{"status":"ready"}` — from
 * the OLD process — while every request kept being served there. An environment override (a provider base URL
 * pointed at a local stub) therefore looked like it had been ignored, two turns reached the deployed provider
 * instead, and four requests were spent on two unusable answers (§27CW).
 *
 * The fix is not more logging; it is that a running process can PROVE it is the one answering. Every response
 * carries this boot's id, and the boot itself asks the port who is there (config/portGuard.ts).
 *
 * WHAT THIS IS NOT. It is not a credential, a session, a tenant or a build id, and nothing authorizes on it: it
 * is a fresh random value per process, it is regenerated on every restart, and it is meaningless the moment the
 * process exits. It identifies "this boot of this server" and nothing else.
 */
import { randomUUID } from 'node:crypto';

/** The response header carrying {@link INSTANCE_ID}. Lowercase, as HTTP/2 and fetch normalise it. */
export const INSTANCE_ID_HEADER = 'x-instance-id';

/** This process's identity, created once at module load and stable for the life of the process. */
export const INSTANCE_ID: string = randomUUID();

export default { INSTANCE_ID, INSTANCE_ID_HEADER };
