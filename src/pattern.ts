/**
 * Pattern matching for dynamic values in specdown responses.
 *
 * Patterns:
 *   xxxxxxxxxxxx  → alphanumeric [a-zA-Z0-9_-] of exact length
 *   00000         → numeric [0-9] of exact length
 *   any-text      → any non-empty string (any-* wildcard)
 *   example@example.com → any valid-looking email
 *   literal       → exact match
 */

/**
 * Convert a pattern string to a RegExp for matching.
 * Only treats runs of 2+ x's or 2+ 0's as wildcards.
 */
export function toPattern(value: string): RegExp {
  // First, collect all pattern runs with their positions (before escaping)
  const replacements: { start: number; end: number; regex: string }[] = [];

  // Find runs of 2+ x
  for (const m of value.matchAll(/x{2,}/g)) {
    replacements.push({ start: m.index!, end: m.index! + m[0].length, regex: `[a-zA-Z0-9_-]{${m[0].length}}` });
  }
  // Find runs of 2+ 0
  for (const m of value.matchAll(/0{2,}/g)) {
    replacements.push({ start: m.index!, end: m.index! + m[0].length, regex: `[0-9]{${m[0].length}}` });
  }

  // Sort by position (reverse) and build result
  replacements.sort((a, b) => b.start - a.start);

  let result = value;
  const placeholders: Map<string, string> = new Map();

  for (let i = 0; i < replacements.length; i++) {
    const r = replacements[i];
    const placeholder = `\x00PATTERN${i}\x00`;
    placeholders.set(placeholder, r.regex);
    result = result.slice(0, r.start) + placeholder + result.slice(r.end);
  }

  // Escape regex special chars in the literal parts
  result = result.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Restore placeholders with their regex patterns
  for (const [placeholder, regex] of placeholders) {
    result = result.replace(placeholder, regex);
  }

  return new RegExp(`^${result}$`);
}

/**
 * Check if an actual value matches a pattern string.
 * Handles special patterns (any-*, email) and falls back to toPattern.
 */
export function matchesPattern(pattern: string, actual: string): boolean {
  // Guard: null/undefined/non-string actual can never match any pattern
  if (actual == null || typeof actual !== 'string') {
    return false;
  }

  // any-* wildcard: matches any non-empty string
  if (pattern.startsWith('any-')) {
    return actual.length > 0;
  }

  // Email pattern
  if (pattern === 'example@example.com') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actual);
  }

  // If pattern contains xx+ or 00+ runs, use regex matching
  if (/x{2,}/.test(pattern) || /0{2,}/.test(pattern)) {
    return toPattern(pattern).test(actual);
  }

  // Literal exact match
  return pattern === actual;
}
