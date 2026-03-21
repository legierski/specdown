/**
 * Configuration for specdown test execution.
 *
 * Config cascade:
 *   Root .specdown → subfolder .specdown → file frontmatter → per-step Headers
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import TOML from 'toml';

export interface SpecConfig {
  http: {
    base: string;
    headers: Record<string, string>;
    timeout?: number;
  };
}

/**
 * Default config when none is provided.
 */
export function defaultConfig(): SpecConfig {
  return {
    http: {
      base: 'http://localhost',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    },
  };
}

/**
 * Parse raw TOML content into a partial config (only fields present in the file).
 */
function parseTomlConfig(content: string): Partial<SpecConfig> {
  if (!content.trim()) return {};

  let parsed: any;
  try {
    parsed = TOML.parse(content);
  } catch {
    return {};
  }

  if (!parsed.http) return {};

  const result: Partial<SpecConfig> = {
    http: {
      base: parsed.http.base || '',
      headers: parsed.http.headers ? { ...parsed.http.headers } : {},
    },
  };

  if (parsed.http.timeout !== undefined) {
    result.http!.timeout = parsed.http.timeout;
  }

  return result;
}

/**
 * Parse a single .specdown TOML config file.
 * Returns defaultConfig() if file doesn't exist or is empty/invalid.
 * When used standalone (not in cascade), fills in defaults.
 */
export function parseConfigFile(filePath: string): SpecConfig {
  if (!existsSync(filePath)) {
    return defaultConfig();
  }

  const content = readFileSync(filePath, 'utf-8');
  const partial = parseTomlConfig(content);

  if (!partial.http || !partial.http.base) {
    return defaultConfig();
  }

  return {
    http: {
      base: partial.http.base,
      headers: partial.http.headers || {},
      timeout: partial.http.timeout,
    },
  };
}

/**
 * Merge two configs. Child overrides parent.
 * Header set to "none" in child removes it from the result.
 */
export function mergeConfigs(parent: SpecConfig, child: Partial<SpecConfig>): SpecConfig {
  const merged: SpecConfig = {
    http: {
      base: child.http?.base || parent.http.base,
      headers: { ...parent.http.headers },
      timeout: child.http?.timeout ?? parent.http.timeout,
    },
  };

  // Merge headers: child overrides parent, empty string removes
  if (child.http?.headers) {
    for (const [key, value] of Object.entries(child.http.headers)) {
      if (value === '') {
        delete merged.http.headers[key];
      } else {
        merged.http.headers[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Walk up from a directory, collecting .specdown files, and merge them
 * in order (root first, deepest last). Returns the cascaded config.
 *
 * Stops walking up at filesystem root.
 */
export function resolveConfig(dir: string): SpecConfig {
  const configFiles: string[] = [];
  let current = resolve(dir);

  // Walk up collecting .specdown files
  while (true) {
    const configPath = join(current, '.specdown');
    if (existsSync(configPath)) {
      configFiles.unshift(configPath); // prepend so root is first
    }
    const parent = dirname(current);
    if (parent === current) break; // reached filesystem root
    current = parent;
  }

  if (configFiles.length === 0) {
    return defaultConfig();
  }

  // Parse root as full config (with defaults for missing fields)
  let config = parseConfigFile(configFiles[0]);

  // Merge subsequent configs as partials (only override what they set)
  for (let i = 1; i < configFiles.length; i++) {
    const content = readFileSync(configFiles[i], 'utf-8');
    const partial = parseTomlConfig(content);
    if (partial.http) {
      config = mergeConfigs(config, partial);
    }
  }

  return config;
}
