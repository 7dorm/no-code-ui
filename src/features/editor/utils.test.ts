import { describe, expect, it } from 'vitest';
import {
  collectImportLocalNames,
  ensureComponentImportInCode,
  ensureCssImportInCode,
  ensureUniqueImportName,
  enrichLayersTree,
  extractImportedCssPathsFromCode,
  formatContentForWrite,
  getRelativeAssetImportPath,
  getRelativeImportPath,
  resolveSourceFilePathFromDependencies,
  toSafeIdentifier,
  upsertClassNameInJsxOpeningTag,
} from './utils';

describe('editor utils', () => {
  it('formats json and js-like content while preserving invalid input', () => {
    expect(formatContentForWrite('state.json', '{"a":1}')).toBe('{\n  "a": 1\n}\n');

    const formattedJsx = formatContentForWrite('App.jsx', 'const App=()=>{return <div>Hi</div>}');
    expect(formattedJsx).toContain('const App = () => {');
    expect(formattedJsx.endsWith('\n')).toBe(true);

    expect(formatContentForWrite('broken.jsx', 'const =')).toBe('const =');
  });

  it('inserts css imports after existing imports and avoids duplicates', () => {
    const source = `import React from 'react';\nconst App = () => <div />;\n`;
    const updated = ensureCssImportInCode(source, './styles.css');

    expect(updated.split('\n')[1]).toBe(`import './styles.css';`);
    expect(ensureCssImportInCode(updated, './styles.css')).toBe(updated);
  });

  it('extracts imported css paths from jsx and html files', () => {
    expect(
      extractImportedCssPathsFromCode(
        `import './base.css';\nimport "../theme/app.css";\nimport 'https://cdn.example.com/x.css';`,
        'react',
        '/app/src/App.jsx'
      )
    ).toEqual(['app/src/base.css', 'app/theme/app.css']);

    expect(
      extractImportedCssPathsFromCode(
        `<link rel="stylesheet" href="./page.css"><link rel="stylesheet" href="/shared/reset.css">`,
        'html',
        '/app/src/index.html'
      )
    ).toEqual(['app/src/page.css', '/shared/reset.css']);
  });

  it('updates or rejects className mutations in jsx opening tags', () => {
    expect(upsertClassNameInJsxOpeningTag('<div className="card" />', 'active')).toEqual({
      ok: true,
      text: '<div className="card active" />',
    });

    expect(upsertClassNameInJsxOpeningTag('<div className={styles.card} />', 'active')).toEqual({
      ok: false,
      error: 'Dynamic className expressions are not supported for style library apply yet.',
    });
  });

  it('computes relative import and asset paths', () => {
    expect(getRelativeImportPath('/app/src/App.jsx', '/app/src/components/Button.tsx')).toBe(
      './components/Button'
    );
    expect(getRelativeAssetImportPath('/app/src/App.jsx', '/app/src/assets/logo.svg')).toBe(
      './assets/logo.svg'
    );
  });

  it('creates safe identifiers and unique import names', () => {
    expect(toSafeIdentifier('123 hero-icon')).toBe('asset_123_hero_icon');
    expect(ensureUniqueImportName('Button', new Set(['Button', 'Button_1']))).toBe('Button_2');
  });

  it('adds component imports into existing import blocks', () => {
    const code = `
      import React from 'react';
      import Existing from './lib';
      const App = () => <div />;
    `;

    const updated = ensureComponentImportInCode(code, {
      localName: 'Button',
      importPath: './lib',
      importKind: 'named',
    });

    expect(updated).toMatch(/import Existing,\s*\{\s*Button\s*\}\s*from ['"]\.\/lib['"]/);
    expect(updated.match(/from ['"]\.\/lib['"]/g)).toHaveLength(1);
  });

  it('collects local import names across specifier kinds', () => {
    const names = collectImportLocalNames(`
      import React from 'react';
      import { Button as PrimaryButton } from './Button';
      import * as styles from './styles';
    `);

    expect(Array.from(names).sort()).toEqual(['PrimaryButton', 'React', 'styles']);
  });

  it('resolves dependency-backed source file paths', () => {
    expect(
      resolveSourceFilePathFromDependencies('/app/src/App.jsx', './components/Button', [
        '/vendor/Button.jsx',
        '/app/src/components/Button.tsx',
      ])
    ).toBe('/app/src/components/Button.tsx');
  });

  it('enriches layers tree nodes with source metadata', () => {
    const tree = {
      rootIds: ['mrpak:App.jsx:div:root'],
      nodes: {
        'mrpak:App.jsx:div:root': {
          tagName: 'div',
          childIds: ['mrpak:Header.jsx:section:1'],
        },
        'mrpak:Header.jsx:section:1': {
          tagName: 'section',
          sourcePath: './components/Header.jsx',
          componentName: 'Header',
        },
      },
    };

    const enriched = enrichLayersTree(tree, '/app/src/App.jsx', ['/app/src/components/Header.jsx']);

    expect(enriched.nodes['mrpak:App.jsx:div:root']).toMatchObject({
      sourceBasename: 'App.jsx',
      sourceFilePath: '/app/src/App.jsx',
      isIsolatedComponent: false,
    });
    expect(enriched.nodes['mrpak:Header.jsx:section:1']).toMatchObject({
      sourceBasename: 'Header.jsx',
      sourceFilePath: '/app/src/components/Header.jsx',
      componentName: 'Header',
      isIsolatedComponent: true,
    });
  });
});
