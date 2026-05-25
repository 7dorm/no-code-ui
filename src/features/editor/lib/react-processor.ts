import { parse } from '@babel/parser';
import generate from '@babel/generator';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { instrumentJsx } from '../../../blockEditor/JsxInstrumenter';

type ExtractedImport = {
  path: string;
  fullStatement: string;
  line: number;
};

export type DetectedComponent = {
  name: string;
  type: string;
  priority: number;
  exportType?: 'default' | 'named' | 'none';
  hasProps?: boolean;
  propsCount?: number;
  supportsStyleOnlyArg?: boolean;
  isAnonymous?: boolean;
  isInferred?: boolean;
};

type NamedExportInfo = {
  localName: string;
  exportedName: string;
};

type DefaultExportInfo = {
  name: string;
  type: string;
};

type LocalComponentImport = {
  localName: string;
  sourcePath: string;
};

const DEFAULT_EXPORT_COMPONENT_NAME = 'MrpakDefaultExportComponent';
const JS_KEYWORDS = new Set([
  'function',
  'class',
  'const',
  'let',
  'var',
  'if',
  'else',
  'for',
  'while',
  'return',
]);

function parseModule(code: string) {
  return parse(String(code ?? ''), {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'classProperties',
      'decorators-legacy',
      'optionalChaining',
      'nullishCoalescingOperator',
    ],
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    errorRecovery: true,
  });
}

function isPascalCase(name: string | null | undefined) {
  return Boolean(name && /^[A-Z]/.test(name) && !JS_KEYWORDS.has(name));
}

function unwrapNode(node: t.Node | null | undefined): t.Node | null {
  let current = node ?? null;

  while (current) {
    if (t.isTSAsExpression(current) || t.isTSSatisfiesExpression(current) || t.isTSTypeAssertion(current)) {
      current = current.expression;
      continue;
    }

    if (t.isTSNonNullExpression(current)) {
      current = current.expression;
      continue;
    }

    if (t.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }

    break;
  }

  return current;
}

function declarationToExpression(
  declaration: t.ExportDefaultDeclaration['declaration']
): t.Expression | null {
  const unwrapped = unwrapNode(declaration);

  if (!unwrapped) {
    return null;
  }

  if (t.isFunctionDeclaration(unwrapped)) {
    return t.functionExpression(
      unwrapped.id,
      unwrapped.params,
      unwrapped.body,
      unwrapped.generator,
      unwrapped.async
    );
  }

  if (t.isClassDeclaration(unwrapped)) {
    return t.classExpression(
      unwrapped.id,
      unwrapped.superClass,
      unwrapped.body,
      unwrapped.decorators || []
    );
  }

  if (t.isExpression(unwrapped)) {
    return unwrapped;
  }

  return null;
}

function collectProgramBindings(ast: t.File) {
  const bindings = new Set<string>();

  traverse(ast, {
    Program(path) {
      Object.keys(path.scope.bindings).forEach((name) => bindings.add(name));
      path.stop();
    },
  });

  return bindings;
}

function createUniqueIdentifier(usedNames: Set<string>, baseName = DEFAULT_EXPORT_COMPONENT_NAME) {
  let candidate = baseName;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}${index}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function collectRuntimeNamesFromDeclaration(declaration: t.Declaration) {
  const names: string[] = [];

  if (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) {
    if (declaration.id?.name) {
      names.push(declaration.id.name);
    }
    return names;
  }

  if (t.isVariableDeclaration(declaration)) {
    declaration.declarations.forEach((item) => {
      if (t.isIdentifier(item.id)) {
        names.push(item.id.name);
      }
    });
  }

  return names;
}

function hasRenderableReturn(fn: t.FunctionExpression | t.ArrowFunctionExpression | t.FunctionDeclaration) {
  if (t.isArrowFunctionExpression(fn) && !t.isBlockStatement(fn.body)) {
    const body = unwrapNode(fn.body);
    return Boolean(
      body &&
      (t.isJSXElement(body) ||
        t.isJSXFragment(body) ||
        isReactCreateElementCall(body) ||
        (t.isCallExpression(body) && isComponentFactoryCall(body)))
    );
  }

  let found = false;

  traverse(
    t.file(t.program([t.expressionStatement(t.functionExpression(null, fn.params, fn.body as t.BlockStatement, fn.generator, fn.async))])),
    {
      ReturnStatement(path) {
        const argument = unwrapNode(path.node.argument);
        if (
          argument &&
          (t.isJSXElement(argument) ||
            t.isJSXFragment(argument) ||
            isReactCreateElementCall(argument) ||
            (t.isCallExpression(argument) && isComponentFactoryCall(argument)))
        ) {
          found = true;
          path.stop();
        }
      },
    }
  );

  return found;
}

