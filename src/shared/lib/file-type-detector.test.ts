import { describe, expect, it } from 'vitest';
import { getFileType, getMonacoLanguage } from './file-type-detector';

describe('file-type-detector', () => {
  it('detects React TypeScript component files', () => {
    const code = `
      import React from 'react';
      export const Card: React.FC = () => <div>Hello</div>;
    `;

    expect(getFileType('Card.ts', code)).toBe('react');
  });

  it('detects React Native components', () => {
    const code = `
      import React from 'react';
      import { View } from 'react-native';
      export default function App() {
        return <View />;
      }
    `;

    expect(getFileType('App.tsx', code)).toBe('react-native');
  });

  it('keeps plain TypeScript files as typescript', () => {
    const code = `export function sum(a: number, b: number) { return a + b; }`;
    expect(getFileType('math.ts', code)).toBe('typescript');
  });

  it('classifies binary assets', () => {
    expect(getFileType('assets/logo.png')).toBe('binary');
  });

  it('maps Monaco language from file type and extension', () => {
    expect(getMonacoLanguage('react', '/src/App.tsx')).toBe('typescript');
    expect(getMonacoLanguage('css', '/src/styles.scss')).toBe('scss');
    expect(getMonacoLanguage('binary', '/src/logo.png')).toBeNull();
  });
});
