import { AstBidirectionalManager } from './src/blockEditor/AstBidirectional.ts';
async function run() {
  const code = `function App() { return <div style={{ color: 'red' }}>Hello</div>; }`;
  const m = new AstBidirectionalManager('App.jsx', '/');
  await m.initializeFromCode(code);
  const patch = { color: 'blue' };
  // Find ID from codeAST
  let id = null;
  const traverse = require('@babel/traverse').default;
  traverse(m.codeAST, {
    JSXOpeningElement(path) {
      if (!id) {
        id = m.extractIdFromNode(path.node);
      }
    }
  });
  console.log("Found ID:", id);
  const res = m.updateCodeAST(id, { type: 'style', patch });
  console.log("Update result:", res);
  const gen = m.generateCodeFromCodeAST();
  console.log("Generated code:", gen.code);
}
run();