function isReactCreateElementCall(node: t.Node | null | undefined) {
  return Boolean(
    node &&
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.object, { name: 'React' }) &&
    t.isIdentifier(node.callee.property, { name: 'createElement' })
  );
}

function isClassComponent(node: t.Node | null | undefined) {
  const unwrapped = unwrapNode(node);
  if (!unwrapped || (!t.isClassDeclaration(unwrapped) && !t.isClassExpression(unwrapped))) {
    return false;
  }

  const superClass = unwrapNode(unwrapped.superClass);
  if (
    superClass &&
    ((t.isIdentifier(superClass) &&
      (superClass.name === 'Component' || superClass.name === 'PureComponent')) ||
      (t.isMemberExpression(superClass) &&
        t.isIdentifier(superClass.object, { name: 'React' }) &&
        t.isIdentifier(superClass.property) &&
        (superClass.property.name === 'Component' || superClass.property.name === 'PureComponent')))
  ) {
    return true;
  }

  return unwrapped.body.body.some(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key, { name: 'render' })
  );
}

function isComponentFactoryCall(node: t.CallExpression) {
  const callee = unwrapNode(node.callee);
  const calleeName =
    (t.isIdentifier(callee) && callee.name) ||
    (t.isMemberExpression(callee) && t.isIdentifier(callee.property) ? callee.property.name : null);

  const supportedFactories = new Set(['memo', 'forwardRef', 'observer', 'styled']);
  if (!calleeName || !supportedFactories.has(calleeName)) {
    return false;
  }

  return node.arguments.some((argument) => isComponentLikeNode(argument));
}

function isComponentLikeNode(node: t.Node | null | undefined): boolean {
  const unwrapped = unwrapNode(node);

  if (!unwrapped) {
    return false;
  }

  if (t.isIdentifier(unwrapped)) {
    return isPascalCase(unwrapped.name);
  }

  if (t.isFunctionExpression(unwrapped) || t.isArrowFunctionExpression(unwrapped) || t.isFunctionDeclaration(unwrapped)) {
    return hasRenderableReturn(unwrapped);
  }

  if (t.isClassExpression(unwrapped) || t.isClassDeclaration(unwrapped)) {
    return isClassComponent(unwrapped);
  }

  if (t.isCallExpression(unwrapped)) {
    return isComponentFactoryCall(unwrapped);
  }

  return false;
}

function isCoreReactImport(importPath: string): boolean {
  return /^(react|react-dom|react-native)(\/|$)/.test(String(importPath || '').trim());
}

function fallbackExtractImports(code: string, sourceFile = 'unknown') {
  const imports: ExtractedImport[] = [];
  const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"];?/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    if (
      isCoreReactImport(importPath) ||
      importPath.startsWith('node_modules') ||
      importPath.startsWith('http://') ||
      importPath.startsWith('https://')
    ) {
      continue;
    }

    imports.push({
      path: importPath,
      fullStatement: match[0],
      line: code.substring(0, match.index).split('\n').length,
    });
  }

  if (imports.length > 0) {
    console.log(
      `[Import Extraction] Total imports found in ${sourceFile}:`,
      imports.length,
      imports.map((item) => `${item.path} (line ${item.line})`)
    );
  }

  return imports;
}

