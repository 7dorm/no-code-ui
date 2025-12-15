const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const distRoot = path.join(__dirname, '..', '.tmp-test-dist');

function requireFromDist(...segments) {
  if (!fs.existsSync(distRoot)) {
    throw new Error(
      `Missing backend build at ${distRoot}. Run: npm -C no-code-ui run test:backend`
    );
  }
  return require(path.join(distRoot, ...segments));
}

const { VisualEngine } = requireFromDist('src', 'engine', 'Engine.js');
const { updateCssPropertyInFile } = requireFromDist(
  'src',
  'engine',
  'mutators',
  'updateCss.js'
);
const { addComponentAsChild } = requireFromDist(
  'src',
  'engine',
  'mutators',
  'addComponent.js'
);
const { removeBlockAndCleanup } = requireFromDist(
  'src',
  'engine',
  'mutators',
  'deleteBlock.js'
);
const { updateBlockPropInFile } = requireFromDist(
  'src',
  'engine',
  'Files',
  'editParams.js'
);
const { removeFragmentFromFile } = requireFromDist(
  'src',
  'engine',
  'Files',
  'delete.js'
);
const { insertTextToFile } = requireFromDist('src', 'engine', 'Files', 'add.js');
const { createTsxComponent } = requireFromDist(
  'src',
  'engine',
  'Files',
  'createFile.js'
);

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relPath, contents) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents, 'utf8');
  return abs;
}

function createFullFixtureProject() {
  const root = mkTempDir('visual-engine-fixture-');

  writeFile(
    root,
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
        },
        include: ['src'],
      },
      null,
      2
    )
  );

  writeFile(
    root,
    'public/page.html',
    `<!doctype html>
<html>
  <body>
    <div class="static card">From HTML</div>
  </body>
</html>
`
  );

  writeFile(
    root,
    'src/App.tsx',
    `import './styles/a.css';
import Layout from './components/Layout';
import { Card } from './components/Card';
import { Icon } from './components/Icon';
import './styles/b.css';

export function App() {
  const count = 5;

  return (
    <Layout variant="main">
      <Card title="First" count={1} active />
      <Card title="Second" count={count} icon={Icon} onAction={() => count + 1} />
    </Layout>
  );
}
`
  );

  writeFile(
    root,
    'src/components/Layout.tsx',
    `import '../styles/layout.css';
import { Button } from './Button';

export default function Layout({
  variant,
  children,
}: {
  variant: "main" | "alt";
  children: any;
}) {
  return (
    <div className="layout" data-variant={variant}>
      <Button label="Hello" />
      {children}
    </div>
  );
}
`
  );

  writeFile(
    root,
    'src/components/Button.tsx',
    `import '../styles/button.css';

export const Button = ({ label }: { label: string }) => {
  return <button className="btn">{label}</button>;
};
`
  );

  writeFile(
    root,
    'src/components/Icon.tsx',
    `export function Icon({ name }: { name: string }) {
  return <span className="icon">{name}</span>;
}
`
  );

  writeFile(
    root,
    'src/components/Card.tsx',
    `import '../styles/card.css';
import { Button } from './Button';

export function Card({
  title,
  count,
  active,
  icon,
}: {
  title: string;
  count: number;
  active?: boolean;
  icon?: any;
}) {
  return (
    <div className="card" data-count={count} data-active={active}>
      <Button label={title} />
      {icon ? <span className="has-icon">icon</span> : null}
      {title}
    </div>
  );
}
`
  );

  writeFile(
    root,
    'src/styles/a.css',
    `.card { color: red; }
.layout { border: 1px solid black; }
`
  );
  writeFile(root, 'src/styles/card.css', `.card { color: orange; }\n`);
  writeFile(
    root,
    'src/styles/b.css',
    `.card { color: blue; }
.card { color: green; }
`
  );
  writeFile(root, 'src/styles/layout.css', `.layout { padding: 4px; }\n`);
  writeFile(root, 'src/styles/button.css', `.btn { background: black; color: white; }\n`);

  writeFile(
    root,
    'src/database.ts',
    `export const BASE_URL = 'https://example.com';
const Database = {
  async getCommentLikes() {
    return [];
  },
};
export default Database;
`
  );

  writeFile(root, 'src/assets/like.svg', `<svg xmlns="http://www.w3.org/2000/svg"></svg>\n`);

  writeFile(
    root,
    'src/components/Comment.tsx',
    `import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import LikeIcon from '../assets/like.svg';
import Database, { BASE_URL } from '../database';

export default function Comment({ ok }: { ok: boolean }) {
  useEffect(() => {
    void Database.getCommentLikes();
  }, []);

  const [count] = useState(0);

  try {
    if (!ok) {
      return <Text>{BASE_URL}</Text>;
    }

    return (
      <View style={styles.container}>
        <Image source={LikeIcon} />
        <Text>{count}</Text>
      </View>
    );
  } catch (e) {
    return <Text>err</Text>;
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 1,
  },
});
`
  );

  return root;
}

