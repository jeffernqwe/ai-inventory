/**
 * Cap a tool result WITHOUT breaking it.
 *
 * THE DEFECT THIS REPLACES. `runAiChat` used to hand the model
 * `truncate(JSON.stringify(output), maxToolResultChars)` — a slice of a JSON document plus an ellipsis. Measured
 * against the 50 000-product perf tenant on 2026-10-18, **five of the nine tools exceed the 12 000-character cap
 * at their own maximum page size**, so the model was regularly being handed syntactically invalid JSON:
 *
 * | tool | payload at its max limit | over the cap by |
 * | --- | --- | --- |
 * | `getInventoryHistory` | 24 834 chars | 12 834 |
 * | `getReorderNeededProducts` | 15 550 | 3 550 |
 * | `getProductsByLocation` | 14 207 | 2 207 |
 * | `getLowStockProducts` | 14 109 | 2 109 |
 * | `getOutOfStockProducts` | 14 082 | 2 082 |
 *
 * Those are not exotic arguments: they are the `limit` maxima the tool schemas advertise, so "show me the last 50
 * movements" reaches one of them with no misbehaviour anywhere. A model handed a cut document has to guess at the
 * missing half — the worst possible input for an assistant whose whole job is reporting exact numbers.
 *
 * THE FIX IS STRUCTURAL. The cap is applied to the DATA, not to the text: rows are dropped from the end of the
 * longest array until the serialized result fits, the result stays valid JSON, and it says what happened
 * (`truncated: true` plus a note naming how many rows of how many are included). A prefix is kept rather than a
 * sample because every one of these tools returns newest-first or worst-first, so the kept rows are the ones the
 * question was about.
 *
 * A result that fits is returned **byte-identical** to `JSON.stringify(output)` — that is asserted, because this
 * module must be invisible on every ordinary turn.
 */

/** What the model is told when rows had to be dropped. */
function rowsNote(kept: number, total: number, max: number): string {
  return (
    `Only ${kept} of ${total} rows are included: the complete result was longer than this assistant's ` +
    `${max}-character tool-result limit. Ask a narrower question or request a smaller page to see the rest.`
  );
}

/** The longest array property of a plain object, which is the one worth shortening. */
function longestArray(value: Record<string, unknown>): { key: string; rows: unknown[] } | null {
  let best: { key: string; rows: unknown[] } | null = null;
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item) && (!best || item.length > best.rows.length)) best = { key, rows: item };
  }
  return best;
}

/**
 * A valid-JSON envelope for a result too wide to shorten row by row — one enormous row, a bare array, a string.
 *
 * `preview` is a STRING on purpose: the alternative is a cut document, which is the bug. It is the start of the
 * payload, so a model reading it sees the shape and the first records, and `truncated` plus the note stop it
 * from presenting the preview as the whole answer.
 */
function previewEnvelope(full: string, max: number): string {
  const note =
    `This tool result was too large for this assistant's ${max}-character tool-result limit and could not be ` +
    'shortened row by row. Ask a narrower question or request a smaller page.';
  const shell = (preview: string): string => JSON.stringify({ truncated: true, note, preview });

  // A cap smaller than the envelope itself cannot carry a note. Validity still wins: a
  // caller reading `{ truncated: true }` knows less, but never receives a broken document.
  if (shell('').length > max) return JSON.stringify({ truncated: true });

  // The preview is escaped JSON text, so its serialized length grows FASTER than the slice
  // it came from (`"` becomes `\"`). A budget computed by subtraction therefore overflows —
  // which is exactly how the first draft of this function produced a cut document again.
  // Escaping is per-character, so the length is monotone and a search is exact.
  let low = 0;
  let high = full.length;
  let best = shell('');
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = shell(full.slice(0, mid));
    if (candidate.length <= max) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/**
 * Serialize a tool result for the model, shortening the DATA when it does not fit.
 *
 * @param output the tool's own return value, exactly as `executeTool` produced it
 * @param max the assistant's tool-result character limit (`AI_MAX_TOOL_RESULT_CHARS`)
 */
export function capToolResult(output: unknown, max: number): string {
  const full = JSON.stringify(output ?? null);
  if (full.length <= max) return full;

  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const base = output as Record<string, unknown>;
    const target = longestArray(base);
    if (target && target.rows.length > 0) {
      const total = target.rows.length;
      const build = (kept: number): string =>
        JSON.stringify({
          ...base,
          [target.key]: target.rows.slice(0, kept),
          truncated: true,
          note: rowsNote(kept, total, max),
        });

      // The largest prefix that fits. `kept` is monotone in the serialized length —
      // every dropped row removes its own bytes — so a binary search is exact, and
      // the search stays cheap (a page is 50 rows at most).
      let low = 0;
      let high = total;
      let best: string | null = null;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const candidate = build(mid);
        if (candidate.length <= max) {
          best = candidate;
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      if (best) return best;
    }
  }

  return previewEnvelope(full, max);
}
