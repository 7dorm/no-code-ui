import { describe, expect, it } from 'vitest';
import {
  buildPatchFromKv,
  camelToKebab,
  normalizeStyleKey,
  parseInlineStyleToBaseline,
  parseValueForReactLike,
  toHtmlStyleAttr,
  toReactStyleObjectText,
} from './styleUtils';

describe('styleUtils', () => {
  it('normalizes style keys for html and react-like targets', () => {
    expect(camelToKebab('backgroundColor')).toBe('background-color');
    expect(normalizeStyleKey({ fileType: 'html', key: 'backgroundColor' })).toBe('background-color');
    expect(normalizeStyleKey({ fileType: 'react', key: 'font-size' })).toBe('fontSize');
  });

  it('parses react-like primitive values', () => {
    expect(parseValueForReactLike('12px')).toBe(12);
    expect(parseValueForReactLike('3.5')).toBe(3.5);
    expect(parseValueForReactLike('true')).toBe(true);
    expect(parseValueForReactLike('null')).toBeNull();
    expect(parseValueForReactLike('100%')).toBe('100%');
  });

  it('builds patch values using target-specific normalization', () => {
    expect(
      buildPatchFromKv({
        fileType: 'html',
        rows: [
          { key: 'backgroundColor', value: 'red' },
          { key: 'width', value: 120 },
        ],
      })
    ).toEqual({
      'background-color': 'red',
      width: '120',
    });

    expect(
      buildPatchFromKv({
        fileType: 'react',
        rows: [
          { key: 'font-size', value: '14px' },
          { key: 'visible', value: 'true' },
        ],
      })
    ).toEqual({
      fontSize: 14,
      visible: true,
    });
  });

  it('serializes html and react style text consistently', () => {
    expect(toHtmlStyleAttr({ backgroundColor: 'red', width: 12, empty: '' })).toBe(
      'background-color: red; width: 12'
    );
    expect(
      toReactStyleObjectText({ width: 12, hidden: false, label: 'Hello', nothing: null })
    ).toBe('width: 12, hidden: false, label: "Hello", nothing: null');
  });

  it('parses inline style text into baseline patch objects', () => {
    expect(
      parseInlineStyleToBaseline({
        fileType: 'react',
        inline: 'font-size: 16px; display: flex; visible: true',
      })
    ).toEqual({
      fontSize: 16,
      display: 'flex',
      visible: true,
    });
  });
});
