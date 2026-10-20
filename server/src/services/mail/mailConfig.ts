/**
 * Mail configuration, read lazily from environment variables at call time.
 *
 * Reading process.env on every access (rather than caching at module load) is
 * the same pattern as services/ai/aiConfig.js, and it matters for the same
 * reasons: node:test can switch MAIL_PROVIDER between test files, and a missing
 * key or an unknown provider name can never prevent the server from booting —
 * password recovery simply answers a clean 503 until an operator fixes it.
 *
 * Every value here lives server-side only. Nothing in this module is ever sent
 * to the mobile application, and the provider API key (`BREVO_API_KEY`) is
 * deliberately NOT part of this object: it is read by the transport that needs it
 * (`brevoProvider.ts`) so it cannot be spread into a log line or an error by
 * accident.
 */

function positiveInt(raw: string | undefined, fallback: number) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function trimmed(raw: unknown) {
  return typeof raw === 'string' ? raw.trim() : '';
}

export function mailConfig() {
  return {
    // Provider selector (mirrors AI_PROVIDER). Normalised to lower case for the
    // registry lookup; empty means mail is disabled.
    provider: trimmed(process.env.MAIL_PROVIDER).toLowerCase(),
    // Sender address, passed to the provider verbatim so an RFC 5322 display
    // form ("Inventory AI <no-reply@example.com>") works with no extra variable.
    from: trimmed(process.env.MAIL_FROM),
    // Public base URL of the password-reset screen. The reset link appends its
    // opaque token as a query parameter; this value carries no secret.
    resetUrl: trimmed(process.env.PASSWORD_RESET_URL),
    appName: trimmed(process.env.MAIL_APP_NAME) || 'Inventory AI',
    requestTimeoutMs: positiveInt(process.env.MAIL_REQUEST_TIMEOUT_MS, 10000),
  };
}

export default { mailConfig };
