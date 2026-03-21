import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseConfigFile, resolveConfig, mergeConfigs, defaultConfig } from '../src/config.js';
import type { SpecConfig } from '../src/config.js';

const tmpDir = resolve(__dirname, '__config-edge-test-tmp__');

beforeEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

// ──────────────────────────────────────
// parseConfigFile edge cases
// ──────────────────────────────────────

describe('parseConfigFile edge cases', () => {
  it('handles invalid TOML syntax gracefully', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, '[http\nbase = broken syntax');
    const config = parseConfigFile(file);
    // Should return default, not crash
    expect(config.http.base).toBe('http://localhost');
  });

  it('handles TOML with unrelated sections (ignores them)', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[database]\nhost = "localhost"\n\n[http]\nbase = "http://api.test"\n`);
    const config = parseConfigFile(file);
    expect(config.http.base).toBe('http://api.test');
  });

  it('handles http section with no base', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\ntimeout = 3000\n`);
    const config = parseConfigFile(file);
    // No base → returns default
    expect(config.http.base).toBe('http://localhost');
  });

  it('handles http.headers with many headers', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "http://api.test"\n\n[http.headers]\nAuthorization = "Bearer abc"\nX-Request-Id = "test-123"\nAccept = "application/json"\nX-Custom = "value"\n`);
    const config = parseConfigFile(file);
    expect(Object.keys(config.http.headers)).toHaveLength(4);
    expect(config.http.headers['X-Custom']).toBe('value');
  });

  it('handles base URL with trailing slash', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "https://api.example.com/"\n`);
    const config = parseConfigFile(file);
    expect(config.http.base).toBe('https://api.example.com/');
  });

  it('handles base URL with path prefix', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "https://api.example.com/v2"\n`);
    const config = parseConfigFile(file);
    expect(config.http.base).toBe('https://api.example.com/v2');
  });

  it('handles timeout of 0', () => {
    const file = join(tmpDir, '.specdown');
    writeFileSync(file, `[http]\nbase = "http://localhost"\ntimeout = 0\n`);
    const config = parseConfigFile(file);
    expect(config.http.timeout).toBe(0);
  });
});

// ──────────────────────────────────────
// mergeConfigs edge cases
// ──────────────────────────────────────

describe('mergeConfigs edge cases', () => {
  it('child with empty headers does not wipe parent headers', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: { 'Auth': 'Bearer x' } },
    };
    const child: Partial<SpecConfig> = {
      http: { base: '', headers: {} },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.headers['Auth']).toBe('Bearer x');
  });

  it('child with no http section returns parent unchanged', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: { 'X': 'Y' }, timeout: 5000 },
    };
    const merged = mergeConfigs(parent, {});
    expect(merged.http.base).toBe('http://localhost');
    expect(merged.http.headers['X']).toBe('Y');
    expect(merged.http.timeout).toBe(5000);
  });

  it('removes multiple headers with "none"', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: { 'A': '1', 'B': '2', 'C': '3' } },
    };
    const child: Partial<SpecConfig> = {
      http: { base: '', headers: { 'A': 'none', 'C': 'none' } },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.headers['A']).toBeUndefined();
    expect(merged.http.headers['B']).toBe('2');
    expect(merged.http.headers['C']).toBeUndefined();
  });

  it('child timeout of 0 overrides parent timeout', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: {}, timeout: 5000 },
    };
    const child: Partial<SpecConfig> = {
      http: { base: '', headers: {}, timeout: 0 },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.timeout).toBe(0);
  });

  it('child undefined timeout preserves parent timeout', () => {
    const parent: SpecConfig = {
      http: { base: 'http://localhost', headers: {}, timeout: 10000 },
    };
    const child: Partial<SpecConfig> = {
      http: { base: 'http://staging', headers: {} },
    };
    const merged = mergeConfigs(parent, child);
    expect(merged.http.timeout).toBe(10000);
  });
});

// ──────────────────────────────────────
// resolveConfig edge cases
// ──────────────────────────────────────

describe('resolveConfig edge cases', () => {
  it('handles directory that does not exist gracefully', () => {
    // resolveConfig should not throw, just return defaults
    // (the dir may not have .specdown files, which is fine)
    const config = resolveConfig(join(tmpDir, 'nonexistent-subdir-that-exists-nowhere'));
    // Should still work — just finds no .specdown files walking up
    expect(config.http.base).toBeDefined();
  });

  it('ignores .specdown files above the tmp test dir', () => {
    // This test verifies the cascade doesn't pick up random .specdown
    // files from completely unrelated parent directories
    const deep = join(tmpDir, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(tmpDir, '.specdown'), `[http]\nbase = "http://test-root"\n`);
    writeFileSync(join(deep, '.specdown'), `[http.headers]\nX-Deep = "yes"\n`);

    const config = resolveConfig(deep);
    expect(config.http.base).toBe('http://test-root');
    expect(config.http.headers['X-Deep']).toBe('yes');
  });

  it('skips directories without .specdown (no gap in cascade)', () => {
    // root has config, middle has none, leaf has config
    const mid = join(tmpDir, 'mid');
    const leaf = join(mid, 'leaf');
    mkdirSync(leaf, { recursive: true });

    writeFileSync(join(tmpDir, '.specdown'), `[http]\nbase = "http://root"\n\n[http.headers]\nAuth = "root-token"\n`);
    // mid has NO .specdown
    writeFileSync(join(leaf, '.specdown'), `[http.headers]\nAuth = "leaf-token"\n`);

    const config = resolveConfig(leaf);
    expect(config.http.base).toBe('http://root');
    expect(config.http.headers['Auth']).toBe('leaf-token');
  });
});

// ──────────────────────────────────────
// defaultConfig
// ──────────────────────────────────────

describe('defaultConfig', () => {
  it('returns expected defaults', () => {
    const config = defaultConfig();
    expect(config.http.base).toBe('http://localhost');
    expect(config.http.headers['Content-Type']).toBe('application/json');
    expect(config.http.timeout).toBe(5000);
  });

  it('returns a new object each time (not shared reference)', () => {
    const a = defaultConfig();
    const b = defaultConfig();
    a.http.base = 'modified';
    expect(b.http.base).toBe('http://localhost');
  });
});
