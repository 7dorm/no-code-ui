import { describe, expect, it } from 'vitest';
import { applyHtmlStylePatch } from './applyHtmlStylePatch';

describe('applyHtmlStylePatch', () => {
  it('updates inline styles and preserves doctype', () => {
    const result = applyHtmlStylePatch({
      html: '<!DOCTYPE html><html><body><div class="card" style="color: red"></div></body></html>',
      selector: '.card',
      patch: {
        'background-color': 'blue',
        width: 120,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('style="color: red; background-color: blue; width: 120"');
  });

  it('returns an error when selector is missing', () => {
    expect(
      applyHtmlStylePatch({
        html: '<html><body><div></div></body></html>',
        selector: '.missing',
        patch: { color: 'red' },
      })
    ).toEqual({
      ok: false,
      error: 'applyHtmlStylePatch: element not found for selector: .missing',
    });
  });
});
