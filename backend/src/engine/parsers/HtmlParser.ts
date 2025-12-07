// src/engine/parsers/HtmlParser.ts
import { parse } from 'node-html-parser';
import * as fs from 'fs';
import * as path from 'path';
import { VisualBlock } from '../types';
import { generateId } from './utils';

export class HtmlParser {
  constructor(
    private filePath: string,
    private blocks: Map<string, VisualBlock>
  ) {}

  parse(fullPath: string): void {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const root = parse(content);

    const rootId = generateId(this.filePath, 'html-root');
    const rootBlock: VisualBlock = {
      id: rootId,
      type: 'html-root',
      name: 'HTML Document',
      filePath: this.filePath.replace(/\\/g, '/'),
      sourceCode: content,
      startLine: 1,
      endLine: content.split('\n').length,
      childrenIds: [],
      uses: [],
      usedIn: [],
    };

    this.blocks.set(rootId, rootBlock);
    this.parseNode(root, rootId);
  }

  private parseNode(node: any, parentId: string): void {
    if (!node.childNodes) return;

    node.childNodes.forEach((child: any, index: number) => {
      if (child.tagName) {
        const tagName = child.tagName.toLowerCase();
        const elementId = generateId(this.filePath, 'html-element', `${tagName}-${index}`);

        const block: VisualBlock = {
          id: elementId,
          type: 'html-element',
          name: tagName,
          filePath: this.filePath.replace(/\\/g, '/'),
          sourceCode: child.outerHTML,
          startLine: child.range?.[0]?.line || 0,
          endLine: child.range?.[1]?.line || 0,
          parentId,
          childrenIds: [],
          props: this.extractHtmlProps(child.attributes),
          uses: [],
          usedIn: [],
        };

        this.blocks.set(elementId, block);
        this.blocks.get(parentId)!.childrenIds.push(elementId);

        this.parseNode(child, elementId);
      }
    });
  }

  private extractHtmlProps(attrs: Record<string, string>): Record<string, any> {
    const props: Record<string, any> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') {
        props.className = { type: 'string', value };
      } else {
        props[key] = { type: 'string', value };
      }
    }
    return props;
  }
}