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

function findFirstNonWhitespaceIndex(
  source: string,
  start: number,
  end: number
): number | null {
  for (let i = start; i < end; i++) {
    const ch = source[i];
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return i;
  }
  return null;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type CurlyBlock = {
  prelude: string;
  preludeStart: number;
  preludeEnd: number;
  blockStart: number;
  blockEnd: number;
  blockEndExclusive: number;
};

function scanCurlyBlocks(source: string): CurlyBlock[] {
  const blocks: CurlyBlock[] = [];
  const segmentStartByDepth: number[] = [0];
  const stack: Array<{
    prelude: string;
    preludeStart: number;
    preludeEnd: number;
    blockStart: number;
  }> = [];

  let depth = 0;
  let inBlockComment = false;
  let inString: "'" | '"' | null = null;
  let stringEscape = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (stringEscape) {
        stringEscape = false;
        continue;
      }
      if (ch === '\\') {
        stringEscape = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === '{') {
      const preludeStart = segmentStartByDepth[depth] ?? 0;
      const preludeEnd = i;
      const prelude = source.slice(preludeStart, preludeEnd).trim();

      stack.push({ prelude, preludeStart, preludeEnd, blockStart: i });
      depth++;
      segmentStartByDepth[depth] = i + 1;
      continue;
    }

    if (ch === '}') {
      if (depth === 0) continue;

      depth--;
      const open = stack.pop();
      if (open) {
        blocks.push({
          prelude: open.prelude,
          preludeStart: open.preludeStart,
          preludeEnd: open.preludeEnd,
          blockStart: open.blockStart,
          blockEnd: i,
          blockEndExclusive: i + 1,
        });
      }
      segmentStartByDepth[depth] = i + 1;
      continue;
    }

    if (ch === ';') {
      segmentStartByDepth[depth] = i + 1;
      continue;
    }
  }

  return blocks;
}

function findMatchingClosingBrace(source: string, openBraceIndex: number): number | null {
  let depth = 0;
  let inBlockComment = false;
  let inString: "'" | '"' | null = null;
  let stringEscape = false;

  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (stringEscape) {
        stringEscape = false;
        continue;
      }
      if (ch === '\\') {
        stringEscape = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
      continue;
    }
  }

  return null;
}

function resolveCssRuleRange(
  source: string,
  cssBlock: VisualBlock
): { startIndex: number; endIndex: number } {
  const className = cssBlock.name;

  const lineStarts = buildLineStarts(source);

  const candidates = new Set<number>();
  const metaStart = cssBlock.metadata?.ruleStartIndex;
  if (typeof metaStart === 'number' && Number.isFinite(metaStart)) {
    candidates.add(metaStart);
  }
  try {
    candidates.add(indexFromLineCol(lineStarts, cssBlock.startLine, cssBlock.startCol));
  } catch {}

  const classInPrelude = new RegExp(`\\.${escapeRegExp(className)}(?![_a-zA-Z0-9-])`);

  for (const start of candidates) {
    if (start < 0 || start >= source.length) continue;

    const openBrace = source.indexOf('{', start);
    if (openBrace === -1) continue;

    const firstNonWs = findFirstNonWhitespaceIndex(source, start, openBrace);
    if (firstNonWs === null) continue;

    const prelude = source.slice(firstNonWs, openBrace).trim();
    if (!prelude || prelude.startsWith('@')) continue;
    if (!classInPrelude.test(prelude)) continue;

    const closeBrace = findMatchingClosingBrace(source, openBrace);
    if (closeBrace === null) continue;

    let endIndex = closeBrace + 1;
    if (source[endIndex] === '\r' && source[endIndex + 1] === '\n') endIndex += 2;
    else if (source[endIndex] === '\n') endIndex += 1;

    return { startIndex: firstNonWs, endIndex };
  }

  // Fallback: re-scan file and pick the last rule that contains this class.
  const classRegex = /\.([_a-zA-Z][_a-zA-Z0-9-]*)/g;
  const blocks = scanCurlyBlocks(source);
  let best: { startIndex: number; endIndex: number; sortKey: number } | null = null;

  for (const curlyBlock of blocks) {
    if (!curlyBlock.prelude || curlyBlock.prelude.startsWith('@')) continue;

    const firstNonWs = findFirstNonWhitespaceIndex(
      source,
      curlyBlock.preludeStart,
      curlyBlock.preludeEnd
    );
    if (firstNonWs === null) continue;

    const selectorText = source.slice(firstNonWs, curlyBlock.preludeEnd).trim();
    const classNames = new Set<string>();
    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRegex.exec(selectorText))) classNames.add(classMatch[1]);
    if (!classNames.has(className)) continue;

    let ruleEndExclusive = curlyBlock.blockEndExclusive;
    if (source[ruleEndExclusive] === '\r' && source[ruleEndExclusive + 1] === '\n') {
      ruleEndExclusive += 2;
    } else if (source[ruleEndExclusive] === '\n') {
      ruleEndExclusive += 1;
    }

    const candidate = { startIndex: firstNonWs, endIndex: ruleEndExclusive, sortKey: firstNonWs };
    if (!best || candidate.sortKey > best.sortKey) best = candidate;
  }

  if (best) return { startIndex: best.startIndex, endIndex: best.endIndex };

  throw new Error(`Unable to locate CSS rule range for block ${cssBlock.id}`);
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

  const { startIndex, endIndex } = resolveCssRuleRange(source, cssBlock);

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
