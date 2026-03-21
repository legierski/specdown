/**
 * Code block extraction helpers for the specdown markdown parser.
 *
 * These are internal utilities — not part of the public API.
 */

import { parseJsonWithAnnotations } from './json.js';

/**
 * Extract a JSON code block starting at lines[startIdx] (the ```json line).
 */
export function extractJsonBlock(
  lines: string[],
  startIdx: number
): { data: any; annotations: Record<string, string>; endIdx: number } | null {
  if (startIdx >= lines.length || !lines[startIdx].includes('```json')) return null;

  let idx = startIdx + 1;
  const blockLines: string[] = [];
  while (idx < lines.length && !lines[idx].includes('```')) {
    blockLines.push(lines[idx]);
    idx++;
  }
  idx++; // skip closing ```

  if (blockLines.length === 0) return { data: null, annotations: {}, endIdx: idx };

  const { data, annotations } = parseJsonWithAnnotations(blockLines.join('\n'));
  return { data, annotations, endIdx: idx };
}

/**
 * Extract a headers code block starting at lines[startIdx].
 */
export function extractHeadersBlock(
  lines: string[],
  startIdx: number
): { headers: Record<string, string>; endIdx: number } {
  const headers: Record<string, string> = {};
  let idx = startIdx + 1;
  while (idx < lines.length && !lines[idx].startsWith('```')) {
    const line = lines[idx].trim();
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      headers[key.trim()] = value;
    }
    idx++;
  }
  idx++; // skip closing ```
  return { headers, endIdx: idx };
}
