/**
 * The judgements a device run makes, kept pure so they can be tested without a phone.
 *
 * WHY THIS FILE EXISTS. `scripts/device/run.mjs` drives a real Android phone over adb and decides
 * pass/fail from the accessibility tree. Every judgement in that loop — is this text on screen, did
 * this step fail, what exit code does the run deserve — is a place where a mistake turns a broken
 * build into a green report. So none of it lives in the I/O code: it is here, where
 * `server/test/device-harness.test.mjs` can assert it directly and, just as importantly, assert the
 * must-fail cases beside it.
 *
 * NOTHING HERE TOUCHES THE DEVICE. No `child_process`, no filesystem, no clock reads beyond what is
 * passed in. That is what makes it testable at all.
 */

/**
 * The verbs a journey step may use. One key per step, which is what makes `validateJourneys` able to
 * reject a step that would silently do nothing.
 */
export const STEP_VERBS = Object.freeze([
  'open', // a deep link, e.g. inventoryai://dashboard
  'expect', // wait until this text is on screen
  'expectGone', // wait until this text is NOT on screen
  'tap', // tap the node whose label is this (exact match preferred)
  'tapFirst', // tap the first row below a sheet heading — the list item, not the heading
  'type', // type into the focused field
  'key', // BACK / ENTER / etc.
  'scroll', // 'down' | 'up'
  'wait', // milliseconds
  'shot', // screenshot into the run folder
  'readCode', // remember the 13-digit EAN-13 shown on this screen
  'decodeLabel', // pull the PDF the print action just wrote and decode it
]);

/** Elements a node's visible label may come from. The app uses both. */
const LABEL_KEYS = ['text', 'content-desc'];

/** `<?xml …?>` + a `<node …>` element, as `uiautomator dump` writes it. */
const NODE_RE = /<node\b([^>]*?)\/?>/g;
const ATTR_RE = /([\w-]+)="([^"]*)"/g;
const BOUNDS_RE = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

/**
 * Parse a `uiautomator dump` into nodes with a label, bounds, centre and clickability.
 *
 * A node is kept only when it carries a label, because an unlabelled container is not something a
 * journey can assert or tap. `nodes.length` in the tests is therefore "labelled nodes", not every
 * XML element.
 */
export function parseDump(xml) {
  const nodes = [];
  const text = typeof xml === 'string' ? xml : '';

  for (const match of text.matchAll(NODE_RE)) {
    const attrs = {};
    for (const attr of match[1].matchAll(ATTR_RE)) attrs[attr[1]] = attr[2];

    const label = LABEL_KEYS.map((key) => attrs[key] ?? '').find((value) => value.trim() !== '');
    if (!label) continue;

    const boundsMatch = BOUNDS_RE.exec(attrs.bounds ?? '');
    if (!boundsMatch) continue;
    const [x1, y1, x2, y2] = boundsMatch.slice(1).map(Number);

    nodes.push({
      label: label.trim(),
      // Decoded because the dump escapes `&`, `<` and `>` inside a label; a journey written with
      // the readable text must still match it.
      raw: label,
      className: attrs.class ?? '',
      clickable: attrs.clickable === 'true',
      bounds: { x1, y1, x2, y2 },
      // A dump taken during a scroll or a transition can carry inverted boxes (`y2` above `y1`):
      // the label is right and the geometry is nonsense. Measured on the PO form, where the centre
      // of "Create draft order" computed to a point inside the quantity field and typing went
      // there instead. Text assertions may use such a node; a TAP may not.
      brokenBounds: x2 <= x1 || y2 <= y1,
      center: { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) },
    });
  }

  // `&amp;` and friends: decode after collecting so the regex never sees a re-encoded attribute.
  for (const node of nodes) {
    node.label = decodeEntities(node.label);
    delete node.raw;
  }

  return { nodes, count: nodes.length };
}

function decodeEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Nodes whose label matches `text`. An exact match is preferred and returned on its own when one
 * exists: the app shows "Receive Stock" as both a heading and a button, and tapping the heading does
 * nothing.
 */
export function findNodes(nodes, text, { exact = false } = {}) {
  const wanted = String(text ?? '');
  if (!wanted) return [];

  const exactHits = nodes.filter((node) => node.label === wanted);
  if (exactHits.length) return exactHits;
  if (exact) return [];

  return nodes.filter((node) => node.label.includes(wanted));
}

