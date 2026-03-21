import { describe, it, expect } from 'vitest';
import { splitLineComment, parseJsonWithAnnotations } from '../src/json.js';

describe('splitLineComment', () => {
  it('extracts comment from a JSON line', () => {
    const result = splitLineComment('  "event_id": "evt_xxxxxxxxxxxx",  // save as: $event_id');
    expect(result.json).toBe('  "event_id": "evt_xxxxxxxxxxxx",');
    expect(result.comment).toBe('save as: $event_id');
  });

  it('returns null comment when no comment present', () => {
    const result = splitLineComment('  "name": "Sarah",');
    expect(result.json).toBe('  "name": "Sarah",');
    expect(result.comment).toBeNull();
  });

  it('ignores // inside strings', () => {
    const result = splitLineComment('  "url": "https://example.com/path",');
    expect(result.json).toBe('  "url": "https://example.com/path",');
    expect(result.comment).toBeNull();
  });

  it('handles escaped quotes inside strings', () => {
    const result = splitLineComment('  "msg": "say \\"hello\\"",  // a comment');
    expect(result.comment).toBe('a comment');
  });

  it('handles line with only a comment', () => {
    const result = splitLineComment('  // just a comment');
    expect(result.json).toBe('');
    expect(result.comment).toBe('just a comment');
  });
});

describe('parseJsonWithAnnotations', () => {
  it('extracts annotations from JSON comments', () => {
    const input = `{
  "event_id": "evt_xxxxxxxxxxxx",  // save as: $event_id
  "status": "received",
  "mode": "test"  // one of: test, prod
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data).toEqual({
      event_id: 'evt_xxxxxxxxxxxx',
      status: 'received',
      mode: 'test',
    });
    expect(result.annotations['event_id']).toBe('save as: $event_id');
    expect(result.annotations['mode']).toBe('one of: test, prod');
  });

  it('strips ellipsis lines for partial matching', () => {
    const input = `{
  "id": "1",
  "name": "Sarah",
  ...
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data).toEqual({ id: '1', name: 'Sarah' });
  });

  it('handles trailing commas after stripping comments', () => {
    const input = `{
  "id": "evt_xxxxxxxxxxxx",  // save as: $id
  "status": "received"
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data).toEqual({ id: 'evt_xxxxxxxxxxxx', status: 'received' });
  });

  it('returns empty annotations when no comments', () => {
    const input = `{"name": "Sarah", "age": 30}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.data).toEqual({ name: 'Sarah', age: 30 });
    expect(result.annotations).toEqual({});
  });

  it('handles length annotation', () => {
    const input = `{
  "key": "xxxxxxxxxxxx",  // length: 1000
  "name": "test"
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.annotations['key']).toBe('length: 1000');
  });

  it('handles not: annotation', () => {
    const input = `{
  "event_id": "evt_xxxxxxxxxxxx",  // not: $first_event_id
  "status": "received"
}`;
    const result = parseJsonWithAnnotations(input);
    expect(result.annotations['event_id']).toBe('not: $first_event_id');
  });
});
