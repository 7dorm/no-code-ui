import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { VisualBlock } from '../types';

export function updateBlockPropInFile(
  block: VisualBlock,
  propName: string,
  newValue: string
): void


export function updateBlockPropInFile(
  block: VisualBlock,
  propName: string,
  newValue: string
): void {
  const filePath = path.resolve(block.filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const source = fs.readFileSync(filePath, 'utf8');

  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  let updated = false;

  traverse(ast, {
    JSXOpeningElement(path) {
      const node = path.node;

      // 🔒 Жёсткая привязка по координатам
      if (
        !node.loc ||
        node.loc.start.line !== block.startLine ||
        node.loc.start.column !== block.startCol
      ) {
        return;
      }

      // Ищем атрибут
      let attr = node.attributes.find(
        a =>
          t.isJSXAttribute(a) &&
          t.isJSXIdentifier(a.name) &&
          a.name.name === propName
      ) as t.JSXAttribute | undefined;

      const newAttrValue = createJsxValue(newValue);

      if (attr) {
        // Обновляем существующий
        attr.value = newAttrValue;
      } else {
        // Добавляем новый
        node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier(propName),
            newAttrValue
          )
        );
      }

      updated = true;
      path.stop();
    },
  });

  if (!updated) {
    throw new Error(
      `JSX element for block ${block.id} not found in file`
    );
  }

  const output = generate(ast, {
    retainLines: true,
    jsescOption: { minimal: true },
  }).code;

  fs.writeFileSync(filePath, output, 'utf8');
}

function createJsxValue(value: string): t.JSXAttribute['value'] {
  // {expression}
  if (
    value.startsWith('{') &&
    value.endsWith('}')
  ) {
    const expr = value.slice(1, -1);
    return t.jsxExpressionContainer(
      parseExpression(expr)
    );
  }

  // число
  if (!isNaN(Number(value))) {
    return t.jsxExpressionContainer(
      t.numericLiteral(Number(value))
    );
  }

  // boolean
  if (value === 'true' || value === 'false') {
    return t.jsxExpressionContainer(
      t.booleanLiteral(value === 'true')
    );
  }

  // строка
  return t.stringLiteral(value);
}

import { parseExpression as babelParseExpression } from '@babel/parser';

function parseExpression(expr: string): t.Expression {
  return babelParseExpression(expr, {
    plugins: ['typescript', 'jsx'],
  });
}