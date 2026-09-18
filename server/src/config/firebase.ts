/**
 * Firebase Admin configuration, read lazily from environment variables at call
 * time (Phase 32B).
 *
 * Reading process.env on every access — rather than caching at module load — is
 * the same pattern as services/mail/mailConfig.ts and services/ai/aiConfig.js,
 * and it matters for the same reasons: node:test can switch the Firebase
 * environment between test files, and an absent or malformed Firebase
 * configuration can never prevent the server from booting. With no Firebase
 * configured, the server behaves EXACTLY as it did before Phase 32B — that is
 * the property that makes this phase additive.
 *
 * This module deliberately does NOT import firebase-admin. It is pure
 * environment parsing, which is what lets config/validateConfig.ts (and the
 * production-config suite) stay fast and dependency-free, and what lets
 * `serviceAccountProblems` be a pure function of a values bag rather than of the
 * live process. The SDK is loaded only by services/firebase/adminApp.ts.
 *
 * Everything here is server-side ONLY. No value in this module is ever returned
 * in a response, sent to the mobile application, or written to a log — the
 * service-account private key in particular. See services/firebase/firebaseErrors.ts
 * for why no error may carry a value either.
 */

/**
 * The single-variable form: the whole service-account JSON in one value.
 *
 * Preferred for a deployment behind a web dashboard (Render, Heroku, ...)
 * because it removes the failure class the three-variable form cannot: a PEM
 * pasted through a browser textarea routinely loses or mangles its newlines, and
 * a multi-line value is awkward to store in any case. Accepts either the JSON
 * verbatim or the same JSON base64-encoded — see `decodeServiceAccountJson`.
 */
export const FIREBASE_SERVICE_ACCOUNT_JSON = 'FIREBASE_SERVICE_ACCOUNT_JSON';

/**
 * The three-variable form. All three are required together: a service account is
 * an indivisible credential, and a half-supplied one is a misconfiguration that
 * should fail at boot rather than at the first token exchange.
 */
export const FIREBASE_ACCOUNT_ENV = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
] as const;

/**
 * One problem with the Firebase configuration. `variable` names the environment
 * VARIABLE that is wrong; `message` never carries its value, so no part of the
 * service-account credential can be printed by a validation failure. Structurally
 * identical to `ConfigProblem` in config/validateConfig.ts, which is what lets
 * these be spread straight into that validator's problem list.
 */
export interface ServiceAccountProblem {
  variable: string;
  message: string;
}

/**
 * What a resolved Firebase configuration looks like. `source` records which
 * form supplied it, so an operator can tell a single-variable deployment from a
 * three-variable one without either being logged as a value.
 */
export interface FirebaseConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  source: 'service-account-json' | 'individual' | 'none';
}

function trimmed(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function hasValue(raw: unknown): boolean {
  return trimmed(raw) !== '';
}

/**
 * A PEM private key that travelled through an environment variable usually
 * arrives with literal two-character `\n` sequences instead of real newlines —
 * the standard way to store a multi-line value in one line. `cert()` rejects
 * such a value, so the conversion is not cosmetic: without it every deployment
 * that stores the key this way fails.
 *
 * A key that already has real newlines is unaffected (there is no `\n` sequence
 * left to replace), so this is safe for both spellings.
 */
function normalizePrivateKey(raw: unknown): string {
  return trimmed(raw).replace(/\\n/g, '\n');
}

/**
 * Parses FIREBASE_SERVICE_ACCOUNT_JSON, accepting the JSON verbatim or the same
 * JSON base64-encoded.
 *
 * The two forms cannot be confused in practice: a JSON object begins with `{`,
 * which is not a base64 alphabet character, so the base64 attempt is only ever
 * reached by a value that is not already JSON. Returns null when neither form
 * parses — the caller reports that as a problem rather than throwing, so a
 * malformed value surfaces as a boot-time message naming the variable.
 */
function decodeServiceAccountJson(raw: unknown): Record<string, unknown> | null {
  const value = trimmed(raw);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Not verbatim JSON — fall through to the base64 attempt below.
  }

  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Neither form parsed. Reported by the caller.
  }

  return null;
}

/**
 * The Firebase configuration problems in `values` (defaults to process.env).
 *
 * The rule is deliberately ALL-OR-NOTHING, and it is the reason Phase 32B cannot
 * break an existing deployment:
 *
 *   * Nothing Firebase-related set  -> [] (Firebase is disabled). This is a
 *     supported state, exactly like an empty AI_PROVIDER, and it is the state
 *     every existing production deployment is in today.
 *   * FIREBASE_SERVICE_ACCOUNT_JSON set -> it must parse AND carry
 *     project_id/client_email/private_key. The individual variables are then
 *     ignored entirely, so there is never a question of which one won.
 *   * Any individual variable set -> ALL THREE must be present.
 *
 * Messages name the VARIABLE only. No value, and no part of a value, is ever
 * included — including on a JSON parse failure, where a parser's own message can
 * quote the input it rejected (the same reasoning as the mail layer discarding
 * Resend's free-text error).
 */
