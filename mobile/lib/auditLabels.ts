/**
 * Human-readable labels for the audit trail's server enums.
 *
 * WHY THIS IS A MODULE AND NOT TWO CONSTANTS INSIDE THE SCREEN. The maps existed
 * inside `app/(app)/audit.tsx` and had not been extended since Phase 16A, so every
 * event added afterwards — the four session-lifecycle actions (Phase 26A), the two
 * password-recovery actions (Phase 26B-2) and the two Firebase identity actions
 * (Phase 32H) — fell through to `item.action` and rendered as raw SCREAMING_SNAKE
 * constants in the list ("SESSION_CREATED", "FIREBASE_IDENTITY_LINK_CONFLICT"),
 * beside labels like "Stock in". The `SESSION` entity type had the same problem in
 * the entity badge.
 *
 * Nothing failed when those actions were added: the server declares them, the
 * audit screen renders whatever arrives, and a raw enum has no way to look wrong
 * to a test that does not know the label table. Moving the table out of the screen
 * gives the parity guard (`server/test/audit-label-parity.test.mjs`) one surface
 * that can fail.
 *
 * WHY THE TABLE IS JSON AND THIS FILE IS THE WRAPPER. The guard has to read the
 * same table the app renders, and it runs under the *server's* TypeScript project:
 * importing this `.ts` file from a server test pulled it into `server/tsconfig.json`
 * and produced four `verbatimModuleSyntax` errors, because a mobile ES module was
 * being checked under the server's NodeNext/CommonJS-ish settings. Data cannot
 * collide that way — the guard parses `auditLabels.json` directly and the app
 * imports the same file — so there is still exactly one table, and no second copy
 * to drift. The JSON carries no behaviour; the two lookup functions below do.
 *
 * This is PRESENTATION ONLY. No authorization, filtering or storage decision reads
 * these labels.
 */

import labels from './auditLabels.json';

/** Every `AUDIT_ACTIONS` value (server `src/constants/audit.ts`), humanised. */
export const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze(labels.actions);

/** Every `AUDIT_ENTITY_TYPES` value (server `src/constants/audit.ts`), humanised. */
export const ENTITY_LABELS: Readonly<Record<string, string>> = Object.freeze(labels.entityTypes);

/**
 * The label for an action. An UNKNOWN value is returned as-is rather than
 * replaced: a new server event should be visible (in its raw form) on the trail
 * rather than hidden behind a generic word — and the parity guard is what keeps
 * that from being the normal case.
 */
export function actionLabel(action: string | null | undefined): string {
  if (!action) return '—';
  return ACTION_LABELS[action] ?? action;
}

/** The label for an entity type, with the same raw fallback. */
export function entityLabel(entityType: string | null | undefined): string {
  if (!entityType) return '—';
  return ENTITY_LABELS[entityType] ?? entityType;
}

export default { ACTION_LABELS, ENTITY_LABELS, actionLabel, entityLabel };
