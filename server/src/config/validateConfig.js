/**
 * Production configuration validation (Phase 07D / H7).
 *
 * The server only accepts traffic in production when the environment is
 * genuinely runnable, so a broken deploy fails fast at startup (non-zero exit)
 * instead of booting and answering every request with a 500.
 *
 * Checks:
 *   - MONGODB_URI   present (never logged; "usable" is verified by the startup
 *                   database connection — see config/startup.js).
 *   - JWT_SECRET    present and long enough to be a credible signing secret.
 *   - JWT_EXPIRES_IN, when set, is a timespan jsonwebtoken can parse (probed
 *                   with a throwaway signature so a malformed value fails at
 *                   boot instead of turning the first login into a 500).
 *   - AI_PROVIDER   when a provider IS configured, the keys that provider needs
 *                   are present (respecting the provider abstraction: the
 *                   provider layer declares its own requirements). An empty
 *                   AI_PROVIDER is the supported "AI disabled" state.
 *
 * Problems are returned as { variable, message } objects. Messages name the
 * VARIABLE that is wrong — they never contain the variable's value, so no
 * secret (connection string, JWT, API key) can ever be printed.
 */

import jwt from 'jsonwebtoken';

import { providerRequiredEnv } from '../services/ai/providers/index.js';

/** Minimum JWT_SECRET length. A short secret is not a credible HS256 signing key. */
export const JWT_SECRET_MIN_LENGTH = 32;

function missing(variable) {
  return { variable, message: `Missing required environment variable: ${variable}` };
}

/**
 * Validate the production configuration against `values` (defaults to
 * process.env). Returns an array of { variable, message } problems — empty when
 * the configuration is valid. Never includes secret values.
 */
export function validateProductionConfig(values = process.env) {
  const problems = [];
  const get = (key) => {
    const raw = values && typeof values[key] === 'string' ? values[key] : '';
    return raw.trim();
  };

  if (!get('MONGODB_URI')) {
    problems.push(missing('MONGODB_URI'));
  }

  const jwtSecret = get('JWT_SECRET');
  if (!jwtSecret) {
    problems.push(missing('JWT_SECRET'));
  } else if (jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
    problems.push({
      variable: 'JWT_SECRET',
      message: `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters in production`,
    });
  }

  // Phase 07G: env.js passes JWT_EXPIRES_IN straight to jsonwebtoken, so a
  // malformed value today only fails on the FIRST login — as a 500 — instead of
  // at boot. Probe it with a throwaway signature (never transmitted, nothing
  // persisted) reusing jsonwebtoken's own parser, so this check can never
  // disagree with signAccessToken about what is valid. An empty value is left
  // alone: env.js already treats it as absent and applies the "7d" default.
  const jwtExpiresIn = get('JWT_EXPIRES_IN');
  if (jwtSecret && jwtExpiresIn) {
    try {
      jwt.sign({ sub: 'startup-config-probe' }, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: jwtExpiresIn,
      });
    } catch {
      problems.push({
        variable: 'JWT_EXPIRES_IN',
        message:
          'JWT_EXPIRES_IN is not a valid expiration string. Use a jsonwebtoken timespan such as "7d", "15m", or "2h", or a number of seconds.',
      });
    }
  }

  const provider = get('AI_PROVIDER');
  if (provider) {
    const required = providerRequiredEnv(provider);
    if (required === null) {
      problems.push({
        variable: 'AI_PROVIDER',
        message:
          'AI_PROVIDER is set to an unsupported provider. Use "claude", "gemini", or "agentrouter", or leave it empty to disable the AI assistant.',
      });
    } else {
      for (const variable of required) {
        if (!get(variable)) {
          problems.push({
            variable,
            message: `Missing required environment variable: ${variable} (required by the configured AI provider "${provider}")`,
          });
        }
      }
    }
  }

  return problems;
}

export default { validateProductionConfig, JWT_SECRET_MIN_LENGTH };
