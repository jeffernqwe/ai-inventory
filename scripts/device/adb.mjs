/**
 * The only file in the harness that touches a phone.
 *
 * Everything here is `adb` invoked with an ARGUMENT ARRAY, never a shell string: on Windows the
 * local quoting of a command containing `'`, `!` or a path with spaces is a bug factory, and passing
 * argv straight to the executable removes that whole class. The device side still runs through the
 * phone's shell for `input text` and `run-as`, which is why `escapeInputText` exists.
 *
 * Two behaviours come from `docs/DEVELOPING_ON_A_PHYSICAL_DEVICE.md`'s measured traps, not from
 * theory:
 *
 *   * `uiautomator dump` is intermittent and a FAILED dump leaves the PREVIOUS file behind, so a
 *     naive reader answers with the last screen it saw. Every read deletes the remote and local
 *     copy first and treats a blank file as "no screen", then retries.
 *   * the `adb reverse` tunnels do not survive an adb server restart, so the runner probes them
 *     rather than discovering it as a mysterious network error mid-journey.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isBlankDump, isUnstableDump, parseDump, quoteForDeviceShell } from './lib.mjs';

const PACKAGE = 'com.inventoryai.app';
const KEYCODES = { BACK: '4', ENTER: '66', HOME: '3', TAB: '61', DEL: '67', ESCAPE: '111' };
const DUMP_PATH = '/sdcard/inventoryai-harness.xml';

export class DeviceUnavailable extends Error {}

/** Run adb and return stdout. Throws `DeviceUnavailable` for the failures that mean "cannot check". */
export function adb(args, { adbPath = 'adb', timeout = 30_000, binary = false } = {}) {
  try {
    const out = execFileSync(adbPath, args, {
      timeout,
      maxBuffer: 32 * 1024 * 1024,
      // Windows would otherwise translate the exit code through cmd.exe conventions.
      shell: false,
    });
    return binary ? out : out.toString('utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new DeviceUnavailable(`adb was not found on PATH (${adbPath}); install platform-tools`);
    }
    if (err.status === 127) throw new DeviceUnavailable('the phone refused the command (127)');
    throw err;
  }
}

/** One device, by serial (or the only one attached). */
export function deviceInfo({ adbPath = 'adb', serial } = {}) {
  const target = serial ? ['-s', serial] : [];
  const devices = adb([...target, 'devices'], { adbPath })
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  const ready = devices.filter((line) => line.endsWith('\tdevice') || /\sdevice$/.test(line));
  if (!ready.length) {
    const states = devices.map((line) => line.replace(/\s+/g, ' ')).join('; ');
    throw new DeviceUnavailable(
      states ? `no device in the "device" state (saw: ${states})` : 'no device attached',
    );
  }

  const chosen = serial ?? ready[0].split(/\s+/)[0];
  const prop = (name) => adb([...['-s', chosen], 'shell', 'getprop', name], { adbPath }).trim();

  return {
    serial: chosen,
    model: prop('ro.product.model') || 'unknown',
    sdk: prop('ro.build.version.sdk') || 'unknown',
    release: prop('ro.build.version.release') || 'unknown',
  };
}

/** The USB tunnels the app needs, as `tcp:port tcp:port` strings. */
export function reverseList({ adbPath = 'adb', serial } = {}) {
  const out = adb([...['-s', serial], 'reverse', '--list'], { adbPath });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Is the app's Activity in front? Used to tell "not signed in" from "the app crashed". */
export function foregroundActivity({ adbPath = 'adb', serial } = {}) {
  const out = adb([...['-s', serial], 'shell', 'dumpsys activity activities'], { adbPath });
  const line = out.split('\n').find((l) => l.includes('mResumedActivity'));
  return line ? line.trim() : '';
}

/**
 * Read the screen. Returns parsed nodes, or throws when no readable screen could be obtained.
 *
 * Retries twice over for two different failures: the dump may be BLANK (a stale-file trap) and it
 * may be UNSTABLE (taken mid-scroll, with inverted boxes). An unstable dump is returned only when
 * every attempt produced one — the labels are still worth reporting, and `findTapTarget` will
 * refuse to tap a node whose box it cannot trust.
 */
export function readScreen({ adbPath = 'adb', serial, attempts = 4, pauseMs = 700 } = {}) {
  const target = ['-s', serial];
  let last = '';
  let fallback = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Delete BOTH copies first: a stale dump is the failure mode this loop exists for.
    adb([...target, 'shell', 'rm', '-f', DUMP_PATH], { adbPath });
    last = adb([...target, 'shell', 'uiautomator', 'dump', DUMP_PATH], { adbPath });
    if (/ERROR|Exception/i.test(last)) {
      sleepSync(pauseMs);
      continue;
    }

    let xml = '';
    try {
      xml = adb([...target, 'exec-out', 'cat', DUMP_PATH], { adbPath });
    } catch {
      sleepSync(pauseMs);
      continue;
    }

    if (isBlankDump(xml)) {
      sleepSync(pauseMs);
      continue;
    }

    if (!isUnstableDump(xml)) return parseDump(xml);
    fallback = parseDump(xml);
    sleepSync(pauseMs);
  }

  if (fallback) return fallback;
  throw new Error(`could not read the screen after ${attempts} attempts (last: ${last || 'no output'})`);
}