export function serviceAccountProblems(
  values: Record<string, string | undefined> = process.env
): ServiceAccountProblem[] {
  const problems: ServiceAccountProblem[] = [];

  const jsonRaw = values?.[FIREBASE_SERVICE_ACCOUNT_JSON];
  const anyIndividualSet = FIREBASE_ACCOUNT_ENV.some((key) => hasValue(values?.[key]));

  // Nothing configured at all: Firebase is disabled. Not a problem.
  if (!hasValue(jsonRaw) && !anyIndividualSet) return problems;

  if (hasValue(jsonRaw)) {
    const account = decodeServiceAccountJson(jsonRaw);
    if (!account) {
      problems.push({
        variable: FIREBASE_SERVICE_ACCOUNT_JSON,
        message: `${FIREBASE_SERVICE_ACCOUNT_JSON} is not valid JSON, and is not valid base64-encoded JSON either. Paste the service-account JSON verbatim, or its base64 encoding.`,
      });
      return problems;
    }

    if (!hasValue(account.project_id)) {
      problems.push({
        variable: FIREBASE_SERVICE_ACCOUNT_JSON,
        message: `${FIREBASE_SERVICE_ACCOUNT_JSON} is missing the "project_id" field of a Firebase service account.`,
      });
    }
    if (!hasValue(account.client_email)) {
      problems.push({
        variable: FIREBASE_SERVICE_ACCOUNT_JSON,
        message: `${FIREBASE_SERVICE_ACCOUNT_JSON} is missing the "client_email" field of a Firebase service account.`,
      });
    }
    if (!hasValue(account.private_key)) {
      problems.push({
        variable: FIREBASE_SERVICE_ACCOUNT_JSON,
        message: `${FIREBASE_SERVICE_ACCOUNT_JSON} is missing the "private_key" field of a Firebase service account.`,
      });
    }
    return problems;
  }

  // Individual form: all three, or none.
  for (const variable of FIREBASE_ACCOUNT_ENV) {
    if (!hasValue(values?.[variable])) {
      problems.push({
        variable,
        message: `Missing required environment variable: ${variable} (Firebase is partially configured — FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together, or all left empty to keep Firebase disabled)`,
      });
    }
  }

  return problems;
}

/**
 * Resolves the Firebase configuration from the environment.
 *
 * Never throws: an absent or incomplete configuration resolves to
 * `source: 'none'` with empty fields, which is how `isFirebaseConfigured()`
 * answers false without the caller handling an exception. Callers that need a
 * configured Firebase (services/firebase/adminApp.ts) raise FirebaseNotConfigured
 * themselves, so the failure carries a service-layer code rather than a config one.
 */
export function firebaseConfig(
  values: Record<string, string | undefined> = process.env
): FirebaseConfig {
  const jsonRaw = values?.[FIREBASE_SERVICE_ACCOUNT_JSON];

  if (hasValue(jsonRaw)) {
    const account = decodeServiceAccountJson(jsonRaw);
    if (account) {
      return {
        projectId: trimmed(account.project_id),
        clientEmail: trimmed(account.client_email),
        privateKey: normalizePrivateKey(account.private_key),
        source: 'service-account-json',
      };
    }
    // Unparseable: surface as unconfigured rather than half-built. The reason is
    // reported by serviceAccountProblems, which production config validation runs.
    return { projectId: '', clientEmail: '', privateKey: '', source: 'none' };
  }

  const projectId = trimmed(values?.['FIREBASE_PROJECT_ID']);
  const clientEmail = trimmed(values?.['FIREBASE_CLIENT_EMAIL']);
  const privateKey = normalizePrivateKey(values?.['FIREBASE_PRIVATE_KEY']);

  if (!projectId || !clientEmail || !privateKey) {
    return { projectId: '', clientEmail: '', privateKey: '', source: 'none' };
  }

  return { projectId, clientEmail, privateKey, source: 'individual' };
}

/**
 * True when the environment supplies a complete Firebase service account.
 * Never throws. With this false, no Firebase verification is possible and — in
 * Phase 32B — nothing in the running server calls for it.
 */
export function isFirebaseConfigured(values: Record<string, string | undefined> = process.env): boolean {
  return serviceAccountProblems(values).length === 0 && firebaseConfig(values).source !== 'none';
}

export default {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_ACCOUNT_ENV,
  serviceAccountProblems,
  firebaseConfig,
  isFirebaseConfigured,
};
