/**
 * Deployment readiness — what THIS deployment is, and what it is missing.
 *
 * WHY THIS EXISTS, WITH THE DATE IT WAS WRITTEN FOR. On **2026-10-15** the deployed
 * production service was, by every signal it published, perfectly healthy: `/api/health/live`
 * answered `200`, `/api/health/ready` answered `200` with `db: "connected"` in 0.28 s, CI was
 * green on `main`, and the production configuration validator — which refuses to boot on a
 * missing `MONGODB_URI`, a short `JWT_SECRET`, a malformed `JWT_EXPIRES_IN`, an AI provider
 * without its keys, a half-configured Firebase service account or a missing code pepper — had
 * nothing to say. And **not one new member could register**, because the AUTH-04
 * email-verification code is delivered through the mail boundary and `MAIL_PROVIDER` was not
 * set on that host: `POST /api/auth/email-verification/request` answers
 * `503 EMAIL_VERIFICATION_NOT_CONFIGURED` before it touches a challenge, and
 * `POST /api/auth/forgot-password` answers `503 MAIL_NOT_CONFIGURED`. A member on a phone
 * would have discovered it, one screen into registration.
 *
 * That is the shape this module exists to remove: a state that is **legal, silent and
 * crippling**. Not a missing required variable — validation owns those, and it fails fast —
 * but a *supported* configuration in which an enabled flow cannot possibly work, said out
 * loud **at boot**, once, where the operator is already looking.
 *
 * WHAT IT IS NOT. It is not validation: it never refuses to boot, never changes a status code,
 * never touches a route and never gates a request. A degraded deployment stays up and keeps
 * serving the flows it *can* serve — which is the property the mail boundary's own design
 * already relies on ("password recovery simply answers a clean 503 until an operator fixes
 * it"). This module only makes the state legible, and it is deliberately a **warning**, not a
 * failure: refusing to boot over an optional integration would turn a degraded feature into a
 * dead deployment on the next restart.
 *
 * WHY IT READS THE REAL PREDICATES RATHER THAN REPEATING THEIR RULES. `mail`, `firebase` and
 * the AUTH-04 gate are asked of the modules that own them (`isMailConfigured`,
 * `isFirebaseConfigured`, `isEmailVerificationConfigured`), so a readiness line can never
 * disagree with the code whose behaviour it describes. That is the same argument
 * `config/firebase.ts` and `config/emailVerification.ts` make for sharing their predicates
 * with the production validator. The consequence is that this file's reader is **impure** —
 * it reads the live environment — which is exactly why every piece of *logic* here is a pure
 * function of a report, and the suite drives those rather than mocking `process.env`.
 *
 * NOTHING HERE PRINTS A VALUE. The line and the notes name **variables** and **states**, never
 * a secret, a recipient, a connection string or a key — including on the paths that were
 * configured wrongly, which is where a careless implementation quotes the thing it rejected.
 *
 * IT IS IMPORTANT TO NOTE THE EXCEPTION: the build identity below (`commit`) is derived from
 * the host's environment and is the ONE field here that is published to a caller. It is a
 * commit id — not a credential, not a host, not a tenant — and it exists because "is the
 * deployed build the one I just merged?" was, until it existed, unanswerable from outside the
 * hosting dashboard. See `routes/health.routes.ts` for where it is exposed and why that is
 * deliberate rather than an oversight.
 */

import { isEmailVerificationConfigured, EMAIL_VERIFICATION_CODE_PEPPER_ENV } from './emailVerification.ts';
import { isFirebaseConfigured } from './firebase.ts';
import { isMailConfigured, mailProviderName } from '../services/mail/index.ts';

/** The integration states a deployment can be in, as booleans and (where configured) names. */
export interface IntegrationReport {
  /** May this server send mail at all? Read from the mail boundary, never re-derived. */
  mail: boolean;
  /** The configured provider name, or `''` when mail is off. */
  mailProvider: string;
  /** Is a complete Firebase service account configured? */
  firebase: boolean;
  /** May this server run the AUTH-04 flow (Firebase AND a usable pepper)? */
  emailVerification: boolean;
  /** Is an AI provider selected? */
  ai: boolean;
  /** The configured provider name, or `''` when the assistant is off. */
  aiProvider: string;
}

/** What a caller may be told about the running build. */
export interface BuildInfo {
  /** The deployed commit, or `'unknown'` when the host does not state one. */
  commit: string;
  /** Whole seconds since this PROCESS started — "was this restarted?", answered cheaply. */
  uptimeSeconds: number;
}

