import { ENTITY_LABELS, actionLabel, entityLabel } from '../lib/auditLabels';

/**
 * The audit trail's label LOOKUPS.
 *
 * The coverage guard (`server/test/audit-label-parity.test.mjs`) proves every
 * server enum has a human label by reading `lib/auditLabels.json` as data. These
 * cases cover the other half — what the screen does with a value, which is where
 * the device showed the defect: a value that is not in the table must stay
 * VISIBLE, and a missing value must not render as the word "undefined".
 */
describe('audit labels', () => {
  it('labels the events that rendered as raw enums on the device', () => {
    expect(actionLabel('SESSION_CREATED')).toBe('Signed in');
    expect(actionLabel('PASSWORD_RESET_COMPLETED')).toBe('Password reset completed');
    expect(actionLabel('FIREBASE_IDENTITY_LINK_CONFLICT')).toBe('Sign-in identity conflict');
    expect(entityLabel('SESSION')).toBe('Session');
  });

  it('leaves an unknown value readable instead of hiding it', () => {
    // A future event with no label is honest in its raw form; a generic
    // "Activity" would hide what happened.
    expect(actionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(entityLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });

  it('renders a missing value as an em dash, never as undefined', () => {
    expect(actionLabel(null)).toBe('—');
    expect(actionLabel(undefined)).toBe('—');
    expect(actionLabel('')).toBe('—');
    expect(entityLabel(null)).toBe('—');
    expect(entityLabel(undefined)).toBe('—');
  });

  it('exposes the tables the screen reads', () => {
    expect(ENTITY_LABELS.INVENTORY_TRANSACTION).toBe('Transaction');
  });
});
