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
    const imports = this.collectImports(sourceFile);

    sourceFile.getExportedDeclarations().forEach((decls) => {
      decls.forEach(decl => {
        if (Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl)) {
          const name = decl.getName() || '<anonymous>';
          const isDefault =
            sourceFile.getDefaultExportSymbol()?.getDeclarations().includes(decl) ?? false;

          if (this.isReactComponent(decl)) {
            this.parseComponent(decl, name, isDefault, imports);
          }
        }
      });
    });
  }


  private isReactComponent(node: Node): boolean {
    const code = node.getFullText();
    return (
      /return\s*\(?\s*</.test(code) ||           // возвращает JSX
      /use[A-Z]/.test(code) ||                   // использует хуки
      /[A-Z][a-zA-Z]*\(.*\)\s*{/.test(code)      // функциональный компонент с заглавной буквы
    );
  }

  private parseComponent(node: Node, name: string, isDefault: boolean, imports: string[]): void {
    const jsxRoot = this.extractJsxRoot(node);
    if (!jsxRoot) return;

    const componentId = generateId(this.filePath, 'component', name);

    const componentBlock: VisualBlock = {
      id: componentId,
      type: 'component',
      name,
      astNode: node,
      filePath: this.filePath.replace(/\\/g, '/'),
      sourceCode: node.getFullText(),
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      childrenIds: [],
      uses: [],
      usedIn: [],
      isExported: true,
      props: this.extractComponentProps(node),
      metadata: { isDefaultExport: isDefault },
      imports: imports,
    };

    this.blocks.set(componentId, componentBlock);
    this.parseJsxTree(jsxRoot, componentId);
  }

  private extractJsxRoot(node: Node): t.JSXElement | t.JSXFragment | null {
  try {
    const code = node.getFullText();

    // Если первая строка — экспорт с ошибкой типа "export { default } = ...", пропускаем
    if (/^\s*export\s*\{[^}]*\}\s*=/.test(code)) {
      console.warn(`Пропущен файл с некорректным экспортом: ${this.filePath}`);
      return null;
    }

    const ast = parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
        'decorators-legacy',
      ],
      errorRecovery: true, // ← ВАЖНО: не падать, а продолжать
    });

    let result: t.JSXElement | t.JSXFragment | null = null;

    traverse(ast, {
      ReturnStatement(path) {
        const arg = path.node.argument;
        if (arg && (t.isJSXElement(arg) || t.isJSXFragment(arg))) {
          result = arg;
          path.stop();
        }
      },
    });

    return result;
  } catch (error: any) {
    console.warn(`Babel не смог распарсить ${this.filePath}: ${error.message}`);
    return null;
  }
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
          props[name] = { type: 'expression', value: '{' + (attr.value.expression as any)?.getText?.() || '...' + '}' };
        } else {
          props[name] = { type: 'string', value: 'true' };
        }
      }
    });
    return props;
  }

  private extractComponentProps(node: Node): Record<string, any> {
    // Простое извлечение параметров функции
    const props: Record<string, any> = {};
    if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node)) {
      const param = node.getParameters()[0];
      if (param) {
        const type = param.getType().getText();
        // Можно распарсить интерфейс, но пока заглушка
        props['props'] = { type: 'object', value: type };
      }
    }
    return props;
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