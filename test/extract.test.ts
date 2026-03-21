import { describe, it, expect } from 'vitest';
import { extractJsonBlock, extractHeadersBlock } from '../src/extract.js';

describe('extractJsonBlock', () => {
  it('extracts a simple JSON object', () => {
    const lines = ['```json', '{"key": "value"}', '```'];
    const result = extractJsonBlock(lines, 0);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual({ key: 'value' });
    expect(result!.annotations).toEqual({});
    expect(result!.endIdx).toBe(3);
  });

  it('extracts JSON with annotations', () => {
    const lines = ['```json', '{"id": "xxxx",  // save as: $id', '}', '```'];
    const result = extractJsonBlock(lines, 0);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual({ id: 'xxxx' });
    expect(result!.annotations['id']).toBe('save as: $id');
  });

  it('returns null if line does not contain ```json', () => {
    const lines = ['```http', 'Authorization: Bearer token', '```'];
    const result = extractJsonBlock(lines, 0);
    expect(result).toBeNull();
  });

  it('returns null if startIdx is out of bounds', () => {
    const result = extractJsonBlock([], 0);
    expect(result).toBeNull();
  });

  it('returns { data: null } for empty JSON block', () => {
    const lines = ['```json', '```'];
    const result = extractJsonBlock(lines, 0);
    expect(result).not.toBeNull();
    expect(result!.data).toBeNull();
    expect(result!.endIdx).toBe(2);
  });

  it('starts extracting from the specified index', () => {
    const lines = ['some line', '```json', '{"n": 1}', '```'];
    const result = extractJsonBlock(lines, 1);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual({ n: 1 });
    expect(result!.endIdx).toBe(4);
  });
});

describe('extractHeadersBlock', () => {
  it('extracts simple headers', () => {
    const lines = ['```http', 'Authorization: Bearer token', 'X-Custom: value', '```'];
    const result = extractHeadersBlock(lines, 0);
    expect(result.headers['Authorization']).toBe('Bearer token');
    expect(result.headers['X-Custom']).toBe('value');
    expect(result.endIdx).toBe(4);
  });

  it('handles header with colons in value', () => {
    const lines = ['```http', 'Authorization: Bearer a:b:c', '```'];
    const result = extractHeadersBlock(lines, 0);
    expect(result.headers['Authorization']).toBe('Bearer a:b:c');
  });

  it('handles empty value (header removal syntax)', () => {
    const lines = ['```http', 'Authorization:', '```'];
    const result = extractHeadersBlock(lines, 0);
    expect(result.headers['Authorization']).toBe('');
  });

  it('ignores lines without colons', () => {
    const lines = ['```http', 'NoColon', 'Key: value', '```'];
    const result = extractHeadersBlock(lines, 0);
    expect(Object.keys(result.headers)).toEqual(['Key']);
  });

  it('returns empty headers for empty block', () => {
    const lines = ['```http', '```'];
    const result = extractHeadersBlock(lines, 0);
    expect(result.headers).toEqual({});
    expect(result.endIdx).toBe(2);
  });
});