export function extractImports(code: string, sourceFile = 'unknown'): ExtractedImport[] {
  const normalizedSourceFile = String(sourceFile || '').toLowerCase();
  if (/\.(css|scss|less)($|\?)/i.test(normalizedSourceFile)) {
    return [];
  }
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)($|\?)/i.test(normalizedSourceFile)) {
    return [];
  }

  try {
    const ast = parseModule(code);
    const imports: ExtractedImport[] = [];

    ast.program.body.forEach((statement) => {
      if (!t.isImportDeclaration(statement) || typeof statement.source.value !== 'string') {
        return;
      }

      const importPath = statement.source.value;
      const isTypeOnly =
        statement.importKind === 'type' ||
        (statement.specifiers.length > 0 &&
          statement.specifiers.every((specifier) => {
            if (t.isImportSpecifier(specifier)) {
              return specifier.importKind === 'type';
            }
            return false;
          }));

      if (
        isTypeOnly ||
        isCoreReactImport(importPath) ||
        importPath.startsWith('node_modules') ||
        importPath.startsWith('http://') ||
        importPath.startsWith('https://')
      ) {
        return;
      }

      imports.push({
        path: importPath,
        fullStatement: String(code ?? '').slice(statement.start ?? 0, statement.end ?? 0),
        line: statement.loc?.start.line || 1,
      });
    });

    if (imports.length > 0) {
      console.log(
        `[Import Extraction] Total imports found in ${sourceFile}:`,
        imports.length,
        imports.map((item) => `${item.path} (line ${item.line})`)
      );
    }

    return imports;
  } catch (error) {
    console.warn(`[Import Extraction] AST parsing failed in ${sourceFile}, falling back:`, error);
    return fallbackExtractImports(code, sourceFile);
  }
}

export function normalizeReactModuleCode(code: string): {
  code: string;
  defaultExportInfo: DefaultExportInfo | null;
  namedExports: NamedExportInfo[];
} {
  try {
    const ast = parseModule(code);
    const usedNames = collectProgramBindings(ast);
    const namedExports: NamedExportInfo[] = [];
    let defaultExportInfo: DefaultExportInfo | null = null;
    const nextBody: t.Statement[] = [];

    ast.program.body.forEach((statement) => {
      if (t.isExportDefaultDeclaration(statement)) {
        const declaration = unwrapNode(statement.declaration);

        if (
          (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) &&
          declaration.id?.name
        ) {
          defaultExportInfo = {
            name: declaration.id.name,
            type: t.isFunctionDeclaration(declaration)
              ? 'default-export-function'
              : 'default-export-class',
          };
          nextBody.push(declaration);
          return;
        }

        if (t.isIdentifier(declaration)) {
          defaultExportInfo = {
            name: declaration.name,
            type: 'default-export',
          };
          return;
        }

        const expression = declarationToExpression(statement.declaration);
        if (!expression) {
          return;
        }

        const defaultName = createUniqueIdentifier(usedNames);
        nextBody.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(defaultName), expression),
          ])
        );
        defaultExportInfo = {
          name: defaultName,
          type: 'default-export-expression',
        };
        return;
      }

      if (t.isExportNamedDeclaration(statement)) {
        if (statement.declaration) {
          const runtimeNames = collectRuntimeNamesFromDeclaration(statement.declaration);
          runtimeNames.forEach((name) => {
            namedExports.push({ localName: name, exportedName: name });
          });
          nextBody.push(statement.declaration);
          return;
        }

        if (!statement.source) {
          statement.specifiers.forEach((specifier) => {
            if (t.isExportSpecifier(specifier)) {
              const localName =
                t.isIdentifier(specifier.local) ? specifier.local.name : null;
              const exportedName =
                t.isIdentifier(specifier.exported)
                  ? specifier.exported.name
                  : t.isStringLiteral(specifier.exported)
                    ? specifier.exported.value
                    : null;

              if (localName && exportedName) {
                namedExports.push({ localName, exportedName });
              }
            }
          });
        }

        return;
      }

      if (t.isExportAllDeclaration(statement)) {
        return;
      }

      nextBody.push(statement);
    });

    ast.program.body = nextBody;

    return {
      code: generate(ast, {
        retainLines: false,
        compact: false,
        concise: false,
        comments: true,
      }).code,
      defaultExportInfo,
      namedExports,
    };
  } catch (error) {
    console.warn('[normalizeReactModuleCode] AST normalization failed, using fallback:', error);

    const defaultExportMatch = String(code ?? '').match(/export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    return {
      code: String(code ?? '').replace(/export\s+default\s+/g, ''),
      defaultExportInfo: defaultExportMatch
        ? { name: defaultExportMatch[1], type: 'default-export' }
        : null,
      namedExports: [],
    };
  }
}

