import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseConfigFile, resolveConfig, mergeConfigs } from '../src/config.js';
import type { SpecConfig } from '../src/config.js';

const tmpDir = resolve(__dirname, '__config-test-tmp__');

beforeEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

// ──────────────────────────────────────
// parseConfigFile — parse a single .specdown TOML file
// ──────────────────────────────────────

describe('parseConfigFile', () => {
  it('parses base URL from TOML', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "https://api.example.com"\n`);
    const config = parseConfigFile(file);
    expect(config.http.base).toBe('https://api.example.com');
  });

  it('parses timeout', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "http://localhost"\ntimeout = 10000\n`);
    const config = parseConfigFile(file);
    expect(config.http.timeout).toBe(10000);
  });

  it('parses headers', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "http://localhost"\n\n[http.headers]\nAuthorization = "Bearer abc123"\nContent-Type = "application/json"\n`);
    const config = parseConfigFile(file);
    expect(config.http.headers['Authorization']).toBe('Bearer abc123');
    expect(config.http.headers['Content-Type']).toBe('application/json');
  });

  it('returns default config when file does not exist', () => {
    const config = parseConfigFile(join(tmpDir, 'nonexistent'));
    expect(config.http.base).toBe('http://localhost');
    expect(config.http.headers['Content-Type']).toBe('application/json');
  });

  it('parses minimal config (just base)', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "http://localhost:8080"\n`);
    const config = parseConfigFile(file);
    expect(config.http.base).toBe('http://localhost:8080');
    expect(config.http.headers).toEqual({});
  });

  it('handles empty file', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, '');
    const config = parseConfigFile(file);
    expect(config.http.base).toBe('http://localhost');
  });

  it('handles file with only comments', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, '# This is a comment\n# Another comment\n');
    const config = parseConfigFile(file);
    expect(config.http.base).toBe('http://localhost');
  });
});

// ──────────────────────────────────────
// mergeConfigs — cascade/override configs
// ──────────────────────────────────────

describe('mergeConfigs', () => {
  it('overrides base URL from child', () => {
    const parent: SpecConfig = {
      http: { base: 'https://prod.api.com', headers: { 'Content-Type': 'application/json' } },
    };
    const child: Partial<SpecConfig> = {
      http: { base: 'https://staging.api.com', headers: {} },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.base).toBe('https://staging.api.com');
  });

  it('inherits parent headers not overridden by child', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer parent' } },
    };
    const child: Partial<SpecConfig> = {
      http: { base: 'http://localhost', headers: { 'Authorization': 'Bearer child' } },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.headers['Content-Type']).toBe('application/json');
    expect(merged.http.headers['Authorization']).toBe('Bearer child');
  });

  it('removes header when child sets it to empty string', () => {
    // Empty string is the removal sentinel — consistent with step headers
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: { 'Authorization': 'Bearer token' } },
    };
    const child: Partial<SpecConfig> = {
      http: { base: 'http://localhost', headers: { 'Authorization': '' } },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.headers['Authorization']).toBeUndefined();
  });

  it('does NOT treat "none" as a removal sentinel in config cascade', () => {
    // "none" is a literal value now — consistent with step headers
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: {} },
    };
    const child: Partial<SpecConfig> = {
      http: { base: 'http://localhost', headers: { 'X-Mode': 'none' } },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.headers['X-Mode']).toBe('none');
  });

  it('preserves parent timeout when child does not set it', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: {}, timeout: 5000 },
    };
    const child: Partial<SpecConfig> = {
      http: { base: 'http://localhost:8080', headers: {} },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.timeout).toBe(5000);
    expect(merged.http.base).toBe('http://localhost:8080');
  });

  it('child timeout overrides parent', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: {}, timeout: 5000 },
    };
    const child: Partial<SpecConfig> = {
      http: { base: 'http://localhost', headers: {}, timeout: 15000 },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.timeout).toBe(15000);
  });
});

// ──────────────────────────────────────
// resolveConfig — walk up directories to find and merge .specdown files
// ──────────────────────────────────────

describe('resolveConfig', () => {
  it('finds .specdown in the given directory', () => {
    writeFileSync(join(tmpDir, '.specdown'), `[http]\nbase = "https://api.example.com"\n`);
    const config = resolveConfig(tmpDir);
    expect(config.http.base).toBe('https://api.example.com');
  });

  it('cascades configs from parent to child directory', () => {
    // Root config
    writeFileSync(join(tmpDir, '.specdown'), `[http]\nbase = "https://prod.api.com"\n\n[http.headers]\nAuthorization = "Bearer prod"\nContent-Type = "application/json"\n`);

    // Child directory with override
    const childDir = join(tmpDir, 'staging');
    mkdirSync(childDir);
    writeFileSync(join(childDir, '.specdown'), `[http]\nbase = "https://staging.api.com"\n\n[http.headers]\nAuthorization = "Bearer staging"\n`);

    const config = resolveConfig(childDir);
    expect(config.http.base).toBe('https://staging.api.com');
    expect(config.http.headers['Authorization']).toBe('Bearer staging');
    // Content-Type inherited from parent
    expect(config.http.headers['Content-Type']).toBe('application/json');
  });

  it('returns default config when no .specdown files found', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const config = resolveConfig(emptyDir);
    expect(config.http.base).toBe('http://localhost');
  });

  it('handles three levels of config cascade', () => {
    // Root
    writeFileSync(join(tmpDir, '.specdown'), `[http]\nbase = "https://root.api.com"\ntimeout = 5000\n\n[http.headers]\nAuthorization = "Bearer root"\nContent-Type = "application/json"\nX-Custom = "root-value"\n`);

    // Level 2
    const l2 = join(tmpDir, 'l2');
    mkdirSync(l2);
    writeFileSync(join(l2, '.specdown'), `[http.headers]\nAuthorization = "Bearer l2"\n`);

    // Level 3 — empty string removes inherited header
    const l3 = join(l2, 'l3');
    mkdirSync(l3);
    writeFileSync(join(l3, '.specdown'), `[http.headers]\nAuthorization = ""\n`);

    const config = resolveConfig(l3);
    expect(config.http.base).toBe('https://root.api.com');
    expect(config.http.timeout).toBe(5000);
    expect(config.http.headers['Authorization']).toBeUndefined(); // removed by empty string
    expect(config.http.headers['Content-Type']).toBe('application/json');
    expect(config.http.headers['X-Custom']).toBe('root-value');
  });
});
