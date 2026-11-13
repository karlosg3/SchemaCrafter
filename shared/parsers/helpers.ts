import type { ForeignKeyAction } from '../types/schema';

const VALID_FK_ACTIONS = new Set<ForeignKeyAction>(['CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION']);

/** Removes matching surrounding quotes/backticks/brackets from a SQL or code identifier. */
export function stripQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if (
      (first === '"' && last === '"')
      || (first === '`' && last === '`')
      || (first === "'" && last === "'")
      || (first === '[' && last === ']')
    ) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed.replace(/[`"']/g, '');
}

/** Normalizes a foreign-key referential action string if valid. */
export function normalizeFkAction(raw?: string): ForeignKeyAction | undefined {
  if (!raw) return undefined;
  const upper = raw.trim().replace(/\s+/g, ' ').toUpperCase() as ForeignKeyAction;
  return VALID_FK_ACTIONS.has(upper) ? upper : undefined;
}

/**
 * Splits `input` by `delimiter` only at top level (nesting depth 0 and outside
 * string literals), preventing commas inside `NUMERIC(10, 2)` or `{ length: 255 }`
 * from fragmenting statements.
 */
export function splitTopLevel(input: string, delimiter = ','): string[] {
  const parts: string[] = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const next = input[i + 1];

    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          i++;
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '(') parenDepth++;
    else if (ch === ')' && parenDepth > 0) parenDepth--;
    else if (ch === '{') braceDepth++;
    else if (ch === '}' && braceDepth > 0) braceDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']' && bracketDepth > 0) bracketDepth--;
    else if (
      ch === delimiter
      && parenDepth === 0
      && braceDepth === 0
      && bracketDepth === 0
    ) {
      const piece = input.slice(start, i).trim();
      if (piece) parts.push(piece);
      start = i + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

/** Extracts the balanced substring inside `openChar`...`closeChar` starting at `openIndex`. */
export function extractBalanced(
  text: string,
  openIndex: number,
  openChar = '{',
  closeChar = '}'
): { content: string; endIndex: number } | null {
  if (text[openIndex] !== openChar) return null;

  let depth = 0;
  let quote: string | null = null;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          i++;
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return { content: text.slice(openIndex + 1, i), endIndex: i };
      }
    }
  }

  return null;
}