function findBlock(blocks, predicate) {
  return Object.values(blocks).find(predicate) || null;
}

function findBlocks(blocks, predicate) {
  return Object.values(blocks).filter(predicate);
}

test('Engine parses project, resolves component usages, args, and CSS priority', async t => {
  const projectRoot = createFullFixtureProject();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();
  const { blocks } = tree;

  const cardComponent = findBlock(
    blocks,
    b => b.type === 'component' && b.name === 'Card' && b.relPath.endsWith('src/components/Card.tsx')
  );
  assert(cardComponent, 'Card component not found');
  assert.equal(cardComponent.args?.title, 'string');
  assert.equal(cardComponent.args?.count, 'number');
  assert.equal(cardComponent.args?.active, 'boolean');

  const cardInstances = findBlocks(
    blocks,
    b => b.type === 'component-instance' && b.name === 'Card' && b.relPath.endsWith('src/App.tsx')
  );
  assert.equal(cardInstances.length, 2);

  const instanceTitles = cardInstances
    .map(i => i.props?.title?.value)
    .filter(Boolean)
    .sort();
  assert.deepEqual(instanceTitles, ['First', 'Second']);

  const firstInstance = cardInstances.find(i => i.props?.title?.value === 'First');
  assert(firstInstance);
  assert.equal(firstInstance.props?.active?.type, 'boolean');
  assert.equal(firstInstance.props?.active?.value, 'true');
  assert.equal(firstInstance.props?.count?.type, 'number');
  assert.equal(firstInstance.props?.count?.value, '1');

  const secondInstance = cardInstances.find(i => i.props?.title?.value === 'Second');
  assert(secondInstance);
  assert.equal(secondInstance.props?.count?.type, 'expression');
  assert.equal(secondInstance.props?.count?.value, 'count');
  assert.equal(secondInstance.props?.icon?.type, 'component');
  assert.equal(secondInstance.props?.icon?.value, 'Icon');
  assert.equal(secondInstance.props?.onAction?.type, 'expression');
  assert.match(secondInstance.props?.onAction?.value ?? '', /count \+ 1/);

  assert.equal(secondInstance.refId, cardComponent.id);
  assert(secondInstance.uses.includes(cardComponent.id));

  assert(Array.isArray(cardComponent.usages));
  assert.equal(cardComponent.usages.length, 2);
  const usageTitles = cardComponent.usages
    .map(u => u.props?.title?.value)
    .filter(Boolean)
    .sort();
  assert.deepEqual(usageTitles, ['First', 'Second']);

  const layoutInstance = findBlock(
    blocks,
    b => b.type === 'component-instance' && b.name === 'Layout' && b.relPath.endsWith('src/App.tsx')
  );
  assert(layoutInstance, 'Layout usage not found (should be component-instance)');
  assert(cardInstances.every(i => i.parentId === layoutInstance.id));

  const buttonInstanceInCard = findBlock(
    blocks,
    b =>
      b.type === 'component-instance' &&
      b.name === 'Button' &&
      b.relPath.endsWith('src/components/Card.tsx')
  );
  assert(buttonInstanceInCard, 'Expected <Button /> usage inside Card');
  assert.equal(buttonInstanceInCard.props?.label?.type, 'expression');
  assert.equal(buttonInstanceInCard.props?.label?.value, 'title');

  const cardDiv = findBlock(
    blocks,
    b =>
      b.type === 'element' &&
      b.name === 'div' &&
      b.relPath.endsWith('src/components/Card.tsx') &&
      b.props?.className?.value === 'card'
  );
  assert(cardDiv, 'Expected <div className="card"> inside Card');

  const usedCssBlocks = (cardDiv.uses ?? [])
    .map(id => engine.cssStyles.get(id))
    .filter(Boolean);

  const cssFromA = usedCssBlocks.find(b =>
    normalizePath(b.filePath).endsWith('/src/styles/a.css')
  );
  assert.equal(cssFromA, undefined);

  const cssFromB = usedCssBlocks.find(b =>
    normalizePath(b.filePath).endsWith('/src/styles/b.css')
  );
  assert(cssFromB, 'Expected .card to be linked to b.css (React import priority)');
  assert.match(cssFromB.sourceCode, /color:\s*green/);
  assert(cssFromB.startLine > 0 && cssFromB.endLine > 0);
});

