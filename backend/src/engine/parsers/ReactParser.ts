// src/engine/parsers/ReactParser.ts
import { SourceFile, Node, SyntaxKind } from 'ts-morph';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { VisualBlock } from '../types';
import { generateId } from './utils';

export class ReactParser {
  constructor(
    private filePath: string,
    private blocks: Map<string, VisualBlock>
  ) {}

  parse(sourceFile: SourceFile): void {
  const ext = this.filePath.split('.').pop()?.toLowerCase();

  let plugins: any[] = ['jsx'];
  if (ext === 'ts' || ext === 'tsx') {
    plugins.push(
      'typescript',
      'classProperties',
      'decorators-legacy',
      'optionalChaining',
      'nullishCoalescingOperator'
    );
  }

  const code = sourceFile.getFullText();
  const imports = this.collectImports(sourceFile);

  // Парсим через Babel
  const ast = parse(code, { sourceType: 'module', plugins });
  traverse(ast, {
  ExportDefaultDeclaration: path => {
    const decl = path.node.declaration;

    // Пропускаем, если уже обработан
    if ((decl as any).__parsed) return;

    const name = (decl as any).id?.name || 'DefaultExport';
    this.parseJsxComponent(code, name, true, imports, decl);

    // Помечаем как обработанный
    (decl as any).__parsed = true;
  },

  FunctionDeclaration: path => {
    const node = path.node;

    // Пропускаем, если уже обработан как export default
    if ((node as any).__parsed) return;

    if (this.isReactComponentBabel(node)) {
      const name = node.id?.name || '<anonymous>';
      this.parseJsxComponent(code, name, false, imports, node);
      (node as any).__parsed = true;
    }
  },

  VariableDeclaration: path => {
    path.node.declarations.forEach(decl => {
      const fn = decl.init;
      if (
        t.isArrowFunctionExpression(fn) ||
        t.isFunctionExpression(fn)
      ) {
        // Пропускаем, если уже обработан
        if ((fn as any).__parsed) return;

        if (this.isReactComponentBabel(fn)) {
          const name = (decl.id as any)?.name || '<anonymous>';
          this.parseJsxComponent(code, name, false, imports, fn);
          (fn as any).__parsed = true;
        }
      }
    });
  },

  ClassDeclaration: path => {
    const node = path.node;

    // Ищем метод render
    const renderMethod = node.body.body.find(
      (m): m is t.ClassMethod =>
        t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'render'
    );

    if (renderMethod) {
      // Пропускаем, если метод уже обработан
      if ((renderMethod as any).__parsed) return;

      const name = node.id?.name || 'DefaultClass';
      this.parseJsxComponent(code, name, false, imports, renderMethod);
      (renderMethod as any).__parsed = true;
    }
  }
});

}


  private parseJsxComponent(
    code: string,
    name: string,
    isDefault: boolean,
    imports: string[],
    babelNode: any
  ): void {
  
        
  const jsxRoot = this.findJsxInBabelNode(babelNode);
  if (!jsxRoot) return;
  const componentId = generateId(this.filePath, 'component', name);
    
  const componentBlock: VisualBlock = {
    id: componentId,
    type: 'component',
    name,
    astNode: babelNode,
    filePath: this.filePath.replace(/\\/g, '/'),
    sourceCode: code.slice(babelNode.start, babelNode.end),
    startLine: babelNode.loc?.start.line || 0,
    endLine: babelNode.loc?.end.line || 0,
    childrenIds: [],
    uses: [],
    usedIn: [],
    isExported: true,
    props: {},                       // можно сделать extractComponentPropsBabel
    metadata: { isDefaultExport: isDefault },
    imports: imports,
  };

  this.blocks.set(componentId, componentBlock);
  this.parseJsxTree(jsxRoot, componentId);
}

private findJsxInBabelNode(node: any): t.JSXElement | t.JSXFragment | null {
  if (!node) return null;

  // Стрелочные функции с implicit return
  if (t.isArrowFunctionExpression(node) && (t.isJSXElement(node.body) || t.isJSXFragment(node.body))) {
    return node.body;
  }

  // Обычные функции
  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
    if (t.isBlockStatement(node.body)) {
      for (const stmt of node.body.body) {
        if (t.isReturnStatement(stmt) && stmt.argument &&
            (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))) {
          return stmt.argument;
        }
      }
    }
  }

  // Метод render() класса
  if (t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === 'render') {
    for (const stmt of node.body.body) {
      if (t.isReturnStatement(stmt) && stmt.argument &&
          (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))) {
        return stmt.argument;
      }
    }
  }

  return null;
}