function getMrpakIdAttributeValue(openingElement: t.JSXOpeningElement) {
  for (const attr of openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    if (attr.name.name !== 'data-no-code-ui-id') continue;
    if (t.isStringLiteral(attr.value)) {
      return t.stringLiteral(attr.value.value);
    }
    if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
      return t.cloneNode(attr.value.expression, true);
    }
  }
  return null;
}

function collectLocalComponentImports(ast: t.File) {
  const imports = new Map<string, LocalComponentImport>();

  ast.program.body.forEach((statement) => {
    if (!t.isImportDeclaration(statement) || typeof statement.source.value !== 'string') {
      return;
    }

    const importPath = statement.source.value;
    const isTypeOnly =
      statement.importKind === 'type' ||
      statement.specifiers.every((specifier) => t.isImportSpecifier(specifier) && specifier.importKind === 'type');

    if (
      isTypeOnly ||
      isCoreReactImport(importPath) ||
      importPath.startsWith('node_modules') ||
      importPath.startsWith('http://') ||
      importPath.startsWith('https://')
    ) {
      return;
    }

    statement.specifiers.forEach((specifier) => {
      const localName = t.isIdentifier(specifier.local) ? specifier.local.name : null;
      if (!isPascalCase(localName)) return;
      imports.set(localName!, {
        localName: localName!,
        sourcePath: importPath,
      });
    });
  });

  return imports;
}

export function wrapImportedComponentUsages(code: string): {
  code: string;
  wrappedCount: number;
} {
  try {
    const ast = parseModule(code);
    const componentImports = collectLocalComponentImports(ast);
    if (componentImports.size === 0) {
      return { code, wrappedCount: 0 };
    }

    let wrappedCount = 0;

    traverse(ast, {
      JSXElement(path) {
        const openingElement = path.node.openingElement;
        if (!t.isJSXIdentifier(openingElement.name)) return;

        const componentName = openingElement.name.name;
        if (componentName === 'MrpakImportedBoundary') return;
        const importMeta = componentImports.get(componentName);
        if (!importMeta) return;

        const mrpakIdExpr = getMrpakIdAttributeValue(openingElement);
        if (!mrpakIdExpr) return;

        const forwardedAttributes = openingElement.attributes.filter((attr) => {
          return !(
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name) &&
            attr.name.name === 'data-no-code-ui-id'
          );
        }).map((attr) => t.cloneNode(attr, true));

        const boundaryElement = t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier('MrpakImportedBoundary'),
            [
              t.jsxAttribute(
                t.jsxIdentifier('__mrpakComponent'),
                t.jsxExpressionContainer(t.identifier(componentName))
              ),
              t.jsxAttribute(t.jsxIdentifier('__mrpakName'), t.stringLiteral(componentName)),
              t.jsxAttribute(t.jsxIdentifier('__mrpakSource'), t.stringLiteral(importMeta.sourcePath)),
              t.jsxAttribute(
                t.jsxIdentifier('__mrpakId'),
                t.jsxExpressionContainer(mrpakIdExpr)
              ),
              ...forwardedAttributes,
            ],
            false
          ),
          t.jsxClosingElement(t.jsxIdentifier('MrpakImportedBoundary')),
          path.node.children.map((child) => t.cloneNode(child, true)),
          false
        );

        path.replaceWith(boundaryElement);
        wrappedCount += 1;
      },
    });

    return {
      code: generate(ast, {
        retainLines: false,
        compact: false,
        concise: false,
        comments: true,
      }).code,
      wrappedCount,
    };
  } catch (error) {
    console.warn('[wrapImportedComponentUsages] AST transform failed, skipping:', error);
    return { code, wrappedCount: 0 };
  }
}

