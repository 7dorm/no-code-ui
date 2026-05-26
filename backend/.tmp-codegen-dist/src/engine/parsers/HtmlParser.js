"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HtmlParser = void 0;
// src/engine/parsers/HtmlParser.ts
const node_html_parser_1 = require("node-html-parser");
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
class HtmlParser {
    constructor(filePath, relPath, blocks) {
        this.filePath = filePath;
        this.relPath = relPath;
        this.blocks = blocks;
    }
    parse(fullPath) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const root = (0, node_html_parser_1.parse)(content);
        const lines = content.split('\n');
        const lastLine = lines[lines.length - 1] ?? '';
        const rootId = (0, utils_1.generateId)(this.relPath, 'html-root');
        const rootBlock = {
            id: rootId,
            type: 'html-root',
            name: 'HTML Document',
            filePath: this.filePath.replace(/\\/g, '/'),
            relPath: this.relPath.replace(/\\/g, '/'),
            sourceCode: content,
            startLine: 1,
            endLine: lines.length,
            startCol: 0,
            endCol: lastLine.length,
            childrenIds: [],
            uses: [],
            usedIn: [],
        };
        this.blocks.set(rootId, rootBlock);
        this.parseNode(root, rootId);
    }
    parseNode(node, parentId) {
        if (!node.childNodes)
            return;
        node.childNodes.forEach((child, index) => {
            if (child.tagName) {
                const tagName = child.tagName.toLowerCase();
                const elementId = (0, utils_1.generateId)(this.relPath, 'html-element', `${tagName}-${index}`);
                const block = {
                    id: elementId,
                    type: 'html-element',
                    name: tagName,
                    filePath: this.filePath.replace(/\\/g, '/'),
                    relPath: this.relPath.replace(/\\/g, '/'),
                    sourceCode: child.outerHTML,
                    startLine: child.range?.[0]?.line || 0,
                    endLine: child.range?.[1]?.line || 0,
                    startCol: child.range?.[0]?.column || 0,
                    endCol: child.range?.[1]?.column || 0,
                    parentId,
                    childrenIds: [],
                    props: this.extractHtmlProps(child.attributes),
                    uses: [],
                    usedIn: [],
                };
                this.blocks.set(elementId, block);
                this.blocks.get(parentId).childrenIds.push(elementId);
                this.parseNode(child, elementId);
            }
        });
    }
    extractHtmlProps(attrs) {
        const props = {};
        for (const [key, value] of Object.entries(attrs)) {
            if (key === 'class') {
                props.className = { type: 'string', value };
            }
            else {
                props[key] = { type: 'string', value };
            }
        }
        return props;
    }
}
exports.HtmlParser = HtmlParser;
