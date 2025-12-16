// src/engine/parsers/CssParser.ts
import * as fs from 'fs';
import { VisualBlock } from '../types';
import { generateId } from './utils';

type LineStarts = number[];

function buildLineStarts(source: string): LineStarts {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function positionAt(
  lineStarts: LineStarts,
  index: number
): { line: number; column: number } {
  const clampedIndex = Math.max(0, Math.min(index, Number.MAX_SAFE_INTEGER));

  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lineStarts[mid] <= clampedIndex) low = mid + 1;
    else high = mid - 1;
  }

  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: clampedIndex - lineStarts[lineIndex] };
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
      if (ch === inString) {
        inString = null;
      }
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

export class CssParser {
  constructor(
    private filePath: string,
    private relPath: string,
    private blocks: Map<string, VisualBlock>
  ) {}

  parse(fullPath: string): void {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lineStarts = buildLineStarts(content);
    const curlyBlocks = scanCurlyBlocks(content);

    for (const curlyBlock of curlyBlocks) {
      // At-rules like @media/@keyframes are containers; their nested rules will also be scanned.
      if (!curlyBlock.prelude || curlyBlock.prelude.startsWith('@')) continue;

      const firstNonWs = findFirstNonWhitespaceIndex(
        content,
        curlyBlock.preludeStart,
        curlyBlock.preludeEnd
      );
      if (firstNonWs === null) continue;

      // Include the trailing newline after '}' if present (so deleting a rule doesn't leave an empty line).
      let ruleEndExclusive = curlyBlock.blockEndExclusive;
      if (content[ruleEndExclusive] === '\r' && content[ruleEndExclusive + 1] === '\n') {
        ruleEndExclusive += 2;
      } else if (content[ruleEndExclusive] === '\n') {
        ruleEndExclusive += 1;
      }

      const selectorText = content.slice(firstNonWs, curlyBlock.preludeEnd).trim();
      const classRegex = /\.([_a-zA-Z][_a-zA-Z0-9-]*)/g;
      const classNames = new Set<string>();
      let classMatch: RegExpExecArray | null;
      while ((classMatch = classRegex.exec(selectorText))) {
        classNames.add(classMatch[1]);
      }

      if (classNames.size === 0) continue;

      const startPos = positionAt(lineStarts, firstNonWs);
      const endPos = positionAt(lineStarts, ruleEndExclusive);
      const ruleSource = content.slice(firstNonWs, ruleEndExclusive);

      for (const className of classNames) {
        const classId = generateId(this.relPath, 'css-class', className);

        const block: VisualBlock = {
          id: classId,
          type: 'css-class',
          name: className,
          filePath: this.filePath.replace(/\\/g, '/'),
          relPath: this.relPath.replace(/\\/g, '/'),
          sourceCode: ruleSource,
          startLine: startPos.line,
          endLine: endPos.line,
          startCol: startPos.column,
          endCol: endPos.column,
          childrenIds: [],
          uses: [],
          usedIn: [],
          metadata: {
            selector: selectorText,
            braceOpenIndex: curlyBlock.blockStart,
            braceCloseIndex: curlyBlock.blockEnd,
            ruleStartIndex: firstNonWs,
            ruleEndExclusive,
          },
        };

        this.blocks.set(classId, block);
      }
    }
  }
}