export function tap(x, y, { adbPath = 'adb', serial } = {}) {
  adb([...['-s', serial], 'shell', 'input', 'tap', String(x), String(y)], { adbPath });
}

export function typeText(value, { adbPath = 'adb', serial } = {}) {
  adb([...['-s', serial], 'shell', 'input', 'text', value], { adbPath });
}

export function pressKey(name, { adbPath = 'adb', serial } = {}) {
  const code = KEYCODES[name] ?? name;
  adb([...['-s', serial], 'shell', 'input', 'keyevent', code], { adbPath });
}

export function swipe(x1, y1, x2, y2, { adbPath = 'adb', serial, durationMs = 300 } = {}) {
  adb(
    [
      ...['-s', serial],
      'shell',
      'input',
      'swipe',
      String(x1),
      String(y1),
      String(x2),
      String(y2),
      String(durationMs),
    ],
    { adbPath },
  );
}

/**
 * Open one of the app's routes by deep link.
 *
 * The URL is quoted for the device shell because `adb shell` re-parses what it is given: without the
 * quotes the phone's shell treats `&` as a job separator, so every parameter after it was dropped
 * and a deep link with a query string arrived as a bare route.
 */
export function openRoute(route, { adbPath = 'adb', serial } = {}) {
  const url = route.startsWith('inventoryai://') ? route : `inventoryai://${route}`;
  adb(
    [...['-s', serial], 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', quoteForDeviceShell(url)],
    { adbPath },
  );
}

/**
 * Start the app ON a development server, the way tapping it in the dev launcher does.
 *
 * A cold-started development build opens the **Expo dev launcher** ("Development Build" /
 * "DEVELOPMENT SERVERS"), not the app: `am start -n com.inventoryai.app/.MainActivity` lands on
 * `DevLauncherActivity`, and a route deep link cannot reach an app that is not running. Measured on
 * 2026-10-22 — a smoke run reported `expect "Overview"` as a failure while the launcher was in front.
 * `expo-dev-client`'s own link starts the bundle from a named server, which is the same action a
 * person takes by tapping the entry; that is what this issues.
 */
export function openDevClient({ adbPath = 'adb', serial, devServerUrl = 'http://localhost:8081' } = {}) {
  const url = `inventoryai://expo-development-client/?url=${encodeURIComponent(devServerUrl)}`;
  adb(
    [...['-s', serial], 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', quoteForDeviceShell(url)],
    { adbPath },
  );
}

/**
 * Is the soft keyboard on screen?
 *
 * Asked before a BACK, because BACK means two different things: it closes the keyboard when one is
 * open, and it leaves the screen when none is. A journey that pressed it blindly found itself on the
 * dashboard, mid-form.
 */
export function keyboardShown({ adbPath = 'adb', serial } = {}) {
  const out = adb([...['-s', serial], 'shell', 'dumpsys', 'input_method'], { adbPath });
  return /mInputShown=true/.test(out);
}

/** A PNG of the current screen, written to `path`. */
export function screenshot(path, { adbPath = 'adb', serial } = {}) {
  const png = adb([...['-s', serial], 'exec-out', 'screencap', '-p'], { adbPath, binary: true });
  writeFileSync(path, png);
  return path;
}

/**
 * The PDFs the app has written to its own cache (`expo-print` puts them in `cache/Print`).
 * Empty when the build is not debuggable, which is a BLOCKED condition rather than a failure.
 */
export function appPdfs({ adbPath = 'adb', serial } = {}) {
  try {
    const out = adb(
      [...['-s', serial], 'shell', 'run-as', PACKAGE, 'ls', '-t', 'cache/Print'],
      { adbPath },
    );
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('.pdf'))
      .map((name) => name.split(/\s+/).pop());
  } catch (err) {
    throw new DeviceUnavailable(`cannot read the app's own files (debuggable build required): ${err.message}`);
  }
}

/**
 * The bytes of one PDF from the app's cache.
 *
 * `exec-out`, never `shell`. On Android, `adb shell cat file` runs the text through the shell's
 * pseudo-terminal, which rewrites every LF as CRLF: the first run of this harness received 11,472
 * bytes for a 11,225-byte PDF, and the 247 extra bytes fell inside a Flate-compressed content
 * stream, so inflate failed and a perfectly good label was reported as "contains no decodable
 * EAN-13". `exec-out` is a raw pipe and returns the file exactly.
 */
export function readAppPdf(name, { adbPath = 'adb', serial } = {}) {
  return adb(
    [...['-s', serial], 'exec-out', 'run-as', PACKAGE, 'cat', `cache/Print/${name}`],
    { adbPath, binary: true },
  );
}

/** A scratch file inside the workspace-independent temp dir. */
export function tempFile(name) {
  return join(mkdtempSync(join(tmpdir(), 'inventoryai-device-')), name);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
