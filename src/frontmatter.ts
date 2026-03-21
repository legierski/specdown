/**
 * YAML frontmatter parser for specdown spec files.
 *
 * Hand-rolled; no js-yaml dependency. Supports: base, timeout, headers.
 * Unknown keys emit a stderr warning so typos don't silently do nothing.
 */

import type { SpecConfig } from './config.js';

/**
 * Parse a YAML frontmatter block at the top of a markdown file.
 * Supports: base, timeout, headers (with indented key: value pairs).
 * Returns null if no frontmatter, empty frontmatter, or no recognized fields.
 */
export function parseFrontmatter(markdown: string): Partial<SpecConfig> | null {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') return null;

  // Find closing ---
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) return null;

  const fmLines = lines.slice(1, endLine);
  if (fmLines.every(l => !l.trim())) return null;

  let base: string | undefined;
  let timeout: number | undefined;
  let headers: Record<string, string> | undefined;

  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('base:')) {
      base = line.slice('base:'.length).trim();
      i++;
    } else if (line.startsWith('timeout:')) {
      // parseInt intentionally truncates floats (99.5 → 99); this is fine for ms values
      const val = parseInt(line.slice('timeout:'.length).trim(), 10);
      if (!isNaN(val)) timeout = val;
      i++;
    } else if (line.startsWith('headers:')) {
      headers = {};
      i++;
      // Consume indented lines
      while (i < fmLines.length && (fmLines[i].startsWith('  ') || fmLines[i].startsWith('\t'))) {
        const headerLine = fmLines[i].trim();
        const colonIdx = headerLine.indexOf(':');
        if (colonIdx !== -1) {
          const key = headerLine.slice(0, colonIdx).trim();
          let value = headerLine.slice(colonIdx + 1).trim();
          // Strip surrounding quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          headers[key] = value;
        }
        i++;
      }
    } else {
      // Unknown top-level key — warn so typos like "base_url" don't silently do nothing
      const key = line.split(':')[0].trim();
      if (key && !line.startsWith(' ') && !line.startsWith('\t')) {
        process.stderr.write(
          `specdown: unknown frontmatter field '${key}' (valid: base, timeout, headers)\n`
        );
      }
      i++;
    }
  }

  if (base === undefined && timeout === undefined && headers === undefined) return null;

  const http: any = {};
  if (base !== undefined) http.base = base;
  if (timeout !== undefined) http.timeout = timeout;
  if (headers !== undefined) http.headers = headers;

  return { http };
}

/**
 * Remove the YAML frontmatter block from the top of a markdown string.
 * Returns the markdown unchanged if no frontmatter is present.
 */
export function stripFrontmatter(markdown: string): string {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') return markdown;

  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) return markdown;

  return lines.slice(endLine + 1).join('\n');
}
