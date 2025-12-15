// src/engine/parsers/ReactParser.ts
import { SourceFile, Node, SyntaxKind } from 'ts-morph';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { VisualBlock } from '../types';
import { generateId } from './utils';

type ImportBindingKind = 'default' | 'named' | 'namespace';

type ImportBindingInfo = {
  source: string;
  kind: ImportBindingKind;
  importedName?: string;
  localName: string;
  importCode: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  isAsset: boolean;
};

const STYLE_EXTS = new Set(['.css', '.scss', '.sass', '.less']);
const SCRIPT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ASSET_EXTS = new Set([
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.avif',
  '.mp4',
  '.mp3',
  '.wav',
  '.ogg',
  '.json',
  '.txt',
]);

function stripImportQuery(spec: string): string {
  const idx = spec.search(/[?#]/);
  return idx === -1 ? spec : spec.slice(0, idx);
}

function getImportExt(spec: string): string {
  const clean = stripImportQuery(spec);
  const m = clean.match(/(\.[a-z0-9]+)$/i);
  return (m?.[1] ?? '').toLowerCase();
}

function isStyleImport(spec: string): boolean {
  const ext = getImportExt(spec);
  return STYLE_EXTS.has(ext);
}

function isScriptImport(spec: string): boolean {
  const ext = getImportExt(spec);
  return ext ? SCRIPT_EXTS.has(ext) : false;
}

export class ReactParser {
  private objectImportNames = new Set<string>();
  private importBindingsByLocalName = new Map<string, ImportBindingInfo>();

  constructor(
    private filePath: string,
    private relPath: string,
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

  // --- create "object" blocks for non-rendered imports (svg/utils/etc) ---
  this.importBindingsByLocalName.clear();
  this.objectImportNames.clear();
  const importBindings = this.collectImportBindings(ast, code);
  const componentLikeNames = this.collectComponentLikeIdentifiers(ast, importBindings);
  this.createObjectImportBlocks(importBindings, componentLikeNames);

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

private collectImportBindings(ast: any, code: string): ImportBindingInfo[] {
  const bindings: ImportBindingInfo[] = [];

  const body: any[] = ast?.program?.body ?? [];
  for (const stmt of body) {
    if (!t.isImportDeclaration(stmt)) continue;

    const source = String(stmt.source?.value ?? '');
    const importCode = code.slice(stmt.start ?? 0, stmt.end ?? 0);
    const ext = getImportExt(source);
    const isAsset = ASSET_EXTS.has(ext) && !STYLE_EXTS.has(ext) && !SCRIPT_EXTS.has(ext);

    for (const spec of stmt.specifiers ?? []) {
      let kind: ImportBindingKind;
      let importedName: string | undefined;

      if (t.isImportDefaultSpecifier(spec)) {
        kind = 'default';
      } else if (t.isImportNamespaceSpecifier(spec)) {
        kind = 'namespace';
      } else if (t.isImportSpecifier(spec)) {
        kind = 'named';
        const imported = spec.imported;
        importedName = t.isIdentifier(imported)
          ? imported.name
          : t.isStringLiteral(imported)
            ? imported.value
            : undefined;
      } else {
        continue;
      }

      const localName = spec.local?.name;
      if (!localName) continue;

      const loc = spec.loc ?? stmt.loc;
      const startLine = loc?.start.line ?? 0;
      const endLine = loc?.end.line ?? 0;
      const startCol = loc?.start.column ?? 0;
      const endCol = loc?.end.column ?? 0;

      const info: ImportBindingInfo = {
        source,
        kind,
        importedName,
        localName,
        importCode,
        startLine,
        endLine,
        startCol,
        endCol,
        isAsset,
      };

      bindings.push(info);
      this.importBindingsByLocalName.set(localName, info);
    }
  }

  return bindings;
}

private collectComponentLikeIdentifiers(
  ast: any,
  importBindings: ImportBindingInfo[]
): Set<string> {
  const componentLike = new Set<string>();
  const importByLocal = new Map<string, ImportBindingInfo>();
  for (const info of importBindings) importByLocal.set(info.localName, info);

  const jsxPropIdentifierNames = new Set<string>();

  traverse(ast, {
    JSXOpeningElement: path => {
      const rootName = this.getJsxOpeningRootIdentifierName(path.node.name);
      if (rootName) componentLike.add(rootName);
    },
    JSXAttribute: path => {
      const v = path.node.value;
      if (!v || !t.isJSXExpressionContainer(v)) return;
      const expr = v.expression;
      if (!t.isIdentifier(expr)) return;
      jsxPropIdentifierNames.add(expr.name);
    },
  });

  for (const name of jsxPropIdentifierNames) {
    const imported = importByLocal.get(name);
    const importedIsAsset = imported?.isAsset ?? false;
    if (importedIsAsset) continue;

    if (/^[A-Z]/.test(name)) {
      componentLike.add(name);
    }
  }

  return componentLike;
}

private getJsxOpeningRootIdentifierName(name: any): string | null {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    let obj: any = name.object;
    while (t.isJSXMemberExpression(obj)) obj = obj.object;
    if (t.isJSXIdentifier(obj)) return obj.name;
  }
  return null;
}

private createObjectImportBlocks(importBindings: ImportBindingInfo[], componentLikeNames: Set<string>) {
  for (const binding of importBindings) {
    if (!binding.localName) continue;
    if (componentLikeNames.has(binding.localName)) continue;

    this.objectImportNames.add(binding.localName);

    const objectId = generateId(this.relPath, 'object', binding.localName);
    const block: VisualBlock = {
      id: objectId,
      type: 'object',
      name: binding.localName,
      filePath: this.filePath.replace(/\\/g, '/'),
      relPath: this.relPath.replace(/\\/g, '/'),
      sourceCode: binding.importCode,
      startLine: binding.startLine,
      endLine: binding.endLine,
      startCol: binding.startCol,
      endCol: binding.endCol,
      childrenIds: [],
      uses: [],
      usedIn: [],
      metadata: {
        importSource: binding.source,
        importKind: binding.kind,
        importedName: binding.importedName,
        isStyle: isStyleImport(binding.source),
        isScript: isScriptImport(binding.source),
        isAsset: binding.isAsset,
      },
    };

    this.blocks.set(objectId, block);
  }
}


private parseJsxComponent(
  code: string,
  name: string,
  isDefault: boolean,
  imports: string[],
  babelNode: any
	): void {

	  const jsxRoots = this.findJsxReturnsInBabelNode(babelNode);
	  if (jsxRoots.length === 0) return;

  const componentId = generateId(this.relPath, 'component', name);

  const args = this.extractComponentArgs(babelNode);

  const componentBlock: VisualBlock = {
    id: componentId,
    type: 'component',
    name,
    astNode: babelNode,
    filePath: this.filePath.replace(/\\/g, '/'),
    relPath: this.relPath.replace(/\\/g, '/'),
    sourceCode: code.slice(babelNode.start, babelNode.end),
    startLine: babelNode.loc?.start.line || 0,
    endLine: babelNode.loc?.end.line || 0,
    startCol: babelNode.loc?.start.column || 0,
    endCol: babelNode.loc?.end.column || 0,
    childrenIds: [],
    uses: [],
    usedIn: [],
    isExported: true,
    metadata: { isDefaultExport: isDefault },
    imports: imports,
    args: args, // <--- новое поле с типами и именами
  };

	  this.blocks.set(componentId, componentBlock);
	  for (const jsxRoot of jsxRoots) {
	    this.parseJsxTree(jsxRoot, componentId);
	  }
	}

private extractComponentArgs(babelNode: any): Record<string, string> {
  const args: Record<string, string> = {};

  const params = Array.isArray(babelNode?.params) ? babelNode.params : [];
  for (const param of params) {
    this.collectArgsFromParam(param, args);
  }

  return args;
}

private collectArgsFromParam(param: any, args: Record<string, string>) {
  if (!param) return;

  if (t.isAssignmentPattern(param)) {
    this.collectArgsFromParam(param.left, args);
    return;
  }

  if (t.isIdentifier(param)) {
    args[param.name] = this.extractTypeString(param.typeAnnotation);
    return;
  }

  if (t.isRestElement(param) && t.isIdentifier(param.argument)) {
    args[`...${param.argument.name}`] = 'any';
    return;
  }

  if (t.isObjectPattern(param)) {
    const typeMap = this.extractObjectPatternTypeMap(param.typeAnnotation);
    for (const prop of param.properties) {
      if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
        args[`...${prop.argument.name}`] = 'any';
        continue;
      }
      if (!t.isObjectProperty(prop)) continue;

      const keyName = t.isIdentifier(prop.key)
        ? prop.key.name
        : t.isStringLiteral(prop.key)
          ? prop.key.value
          : null;
      if (!keyName) continue;

      let type = typeMap?.[keyName] ?? 'any';
      if (t.isIdentifier(prop.value) && (prop.value as any).typeAnnotation) {
        type = this.extractTypeString((prop.value as any).typeAnnotation);
      }

      args[keyName] = type;
    }
  }
}

private extractObjectPatternTypeMap(typeAnnotation: any): Record<string, string> | null {
  const inner = this.unwrapTsTypeAnnotation(typeAnnotation);
  if (!inner || inner.type !== 'TSTypeLiteral') return null;

  const result: Record<string, string> = {};
  for (const member of inner.members) {
    if (member.type !== 'TSPropertySignature') continue;

    const key = member.key;
    const keyName =
      key.type === 'Identifier'
        ? key.name
        : key.type === 'StringLiteral'
          ? key.value
          : null;
    if (!keyName) continue;

    result[keyName] = this.extractTypeString(member.typeAnnotation);
  }
  return result;
}

// Помощник для извлечения строки типа из typeAnnotation
private extractTypeString(typeAnnotation: any): string {
  const typeNode = this.unwrapTsTypeAnnotation(typeAnnotation);
  if (!typeNode) return 'any';

  switch (typeNode.type) {
    case 'TSStringKeyword': return 'string';
    case 'TSNumberKeyword': return 'number';
    case 'TSBooleanKeyword': return 'boolean';
    case 'TSAnyKeyword': return 'any';
    case 'TSUnknownKeyword': return 'unknown';
    case 'TSNeverKeyword': return 'never';
    case 'TSVoidKeyword': return 'void';
    case 'TSLiteralType': {
      const lit = typeNode.literal;
      if (t.isStringLiteral(lit)) return JSON.stringify(lit.value);
      if (t.isNumericLiteral(lit)) return String(lit.value);
      if (t.isBooleanLiteral(lit)) return String(lit.value);
      return 'any';
    }
    case 'TSArrayType':
      return `${this.extractTypeString(typeNode.elementType)}[]`;
    case 'TSUnionType':
      return typeNode.types.map(tn => this.extractTypeString(tn)).join(' | ') || 'any';
    case 'TSParenthesizedType':
      return `(${this.extractTypeString(typeNode.typeAnnotation)})`;
    case 'TSTypeReference':
      return this.tsTypeNameToString(typeNode.typeName) || 'any';
    case 'TSTypeLiteral':
      return 'object';
    default:
      return 'any';
  }
}

private unwrapTsTypeAnnotation(typeAnnotation: any): any | null {
  if (!typeAnnotation) return null;
  if (typeAnnotation.type === 'TSTypeAnnotation') return typeAnnotation.typeAnnotation ?? null;
  return typeAnnotation;
}

private tsTypeNameToString(typeName: any): string {
  if (!typeName) return '';
  if (typeName.type === 'Identifier') return typeName.name;
  if (typeName.type === 'TSQualifiedName') {
    return `${this.tsTypeNameToString(typeName.left)}.${this.tsTypeNameToString(typeName.right)}`;
  }
  return '';
}


	private findJsxReturnsInBabelNode(
	  node: any
	): Array<t.JSXElement | t.JSXFragment> {
	  if (!node) return [];

	  // Стрелочные функции с implicit return
	  if (t.isArrowFunctionExpression(node) && (t.isJSXElement(node.body) || t.isJSXFragment(node.body))) {
	    return [node.body];
	  }

	  // Обычные функции
	  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
	    if (t.isBlockStatement(node.body)) {
	      return this.findJsxReturnsInStatements(node.body.body).map(r => r.jsx);
	    }
	  }

	  // Метод render() класса
	  if (t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === 'render') {
	    return this.findJsxReturnsInStatements(node.body.body).map(r => r.jsx);
	  }

	  return [];
	}

	private findJsxReturnsInStatements(
	  statements: any[]
	): Array<{ start: number; jsx: t.JSXElement | t.JSXFragment }> {
	  const found: Array<{ start: number; jsx: t.JSXElement | t.JSXFragment }> = [];

	  const visitStatement = (stmt: any) => {
	    if (!stmt) return;

	    if (t.isReturnStatement(stmt)) {
	      const arg = stmt.argument;
	      if (arg && (t.isJSXElement(arg) || t.isJSXFragment(arg))) {
	        const start =
	          typeof stmt.start === 'number'
	            ? stmt.start
	            : typeof arg.start === 'number'
	              ? arg.start
	              : 0;
	        found.push({ start, jsx: arg });
	      }
	      return;
	    }

	    if (t.isBlockStatement(stmt)) {
	      for (const s of stmt.body) visitStatement(s);
	      return;
	    }

	    if (t.isIfStatement(stmt)) {
	      visitStatement(stmt.consequent);
	      if (stmt.alternate) visitStatement(stmt.alternate);
	      return;
	    }

	    if (t.isTryStatement(stmt)) {
	      visitStatement(stmt.block);
	      if (stmt.handler) visitStatement(stmt.handler.body);
	      if (stmt.finalizer) visitStatement(stmt.finalizer);
	      return;
	    }

	    if (t.isSwitchStatement(stmt)) {
	      for (const c of stmt.cases) {
	        for (const s of c.consequent) visitStatement(s);
	      }
	      return;
	    }

	    if (
	      t.isForStatement(stmt) ||
	      t.isForInStatement(stmt) ||
	      t.isForOfStatement(stmt) ||
	      t.isWhileStatement(stmt) ||
	      t.isDoWhileStatement(stmt)
	    ) {
	      visitStatement(stmt.body);
	      return;
	    }
	  };

	  for (const stmt of statements) visitStatement(stmt);
	  return found.sort((a, b) => a.start - b.start);
	}


	private isReactComponentBabel(node: t.Node): boolean {
	  if (!node) return false;

	  // стрелочные функции с JSX
	  if (t.isArrowFunctionExpression(node)) {
	    if (t.isJSXElement(node.body) || t.isJSXFragment(node.body)) return true;
	    if (t.isBlockStatement(node.body)) {
	      return this.findJsxReturnsInStatements(node.body.body).length > 0;
	    }
	  }

	  // обычные функции
	  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) {
	    if (t.isBlockStatement(node.body)) {
	      return this.findJsxReturnsInStatements(node.body.body).length > 0;
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

    const elementId = generateId(this.relPath, 'element', tagName);

    const block: VisualBlock = {
      id: elementId,
      type: 'element',
      astNode: node,
      name: tagName,
      filePath: this.filePath.replace(/\\/g, '/'),
      relPath: this.relPath.replace(/\\/g, '/'),
      sourceCode: this.nodeToString(node),
      startLine: node.loc?.start.line || 0,
      endLine: node.loc?.end.line || 0,
      startCol:node.loc?.start.column || 0,
      endCol: node.loc?.end.column || 0,
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
        const textId = generateId(this.relPath, 'text');
        const textBlock: VisualBlock = {
          id: textId,
          type: 'element',
          name: '#text',
          astNode: child,
          filePath: this.filePath.replace(/\\/g, '/'),
          relPath: this.relPath.replace(/\\/g, '/'),
          sourceCode: child.value,
          startLine: child.loc?.start.line || 0,
          endLine: child.loc?.end.line || 0,
          startCol:child.loc?.start.column || 0,
          endCol: child.loc?.end.column || 0,
          parentId: elementId,
          childrenIds: [],
          uses: [],
          usedIn: [],
        };
        this.blocks.set(textId, textBlock);
        block.childrenIds.push(textId);
      } else if (t.isJSXExpressionContainer(child)) {
        if (t.isIdentifier(child.expression)) {
          const varId = generateId(this.relPath, 'variable', child.expression.name);
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
        if (t.isNumericLiteral(expr)) {
          props[name] = { type: 'number', value: String(expr.value) };
          return;
        }
        if (t.isBooleanLiteral(expr)) {
          props[name] = { type: 'boolean', value: String(expr.value) };
          return;
        }
	        if (t.isStringLiteral(expr)) {
	          props[name] = { type: 'string', value: expr.value };
	          return;
	        }
	        if (t.isIdentifier(expr)) {
	          if (this.objectImportNames.has(expr.name)) {
	            props[name] = { type: 'object', value: expr.name };
	            return;
	          }
	          if (/^[A-Z]/.test(expr.name)) {
	            props[name] = { type: 'component', value: expr.name };
	            return;
	          }
	          props[name] = { type: 'expression', value: expr.name };
	          return;
	        }

        let exprCode = '<expression>';
        try {
          exprCode = generate(expr as any, { jsescOption: { minimal: true } }).code;
        } catch {}
        props[name] = { type: 'expression', value: exprCode };
      } else {
        props[name] = { type: 'boolean', value: 'true' };
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
