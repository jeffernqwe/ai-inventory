/**
 * AI-26 — an answer that hit the output cap must not end mid-word or mid-row.
 *
 * THE DEFECT. `AI_MAX_OUTPUT_TOKENS` bounds a turn, and when the model reaches it the
 * provider says so (`stop_reason: max_tokens` → `truncated: true`). AI-8 kept that partial
 * answer and marked the turn `OUTPUT_LIMIT`, which is right — the first rows ARE what was
 * asked for — but the text stored and drawn was the model's raw prefix. Read out of the
 * development database on 2026-10-19, all four stored `OUTPUT_LIMIT` answers ended inside
 * a Markdown table cell:
 *
 *     … | Professional Battery 10051 |      ("| 6ad49" — a cut id)
 *     … | 2026‑10‑18 01:48:51 | Professional Towel 1   (no closing pipe)
 *     … | Pro Cable 19871 |                (one cell under a four-column header)
 *
 * The bubble then rendered a row with a name and no quantities, or a name cut in half,
 * with the "may be incomplete" note underneath. The note explains the truncation; it does
 * not make a half-row readable. A member reading "Professional Towel 1" cannot tell whether
 * the product is called that or whether the name was cut.
 *
 * WHAT THIS DOES, AND WHY IT IS DETERMINISTIC RATHER THAN ANOTHER MODEL CALL. The turn has
 * already spent its output budget; asking the model to continue costs another provider
 * request (the free tier allows ~50 a day, measured on 2026-10-19), can duplicate the last
 * sentence, and cannot be bounded by the turn's remaining deadline. Removing the ONE
 * incomplete unit at the end is a string operation with no quota, no latency and a result
 * that can be asserted exactly: a complete table row is kept, an incomplete one is dropped,
 * and prose is cut back to its last finished sentence. Nothing in the middle of the answer
 * is touched, and nothing is invented.
 *
 * THE SAFETY RULE. When no complete unit can be identified the text is returned unchanged.
 * Dropping text is only justified when what remains is demonstrably whole; guessing would
 * silently delete a correct answer, which is worse than a visibly cut one — the member at
 * least sees the note in that case.
 */

/** A line that is part of a Markdown table row (leading pipe). */
function isRowStart(line: string): boolean {
  return /^\s*\|/.test(line);
}

/** The separator row between a header and its body: `|---|---|`. */
function isSeparatorRow(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes('-');
}

/**
 * Cells in a row, counting only the ones the pipes delimit.
 *
 * A row must both start and end with a pipe to be complete: `| Pro Cable 19871 |` is two
 * cells (an empty first and last are how a table is written, so the count is
 * `pipes - 1`), while `| Professional Towel 1` has no closing pipe at all and is a row the
 * model never finished.
 */
function cellCount(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) return null;
  return trimmed.split('|').length - 2;
}

function lastNonEmpty(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if ((lines[i] ?? '').trim()) return i;
  }
  return -1;
}

/**
 * The number of columns the table ending at `end` declares.
 *
 * Taken from the FIRST row of the contiguous block, because that is where the header is;
 * the separator row is skipped when it is the first thing found. `null` when the block has
 * no complete row to measure against, in which case a trailing partial row cannot be
 * judged and is left alone.
 */
function tableColumns(lines: string[], end: number): number | null {
  let start = end;
  while (start - 1 >= 0 && isRowStart(lines[start - 1] ?? '')) start -= 1;
  for (let i = start; i <= end; i += 1) {
    const line = lines[i] ?? '';
    if (isSeparatorRow(line)) continue;
    const cells = cellCount(line);
    if (cells !== null) return cells;
  }
  return null;
}

/** Drop the trailing table rows that are not whole rows, mutating `lines` in place. */
function trimTrailingRows(lines: string[]): void {
  let last = lastNonEmpty(lines);
  while (last >= 0 && isRowStart(lines[last] ?? '')) {
    const cells = cellCount(lines[last] ?? '');
    const expected = tableColumns(lines, last);
    const incomplete = cells === null || (expected !== null && cells < expected);
    if (!incomplete) break;
    lines[last] = '';
    last = lastNonEmpty(lines);
  }
  // A table left with only its header (or header + separator) says nothing: a heading with
  // no rows is a promise the truncation broke, so remove the stub too.
  last = lastNonEmpty(lines);
  if (last >= 0) {
    let start = last;
    while (start - 1 >= 0 && isRowStart(lines[start - 1] ?? '')) start -= 1;
    const rows = lines.slice(start, last + 1).filter((line) => line.trim() && !isSeparatorRow(line));
    if (rows.length <= 1 && isRowStart(lines[last] ?? '')) {
      for (let i = start; i <= last; i += 1) lines[i] = '';
    }
  }
}

/** Closing marks that may follow a terminator and still leave the sentence finished. */
const CLOSERS = new Set([')', ']', '"', "'", '*', '_', '`']);