/**
 * The node a tap should land on, or null. Prefers a clickable node with the same label, and never
 * returns one whose box is inverted — tapping a made-up centre is how a quantity got corrupted.
 */
export function findTapTarget(nodes, text, options = {}) {
  const hits = findNodes(nodes, text, options).filter((node) => !node.brokenBounds);
  if (!hits.length) return null;
  return hits.find((node) => node.clickable) ?? hits[0];
}

/**
 * The input field a form label refers to: the first edit box below the label's own text.
 *
 * Typing into "whatever has focus" is how the first `draft` run put a quantity into nothing and then
 * pressed BACK, which left the form entirely. A label on a form sits directly above its field, so the
 * field is the nearest edit box below it — and the caller can then read that field back to prove the
 * text arrived.
 */
export function fieldBelow(nodes, label) {
  const wanted = String(label ?? '');
  if (!wanted) return null;

  // Exact first, then substring — the app's labels carry marks a journey should not have to
  // spell out, and the form reads "Quantity ordered *".
  const anchors = findNodes(nodes ?? [], wanted);
  if (!anchors.length) return null;

  const anchor = anchors.find((node) => !node.brokenBounds) ?? anchors[0];
  if (anchor.brokenBounds) return null;

  return (
    (nodes ?? [])
      .filter((node) => !node.brokenBounds)
      .filter((node) => /EditText$/.test(node.className ?? ''))
      .filter((node) => node.bounds.y1 >= anchor.bounds.y2 - 4)
      .sort((a, b) => a.bounds.y1 - b.bounds.y1)[0] ?? null
  );
}

/**
 * Is the app showing its login screen?
 *
 * A signed-out session is a PRECONDITION the harness cannot fix, so it must be reported as "could
 * not check" (exit 2) rather than as a failure. Without this the first real run reported
 * `expect "Overview"` as a failure — an app defect that was not there — when the phone had simply
 * lost its session overnight.
 */
export function looksSignedOut(nodes) {
  const labels = (nodes ?? []).map((node) => node.label);
  const hasSignIn = labels.some((label) => label === 'Sign In' || label === 'Sign in');
  const hasCredentials = labels.includes('Email *') || labels.includes('Password *');
  return hasSignIn && hasCredentials;
}

/**
 * A dump is "blank" when it proves nothing: empty, unparseable, or carrying no labelled node.
 *
 * This is the trap the physical-device guide records: a FAILED `uiautomator dump` leaves the
 * PREVIOUS file in place, so a naive reader answers with the last screen it saw — once reporting
 * Login while the app sat on the dashboard.
 */
export function isBlankDump(xml) {
  if (typeof xml !== 'string' || xml.trim() === '') return true;
  if (!/<hierarchy\b/.test(xml)) return true;
  return parseDump(xml).count === 0;
}

/**
 * A dump that was taken mid-transition: its labels are real, its boxes are not.
 *
 * The screen reader retries while this is true, because every tap computed from such a dump lands
 * somewhere the app never put the control.
 */
export function isUnstableDump(xml) {
  if (isBlankDump(xml)) return true;
  return parseDump(xml).nodes.some((node) => node.brokenBounds);
}

/**
 * Escape text for `adb shell input text`.
 *
 * The device shell splits on spaces (which `input text` spells `%s`) and would interpret quotes,
 * backticks, `$`, `&` and `;`. Escaping them means a journey can type a product name or a password
 * and have the phone receive exactly those characters.
 */
export function escapeInputText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/&/g, '\\&')
    .replace(/;/g, '\\;')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/\|/g, '\\|')
    .replace(/ /g, '%s');
}

/**
 * The run's exit code, in this repository's convention:
 *   0  every step passed
 *   1  a step failed — the app did something wrong
 *   2  a step was blocked (no device, no signed-in session, no artifact) — "could not check",
 *      which is never reported as a pass
 * A failure outranks a block: something was observed to be wrong, rather than merely unreachable.
 */
export function exitCodeFor(steps) {
  const statuses = (steps ?? []).map((step) => step.status);
  if (statuses.includes('fail')) return 1;
  if (statuses.includes('blocked')) return 2;
  return 0;
}

