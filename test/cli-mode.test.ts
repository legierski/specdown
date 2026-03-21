/**
 * CLI mode tests — **Run** / **Output** keyword pair.
 *
 * Tests parser recognition of Run/Output and runner execution via child_process.
 * RED tests: parser and runner don't support CLI mode yet.
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownSpec } from '../src/parser.js';
import { runSpec } from '../src/runner.js';
import type { SpecConfig } from '../src/config.js';

function config(): SpecConfig {
  return { http: { base: 'http://localhost:1', headers: {} } };
}

// ──────────────────────────────────────
// Parser: recognizing **Run** / **Output**
// ──────────────────────────────────────

describe('parser — CLI mode', () => {
  it('parses inline Run command with Output exit code', () => {
    const md = `# CLI Tests

## Simple echo

**Run** → \`echo hello\`

**Output** → \`🟢 exit 0\`

\`\`\`
hello
\`\`\`
`;
    const { tests, warnings } = parseMarkdownSpec(md);
    expect(warnings).toEqual([]);
    expect(tests).toHaveLength(1);
    expect(tests[0].steps).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('cli');
    expect((step as any).command).toBe('echo hello');
    expect((step as any).expectedExit).toBe(0);
  });

  it('parses Run with code block for multi-line commands', () => {
    const md = `# CLI Tests

## Multi-line command

**Run** ↓

\`\`\`bash
echo "line one" && \\
echo "line two"
\`\`\`

**Output** → \`🟢 exit 0\`

\`\`\`
line one
line two
\`\`\`
`;
    const { tests, warnings } = parseMarkdownSpec(md);
    expect(warnings).toEqual([]);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('cli');
    expect((step as any).command).toContain('echo "line one"');
  });

  it('parses non-zero exit code', () => {
    const md = `# CLI Tests

## Failing command

**Run** → \`cat /nonexistent\`

**Output** → \`🔴 exit 1\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('cli');
    expect((step as any).expectedExit).toBe(1);
  });

  it('parses JSON output block with annotations', () => {
    const md = `# CLI Tests

## JSON output

**Run** → \`echo '{"name":"test","id":"abc123"}'\`

**Output** → \`🟢 exit 0\`

\`\`\`json
{
  "name": "test",
  "id": "xxxxxxxxxxxx"  // save as: $item_id
}
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('cli');
    expect((step as any).expectedOutput).toEqual({ name: 'test', id: 'xxxxxxxxxxxx' });
    expect((step as any).outputAnnotations).toHaveProperty('id');
  });

  it('parses Output with no exit code (no arrow)', () => {
    const md = `# CLI Tests

## No exit check

**Run**

\`\`\`bash
echo "no arrows"
\`\`\`

**Output**

\`\`\`
no arrows
\`\`\`
`;
    const { tests } = parseMarkdownSpec(md);
    expect(tests).toHaveLength(1);
    const step = tests[0].steps[0];
    expect(step.mode).toBe('cli');
    // When no exit code specified, should accept any exit code (or null)
    expect((step as any).expectedExit).toBeNull();
  });
});

// ──────────────────────────────────────
// Runner: executing CLI steps
// ──────────────────────────────────────

describe('runner — CLI mode', () => {
  it('runs a simple echo command and matches output', async () => {
    const md = `# CLI Tests

## Echo test

**Run** → \`echo hello world\`

**Output** → \`🟢 exit 0\`

\`\`\`
hello world
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('checks exit code mismatch', async () => {
    const md = `# CLI Tests

## Wrong exit code

**Run** → \`echo hello\`

**Output** → \`🔴 exit 1\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toContain('exit');
  });

  it('matches JSON output from command', async () => {
    const md = `# CLI Tests

## JSON output

**Run** → \`echo '{"name":"alice","count":42}'\`

**Output** → \`🟢 exit 0\`

\`\`\`json
{
  "name": "alice",
  "count": 42
}
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('captures stderr for failing commands', async () => {
    const md = `# CLI Tests

## Stderr capture

**Run** → \`cat /file/that/does/not/exist\`

**Output** → \`🔴 exit 1\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('substitutes variables in commands', async () => {
    const md = `# CLI Tests

## Variable in command

**Run** → \`echo '{"file":"test.md"}'\`

**Output** → \`🟢 exit 0\`

\`\`\`json
{
  "file": "xxxx.xx"  // save as: $filename
}
\`\`\`

**Run** → \`echo $filename\`

**Output** → \`🟢 exit 0\`

\`\`\`
test.md
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('respects timeout for long-running commands', async () => {
    const md = `# CLI Tests

## Timeout

**Run** → \`sleep 10\`

**Output** → \`🟢 exit 0\`
`;
    const result = await runSpec(md, {
      http: { base: 'http://localhost:1', headers: {}, timeout: 100 },
    });
    expect(result.failed).toBe(1);
    expect(result.tests[0].errors[0]).toMatch(/timed? ?out/i);
  }, 5000);

  it('handles plain text output matching', async () => {
    const md = `# CLI Tests

## Plain text

**Run** → \`echo "first line"\`

**Output** → \`🟢 exit 0\`

\`\`\`
first line
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.passed).toBe(1);
  });

  it('fails when text output does not match', async () => {
    const md = `# CLI Tests

## Wrong output

**Run** → \`echo "actual output"\`

**Output** → \`🟢 exit 0\`

\`\`\`
expected output
\`\`\`
`;
    const result = await runSpec(md, config());
    expect(result.failed).toBe(1);
  });
});