test('Parser creates object blocks for non-rendered imports (svg/utils) and supports multiple returns', async t => {
  const projectRoot = createFullFixtureProject();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();
  const { blocks } = tree;

  const likeIcon = findBlock(
    blocks,
    b => b.type === 'object' && b.name === 'LikeIcon' && b.relPath.endsWith('src/components/Comment.tsx')
  );
  assert(likeIcon, 'Expected LikeIcon import to be parsed as object');
  assert.equal(normalizePath(likeIcon.metadata?.importSource ?? ''), '../assets/like.svg');

  const styleSheet = findBlock(
    blocks,
    b => b.type === 'object' && b.name === 'StyleSheet' && b.relPath.endsWith('src/components/Comment.tsx')
  );
  assert(styleSheet, 'Expected StyleSheet import to be parsed as object');

  const database = findBlock(
    blocks,
    b => b.type === 'object' && b.name === 'Database' && b.relPath.endsWith('src/components/Comment.tsx')
  );
  assert(database, 'Expected Database import to be parsed as object');

  const baseUrl = findBlock(
    blocks,
    b => b.type === 'object' && b.name === 'BASE_URL' && b.relPath.endsWith('src/components/Comment.tsx')
  );
  assert(baseUrl, 'Expected BASE_URL import to be parsed as object');

  const commentComponent = findBlock(
    blocks,
    b => b.type === 'component' && b.name === 'Comment' && b.relPath.endsWith('src/components/Comment.tsx')
  );
  assert(commentComponent, 'Comment component not found');
  assert((commentComponent.childrenIds ?? []).length >= 2, 'Expected Comment to have multiple return roots');

  const view = findBlock(
    blocks,
    b => b.type === 'element' && b.name === 'View' && b.relPath.endsWith('src/components/Comment.tsx')
  );
  assert(view, 'Expected <View> tree from main return to be parsed');

  const image = findBlock(
    blocks,
    b => b.type === 'element' && b.name === 'Image' && b.relPath.endsWith('src/components/Comment.tsx')
  );
  assert(image, 'Expected <Image> in Comment');
  assert.equal(image.props?.source?.type, 'object');
  assert.equal(image.props?.source?.value, 'LikeIcon');
});

