import { describe, expect, it } from 'vitest';
import { extractStyleReference, parseStyleImports } from './parseStyleImports';

describe('parseStyleImports', () => {
  it('collects local style imports across import syntaxes', () => {
    const code = `
      import React from 'react';
      import { commonStyles, colors as palette } from '../styles/commonStyles';
      import buttonStyles from './ButtonStyles';
      import * as screenStyles from './screenStyles';
      import { Header } from '../components/Header';
      import helper from 'https://cdn.example.com/helper.js';
    `;

    expect(parseStyleImports(code)).toEqual({
      commonStyles: { path: '../styles/commonStyles', type: 'named' },
      colors: { path: '../styles/commonStyles', type: 'named' },
      buttonStyles: { path: './ButtonStyles', type: 'default' },
      screenStyles: { path: './screenStyles', type: 'namespace' },
    });
  });
});

describe('extractStyleReference', () => {
  it('reads direct style references', () => {
    expect(extractStyleReference('<View style={commonStyles.card} />')).toEqual({
      stylesVar: 'commonStyles',
      styleKey: 'card',
      isArray: false,
    });
  });

  it('reads the first style reference from arrays', () => {
    expect(
      extractStyleReference('<View style={[commonStyles.card, isActive && commonStyles.active]} />')
    ).toEqual({
      stylesVar: 'commonStyles',
      styleKey: 'card',
      isArray: true,
    });
  });
});