/** Is this character a sentence terminator, rather than part of a number or an initial? */
function endsSentence(text: string, index: number): boolean {
  const ch = text[index];
  if (ch !== '.' && ch !== '!' && ch !== '?') return false;
  const prev = text[index - 1] ?? '';
  // A decimal point (`6.09`) and a thousands separator (`8,976.5`) are inside a number.
  if (/[0-9]/.test(prev) && /[0-9]/.test(text[index + 1] ?? '')) return false;
  // The terminator may be followed by closing punctuation/markdown and must then be at a
  // word boundary. `app.)*` ends a sentence; `v1.2` and `SKU.59980` do not.
  let next = index + 1;
  while (next < text.length) {
    const closing = text[next];
    if (closing === undefined || !CLOSERS.has(closing)) break;
    next += 1;
  }
  if (next < text.length && !/\s/.test(text[next] ?? '')) return false;
  return true;
}

/**
 * A list item, whose last line is left alone rather than cut.
 *
 * A list item carries no full stop, so a complete item and a cut one look alike at the end
 * of the string: `5. **Professional Mug 60936** – SKU SEEDSKU‑59936 – 0 units available` is
 * whole, while `5. **Professional Mug 60936** – SKU SEEDSKU‑59` is not, and no cheap test
 * separates them. Removing a complete item to rescue a cut one trades a visible truncation
 * for silently missing data, so the note — which is already drawn — is the honest answer
 * here. Tables are the measured case and are handled above.
 */
function isListItem(line: string): boolean {
  return /^\s*(\d+[.)]|[-*+])\s+/.test(line);
}

/**
 * Return `raw` without the one incomplete unit at its end, or unchanged if it already ends
 * cleanly (or if nothing whole can be identified).
 *
 * Kept pure and exported so both the reason it exists and its edge cases can be asserted
 * without a provider, a database or a key.
 */
/**
 * The stored status constants, in a member's words.
 *
 * Read off the device on 2026-10-19: a complete restock answer drew a table whose
 * Status column read `OUT_OF_STOCK` — the tool payload's enum copied straight onto the
 * screen. The prompt now forbids it (rule 14), but a prompt is a request, not a
 * guarantee: the model may still copy the value it was given, and the member sees
 * server vocabulary in their own answer. This is the deterministic half — the same
 * reason the trim above exists rather than a second model call.
 *
 * The match is word-bounded, so a longer token (`OUT_OF_STOCKED`) and an identifier
 * that merely contains a status (`LOW_STOCK_PRODUCTS`) are left alone rather than
 * half-rewritten.
 */
const STATUS_PHRASES: Record<string, string> = {
  OUT_OF_STOCK: 'Out of stock',
  LOW_STOCK: 'Low stock',
  IN_STOCK: 'In stock',
};

export function humaniseStatusConstants(raw: string): string {
  if (!raw) return raw;
  return raw.replace(/\b(OUT_OF_STOCK|LOW_STOCK|IN_STOCK)\b/g, (token) => STATUS_PHRASES[token] ?? token);
}

export function trimIncompleteAnswer(raw: string): string {
  if (!raw) return raw;
  const lines = raw.replace(/\s+$/, '').split('\n');
  trimTrailingRows(lines);

  const last = lastNonEmpty(lines);
  if (last < 0) return raw;
  const lastLine = lines[last] ?? '';

  // A complete trailing row is a finished unit even without a full stop.
  if (isRowStart(lastLine) && cellCount(lastLine) !== null) {
    return lines.slice(0, last + 1).join('\n');
  }

  // A finished sentence is a finished unit.
  if (endsSentence(lastLine, lastLine.trimEnd().length - 1)) {
    return lines.slice(0, last + 1).join('\n');
  }

  if (isListItem(lastLine)) {
    return lines.slice(0, last + 1).join('\n').trimEnd();
  }

  // A paragraph cut mid-sentence: cut it back to its last finished sentence, and only if
  // that leaves something with more than a fragment in it.
  const tail = lastLine.trimEnd();
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    if (!endsSentence(tail, i)) continue;
    // Keep the closing marks that belong to the sentence: cutting `app.)*` at `app.)`
    // would leave an unterminated `*` and change how the whole bubble renders.
    let end = i + 1;
    while (end < tail.length) {
      const ch = tail[end];
      if (ch === undefined || !CLOSERS.has(ch)) break;
      end += 1;
    }
    const cut = tail.slice(0, end).trimEnd();
    if (cut.length < 24) continue;
    const kept = [...lines.slice(0, last), cut].join('\n').trimEnd();
    if (kept.length >= 24) return kept;
  }

  // Nothing in this paragraph is whole. Keep the previous finished line, if there is one.
  if (last > 0) {
    const previous = lastNonEmpty(lines.slice(0, last));
    if (previous >= 0) {
      const prevText = (lines[previous] ?? '').trimEnd();
      if (isRowStart(prevText) && cellCount(prevText) !== null) {
        return lines.slice(0, previous + 1).join('\n').trimEnd();
      }
      if (endsSentence(prevText, prevText.length - 1)) {
        return lines.slice(0, previous + 1).join('\n').trimEnd();
      }
    }
  }

  // No identifiable whole unit — keep the answer exactly as it arrived.
  return raw;
}

export default { trimIncompleteAnswer, humaniseStatusConstants };
