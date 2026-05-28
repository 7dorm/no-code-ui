import { describe, expect, it } from 'vitest';
import { applyCssRulePatch } from './applyCssRulePatch';

describe('applyCssRulePatch', () => {
  it('updates an existing css rule', () => {
    const result = applyCssRulePatch({
      css: `.card {\n  color: red;\n}\n`,
      className: 'card',
      patch: {
        color: 'green',
        'background-color': 'blue',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.css).toContain('color: green;');
    expect(result.css).toContain('background-color: blue;');
  });

  it('appends a new rule when class does not exist', () => {
    const result = applyCssRulePatch({
      css: '.root {\n  display: flex;\n}\n',
      className: 'card',
      patch: { color: 'red' },
    });

    expect(result.ok).toBe(true);
    expect(result.css).toContain('.card');
    expect(result.css).toContain('color: red;');
  });

  it('rejects missing class names', () => {
    expect(applyCssRulePatch({ css: '.a {}', className: '', patch: {} })).toEqual({
      ok: false,
      error: 'applyCssRulePatch: className is required',
    });
  });
});