const STATUS_MARK = { pass: 'pass', fail: 'FAIL', blocked: 'BLOCKED', skipped: 'skipped' };

/**
 * The run's markdown report: what ran, on what, and what each step saw.
 *
 * A summary that says "pass" beside a failed step is the failure mode this function exists to
 * prevent, so the overall line is derived from `exitCodeFor`, never from the presence of steps.
 */
export function summariseRun(run) {
  const steps = run.steps ?? [];
  const code = exitCodeFor(steps);
  const overall = code === 0 ? 'pass' : code === 1 ? 'FAIL' : 'could not check';

  const lines = [
    `# Device run — ${run.journey}`,
    '',
    `- started: ${run.startedAt}`,
    `- device: ${run.device ?? 'unknown'}`,
    `- overall: ${overall} (exit ${code})`,
    `- steps: ${steps.filter((s) => s.status === 'pass').length}/${steps.length} passed`,
    '',
    '| step | result | ms | what was seen |',
    '|---|---|---|---|',
  ];

  for (const step of steps) {
    const detail = (step.detail ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${step.title} | ${STATUS_MARK[step.status] ?? step.status} | ${step.durationMs ?? ''} | ${detail} |`,
    );
  }

  if (run.notes) lines.push('', run.notes);
  return `${lines.join('\n')}\n`;
}

/**
 * Every problem with a journey table, rather than only the first.
 *
 * A step with two verbs, an unknown verb or an empty expectation would make a journey pass by doing
 * nothing, so the table is checked as data instead of being trusted as code.
 */
export function validateJourneys(journeys) {
  const problems = [];
  const seen = new Set();

  for (const journey of journeys ?? []) {
    const id = journey?.id ?? '(no id)';
    if (!journey?.id || typeof journey.id !== 'string') problems.push(`${id}: missing id`);
    else if (seen.has(journey.id)) problems.push(`${id}: duplicate id`);
    else seen.add(journey.id);

    if (!journey?.summary) problems.push(`${id}: missing summary`);

    const steps = journey?.steps ?? [];
    if (!Array.isArray(steps) || steps.length === 0) {
      problems.push(`${id}: has no steps`);
      continue;
    }

    steps.forEach((step, index) => {
      const keys = Object.keys(step ?? {});
      const verbs = keys.filter((key) => STEP_VERBS.includes(key));
      const unknown = keys.filter((key) => !STEP_VERBS.includes(key));
      const at = `${id}[${index}]`;

      if (verbs.length === 0) problems.push(`${at}: unknown step (${keys.join(', ') || 'empty'})`);
      if (verbs.length > 1) problems.push(`${at}: more than one verb (${verbs.join(', ')})`);
      if (unknown.length) problems.push(`${at}: unknown key (${unknown.join(', ')})`);

      const verb = verbs[0];
      if (!verb) return;
      const value = step[verb];
      if ((verb === 'expect' || verb === 'expectGone') && (typeof value !== 'string' || !value.trim())) {
        problems.push(`${at}: expect with an empty value`);
      }
      if ((verb === 'tap' || verb === 'tapFirst' || verb === 'open') && (typeof value !== 'string' || !value.trim())) {
        problems.push(`${at}: ${verb} with an empty value`);
      }
      if (verb === 'wait' && !(typeof value === 'number' && value >= 0)) {
        problems.push(`${at}: wait needs a number of milliseconds`);
      }
      if (verb === 'type') {
        // Either bare text ("type into the focused field") or a target: `{ value, into }`.
        const isText = typeof value === 'string' && value.trim() !== '';
        const target = value !== null && typeof value === 'object' ? value : null;
        const isTarget =
          target !== null &&
          typeof target.value === 'string' &&
          target.value.trim() !== '' &&
          (target.into === undefined || (typeof target.into === 'string' && target.into.trim() !== '')) &&
          Object.keys(target).every((key) => key === 'value' || key === 'into');
        if (!isText && !isTarget) problems.push(`${at}: type needs text or { value, into }`);
      }
      if (verb === 'scroll' && value !== 'down' && value !== 'up') {
        problems.push(`${at}: scroll must be "down" or "up"`);
      }
    });
  }

  return problems;
}