test('updateCssPropertyInFile works even after rule changes (stale coordinates)', async t => {
  const projectRoot = createFullFixtureProject();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();
  const { blocks } = tree;

  const cardDiv = findBlock(
    blocks,
    b =>
      b.type === 'element' &&
      b.name === 'div' &&
      b.relPath.endsWith('src/components/Card.tsx') &&
      b.props?.className?.value === 'card'
  );
  assert(cardDiv);

  const usedCssBlocks = (cardDiv.uses ?? [])
    .map(id => engine.cssStyles.get(id))
    .filter(Boolean);
  const cssFromB = usedCssBlocks.find(b =>
    normalizePath(b.filePath).endsWith('/src/styles/b.css')
  );
  assert(cssFromB);

  const bCssPath = cssFromB.filePath;
  const before = fs.readFileSync(bCssPath, 'utf8');
  assert.match(before, /color:\s*green/);

  updateCssPropertyInFile(cssFromB, 'padding', '10px');
  const afterInsert = fs.readFileSync(bCssPath, 'utf8');
  assert.match(afterInsert, /padding:\s*10px;/);

  // Call again with the SAME css block (coordinates are now stale if rule grew).
  updateCssPropertyInFile(cssFromB, 'padding', '12px');
  const afterUpdate = fs.readFileSync(bCssPath, 'utf8');
  assert.match(afterUpdate, /padding:\s*12px;/);

  const engine2 = new VisualEngine(projectRoot);
  await engine2.loadProject();
  const parsedBRules = [...engine2.cssStyles.values()].filter(
    b => b.name === 'card' && normalizePath(b.filePath).endsWith('/src/styles/b.css')
  );
  assert(parsedBRules.length >= 1);

  const parsedBLastRule = [...parsedBRules].sort((a, b) => {
    const aKey = typeof a.metadata?.ruleStartIndex === 'number' ? a.metadata.ruleStartIndex : a.startLine * 1_000_000 + a.startCol;
    const bKey = typeof b.metadata?.ruleStartIndex === 'number' ? b.metadata.ruleStartIndex : b.startLine * 1_000_000 + b.startCol;
    return aKey - bKey;
  })[parsedBRules.length - 1];

  assert(parsedBLastRule);
  assert.match(parsedBLastRule.sourceCode, /padding:\s*12px;/);
});

test('updateBlockPropInFile updates JSX props by coordinates', async t => {
  const projectRoot = createFullFixtureProject();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();

  const firstCardInstance = findBlock(
    tree.blocks,
    b =>
      b.type === 'component-instance' &&
      b.name === 'Card' &&
      b.relPath.endsWith('src/App.tsx') &&
      b.props?.title?.value === 'First'
  );
  assert(firstCardInstance);

  updateBlockPropInFile(firstCardInstance, 'title', 'Updated');

  const engine2 = new VisualEngine(projectRoot);
  const tree2 = await engine2.loadProject();
  const titles = findBlocks(
    tree2.blocks,
    b => b.type === 'component-instance' && b.name === 'Card' && b.relPath.endsWith('src/App.tsx')
  )
    .map(b => b.props?.title?.value)
    .filter(Boolean)
    .sort();
  assert.deepEqual(titles, ['Second', 'Updated']);
});

test('removeFragmentFromFile removes JSX usage; Engine reflects usages', async t => {
  const projectRoot = createFullFixtureProject();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();
  const { blocks } = tree;

  const secondCardInstance = findBlock(
    blocks,
    b =>
      b.type === 'component-instance' &&
      b.name === 'Card' &&
      b.relPath.endsWith('src/App.tsx') &&
      b.props?.title?.value === 'Second'
  );
  assert(secondCardInstance);

  removeFragmentFromFile(
    secondCardInstance.filePath,
    secondCardInstance.startLine,
    secondCardInstance.startCol,
    secondCardInstance.endLine,
    secondCardInstance.endCol
  );

  const engine2 = new VisualEngine(projectRoot);
  const tree2 = await engine2.loadProject();

  const remainingCardInstances = findBlocks(
    tree2.blocks,
    b => b.type === 'component-instance' && b.name === 'Card' && b.relPath.endsWith('src/App.tsx')
  );
  assert.equal(remainingCardInstances.length, 1);
  assert.equal(remainingCardInstances[0].props?.title?.value, 'First');

  const cardComponent2 = findBlock(
    tree2.blocks,
    b => b.type === 'component' && b.name === 'Card' && b.relPath.endsWith('src/components/Card.tsx')
  );
  assert(cardComponent2);
  assert.equal(cardComponent2.usages?.length, 1);
  assert.equal(cardComponent2.usages?.[0]?.props?.title?.value, 'First');
});

