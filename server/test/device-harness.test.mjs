/**
 * The device-acceptance harness's own checks.
 *
 * WHY THESE EXIST. The harness drives a real phone over adb and decides pass/fail from the screen's
 * accessibility tree. Every judgement it makes — "this text is on screen", "this step failed",
 * "this run exited 2 rather than 0" — is a place where a mistake turns a broken build into a green
 * report, which is worse than having no harness. So the judgements are pure functions here, asserted
 * directly, with must-fail controls beside them: a matcher that cannot miss and an exit code that
 * cannot be 1 would both pass a happy-path test.
 *
 * WHAT THESE DO NOT PROVE: that the phone is connected, that the app renders, or that a journey
 * passes on hardware. Those need the device, and `scripts/device/run.mjs` records them.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  escapeInputText,
  exitCodeFor,
  fieldBelow,
  findNodes,
  findTapTarget,
  isBlankDump,
  isUnstableDump,
  looksSignedOut,
  parseDump,
  summariseRun,
  validateJourneys,
} from '../../scripts/device/lib.mjs';
import { JOURNEYS } from '../../scripts/device/journeys.mjs';

// A slice of a real `uiautomator dump` from the app (the shape matters: attributes are one long
// line per node and a node's label may be `text` or `content-desc`).
const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.inventoryai.app" content-desc="" clickable="false" bounds="[0,0][1080,2208]">
    <node index="0" text="Inventory AI" resource-id="" class="android.widget.TextView" content-desc="" clickable="false" bounds="[72,372][1008,468]" />
    <node index="1" text="Receive Stock" resource-id="" class="android.widget.Button" content-desc="" clickable="true" bounds="[48,2022][1032,2160]" />
    <node index="2" text="" resource-id="" class="android.widget.Button" content-desc="Scan barcode" clickable="true" bounds="[900,100][1020,220]" />
  </node>
</hierarchy>`;

describe('the screen reader turns a dump into tappable nodes', () => {
  it('reads text, content-desc and bounds from a real dump shape', () => {
    const { nodes } = parseDump(DUMP);

    // Three LABELLED nodes. The unlabelled root container is deliberately not a node: a journey
    // can neither assert nor tap it, and keeping it would let "the screen has nodes" be true of an
    // empty screen.
    assert.equal(nodes.length, 3);
    const title = nodes.find((n) => n.label === 'Inventory AI');
    assert.deepEqual(title.bounds, { x1: 72, y1: 372, x2: 1008, y2: 468 });
    // A tap goes to the middle of the node, not its corner.
    assert.deepEqual(title.center, { x: 540, y: 420 });
  });

  it('finds a control by its content-desc, which is how the app labels icon buttons', () => {
    const { nodes } = parseDump(DUMP);

    const scan = findNodes(nodes, 'Scan barcode');

    assert.equal(scan.length, 1);
    assert.equal(scan[0].clickable, true);
  });

  it('does not invent a match for text that is not on screen', () => {
    const { nodes } = parseDump(DUMP);

    // The control: a matcher that cannot miss would pass every journey.
    assert.deepEqual(findNodes(nodes, 'Not On This Screen'), []);
  });

  it('prefers an exact match over a longer label that contains it', () => {
    // "Receive Stock" exists twice in the real app (a heading and a button). An exact search must
    // return the exact one, not the first substring hit.
    const { nodes } = parseDump(DUMP);

    const exact = findNodes(nodes, 'Receive Stock', { exact: true });
    assert.equal(exact.length, 1);
    assert.equal(exact[0].bounds.y1, 2022);

    const loose = findNodes(nodes, 'Receive', { exact: false });
    assert.equal(loose.length, 1);
  });
});

/** A slice of the purchase-order form: two labels, two fields, and one decoy field above them. */
const FORM = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="Search products" class="android.widget.EditText" clickable="true" bounds="[0,100][1080,200]" />
  <node index="1" text="Quantity ordered *" class="android.widget.TextView" clickable="false" bounds="[0,2112][1080,2166]" />
  <node index="2" text="e.g. 24" class="android.widget.EditText" clickable="true" bounds="[0,2184][1080,2280]" />
  <node index="3" text="Notes (optional)" class="android.widget.TextView" clickable="false" bounds="[0,2400][1080,2454]" />
  <node index="4" text="Add a note" class="android.widget.EditText" clickable="true" bounds="[0,2472][1080,2568]" />