private isReactComponentBabel(node: t.Node): boolean {
  if (!node) return false;

  // стрелочные функции с JSX
  if (t.isArrowFunctionExpression(node)) {
    if (t.isJSXElement(node.body) || t.isJSXFragment(node.body)) return true;
    if (t.isBlockStatement(node.body)) {
      for (const stmt of node.body.body) {
        if (t.isReturnStatement(stmt) && stmt.argument &&
            (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))) {
          return true;
        }
      }
    }
  }

  // обычные функции
  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
    if (t.isBlockStatement(node.body)) {
      for (const stmt of node.body.body) {
        if (t.isReturnStatement(stmt) && stmt.argument &&
            (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))) {
          return true;
        }
      }
    }
  }

  // классы
  if (t.isClassDeclaration(node)) {
    const renderMethod = node.body.body.find(
      m => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'render'
    );
    return !!renderMethod;
  }

  return false;
}

  



  private parseJsxTree(node: t.JSXElement | t.JSXFragment, parentId: string): void {

    const opening = 'openingElement' in node ? node.openingElement : null;
    const tagName = opening
      ? t.isJSXIdentifier(opening.name)
        ? opening.name.name
        : t.isJSXMemberExpression(opening.name)
        ? 'MemberExpr'
        : 'Fragment'
      : 'Fragment';

    const elementId = generateId(this.filePath, 'element', tagName);

    const block: VisualBlock = {
      id: elementId,
      type: 'element',
      astNode: node,
      name: tagName,
      filePath: this.filePath.replace(/\\/g, '/'),
      sourceCode: this.nodeToString(node),
      startLine: node.loc?.start.line || 0,
      endLine: node.loc?.end.line || 0,
      parentId,
      childrenIds: [],
      props: this.extractJsxProps(opening?.attributes || []),
      uses: [],
      usedIn: [],
      metadata: { isFragment: tagName === 'Fragment' },
    };

    (node as any).__visualBlockId = elementId; // и ID в узел

    this.blocks.set(elementId, block);
    this.blocks.get(parentId)!.childrenIds.push(elementId);

    // Обходим детей
    node.children.forEach(child => {
      if (t.isJSXElement(child) || t.isJSXFragment(child)) {
        this.parseJsxTree(child, elementId);
      } else if (t.isJSXText(child) && child.value.trim()) {
        const textId = generateId(this.filePath, 'text');
        const textBlock: VisualBlock = {
          id: textId,
          type: 'element',
          name: '#text',
          astNode: child,
          filePath: this.filePath.replace(/\\/g, '/'),
          sourceCode: child.value,
          startLine: child.loc?.start.line || 0,
          endLine: child.loc?.end.line || 0,
          parentId: elementId,
          childrenIds: [],
          uses: [],
          usedIn: [],
        };
        this.blocks.set(textId, textBlock);
        block.childrenIds.push(textId);
      } else if (t.isJSXExpressionContainer(child)) {
        if (t.isIdentifier(child.expression)) {
          const varId = generateId(this.filePath, 'variable', child.expression.name);
          block.uses.push(varId);
          // Можно создать блок переменной позже
        }
      }
    });
  }

private extractJsxProps(attrs: any[]): Record<string, any> {
  const props: Record<string, any> = {};
  attrs.forEach(attr => {
    if (t.isJSXAttribute(attr)) {
      const name = attr.name.name as string;

      if (t.isStringLiteral(attr.value)) {
        props[name] = { type: 'string', value: attr.value.value };
      } else if (t.isJSXExpressionContainer(attr.value)) {
        const expr = attr.value.expression;
        if (t.isIdentifier(expr)) {
          // Вот здесь сохраняем реальный идентификатор
          props[name] = { type: 'component', value: expr.name };
        } else if (t.isMemberExpression(expr)) {
          // например Some.Component
          props[name] = { type: 'component', value: this.memberExprToString(expr) };
        } else {
          props[name] = { type: 'expression', value: '<complex_expression>' };
        }
      } else {
        props[name] = { type: 'string', value: 'true' };
      }
    }
  });
  return props;
}

private memberExprToString(expr: t.MemberExpression): string {
  const parts: string[] = [];
  let e: any = expr;
  while (t.isMemberExpression(e)) {
    if (t.isIdentifier(e.property)) parts.unshift(e.property.name);
    e = e.object;
  }
  if (t.isIdentifier(e)) parts.unshift(e.name);
  return parts.join('.');
}




  private nodeToString(node: any): string {
    if (node.getSourceFile) return node.getFullText();
    if (node.start !== undefined && node.end !== undefined) {
      return node.getSourceFile?.()?.getFullText().slice(node.start, node.end) || '';
    }
    return '';
  }

private collectImports(sourceFile: SourceFile): string[] {
  const result: string[] = [];

  for (const imp of sourceFile.getImportDeclarations()) {
    const modulePath = imp.getModuleSpecifierValue();

    // default
    const def = imp.getDefaultImport();
    if (def) {
      result.push(`${modulePath}|default|${def.getText()}`);
    }

    // namespace: import * as X
    const ns = imp.getNamespaceImport();
    if (ns) {
      result.push(`${modulePath}|namespace|${ns.getText()}`);
    }

    // named imports
    for (const named of imp.getNamedImports()) {
      const orig = named.getName();
      const alias = named.getAliasNode()?.getText() || orig;

      result.push(`${modulePath}|named|${alias}`);
    }

    // --- добавляем пустые импорты (например CSS) ---
    if (!def && !ns && imp.getNamedImports().length === 0) {
      result.push(`${modulePath}|none|`); // просто помечаем как "none"
    }
  }

  return result;
}

}