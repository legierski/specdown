/**
 * Frontmatter tests — YAML config block at top of spec file.
 *
 * Cascade order (lowest → highest priority):
 *   defaultConfig → root .specdown → subdir .specdown → frontmatter → --base CLI flag
 *
 * Frontmatter headers MERGE with config headers (frontmatter wins per-key).
 * Empty string removes an inherited header.
 *
 * parseFrontmatter / stripFrontmatter live in parser.ts.
 * Applying frontmatter to the cascade is cli.ts's responsibility, not runSpec's.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { parseFrontmatter, stripFrontmatter } from '../src/frontmatter.js';
import { mergeConfigs } from '../src/config.js';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';

// ──────────────────────────────────────
// parseFrontmatter — extract YAML config
// ──────────────────────────────────────

describe('parseFrontmatter', () => {
  it('returns null when no frontmatter present', () => {
    const md = `# My API\n\n## Test\n\n**Request** → \`GET /v1/test\`\n`;
    expect(parseFrontmatter(md)).toBeNull();
  });

  it('parses base URL from frontmatter', () => {
    const md = `---\nbase: http://staging.api.com\n---\n\n# API\n`;
    const fm = parseFrontmatter(md);
    expect(fm).not.toBeNull();
    expect(fm!.http?.base).toBe('http://staging.api.com');
  });

  it('parses timeout from frontmatter', () => {
    const md = `---\ntimeout: 10000\n---\n\n# API\n`;
    const fm = parseFrontmatter(md);
    expect(fm!.http?.timeout).toBe(10000);
  });

  it('parses headers from frontmatter', () => {
    const md = `---\nheaders:\n  Authorization: Bearer staging\n  X-Version: "2"\n---\n\n# API\n`;
    const fm = parseFrontmatter(md);
    expect(fm!.http?.headers?.['Authorization']).toBe('Bearer staging');
    expect(fm!.http?.headers?.['X-Version']).toBe('2');
  });

  it('parses all fields together', () => {
    const md = `---\nbase: http://api.test\ntimeout: 3000\nheaders:\n  Authorization: Bearer test\n---\n\n# API\n`;
    const fm = parseFrontmatter(md);
    expect(fm!.http?.base).toBe('http://api.test');
    expect(fm!.http?.timeout).toBe(3000);
    expect(fm!.http?.headers?.['Authorization']).toBe('Bearer test');
  });

  it('returns null for empty frontmatter block', () => {
    const md = `---\n---\n\n# API\n`;
    expect(parseFrontmatter(md)).toBeNull();
  });

  it('returns null for frontmatter with no recognized fields', () => {
    const md = `---\ntitle: My API\nauthor: Alice\n---\n\n# API\n`;
    const fm = parseFrontmatter(md);
    expect(fm).toBeNull();
  });

  it('ignores frontmatter that is not at the top of the file', () => {
    const md = `# API\n\nSome text.\n\n---\nbase: http://sneaky.com\n---\n`;
    expect(parseFrontmatter(md)).toBeNull();
  });

  it('parses header value containing colons inside quotes', () => {
    const md = `---\nheaders:\n  Authorization: "Bearer: token:v2"\n---\n\n# API\n`;
    const fm = parseFrontmatter(md);
    expect(fm!.http?.headers?.['Authorization']).toBe('Bearer: token:v2');
  });

  it('handles frontmatter with only base', () => {
    const md = `---\nbase: http://staging.example.com\n---\n`;
    const fm = parseFrontmatter(md);
    expect(fm!.http?.base).toBe('http://staging.example.com');
    expect(fm!.http?.timeout).toBeUndefined();
    expect(fm!.http?.headers).toBeUndefined();
  });
});

// ──────────────────────────────────────
// stripFrontmatter — remove YAML block before parsing tests
// ──────────────────────────────────────

describe('stripFrontmatter', () => {
  it('returns markdown unchanged when no frontmatter', () => {
    const md = `# API\n\n## Test\n`;
    expect(stripFrontmatter(md)).toBe(md);
  });

  it('strips frontmatter block from top of file', () => {
    const md = `---\nbase: http://api.com\n---\n\n# API\n\n## Test\n`;
    const stripped = stripFrontmatter(md);
    expect(stripped).not.toContain('base:');
    expect(stripped).toContain('# API');
    expect(stripped).toContain('## Test');
  });

  it('preserves --- separators that appear later in the file', () => {
    const md = `---\nbase: http://api.com\n---\n\n# API\n\n---\n\nSome separator.\n`;
    const stripped = stripFrontmatter(md);
    // The later --- should survive
    expect(stripped).toContain('---');
    expect(stripped).not.toContain('base:');
  });
});

// ──────────────────────────────────────
// Cascade integration — mirrors what cli.ts does
// Cascade: resolveConfig → frontmatter → --base CLI flag
// ──────────────────────────────────────

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const url = new URL(req.url!, 'http://localhost');

      if (url.pathname === '/v1/echo-headers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          auth: req.headers['authorization'] || null,
          version: req.headers['x-version'] || null,
          content_type: req.headers['content-type'] || null,
        }));
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status": "ok"}');
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

/**
 * Helper that mirrors the cli.ts cascade:
 *   resolveConfig(baseConfig) → frontmatter → cliBase override
 *
 * In real usage, baseConfig comes from resolveConfig(dirname(file)).
 * Here we pass it directly for test simplicity.
 */