</hierarchy>`;

describe('a form field is found by its label, not by whatever has focus', () => {
  const nodes = parseDump(FORM).nodes;

  it('returns the edit box directly below its label', () => {
    const field = fieldBelow(nodes, 'Quantity ordered *');
    assert.ok(field, 'the quantity field was not found');
    assert.equal(field.bounds.y1, 2184);
    // Not the decoy text box above the form, which is nearer the top of the screen.
    assert.notEqual(field.bounds.y1, 100);
  });

  it('keeps two labels on the same screen apart', () => {
    assert.equal(fieldBelow(nodes, 'Notes (optional)').bounds.y1, 2472);
  });

  it('finds nothing when the label is absent or has no field under it (controls)', () => {
    assert.equal(fieldBelow(nodes, 'Expected date (optional)'), null);
    assert.equal(fieldBelow(nodes, ''), null);
  });

  it('accepts a target for the type verb, and rejects an empty one', () => {
    const ok = validateJourneys([
      { id: 'x', summary: 's', steps: [{ type: { value: '1', into: 'Quantity ordered' } }] },
    ]);
    assert.deepEqual(ok, []);

    const bad = validateJourneys([
      { id: 'a', summary: 's', steps: [{ type: { value: '' } }] },
      { id: 'b', summary: 's', steps: [{ type: { value: '1', typo: 'x' } }] },
      { id: 'c', summary: 's', steps: [{ type: 42 }] },
    ]);
    assert.equal(bad.length, 3, bad.join('; '));
    assert.ok(bad.every((p) => /type needs text/.test(p)), bad.join('; '));
  });
});

/**
 * A real dump taken during a scroll: the label and clickability are right, `y2` is above `y1`.
 * This is the exact shape that sent a tap into the quantity field (centre computed at y=1653).
 */
const UNSTABLE = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="Quantity ordered *" class="android.widget.TextView" clickable="false" bounds="[99,1164][981,1218]" />
  <node index="1" text="Create draft order" class="android.widget.Button" clickable="true" bounds="[48,1863][1032,1443]" />
</hierarchy>`;

describe('a dump taken mid-scroll is read for its words, never for its geometry', () => {
  const nodes = parseDump(UNSTABLE).nodes;

  it('marks an inverted box instead of inventing a centre', () => {
    const button = nodes.find((node) => node.label === 'Create draft order');
    assert.equal(button.brokenBounds, true);
    assert.equal(nodes.find((node) => node.label === 'Quantity ordered *').brokenBounds, false);
  });

  it('refuses the inverted node as a tap target, and says so', () => {
    assert.equal(findTapTarget(nodes, 'Create draft order'), null);
    // Control: the stable label on the same dump is still tappable, so the rule is about the box.
    assert.ok(findTapTarget(nodes, 'Quantity ordered'));
  });

  it('is distinguishable from a stable dump, so the reader can retry', () => {
    assert.equal(isUnstableDump(UNSTABLE), true);
    assert.equal(isUnstableDump(DUMP), false);
    // A blank dump is served by the existing rule, not this one.
    assert.equal(isUnstableDump('<hierarchy rotation="0"></hierarchy>'), true);
  });
});

describe('a signed-out app is a blocked run, not a failed one', () => {
  // The login screen's own labels, taken from the real dump that ended the first harness run
  // (2026-10-21): the session had expired, and the runner reported `expect "Overview"` as a
  // FAILURE — which reads as an app defect when it is really a precondition.
  const login = parseDump(
    `<hierarchy rotation="0">
      <node text="Welcome back" class="android.widget.TextView" bounds="[147,690][933,768]" clickable="false" />
      <node text="Email *" class="android.widget.TextView" bounds="[147,1074][933,1128]" clickable="false" />
      <node text="role@example.invalid" class="android.widget.EditText" bounds="[147,1146][933,1281]" clickable="true" />
      <node text="Password *" class="android.widget.TextView" bounds="[147,1329][933,1383]" clickable="false" />
      <node text="Sign In" class="android.widget.Button" bounds="[147,1584][933,1722]" clickable="true" />
    </hierarchy>`,
  ).nodes;

  it('recognises the login screen', () => {
    assert.equal(looksSignedOut(login), true);
  });

  it('does not mistake the dashboard for a signed-out screen', () => {
    const dashboard = parseDump(
      `<hierarchy rotation="0">
        <node text="Overview" class="android.widget.TextView" bounds="[147,536][933,602]" clickable="false" />
        <node text="Sign out" class="android.widget.Button" bounds="[147,1900][933,2000]" clickable="true" />
      </hierarchy>`,
    ).nodes;

    assert.equal(looksSignedOut(dashboard), false);
  });
});

describe('a blank or stale dump is never read as a screen', () => {
  it('treats an empty file as no screen (a failed dump leaves the previous file behind)', () => {
    assert.equal(isBlankDump(''), true);
    assert.equal(isBlankDump('   \n'), true);
    assert.equal(isBlankDump('<?xml version="1.0"?><hierarchy rotation="0"></hierarchy>'), true);
  });

  it('accepts a dump that carries nodes', () => {
    assert.equal(isBlankDump(DUMP), false);
  });
});

describe('typing survives the device shell', () => {
  it('encodes a space as %s, which is what `input text` expects', () => {
    assert.equal(escapeInputText('Classic Mug'), 'Classic%sMug');
  });

  it('leaves an ordinary alphanumeric password alone', () => {
    assert.equal(escapeInputText('RoleTest2026'), 'RoleTest2026');
  });

  it('quotes the shell characters that would otherwise run on the device', () => {
    // A quote or a backtick would end the command instead of being typed.
    assert.equal(escapeInputText("it's"), "it\\'s");
    assert.equal(escapeInputText('a`b'), 'a\\`b');
    assert.equal(escapeInputText('a\\b'), 'a\\\\b');
  });
});

