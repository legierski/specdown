/**
 * Spec file discovery for specdown.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function findSpecFiles(target: string): string[] {
  const resolved = resolve(target);

  if (!existsSync(resolved)) {
    console.error(`Error: ${target} does not exist`);
    process.exit(1);
  }

  const stat = statSync(resolved);

  if (stat.isFile()) {
    return [resolved];
  }

  if (stat.isDirectory()) {
    const files: string[] = [];
    for (const entry of readdirSync(resolved, { recursive: true })) {
      const name = typeof entry === 'string' ? entry : entry.toString();
      if (name.endsWith('.spec.md')) {
        files.push(join(resolved, name));
      }
    }
    return files.sort();
  }

  return [];
}
