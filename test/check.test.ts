/**
 * RED tests for `specdown check` — dry-run parse validation.
 *
 * These tests will fail until src/check.ts is implemented.
 *
 * checkSpec(markdown, config?) performs static analysis only:
 * - no HTTP requests
 * - parses spec, reports test names + step counts
 * - surfaces parse warnings (zero tests, skipped steps, etc.)
 */

import { describe, it, expect } from 'vitest';
import { checkSpec } from '../src/check.js';
import type { SpecConfig } from '../src/config.js';

const defaultConfig: SpecConfig = {
  http: { base: 'http://localhost:3000', headers: {} },
};

// ── zero-tests cases ──

describe('checkSpec — zero tests found', () => {
  it('returns empty tests array for empty markdown', () => {
    const result = checkSpec('', defaultConfig);
    expect(result.tests).toHaveLength(0);
  });

  it('returns warning when file has no ## headings', () => {
    const result = checkSpec('# Title\n\nProse only.\n', defaultConfig);
    expect(result.tests).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns warning when ## sections have no Request lines', () => {
    const md = `# API\n\n## Introduction\n\nJust prose.\n\n## Overview\n\nMore prose.\n`;
    const result = checkSpec(md, defaultConfig);
    expect(result.tests).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ── valid spec ──

describe('checkSpec — valid spec', () => {
  it('returns test name and step count for a single-step test', () => {
    const md = `# API\n\n## Get users\n\n**Request** → \`GET /v1/users\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const result = checkSpec(md, defaultConfig);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].name).toBe('Get users');
    expect(result.tests[0].stepCount).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns correct step count for chained steps', () => {
    const md = `# API

## Create then fetch

**Request** → \`POST /v1/items\`

\`\`\`json
{"name": "test"}
\`\`\`

**Response** → \`🟢 201 Created\`

\`\`\`json
{"id": "xxxx"}
\`\`\`

**Request** → \`GET /v1/items/$id\`

**Response** → \`🟢 200 OK\`
`;
    const result = checkSpec(md, defaultConfig);
    expect(result.tests[0].stepCount).toBe(2);
  });

  it('returns all tests from a multi-test spec', () => {
    const md = `# API\n\n## Test A\n\n**Request** → \`GET /v1/a\`\n\n**Response** → \`🟢 200 OK\`\n\n## Test B\n\n**Request** → \`GET /v1/b\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const result = checkSpec(md, defaultConfig);
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0].name).toBe('Test A');
    expect(result.tests[1].name).toBe('Test B');
    expect(result.warnings).toHaveLength(0);
  });
});

// ── parse warnings passed through ──

describe('checkSpec — step warnings', () => {
  it('surfaces warning when a step has no Response status line', () => {
    const md = `# API\n\n## Bad response\n\n**Request** → \`GET /v1/test\`\n\n**Response** → \`OK\`\n`;
    const result = checkSpec(md, defaultConfig);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ── config resolution ──

describe('checkSpec — config resolution', () => {
  it('includes resolved base URL in result', () => {
    const config: SpecConfig = { http: { base: 'http://staging:8080', headers: {} } };
    const md = `# API\n\n## Get users\n\n**Request** → \`GET /v1/users\`\n\n**Response** → \`🟢 200 OK\`\n`;
    const result = checkSpec(md, config);
    expect(result.config.http.base).toBe('http://staging:8080');
  });
});
