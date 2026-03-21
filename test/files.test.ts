import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { findSpecFiles } from '../src/files.js';

const tmpDir = resolve(__dirname, '__files-test-tmp__');

describe('findSpecFiles — smoke tests', () => {
  beforeEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  it('returns a single file path when given a file', () => {
    const file = join(tmpDir, 'api.spec.md');
    writeFileSync(file, '# API');
    expect(findSpecFiles(file)).toEqual([resolve(file)]);
  });

  it('finds .spec.md files in a directory', () => {
    writeFileSync(join(tmpDir, 'a.spec.md'), '# A');
    writeFileSync(join(tmpDir, 'b.spec.md'), '# B');
    writeFileSync(join(tmpDir, 'ignore.md'), '# Ignore');
    expect(findSpecFiles(tmpDir)).toHaveLength(2);
  });

  it('returns sorted results', () => {
    writeFileSync(join(tmpDir, 'z.spec.md'), '# Z');
    writeFileSync(join(tmpDir, 'a.spec.md'), '# A');
    const result = findSpecFiles(tmpDir);
    expect(result[0]).toContain('a.spec.md');
    expect(result[1]).toContain('z.spec.md');
  });

  it('returns empty array when no .spec.md files found', () => {
    writeFileSync(join(tmpDir, 'readme.md'), '# readme');
    expect(findSpecFiles(tmpDir)).toEqual([]);
  });

  it('calls process.exit(1) for nonexistent path', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    expect(() => findSpecFiles('/no/such/path/xyz')).toThrow('process.exit called');
    exitSpy.mockRestore();
  });
});