test('addComponentAsChild updates blocks tree (instance + usages + imports)', async t => {
  const projectRoot = createFullFixtureProject();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();
  const blocks = tree.blocks;

  const appComponent = findBlock(
    blocks,
    b => b.type === 'component' && b.name === 'App' && b.relPath.endsWith('src/App.tsx')
  );
  assert(appComponent);

  const cardComponent = findBlock(
    blocks,
    b => b.type === 'component' && b.name === 'Card' && b.relPath.endsWith('src/components/Card.tsx')
  );
  assert(cardComponent);

  const layoutInstance = findBlock(
    blocks,
    b => b.type === 'component-instance' && b.name === 'Layout' && b.relPath.endsWith('src/App.tsx')
  );
  assert(layoutInstance);

  const beforeChildren = [...layoutInstance.childrenIds];
  const beforeUsages = cardComponent.usages?.length ?? 0;

  addComponentAsChild({
    blocks,
    parentElementId: layoutInstance.id,
    componentId: cardComponent.id,
    index: 1,
    props: { title: { type: 'string', value: 'Inserted' } },
    startLine: 999,
    startCol: 0,
    endLine: 999,
    endCol: 10,
  });

  assert.equal(layoutInstance.childrenIds.length, beforeChildren.length + 1);
  const insertedId = layoutInstance.childrenIds[1];
  assert(insertedId);
  assert(blocks[insertedId]);
  assert.equal(blocks[insertedId].type, 'component-instance');
  assert.equal(blocks[insertedId].refId, cardComponent.id);
  assert.equal(blocks[insertedId].props?.title?.value, 'Inserted');

  assert.equal(cardComponent.usages?.length, beforeUsages + 1);
  assert(appComponent.imports?.some(imp => imp.split('|')[2] === 'Card'));
});

test('removeBlockAndCleanup removes component instances and cleans imports when unused', async t => {
  const projectRoot = createFullFixtureProject();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();
  const blocks = tree.blocks;

  const appComponent = findBlock(
    blocks,
    b => b.type === 'component' && b.name === 'App' && b.relPath.endsWith('src/App.tsx')
  );
  assert(appComponent);
  assert(appComponent.imports?.some(imp => imp.split('|')[2] === 'Card'));

  const cardComponent = findBlock(
    blocks,
    b => b.type === 'component' && b.name === 'Card' && b.relPath.endsWith('src/components/Card.tsx')
  );
  assert(cardComponent);
  assert.equal(cardComponent.usages?.length, 2);

  const instances = findBlocks(
    blocks,
    b => b.type === 'component-instance' && b.name === 'Card' && b.relPath.endsWith('src/App.tsx')
  );
  assert.equal(instances.length, 2);

  // Remove one instance: import should remain (still used).
  removeBlockAndCleanup(blocks, instances[0].id);
  assert(appComponent.imports?.some(imp => imp.split('|')[2] === 'Card'));
  assert.equal(cardComponent.usages?.length, 1);

  // Remove the remaining instance: import should be removed.
  const remaining = findBlocks(
    blocks,
    b => b.type === 'component-instance' && b.name === 'Card' && b.relPath.endsWith('src/App.tsx')
  );
  assert.equal(remaining.length, 1);
  removeBlockAndCleanup(blocks, remaining[0].id);

  assert.equal(appComponent.imports?.some(imp => imp.split('|')[2] === 'Card'), false);
  assert.equal(cardComponent.usages?.length ?? 0, 0);
  assert.equal(cardComponent.usedIn?.length ?? 0, 0);
});

test('Engine loads project without tsconfig/package.json (fallback config)', async t => {
  const projectRoot = mkTempDir('visual-engine-fallback-');
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  writeFile(
    projectRoot,
    'index.html',
    `<!doctype html><html><body><div class="x">hi</div></body></html>\n`
  );
  writeFile(
    projectRoot,
    'src/App.jsx',
    `export default function App() { return <div className="x" />; }\n`
  );

  const engine = new VisualEngine(projectRoot);
  const tree = await engine.loadProject();

  const hasComponent = Object.values(tree.blocks).some(b => b.type === 'component' && b.name === 'App');
  assert.equal(hasComponent, true);
  const hasHtmlRoot = Object.values(tree.blocks).some(b => b.type === 'html-root');
  assert.equal(hasHtmlRoot, true);
});

test('Files helpers: createTsxComponent + insertTextToFile', t => {
  const root = mkTempDir('visual-engine-files-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const created = createTsxComponent(path.join(root, 'components'), 'Widget');
  assert(fs.existsSync(created.path), 'Expected file to be created');

  insertTextToFile(created.path, '<div className="x" />', created.line, created.column);
  const updated = fs.readFileSync(created.path, 'utf8');
  assert.match(updated, /<div className="x" \/>/);
});