describe('the run report cannot claim more than happened', () => {
  const step = (status, title) => ({ title, status, detail: '', durationMs: 1 });

  it('exits 0 only when every step passed', () => {
    assert.equal(exitCodeFor([step('pass'), step('pass')]), 0);
  });

  it('exits 1 when a step failed', () => {
    assert.equal(exitCodeFor([step('pass'), step('fail')]), 1);
  });

  it('exits 2 — could not check — when a step was blocked, even with no failures', () => {
    assert.equal(exitCodeFor([step('pass'), step('blocked')]), 2);
    // A failure outranks a block: something was wrong, not merely unreachable.
    assert.equal(exitCodeFor([step('blocked'), step('fail')]), 1);
  });

  it('names the journey, every step and the failure reason in the markdown', () => {
    const md = summariseRun({
      journey: 'smoke',
      startedAt: '2026-10-21T00:00:00.000Z',
      device: 'CPH1969',
      steps: [
        { title: 'Dashboard renders', status: 'pass', durationMs: 412 },
        { title: 'Inventory renders', status: 'fail', detail: 'expected "Inventory" within 15000ms', durationMs: 15000 },
      ],
    });

    assert.match(md, /smoke/);
    assert.match(md, /\| Dashboard renders \| pass \| 412 \|/);
    assert.match(md, /\| Inventory renders \| FAIL \| 15000 \| expected "Inventory" within 15000ms/);
    // The summary line must not say pass when a step failed.
    assert.match(md, /overall: FAIL \(exit 1\)/);
    assert.doesNotMatch(md, /overall: pass/i);
  });
});

describe('the declared journeys are well formed', () => {
  it('accepts its own table', () => {
    assert.deepEqual(validateJourneys(JOURNEYS), []);
  });

  it('rejects an unknown verb, an empty journey and a duplicate id', () => {
    const problems = validateJourneys([
      { id: 'a', summary: 'x', steps: [{ tap: 'A' }] },
      { id: 'a', summary: 'y', steps: [] },
      { id: 'b', summary: 'z', steps: [{ expect: '' }] },
      { id: 'c', summary: 'w', steps: [{ teleport: 'nowhere' }] },
    ]);

    assert.ok(problems.some((p) => /duplicate id/.test(p)), problems.join('; '));
    assert.ok(problems.some((p) => /no steps/.test(p)), problems.join('; '));
    assert.ok(problems.some((p) => /expect.*empty/.test(p)), problems.join('; '));
    assert.ok(problems.some((p) => /unknown step/.test(p)), problems.join('; '));
  });

  it('declares a read-only smoke journey that actually asserts screens', () => {
    const smoke = JOURNEYS.find((j) => j.id === 'smoke');

    assert.ok(smoke, 'smoke journey is missing');
    const expects = smoke.steps.filter((s) => typeof s.expect === 'string');
    assert.ok(expects.length >= 5, 'the smoke journey must assert at least five screens');
    // Read-only means no writes: no typing, no create/receive verbs.
    assert.equal(smoke.steps.some((s) => s.type || s.tapFirst), false);
  });
});

/**
 * The one part of the harness that is I/O rather than judgement: how a file leaves the phone.
 *
 * This is a source guard because the failure it prevents is invisible to a phone-less test — it is
 * a property of an `adb` invocation. The first device run of the `label` journey reported a
 * perfectly good label as "contains no decodable EAN-13": `adb shell cat` had run the PDF through
 * the shell's pseudo-terminal and rewritten every LF as CRLF, so 11,225 bytes arrived as 11,472 and
 * the extra bytes landed inside a Flate-compressed stream. `exec-out` is a raw pipe. A guard that
 * cannot fail is decoration, so the extraction is checked against a control that must trip it.
 */
describe('a binary file leaves the phone unaltered', () => {
  const source = readFileSync(new URL('../../scripts/device/adb.mjs', import.meta.url), 'utf8');

  /** The body of one exported function, so an assertion cannot be satisfied by a different one. */
  const bodyOf = (text, name) => {
    const start = text.indexOf(`export function ${name}(`);
    if (start < 0) return null;
    const next = text.indexOf('\nexport ', start + 1);
    return text.slice(start, next < 0 ? undefined : next);
  };

  const reading = (text) => {
    const body = bodyOf(text, 'readAppPdf');
    return body !== null && /'exec-out'/.test(body) && !/'shell'/.test(body);
  };

  it('reads the app PDF with exec-out, not through the device shell', () => {
    const body = bodyOf(source, 'readAppPdf');
    assert.ok(body, 'readAppPdf is missing from adb.mjs');
    assert.match(body, /'exec-out'/);
    assert.doesNotMatch(body, /'shell'/);
  });

  it('the same check rejects a shell-based read (control)', () => {
    assert.equal(reading(source), true);
    assert.equal(
      reading("export function readAppPdf(name) { return ['shell', 'run-as', 'cat'] }\n"),
      false,
    );
  });
});