export function detectComponents(code: string): DetectedComponent[] {
  const components: DetectedComponent[] = [];
  const seen = new Set<string>();
  let priority = 0;
  const defaultExportNames = new Set<string>();
  const namedExportNames = new Set<string>();

  const getPropsCountForComponentNode = (node: t.Node | null | undefined): number => {
    const unwrapped = unwrapNode(node);
    if (!unwrapped) return 0;

    if (t.isFunctionDeclaration(unwrapped) || t.isFunctionExpression(unwrapped) || t.isArrowFunctionExpression(unwrapped)) {
      return unwrapped.params.length;
    }

    if (t.isClassDeclaration(unwrapped) || t.isClassExpression(unwrapped)) {
      const constructorMethod = unwrapped.body.body.find(
        (member) => t.isClassMethod(member) && member.kind === 'constructor'
      ) as t.ClassMethod | undefined;
      return constructorMethod?.params?.length || 0;
    }

    if (t.isCallExpression(unwrapped)) {
      const firstArg = unwrapped.arguments[0];
      if (t.isFunctionExpression(firstArg) || t.isArrowFunctionExpression(firstArg)) {
        return firstArg.params.length;
      }
    }

    return 0;
  };

  const getComponentFunctionNode = (
    node: t.Node | null | undefined
  ): t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression | null => {
    const unwrapped = unwrapNode(node);
    if (!unwrapped) return null;
    if (t.isFunctionDeclaration(unwrapped) || t.isFunctionExpression(unwrapped) || t.isArrowFunctionExpression(unwrapped)) {
      return unwrapped;
    }
    if (t.isCallExpression(unwrapped)) {
      const firstArg = unwrapNode(unwrapped.arguments[0] as any);
      if (t.isFunctionExpression(firstArg) || t.isArrowFunctionExpression(firstArg)) {
        return firstArg;
      }
    }
    return null;
  };

  const supportsStyleOnlyArgForNode = (node: t.Node | null | undefined): boolean => {
    const unwrapped = unwrapNode(node);
    if (!unwrapped) return true;

    if (t.isClassDeclaration(unwrapped) || t.isClassExpression(unwrapped)) {
      const constructorMethod = unwrapped.body.body.find(
        (member) => t.isClassMethod(member) && member.kind === 'constructor'
      ) as t.ClassMethod | undefined;
      const params = constructorMethod?.params || [];
      return params.length === 0;
    }

    const fn = getComponentFunctionNode(unwrapped);
    if (!fn) return false;
    if (fn.params.length === 0) return true;
    if (fn.params.length > 1) return false;

    let firstParam: t.Node | null = unwrapNode(fn.params[0] as any);
    if (t.isAssignmentPattern(firstParam)) {
      firstParam = unwrapNode(firstParam.left);
    }
    if (!firstParam) return false;

    if (!t.isObjectPattern(firstParam)) {
      return false;
    }

    for (const prop of firstParam.properties) {
      if (t.isRestElement(prop)) {
        return false;
      }
      if (!t.isObjectProperty(prop)) {
        return false;
      }
      const keyNode = prop.computed ? null : prop.key;
      const keyName = t.isIdentifier(keyNode) ? keyNode.name : t.isStringLiteral(keyNode) ? keyNode.value : '';
      if (keyName !== 'style') {
        return false;
      }
    }
    return true;
  };

  const addComponent = (name: string | null | undefined, type: string, extra: Partial<DetectedComponent> = {}) => {
    if (!name || !isPascalCase(name) || seen.has(name)) {
      return;
    }

    const explicitExportType = extra.exportType;
    const exportType =
      explicitExportType ||
      (defaultExportNames.has(name) ? 'default' : namedExportNames.has(name) ? 'named' : 'none');

    seen.add(name);
    components.push({
      name,
      type,
      priority: priority++,
      exportType,
      ...extra,
    });
  };

  try {
    const ast = parseModule(code);

    ast.program.body.forEach((statement) => {
      if (t.isExportDefaultDeclaration(statement)) {
        const declaration = unwrapNode(statement.declaration);
        if ((t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) && declaration.id?.name) {
          defaultExportNames.add(declaration.id.name);
        } else if (t.isIdentifier(declaration)) {
          defaultExportNames.add(declaration.name);
        }
        return;
      }

      if (!t.isExportNamedDeclaration(statement)) return;

      if (statement.declaration) {
        if ((t.isFunctionDeclaration(statement.declaration) || t.isClassDeclaration(statement.declaration)) && statement.declaration.id?.name) {
          namedExportNames.add(statement.declaration.id.name);
          return;
        }
        if (t.isVariableDeclaration(statement.declaration)) {
          statement.declaration.declarations.forEach((declaration) => {
            if (t.isIdentifier(declaration.id)) {
              namedExportNames.add(declaration.id.name);
            }
          });
        }
        return;
      }

      if (!statement.source) {
        statement.specifiers.forEach((specifier) => {
          if (!t.isExportSpecifier(specifier)) return;
          if (t.isIdentifier(specifier.local)) {
            namedExportNames.add(specifier.local.name);
          }
        });
      }
    });

    const inspectTopLevelStatement = (statement: t.Statement | t.Declaration) => {
      if (t.isFunctionDeclaration(statement) && isPascalCase(statement.id?.name) && hasRenderableReturn(statement)) {
        const propsCount = getPropsCountForComponentNode(statement);
        addComponent(statement.id?.name, 'function-component', {
          hasProps: propsCount > 0,
          propsCount,
          supportsStyleOnlyArg: supportsStyleOnlyArgForNode(statement),
        });
        return;
      }

      if (t.isClassDeclaration(statement) && isPascalCase(statement.id?.name) && isClassComponent(statement)) {
        const propsCount = getPropsCountForComponentNode(statement);
        addComponent(statement.id?.name, 'class-component', {
          hasProps: propsCount > 0,
          propsCount,
          supportsStyleOnlyArg: supportsStyleOnlyArgForNode(statement),
        });
        return;
      }

      if (t.isVariableDeclaration(statement)) {
        statement.declarations.forEach((declaration) => {
          if (t.isIdentifier(declaration.id) && isPascalCase(declaration.id.name) && isComponentLikeNode(declaration.init)) {
            const propsCount = getPropsCountForComponentNode(declaration.init);
            addComponent(declaration.id.name, 'variable-component', {
              hasProps: propsCount > 0,
              propsCount,
              supportsStyleOnlyArg: supportsStyleOnlyArgForNode(declaration.init),
            });
          }
        });
      }
    };

    ast.program.body.forEach((statement) => {
      if (t.isExportDefaultDeclaration(statement)) {
        const declaration = statement.declaration;
        if (
          (t.isFunctionDeclaration(declaration) && isPascalCase(declaration.id?.name) && hasRenderableReturn(declaration)) ||
          (t.isClassDeclaration(declaration) && isPascalCase(declaration.id?.name) && isClassComponent(declaration))
        ) {
          inspectTopLevelStatement(declaration);
        }
        return;
      }

      if (t.isExportNamedDeclaration(statement) && statement.declaration) {
        inspectTopLevelStatement(statement.declaration);
        return;
      }

      inspectTopLevelStatement(statement);
    });

    return components;
  } catch (error) {
    console.warn('[detectComponents] AST analysis failed, returning empty list:', error);
    return components;
  }
}