function applyFrontmatterCascade(markdown: string, baseConfig: SpecConfig, cliBase?: string): SpecConfig {
  const fm = parseFrontmatter(markdown);
  let config = fm?.http ? mergeConfigs(baseConfig, fm) : baseConfig;
  if (cliBase) {
    config = mergeConfigs(config, { http: { base: cliBase, headers: {} } });
  }
  return config;
}

describe('frontmatter cascade', () => {
  it('frontmatter base overrides config base', async () => {
    const md = `---
base: http://localhost:${port}
---

# API

## Health check

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`;
    // Config has wrong base — frontmatter should override it
    const baseConfig: SpecConfig = { http: { base: 'http://localhost:1', headers: {} } };
    const config = applyFrontmatterCascade(md, baseConfig);
    const result = await runSpec(stripFrontmatter(md), config);
    expect(result.passed).toBe(1);
  });

  it('--base CLI flag overrides frontmatter base', async () => {
    const md = `---
base: http://localhost:1
---

# API

## Health check

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`;
    // Frontmatter has wrong base — CLI --base overrides it
    const baseConfig: SpecConfig = { http: { base: 'http://localhost:1', headers: {} } };
    const config = applyFrontmatterCascade(md, baseConfig, `http://localhost:${port}`);
    const result = await runSpec(stripFrontmatter(md), config);
    expect(result.passed).toBe(1);
  });

  it('frontmatter headers merge with config headers (both survive)', async () => {
    const md = `---
headers:
  X-Version: "2"
---

# API

## Echo headers

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "auth": "Bearer config_token",
  "version": "2"
}
\`\`\`
`;
    // Config has Authorization + X-Version:1; frontmatter sets X-Version:2
    // Auth survives from config, X-Version upgrades to 2
    const baseConfig: SpecConfig = {
      http: {
        base: `http://localhost:${port}`,
        headers: { 'Authorization': 'Bearer config_token', 'X-Version': '1' },
      },
    };
    const config = applyFrontmatterCascade(md, baseConfig);
    const result = await runSpec(stripFrontmatter(md), config);
    expect(result.passed).toBe(1);
  });

  it('frontmatter header wins over config header for same key', async () => {
    const md = `---
headers:
  Authorization: Bearer frontmatter_token
---

# API

## Echo auth

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "auth": "Bearer frontmatter_token"
}
\`\`\`
`;
    const baseConfig: SpecConfig = {
      http: {
        base: `http://localhost:${port}`,
        headers: { 'Authorization': 'Bearer config_token', 'X-Version': '1' },
      },
    };
    const config = applyFrontmatterCascade(md, baseConfig);
    const result = await runSpec(stripFrontmatter(md), config);
    expect(result.passed).toBe(1);
  });

  it('frontmatter empty-string header removes config header', async () => {
    const md = `---
headers:
  Authorization: ""
---

# API

## Echo no auth

**Request** → \`GET /v1/echo-headers\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{
  "auth": null
}
\`\`\`
`;
    const baseConfig: SpecConfig = {
      http: {
        base: `http://localhost:${port}`,
        headers: { 'Authorization': 'Bearer config_token' },
      },
    };
    const config = applyFrontmatterCascade(md, baseConfig);
    const result = await runSpec(stripFrontmatter(md), config);
    expect(result.passed).toBe(1);
  });

  it('spec with no frontmatter passes through unchanged', async () => {
    const md = `# API

## Health check

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`;
    const baseConfig: SpecConfig = { http: { base: `http://localhost:${port}`, headers: {} } };
    const config = applyFrontmatterCascade(md, baseConfig);
    const result = await runSpec(stripFrontmatter(md), config);
    expect(result.passed).toBe(1);
  });

  it('frontmatter timeout overrides config timeout', async () => {
    // Config has 1ms timeout (would fail); frontmatter overrides to 99999ms (passes)
    const md = `---
timeout: 99999
---

# API

## Health check

**Request** → \`GET /health\`

**Response** → \`🟢 200 OK\`

\`\`\`json
{"status": "ok"}
\`\`\`
`;
    const baseConfig: SpecConfig = {
      http: { base: `http://localhost:${port}`, headers: {}, timeout: 1 },
    };
    const config = applyFrontmatterCascade(md, baseConfig);
    const result = await runSpec(stripFrontmatter(md), config);
    expect(result.passed).toBe(1);
  });
});
