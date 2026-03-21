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
  // Escape regex special chars
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Replace runs of 2+ x with alphanumeric match of same length
  const withWildcards = escaped
    .replace(/x{2,}/g, (m) => `[a-zA-Z0-9_-]{${m.length}}`)
    .replace(/0{2,}/g, (m) => `[0-9]{${m.length}}`);
  return new RegExp(`^${withWildcards}$`);
}

/**
 * Check if an actual value matches a pattern string.
 * Handles special patterns (any-*, email) and falls back to toPattern.
 */
export function matchesPattern(pattern: string, actual: string): boolean {
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
