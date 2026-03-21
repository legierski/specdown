/**
 * Response matcher for specdown.
 *
 * Compares actual API responses against expected values from spec files.
 * Handles pattern matching, variable saving/substitution, and annotations.
 */

import { toPattern, matchesPattern } from './pattern.js';

/**
 * Substitute $variables in a string value.
 */
export function substituteVars(value: string, vars: Record<string, string>): string {
  return value.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
    return vars[name] !== undefined ? vars[name] : match;
  });
}

/**
 * Match an actual response against expected values.
 * Returns an array of error messages (empty = all matched).
 *
 * Supports:
 *   - Pattern matching (xx+, 00+, any-text, email)
 *   - Variable saving (// save as: $var)
 *   - Variable references ($var in expected values)
 *   - Negative assertions (// not: $var)
 *   - One-of validation (// one of: a, b, c)
 *   - Length validation (// length: N)
 *   - Partial matching (only checks fields in expected)
 */
export function matchResponse(
  actual: any,
  expected: any,
  annotations: Record<string, string>,
  vars: Record<string, string>
): string[] {
  const errors: string[] = [];

  for (const [key, val] of Object.entries(expected)) {
    const annotation = annotations[key];

    // Check field exists in actual
    if (actual[key] === undefined) {
      errors.push(`Missing field "${key}" in response`);
      continue;
    }

    // Handle "save as: $var"
    const saveMatch = annotation?.match(/^save as:\s*\$([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (saveMatch) {
      // Still validate pattern if applicable
      if (typeof val === 'string' && (/x{2,}/.test(val) || /0{2,}/.test(val))) {
        if (!toPattern(val).test(actual[key])) {
          errors.push(`Field "${key}": "${actual[key]}" does not match pattern "${val}"`);
          continue;
        }
      }
      vars[saveMatch[1]] = actual[key];
      continue;
    }

    // Handle "not: $var"
    const notMatch = annotation?.match(/^not:\s+\$([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (notMatch && vars[notMatch[1]] !== undefined) {
      // Validate pattern first
      if (typeof val === 'string' && (/x{2,}/.test(val) || /0{2,}/.test(val))) {
        if (!toPattern(val).test(actual[key])) {
          errors.push(`Field "${key}": "${actual[key]}" does not match pattern "${val}"`);
          continue;
        }
      }
      if (actual[key] === vars[notMatch[1]]) {
        errors.push(`Field "${key}": expected NOT to equal "${vars[notMatch[1]]}" but did`);
      }
      continue;
    }

    // Handle "one of:" annotation
    if (annotation?.startsWith('one of:')) {
      const options = annotation.replace('one of:', '').split(',').map(s => s.trim());
      if (!options.includes(actual[key])) {
        errors.push(`Field "${key}": "${actual[key]}" not in [${options.join(', ')}]`);
      }
      continue;
    }

    // Handle "length:" annotation
    if (annotation?.startsWith('length:')) {
      const expectedLength = parseInt(annotation.replace('length:', '').trim());
      if (typeof actual[key] === 'string' && actual[key].length !== expectedLength) {
        errors.push(`Field "${key}": length ${actual[key].length} !== expected ${expectedLength}`);
      }
      continue;
    }

    if (typeof val === 'string') {
      // $variable reference
      if (val.startsWith('$')) {
        const varName = val.slice(1);
        if (vars[varName] !== undefined) {
          if (actual[key] !== vars[varName]) {
            errors.push(`Field "${key}": "${actual[key]}" !== saved $${varName} ("${vars[varName]}")`);
          }
          continue;
        }
      }

      // Pattern matching
      if (!matchesPattern(val, actual[key])) {
        errors.push(`Field "${key}": "${actual[key]}" does not match "${val}"`);
      }
    } else {
      // Non-string: exact match
      if (actual[key] !== val) {
        errors.push(`Field "${key}": ${JSON.stringify(actual[key])} !== ${JSON.stringify(val)}`);
      }
    }
  }

  return errors;
}
