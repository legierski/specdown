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
  cli?: {
    shell?: string;
    timeout?: number;
  };
  sql?: {
    connection: string;
  };
}

/**
 * Default config when none is provided.
 */
export function defaultConfig(): SpecConfig {
  return {
    http: {
      base: 'http://localhost:3000',
      // No Content-Type default: the runner infers it when a body is present (runner.ts).
      // Pre-setting it here caused GET requests to incorrectly send Content-Type: application/json.
      headers: {},
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

  if (!parsed.http && !parsed.cli && !parsed.sql) return {};

  const result: Partial<SpecConfig> = {};

  if (parsed.http) {
    result.http = {
      base: parsed.http.base || '',
      headers: parsed.http.headers ? { ...parsed.http.headers } : {},
    };
    if (parsed.http.timeout !== undefined) {
      result.http.timeout = parsed.http.timeout;
    }
  }

  if (parsed.cli) {
    result.cli = {};
    if (parsed.cli.shell !== undefined) result.cli.shell = parsed.cli.shell;
    if (parsed.cli.timeout !== undefined) result.cli.timeout = parsed.cli.timeout;
  }

  if (parsed.sql?.connection) {
    result.sql = { connection: parsed.sql.connection };
  }

  return result;
}

/**
 * Parse a single .specdown TOML config file.
 * Returns defaultConfig() if file doesn't exist or is empty/invalid.
 * Partial configs (e.g. headers-only, timeout-only) are merged with defaults
 * so that a root .specdown without a base URL still preserves its headers/timeout.
 */
export function parseConfigFile(filePath: string): SpecConfig {
  if (!existsSync(filePath)) {
    return defaultConfig();
  }

  const content = readFileSync(filePath, 'utf-8');
  const partial = parseTomlConfig(content);

  if (!partial.http && !partial.cli && !partial.sql) {
    return defaultConfig();
  }

  // Merge with defaults: partial config overrides only what it sets.
  return mergeConfigs(defaultConfig(), partial);
}

/**
 * Merge two configs. Child overrides parent.
 * Header set to empty string "" in child removes it from the result.
 */
export function mergeConfigs(parent: SpecConfig, child: Partial<SpecConfig>): SpecConfig {
  const merged: SpecConfig = {
    http: {
      base: child.http?.base || parent.http.base,
      headers: { ...parent.http.headers },
      timeout: child.http?.timeout ?? parent.http.timeout,
    },
  };

  // Merge headers: child overrides parent, empty string or "none" removes
  if (child.http?.headers) {
    for (const [key, value] of Object.entries(child.http.headers)) {
      if (value === '' || value === 'none') {
        delete merged.http.headers[key];
      } else {
        merged.http.headers[key] = value;
      }
    }
  }

  // Merge cli: child overrides parent per-field
  if (child.cli || parent.cli) {
    merged.cli = {
      shell: child.cli?.shell ?? parent.cli?.shell,
      timeout: child.cli?.timeout ?? parent.cli?.timeout,
    };
  }

  // Merge sql: child overrides parent
  if (child.sql?.connection) {
    merged.sql = { connection: child.sql.connection };
  } else if (parent.sql) {
    merged.sql = { ...parent.sql };
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
    if (partial.http || partial.cli || partial.sql) {
      config = mergeConfigs(config, partial);
    }
  }

  return config;
}
