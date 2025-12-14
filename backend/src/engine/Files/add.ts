export interface InsertPosition {
  insertLine: number;
  insertColumn: number;
}

import fs from 'fs';
import path from 'path';

export function insertTextToFile(
  filePath: string,
  text: string,
  line: number,
  column: number
): InsertPosition {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const fileSource = fs.readFileSync(absPath, 'utf8');
  const lines = fileSource.split(/\r?\n/);

  const lineIdx = line - 1;

  if (lineIdx < 0 || lineIdx > lines.length) {
    throw new Error(`Invalid line number: ${line}`);
  }

  if (lineIdx === lines.length) {
    // вставка в новую последнюю строку
    lines.push(' '.repeat(column) + text);
  } else {
    const originalLine = lines[lineIdx];
    lines[lineIdx] =
      originalLine.slice(0, column) +
      text +
      originalLine.slice(column);
  }

  console.log(lines[lineIdx])
  fs.writeFileSync(absPath, lines.join('\n'), 'utf8');

  return {
    insertLine: line,
    insertColumn: column,
  };
}
