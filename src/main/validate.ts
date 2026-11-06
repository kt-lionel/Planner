import type { PlanData, SaveFileFilter } from '../shared/types';

/**
 * Defensive input validation for IPC handlers. The renderer is sandboxed and
 * CSP-protected, but every handler still treats its arguments as untrusted:
 * shapes are coerced, lengths capped and anything else is rejected up front.
 */

/** Largest file the app will read into memory (~20 MB of text/CSV). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Upper bound for plain strings handed in from the renderer. */
const MAX_TEXT = 1024 * 1024;

export function asString(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.slice(0, max) : String(value ?? '').slice(0, max);
}

/** Credentials never need to be longer than this; shorter caps blunt DoS crypt work. */
export const MAX_SECRET = 256;
export const MAX_USERNAME = 64;
export const MAX_KEY_TEXT = 128;

/** Validates the shape of a plan being saved before it touches the disk path. */
export function asPlanData(value: unknown): PlanData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid plan data.');
  }
  const data = value as Partial<PlanData>;
  if (!Array.isArray(data.tasks)) throw new Error('Invalid plan data: tasks must be an array.');
  return data as PlanData;
}

/** Sanitises dialog filter definitions coming from the renderer. */
export function asSaveFilters(value: unknown): SaveFileFilter[] {
  if (!Array.isArray(value)) return [];
  const filters: SaveFileFilter[] = [];
  for (const raw of value.slice(0, 8)) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as { name?: unknown; extensions?: unknown };
    if (typeof f.name !== 'string' || !Array.isArray(f.extensions)) continue;
    const extensions = f.extensions
      .filter((e): e is string => typeof e === 'string' && e.length <= 16)
      .slice(0, 16);
    filters.push({ name: f.name.slice(0, 64), extensions });
  }
  return filters;
}

/** Only http(s) URLs are ever opened in an external browser. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  return /^https?:\/\/[^\s]+$/i.test(url) && url.length <= 2048;
}
