import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs — smoke tests', () => {
  it('defaults to run command with empty args', () => {
    expect(parseArgs([]).command).toBe('run');
  });

  it('parses --format json', () => {
    expect(parseArgs(['run', '--format', 'json']).format).toBe('json');
  });

  it('parses --base URL and sets baseOverridden', () => {
    const opts = parseArgs(['run', '--base', 'http://staging:8080']);
    expect(opts.config.http.base).toBe('http://staging:8080');
    expect(opts.baseOverridden).toBe(true);
  });

  it('baseOverridden is false when --base not passed', () => {
    expect(parseArgs(['run']).baseOverridden).toBe(false);
  });

  it('collects positional targets', () => {
    expect(parseArgs(['run', 'a.spec.md', 'b.spec.md']).targets).toEqual(['a.spec.md', 'b.spec.md']);
  });

  it('parses --verbose flag', () => {
    expect((parseArgs(['run', '--verbose']) as any).verbose).toBe(true);
  });

  it('verbose defaults to false when --verbose not passed', () => {
    expect((parseArgs(['run', 'file.spec.md']) as any).verbose).toBe(false);
  });
});
