import { describe, it, expect } from 'vitest';
import { splitLineComment, parseJsonWithAnnotations } from '../src/json.js';

describe('splitLineComment edge cases', () => {
  it('handles empty string', () => {
    const result = splitLineComment('');
    expect(result.json).toBe('');
    expect(result.comment).toBeNull();
  });

  it('handles string with multiple // in a string value', () => {
    const result = splitLineComment('  "url": "https://example.com/path//extra",');
    expect(result.json).toBe('  "url": "https://example.com/path//extra",');
    expect(result.comment).toBeNull();
  });

  it('handles comment after a string containing //', () => {
    const result = splitLineComment('  "url": "https://a.com",  // the url');
    expect(result.json).toBe('  "url": "https://a.com",');
    expect(result.comment).toBe('the url');
  });

  it('handles deeply nested escaped quotes', () => {
    const result = splitLineComment('  "msg": "say \\"hi\\" and \\"bye\\"",  // greeting');
    expect(result.comment).toBe('greeting');
  });

  it('handles line with only whitespace', () => {
    const result = splitLineComment('   ');
    expect(result.json).toBe('   ');
    expect(result.comment).toBeNull();
  });

  it('handles backslash not followed by quote', () => {
    const result = splitLineComment('  "path": "C:\\\\Users\\\\test",  // windows path');
    expect(result.comment).toBe('windows path');
  });

  it('handles comment with special characters', () => {
    const result = splitLineComment('  "id": "xxx",  // save as: $my_var_123');
    expect(result.comment).toBe('save as: $my_var_123');
  });
});

describe('parseJsonWithAnnotations edge cases', () => {
  it('handles single-line JSON', () => {
    const result = parseJsonWithAnnotations('{"a": 1}');
    expect(result.data).toEqual({ a: 1 });
  });

  it('handles JSON with only ellipsis (just partial marker)', () => {
    const result = parseJsonWithAnnotations('{\n  ...\n}');
    expect(result.data).toEqual({});
  });

  it('handles trailing comma on last field before }', () => {
    const input = `{
  "a": 1,
  "b": 2,  // annotation
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data).toEqual({ a: 1, b: 2 });
    expect(result.annotations['b']).toBe('annotation');
  });

  it('handles nested objects with annotations', () => {
    const input = `{
  "outer": {
    "inner": "xxxxxxxxxxxx"  // save as: $inner_id
  }
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data.outer.inner).toBe('xxxxxxxxxxxx');
    expect(result.annotations['inner']).toBe('save as: $inner_id');
  });

  it('handles array elements', () => {
    const input = `{
  "items": [
    {"id": 1},
    {"id": 2}
  ]
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data.items).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('handles annotation on array element field', () => {
    // This is a tricky case — the annotation parser looks for "key": pattern
    const input = `{
  "items": [
    {"id": "xxxxxxxxxxxx"}  // save as: $first_id
  ]
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.annotations['id']).toBe('save as: $first_id');
  });

  it('handles empty object with annotation context', () => {
    const result = parseJsonWithAnnotations('{}');
    expect(result.data).toEqual({});
    expect(result.annotations).toEqual({});
  });

  it('handles multiple ellipsis placements', () => {
    const input = `{
  "a": 1,
  ...
  "b": 2,
  ...,
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data).toEqual({ a: 1, b: 2 });
  });

  it('handles string values containing curly braces', () => {
    const input = `{
  "template": "Hello {name}!",
  "id": 1
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data.template).toBe('Hello {name}!');
  });

  it('handles unicode in values', () => {
    const input = `{
  "name": "Sar\\u0061h",
  "emoji": "Hello 🌍"
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data.emoji).toBe('Hello 🌍');
  });
});