/**
 * The environment variables a host may use to state which commit is running.
 *
 * Ordered most-specific first: Render injects `RENDER_GIT_COMMIT` for the service it built,
 * GitHub Actions exports `GITHUB_SHA` for the commit it checked out (so a CI boot smoke can
 * identify itself too), and `GIT_COMMIT` is the conventional escape hatch for anything else.
 * A host that states none of them reports `unknown` — which is a real answer, not an error.
 */
const COMMIT_ENV_NAMES = ['RENDER_GIT_COMMIT', 'GIT_COMMIT', 'GITHUB_SHA'] as const;

/**
 * A commit id, as this module is willing to echo one: 7–40 hex characters.
 *
 * THE SHAPE CHECK IS NOT COSMETIC. The value comes from the environment, which is to say
 * untrusted input as far as this module is concerned — an operator typo, a stray shell
 * variable or a host that puts something else in the variable would otherwise be published
 * verbatim on a public endpoint. Anything that is not a commit id is reported as `unknown`.
 */
const COMMIT_SHAPE = /^[0-9a-f]{7,40}$/i;

/**
 * Read what this deployment is. Impure by design — see the module header.
 *
 * Every field is asked of the module that owns the question, so this cannot drift from the
 * behaviour it describes.
 */
export function integrationReport(): IntegrationReport {
  return {
    mail: isMailConfigured(),
    mailProvider: mailProviderName(),
    firebase: isFirebaseConfigured(),
    emailVerification: isEmailVerificationConfigured(),
    ai: Boolean(process.env.AI_PROVIDER && process.env.AI_PROVIDER.trim()),
    aiProvider: (process.env.AI_PROVIDER || '').trim(),
  };
}

/**
 * The one boot line that answers "what is on?".
 *
 * Deliberately one line, and greppable with a single token (`[config] integrations`), for the
 * same reason AI-5's turn line is one line: the reader is an operator scrolling a deploy log,
 * and the count of lines is a property worth being able to state.
 */
export function deploymentLine(report: IntegrationReport): string {
  const mail = report.mail ? `on(${report.mailProvider})` : 'off';
  const ai = report.ai ? `on(${report.aiProvider})` : 'off';
  return (
    `[config] integrations mail=${mail} firebase=${report.firebase ? 'on' : 'off'}` +
    ` emailVerification=${report.emailVerification ? 'on' : 'off'} ai=${ai}`
  );
}

/**
 * The states that are legal, silent and unusable — each with what to set.
 *
 * A PURE function of a report, so its cases are asserted directly rather than through the
 * environment. Empty is the healthy answer, and it is asserted as such in both directions: a
 * check that always had something to say would be noise an operator learns to ignore.
 *
 * The two notes below are the SAME SHAPE of problem — an enabled flow with a missing
 * dependency — and each names the variables to set, because "email verification is
 * unavailable" without the variable name sends the reader to grep.
 */
export function deploymentNotes(report: IntegrationReport): string[] {
  const notes: string[] = [];

  // The one that was true in production on 2026-10-15. The AUTH-04 flow IS the registration
  // gate: a member verifies before any User, Business, JWT or session exists, so a server that
  // cannot deliver the code cannot onboard anybody — while continuing to serve every existing
  // member perfectly. That combination is precisely the one that hides.
  if (report.emailVerification && !report.mail) {
    notes.push(
      'email verification is ENABLED but mail is not configured: no new member can complete ' +
        'registration (POST /api/auth/email-verification/request answers 503 ' +
        'EMAIL_VERIFICATION_NOT_CONFIGURED) and POST /api/auth/forgot-password answers 503 ' +
        'MAIL_NOT_CONFIGURED. Set MAIL_PROVIDER=brevo, MAIL_FROM and BREVO_API_KEY on this host.',
    );
  }

  // NOTE ON WHAT IS DELIBERATELY ABSENT.
  //
  // `NODE_ENV` is not a note here. Every state listed in this function is legal: an optional
  // integration that cannot work degrades a feature, and refusing to boot over one would turn
  // that into a dead deployment. An environment the process cannot name is not in that class —
  // it decides the production checks, the database and the error detail at once — so it is a
  // BOOT DECISION in `startServer`, not a readiness line. The report stays a list of what this
  // deployment is missing, and nothing here can be mistaken for "optional".

  // Reachable outside production, where validation is deliberately lenient: Firebase is
  // configured, so the flow is *wanted*, but the pepper it keys its codes with is absent or
  // too short — which validation refuses in production and which answers 503 here.
  if (report.firebase && !report.emailVerification) {
    notes.push(
      `Firebase is configured but the AUTH-04 flow is unavailable: ${EMAIL_VERIFICATION_CODE_PEPPER_ENV} ` +
        'is missing or shorter than the required minimum. New members cannot verify their email, so ' +
        'registration cannot complete. (Production refuses to boot in this state.)',
    );
  }

  return notes;
}

