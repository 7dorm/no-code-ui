import { describe, expect, it } from 'vitest';
import {
  detectComponents,
  extractImports,
  extractVariableUsages,
  instrumentVariablesForPreview,
  normalizeReactModuleCode,
  wrapImportedComponentUsages,
} from './react-processor';

describe('react-processor', () => {
  it('extracts only relevant runtime imports', () => {
    const code = `
      import React from 'react';
      import type { CSSProperties } from 'react';
      import Button from './Button';
      import { Card } from '../components/Card';
      import './local.css';
      import data from 'https://cdn.example.com/data.js';
    `;

    expect(extractImports(code, 'App.tsx')).toEqual([
      expect.objectContaining({ path: './Button', line: 4 }),
      expect.objectContaining({ path: '../components/Card', line: 5 }),
      expect.objectContaining({ path: './local.css', line: 6 }),
    ]);
    expect(extractImports(`@import './a.css';`, 'styles.css')).toEqual([]);
  });

  it('normalizes anonymous default exports into named bindings', () => {
    const result = normalizeReactModuleCode(`
      export const helper = 1;
      export default () => <div>Hello</div>;
    `);

    expect(result.defaultExportInfo).toEqual({
      name: 'MrpakDefaultExportComponent',
      type: 'default-export-expression',
    });
    expect(result.namedExports).toEqual([{ localName: 'helper', exportedName: 'helper' }]);
    expect(result.code).toContain('const MrpakDefaultExportComponent = () => <div>Hello</div>;');
    expect(result.code).toContain('const helper = 1;');
  });

  it('wraps imported component usages with a preview boundary', () => {
    const result = wrapImportedComponentUsages(`
      import Header from './Header';

      export default function App() {
        return <Header data-no-code-ui-id="mrpak:App.jsx:Header:1" title="Hello" />;
      }
    `);

    expect(result.wrappedCount).toBe(1);
    expect(result.code).toContain('<MrpakImportedBoundary');
    expect(result.code).toContain('__mrpakSource="./Header"');
    expect(result.code).toContain('__mrpakName="Header"');
  });

  it('instruments component variables for preview overrides', () => {
    const result = instrumentVariablesForPreview(`
      function App() {
        const [count, setCount] = useState(0);
        const title = 'Hello';
        return <div>{count}{title}</div>;
      }
    `);

    expect(result).toContain('window.__mrpakGetMockState');
    expect(result).toContain('window.__mrpakGetMock');
    expect(result).toContain('"App"');
    expect(result).toContain('"count"');
    expect(result).toContain('"title"');
  });

  it('instruments destructured component props with defaults and prop mocks', () => {
    const result = instrumentVariablesForPreview(`
      function FeatureCard({ title, text = 'Body copy' }) {
        return (
          <article>
            <h2 data-no-code-ui-id="title-block">{title}</h2>
            <p data-no-code-ui-id="text-block">{text}</p>
          </article>
        );
      }
    `);

    expect(result).toMatch(/function FeatureCard\([^)]*=\s*\{\}\)/);
    expect(result).toMatch(/let\s*\{\s*title\s*=\s*"Title",\s*text\s*=\s*'Body copy'|let\s*\{\s*title\s*=\s*"Title",\s*text\s*=\s*"Body copy"/s);
    expect(result).toMatch(/window\.__mrpakGetMock\(\s*"FeatureCard",\s*"title",\s*title,\s*"prop"\s*\)/);
    expect(result).toMatch(/window\.__mrpakGetMock\(\s*"FeatureCard",\s*"text",\s*text,\s*"prop"\s*\)/);

    const usages = extractVariableUsages(result);
    expect(usages.title.getters).toEqual(['title-block']);
    expect(usages.text.getters).toEqual(['text-block']);
  });

  it('detects exported and local component declarations', () => {
    const components = detectComponents(`
      import React from 'react';

      export default function App({ style }) {
        return <div style={style}>App</div>;
      }

      export const Card = ({ title }) => <section>{title}</section>;

      class Legacy extends React.Component {
        render() {
          return <div>Legacy</div>;
        }
      }

      const helper = () => 1;
    `);

    expect(components).toEqual([
      expect.objectContaining({
        name: 'App',
        type: 'function-component',
        exportType: 'default',
        supportsStyleOnlyArg: true,
      }),
      expect.objectContaining({
        name: 'Card',
        type: 'variable-component',
        exportType: 'named',
        hasProps: true,
      }),
      expect.objectContaining({
        name: 'Legacy',
        type: 'class-component',
        exportType: 'none',
      }),
    ]);
  });

  it('extracts getter and setter block usage for component variables', () => {
    const usages = extractVariableUsages(`
      function App() {
        const [count, setCount] = useState(0);
        const doubled = count * 2;

        return (
          <div data-no-code-ui-id="root">
            <span data-no-code-ui-id="getter">{count} / {doubled}</span>
            <button data-no-code-ui-id="setter" onClick={() => setCount(count + 1)}>
              Inc
            </button>
          </div>
        );
      }
    `);

    expect(usages.count.getters).toEqual(expect.arrayContaining(['getter']));
    expect(usages.count.setters).toEqual(['setter']);
    expect(usages.doubled.getters).toEqual(['getter']);
  });
});
