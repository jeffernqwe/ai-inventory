/**
 * Mail provider registry, mirroring services/ai/providers/index.js.
 *
 * A module-level registry sits in front of a small BUILTINS table so tests can
 * swap the transport through a seam rather than through the network. `resend` is
 * the only built-in, and there is deliberately no console or file provider: a
 * development provider that "delivers" by printing would put the raw reset token
 * into the logs, which is the one thing this whole layer exists to prevent. When
 * mail is unconfigured the honest behaviour is to say so.
 *
 * Configuration is read at call time, never at import time, so a test can change
 * process.env and observe the new value without reloading the module — and so a
 * missing key can never stop the server from booting.
 */

import { createResendProvider } from './resendProvider.js';
import { MailNotConfigured } from '../mailErrors.ts';

const registry = new Map();

const BUILTINS = {
  resend: {
    factory: createResendProvider,
    requiredEnv: ['RESEND_API_KEY', 'MAIL_FROM'],
  },
};

function hasValue(key) {
  const raw = process.env[key];
  return typeof raw === 'string' && raw.trim() !== '';
}

export function registerProvider(name, factory) {
  registry.set(String(name).toLowerCase(), factory);
}

export function deregisterProvider(name) {
  registry.delete(String(name).toLowerCase());
}

export function registeredProviders() {
  return [...registry.keys()];
}

/** Restores the registry to its initial state: built-ins only, no test seams. */
export function resetMailProviders() {
  registry.clear();
}

/** The env vars a built-in provider needs, or null when the name is not built in. */
export function mailProviderRequiredEnv(name) {
  const entry = BUILTINS[String(name || '').trim().toLowerCase()];
  return entry ? [...entry.requiredEnv] : null;
}

/**
 * Resolves MAIL_PROVIDER to a provider instance, or throws MailNotConfigured.
 *
 * A registered provider is returned as-is and needs no environment: that is the
 * seam the test fake uses. A built-in must have every one of its required env vars
 * set to a non-blank value before its factory is called.
 */
export function selectProvider() {
  const raw = (process.env.MAIL_PROVIDER || '').trim();
  const name = raw.toLowerCase();

  if (!name) {
    throw new MailNotConfigured(
      'MAIL_PROVIDER is not set, so password-recovery email is disabled on this server.',
    );
  }

  if (registry.has(name)) return registry.get(name)();

  const builtin = BUILTINS[name];
  if (!builtin) {
    throw new MailNotConfigured(
      `The configured mail provider "${raw}" is not supported. Supported providers: ${Object.keys(BUILTINS).join(', ')}.`,
    );
  }

  const missing = builtin.requiredEnv.filter((key) => !hasValue(key));
  if (missing.length > 0) {
    throw new MailNotConfigured(
      `The configured mail provider "${raw}" is missing required configuration: ${missing.join(', ')}.`,
    );
  }

  return builtin.factory();
}

export default {
  registerProvider,
  deregisterProvider,
  registeredProviders,
  resetMailProviders,
  mailProviderRequiredEnv,
  selectProvider,
};
