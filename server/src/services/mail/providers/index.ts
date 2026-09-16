/**
 * Mail provider registry, mirroring services/ai/providers/index.ts.
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

import { createResendProvider } from './resendProvider.ts';
import { MailNotConfigured } from '../mailErrors.ts';

/**
 * What one message must carry. The transport is handed rendered strings and
 * nothing else: no template input, no reset token, no user — so a provider
 * cannot be asked to render, and the raw token has no route past the caller that
 * put it in the URL.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * What the transport reports back. `id` is nullable because the contract is
 * "the provider's own message id, when it named one"; `sendPasswordResetEmail`
 * coerces the difference away for its caller.
 */
export interface MailSendResult {
  id: string | null;
}

/**
 * The provider contract. Both registries — here and services/ai/providers —
 * resolve to one of these, and it is declared here because this is the module
 * that hands providers out: `registerProvider`'s second argument and
 * `selectProvider`'s return are the two ends of the same seam.
 */
export interface MailProvider {
  name: string;
  send(message: MailMessage): Promise<MailSendResult>;
}

export type MailProviderFactory = () => MailProvider;

/** One built-in: how to build it, and what the environment must supply first. */
interface MailProviderEntry {
  factory: MailProviderFactory;
  requiredEnv: readonly string[];
}

const registry = new Map<string, MailProviderFactory>();

const BUILTINS: Record<string, MailProviderEntry> = {
  resend: {
    factory: createResendProvider,
    requiredEnv: ['RESEND_API_KEY', 'MAIL_FROM'],
  },
};

function hasValue(key: string) {
  const raw = process.env[key];
  return typeof raw === 'string' && raw.trim() !== '';
}

export function registerProvider(name: unknown, factory: MailProviderFactory) {
  registry.set(String(name).toLowerCase(), factory);
}

export function deregisterProvider(name: unknown) {
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
export function mailProviderRequiredEnv(name: unknown) {
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
export function selectProvider(): MailProvider {
  const raw = (process.env.MAIL_PROVIDER || '').trim();
  const name = raw.toLowerCase();

  if (!name) {
    throw new MailNotConfigured(
      'MAIL_PROVIDER is not set, so password-recovery email is disabled on this server.',
    );
  }

  if (registry.has(name)) return registry.get(name)!();

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
