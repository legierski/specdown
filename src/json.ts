/**
 * JSON parsing with annotation support for specdown.
 *
 * Handles:
 *   - Line comments (// ...) that become annotations
 *   - Ellipsis (...) for partial matching
 *   - Trailing comma cleanup after comment stripping
 */

/**
 * Split a line into its JSON part and optional comment.
 * Respects string boundaries — // inside strings is not a comment.
 */
export function splitLineComment(line: string): { json: string; comment: string | null } {
  let inString = false;
  let escape = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString && ch === '/' && line[i + 1] === '/') {
      return {
        json: line.slice(0, i).trimEnd(),
        comment: line.slice(i + 2).trim(),
      };
    }
  }
  return { json: line, comment: null };
}

/**
 * Parse a JSON string that may contain:
 *   - Line comments with annotations (// save as: $var)
 *   - Ellipsis lines (... or ...,) for partial matching
 *
 * Returns the parsed data and a map of field name → annotation text.
 */
export function parseJsonWithAnnotations(jsonString: string): {
  data: any;
  annotations: Record<string, string>;
} {
  const annotations: Record<string, string> = {};
  const cleanedLines: string[] = [];

  for (const line of jsonString.split('\n')) {
    // Strip ellipsis (partial matching)
    if (line.trim() === '...' || line.trim() === '...,') continue;

    const { json, comment } = splitLineComment(line);

    if (comment) {
      // Extract the field name this comment annotates
      const keyMatch = json.match(/"([^"]+)"\s*:/);
      if (keyMatch) {
        annotations[keyMatch[1]] = comment;
      }
    }

    cleanedLines.push(json);
  }

  // Remove trailing commas before } or ]
  const cleaned = cleanedLines.join('\n').replace(/,(\s*[}\]])/g, '$1');

  return { data: JSON.parse(cleaned), annotations };
}
