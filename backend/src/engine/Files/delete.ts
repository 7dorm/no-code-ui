import * as path from "path";
import * as fs from 'fs';
import { VisualBlock } from "../types";


export function removeBlockFromDisk(
  block: VisualBlock
): RemovedFragment {
  return removeFragmentFromFile(
    block.filePath,
    block.startLine,
    block.startCol,
    block.endLine,
    block.endCol
  );
}

export interface RemovedFragment {
  removedCode: string;
  insertLine: number;
  insertColumn: number;
}

export function removeFragmentFromFile(
  filePath: string,
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number
): RemovedFragment {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const fileSource = fs.readFileSync(absPath, 'utf8');
  const lines = fileSource.split(/\r?\n/);

  const startLineIdx = startLine - 1;
  const endLineIdx = endLine - 1;

  // ===== 1️⃣ Извлекаем удаляемый код =====
  let removedCode: string;

  if (startLineIdx === endLineIdx) {
    removedCode = lines[startLineIdx].slice(startCol, endCol);
  } else {
    const firstLine = lines[startLineIdx].slice(startCol);
    const middleLines = lines.slice(startLineIdx + 1, endLineIdx);
    const lastLine = lines[endLineIdx].slice(0, endCol);

    removedCode = [
      firstLine,
      ...middleLines,
      lastLine
    ].join('\n');
  }

  // ===== 2️⃣ Формируем новый файл =====
  const newLines = [...lines];

  if (startLineIdx === endLineIdx) {
    newLines[startLineIdx] =
      lines[startLineIdx].slice(0, startCol) +
      lines[startLineIdx].slice(endCol);
  } else {
    const prefix = lines[startLineIdx].slice(0, startCol);
    const suffix = lines[endLineIdx].slice(endCol);

    newLines.splice(
      startLineIdx,
      endLineIdx - startLineIdx + 1,
      prefix + suffix
    );
  }

  fs.writeFileSync(absPath, newLines.join('\n'), 'utf8');

  return {
    removedCode,
    insertLine: startLine,
    insertColumn: startCol,
  };
}
