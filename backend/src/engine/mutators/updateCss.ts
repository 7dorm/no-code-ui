import fs from 'fs';
import path from 'path';
import { VisualBlock } from '../types';

type LineStarts = number[];

function buildLineStarts(source: string): LineStarts {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function indexFromLineCol(
  lineStarts: LineStarts,
  line: number,
  column: number
): number {
  const lineIndex = line - 1;
  if (lineIndex < 0 || lineIndex >= lineStarts.length) {
    throw new Error(`Invalid line ${line}`);
  }
  return lineStarts[lineIndex] + column;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type UpdateCssPropertyAction = 'updated' | 'inserted';

export type UpdateCssPropertyResult = {
  action: UpdateCssPropertyAction;
  cssBlockId: string;
  className: string;
  filePath: string;
  property: string;
  value: string;
};

export function updateCssClassPropertyInFile(
  cssBlocks: Record<string, VisualBlock>,
  cssBlockId: string,
  property: string,
  value: string
): UpdateCssPropertyResult {
  const cssBlock = cssBlocks[cssBlockId];
  if (!cssBlock) {
    throw new Error(`CSS block ${cssBlockId} not found`);
  }
  return updateCssPropertyInFile(cssBlock, property, value);
}

export function updateCssPropertyInFile(
  cssBlock: VisualBlock,
  property: string,
  value: string
): UpdateCssPropertyResult {
  if (cssBlock.type !== 'css-class') {
    throw new Error(`Block ${cssBlock.id} is not a css-class`);
  }

  const absPath = path.resolve(cssBlock.filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const source = fs.readFileSync(absPath, 'utf8');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';

  const lineStarts = buildLineStarts(source);
  const startIndex = indexFromLineCol(lineStarts, cssBlock.startLine, cssBlock.startCol);
  const endIndex = indexFromLineCol(lineStarts, cssBlock.endLine, cssBlock.endCol);

  if (startIndex < 0 || startIndex >= source.length) {
    throw new Error(`Invalid start position for css block ${cssBlock.id}`);
  }
  if (endIndex <= startIndex || endIndex > source.length) {
    throw new Error(`Invalid end position for css block ${cssBlock.id}`);
  }

  const ruleText = source.slice(startIndex, endIndex);
  const openBraceIndex = ruleText.indexOf('{');
  const closeBraceIndex = ruleText.lastIndexOf('}');
  if (openBraceIndex === -1 || closeBraceIndex === -1 || closeBraceIndex <= openBraceIndex) {
    throw new Error(`CSS rule text not found for block ${cssBlock.id}`);
  }

  const beforeBody = ruleText.slice(0, openBraceIndex + 1);
  const body = ruleText.slice(openBraceIndex + 1, closeBraceIndex);
  const afterBody = ruleText.slice(closeBraceIndex);

  const propRegex = new RegExp(
    // start of line (or after newline) + optional indent + "prop:" + value + optional ";"
    `(^|\\r?\\n)([\\t ]*)${escapeRegExp(property)}\\s*:\\s*([^;\\r\\n}]*)\\s*;?`,
    'm'
  );

  if (propRegex.test(body)) {
    const updatedBody = body.replace(propRegex, (_m, lineStart, indent) => {
      const prefix = typeof lineStart === 'string' ? lineStart : '';
      const ws = typeof indent === 'string' ? indent : '';
      return `${prefix}${ws}${property}: ${value};`;
    });

    const nextRuleText = beforeBody + updatedBody + afterBody;
    const nextSource = source.slice(0, startIndex) + nextRuleText + source.slice(endIndex);
    fs.writeFileSync(absPath, nextSource, 'utf8');

    return {
      action: 'updated',
      cssBlockId: cssBlock.id,
      className: cssBlock.name,
      filePath: absPath,
      property,
      value,
    };
  }

  const bodyHasNewlines = /\r?\n/.test(body);

  let nextRuleText: string;
  if (!bodyHasNewlines) {
    // Single-line rule: `.a{color:red}` -> `.a{color:red; padding: 1px;}`
    const trimmed = body.trim();
    const needsSemicolon = trimmed.length > 0 && !trimmed.endsWith(';');
    const separator = trimmed.length > 0 ? (needsSemicolon ? '; ' : ' ') : ' ';
    const nextBody = trimmed + separator + `${property}: ${value};` + (trimmed.length > 0 ? '' : ' ');
    nextRuleText = beforeBody + nextBody + afterBody;
  } else {
    // Multi-line: insert before the closing-brace line.
    const closeLineStart = ruleText.lastIndexOf('\n', closeBraceIndex);
    const closeLineStartIndex = closeLineStart === -1 ? 0 : closeLineStart + 1;
    const closeIndent = ruleText
      .slice(closeLineStartIndex, closeBraceIndex)
      .replace(/\r/g, '');

    const indentMatch = body.match(/\r?\n([ \t]+)\S/);
    const declIndent = indentMatch?.[1] ?? `${closeIndent}  `;

    const insertion = `${declIndent}${property}: ${value};${eol}`;
    nextRuleText =
      ruleText.slice(0, closeLineStartIndex) +
      insertion +
      ruleText.slice(closeLineStartIndex);
  }

  const nextSource = source.slice(0, startIndex) + nextRuleText + source.slice(endIndex);
  fs.writeFileSync(absPath, nextSource, 'utf8');

  return {
    action: 'inserted',
    cssBlockId: cssBlock.id,
    className: cssBlock.name,
    filePath: absPath,
    property,
    value,
  };
}

