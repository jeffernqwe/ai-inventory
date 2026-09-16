import { Platform } from 'react-native';

/**
 * Backend API base URL.
 *
 * The URL is configurable at build/start time via the EXPO_PUBLIC_API_URL env
 * var (see `.env.example`). When unset we fall back to the local development
 * server address for the platform — Android emulators reach the host machine
 * through 10.0.2.2, everything else uses localhost. Physical devices should
 * set EXPO_PUBLIC_API_URL to the machine's LAN address.
 *
 * Only ever a plain HTTP(S) URL — no credentials or secrets belong here.
 */
function defaultBaseUrl(): string {
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

const raw: string = process.env.EXPO_PUBLIC_API_URL || defaultBaseUrl();

export const API_URL: string = raw.replace(/\/+$/, '');

export const REQUEST_TIMEOUT_MS = 15000;