/**
 * The inputs `proxyTrustNote` decides from. Both are non-secret, server-derived facts.
 */
export interface ProxyTrustState {
  /** The posture this process serves: `production`, `development` or `test`. */
  nodeEnv: string;
  /** `TRUST_PROXY` as a hop count (0 = no proxy trusted). */
  trustProxy: number;
}

/**
 * 2026-10-23 security audit — a PRODUCTION service behind a proxy that does not declare it.
 *
 * WHY THIS IS A WARNING AND NOT A REFUSAL. It is the same class as the notes above: a
 * deployment that boots, answers every request, and is quietly weaker than it looks. But it is
 * also the one note whose consequence reaches EVERY member, so it is stated in the log with the
 * exact numbers rather than as a general "check your proxy".
 *
 * WHAT ACTUALLY HAPPENS WITHOUT IT. Express resolves `req.ip` from the direct socket peer unless
 * a proxy is trusted. Render terminates TLS at a proxy, so `req.ip` becomes that proxy's address
 * for every caller — and every per-IP auth limiter therefore counts ONE bucket for the whole
 * world: the login IP bucket (60 failures / 15 min) means sixty wrong passwords from anywhere
 * answer 429 to every member's login for a quarter of an hour; the password-reset IP bucket
 * (20 / hour) and the registration / exchange / verification buckets collapse the same way. The
 * per-account login bucket becomes effectively per-email globally, so one source can also lock a
 * known account for the window.
 *
 * It is not a security downgrade in the opposite direction: with trust 0, a spoofed
 * `X-Forwarded-For` is ignored, so no caller can manufacture fresh buckets. The failure is
 * availability and lockout, not bypass — which is exactly why it hides. Nothing in a request's
 * status code reveals it; only the log line does.
 *
 * The value is compared as a NUMBER, and the message names the variable and the safe value. It
 * never reads or prints anything from the environment.
 */
export function proxyTrustNote({ nodeEnv, trustProxy }: ProxyTrustState): string | null {
  if (nodeEnv !== 'production') return null;
  const hops = Number(trustProxy);
  if (Number.isFinite(hops) && hops > 0) return null;
  return (
    'TRUST_PROXY is not set on this PRODUCTION service. Every per-IP auth rate limiter is ' +
    'therefore keying on the proxy in front of this process instead of on the caller: the login ' +
    'IP bucket (60 failures / 15 min) becomes ONE global bucket, so sixty failed logins from ' +
    'anywhere answer 429 to every member for a quarter of an hour, and the password-reset ' +
    '(20 / hour), registration (30 / hour), Firebase exchange (30 / 15 min), email-verification ' +
    '(30 / 15 min) and session-renewal (120 / 15 min) buckets collapse the same way. Set ' +
    'TRUST_PROXY=1 on Render (the exact number of proxy hops, never `true`).'
  );
}

/**
 * What this build is: the deployed commit and how long the process has been up.
 *
 * The two halves answer the two deployment questions that could not be asked from outside the
 * hosting dashboard: *is the running build the one I merged?* and *did the deploy actually
 * restart the process?* A stale deploy is the failure mode this closes — a documentation
 * change, a config fix or a merge that landed while the service quietly kept serving the old
 * build, which this project has already paid for once (a device run measured "old code" until
 * a reload was produced; §27CE).
 *
 * `values` and `uptime` are injectable so the suite pins both halves deterministically — the
 * same seam `createHealthRouter` gives its database state.
 */
export function buildInfo(
  values: Record<string, string | undefined> = process.env,
  uptime: () => number = () => process.uptime(),
): BuildInfo {
  let commit = 'unknown';
  for (const name of COMMIT_ENV_NAMES) {
    const raw = values?.[name];
    const candidate = typeof raw === 'string' ? raw.trim() : '';
    if (COMMIT_SHAPE.test(candidate)) {
      commit = candidate.toLowerCase();
      break;
    }
  }
  const seconds = uptime();
  return {
    commit,
    uptimeSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0,
  };
}

export default { integrationReport, deploymentLine, deploymentNotes, proxyTrustNote, buildInfo };