/**
 * Создает HTML обертку для React файлов
 * Эта функция должна быть вызвана с зависимостями из path-resolver и других модулей
 */
export function createReactHTMLTemplate({
  processedCode,
  modulesCode,
  componentToRender,
  componentName,
  detectedComponents,
  basePath
}: {
  processedCode: string;
  modulesCode?: string;
  componentToRender?: string;
  componentName?: string;
  detectedComponents?: any[];
  basePath?: string;
}) {
  const inst = instrumentJsx(processedCode, basePath);
  const instrumentedCode = inst.code;
  console.log("HEREEEE");
  
  return {
    html: `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
    </script>
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
        }
        #root {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px 0;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>React Component Preview</strong><br>
        Компонент загружается из выбранного файла...
    </div>
    <div id="root"></div>
    <script type="text/babel" data-type="module" data-presets="react,typescript">
        // React доступен глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        
        // Инициализируем window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация
        console.log('Available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          console.log('Module:', path, window.__modules__[path]);
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = (cur.tagName || 'div').toLowerCase();
              const parent = cur.parentElement;
              if (!parent) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const used = new Set();
          const walk = (node) => {
            if (!node || node.nodeType !== 1) return;
            const existing = node.getAttribute('data-no-code-ui-id') || node.getAttribute('data-mrpak-id');
            const selector = makeSelectorForElement(node);
            const tagName = (node.tagName || 'div').toLowerCase();
            let id = existing || \`mrpak:\${safeBasename(filePath)}:\${tagName}:\${selector}\`;
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            node.setAttribute('data-no-code-ui-id', id);
            node.removeAttribute('data-mrpak-id');
            Array.from(node.children || []).forEach(walk);
          };
          
          walk(rootElement);
        }
        
        ${instrumentedCode}
    </script>
</body>
</html>
`,
  };
}
