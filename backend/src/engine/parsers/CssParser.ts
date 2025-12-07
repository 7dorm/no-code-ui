// src/engine/parsers/CssParser.ts
import * as fs from 'fs';
import { VisualBlock } from '../types';
import { generateId } from './utils';

export class CssParser {
  constructor(
    private filePath: string,
    private blocks: Map<string, VisualBlock>
  ) {}

  parse(fullPath: string): void {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const classRegex = /\.([a-zA-Z_\-\d][\w\-\d]*)/g;
    let match;

    while ((match = classRegex.exec(content))) {
      const className = match[1];
      const classId = generateId(this.filePath, 'css-class', className);

      const block: VisualBlock = {
        id: classId,
        type: 'css-class',
        name: className,
        filePath: this.filePath.replace(/\\/g, '/'),
        sourceCode: match[0],
        startLine: 0,
        endLine: 0,
        childrenIds: [],
        uses: [],
        usedIn: [],
        metadata: { rule: content },
      };

      this.blocks.set(classId, block);
    }
  }
}