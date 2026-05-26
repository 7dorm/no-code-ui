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
exports.removeFragmentFromFile = exports.removeBlockFromDisk = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function removeBlockFromDisk(block) {
    return removeFragmentFromFile(block.filePath, block.startLine, block.startCol, block.endLine, block.endCol);
}
exports.removeBlockFromDisk = removeBlockFromDisk;
function removeFragmentFromFile(filePath, startLine, startCol, endLine, endCol) {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
        throw new Error(`File not found: ${absPath}`);
    }
    const fileSource = fs.readFileSync(absPath, 'utf8');
    const lines = fileSource.split(/\r?\n/);
    const startLineIdx = startLine - 1;
    const endLineIdx = endLine - 1;
    // ===== 1️⃣ Извлекаем удаляемый код =====
    let removedCode;
    if (startLineIdx === endLineIdx) {
        removedCode = lines[startLineIdx].slice(startCol, endCol);
    }
    else {
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
    }
    else {
        const prefix = lines[startLineIdx].slice(0, startCol);
        const suffix = lines[endLineIdx].slice(endCol);
        newLines.splice(startLineIdx, endLineIdx - startLineIdx + 1, prefix + suffix);
    }
    fs.writeFileSync(absPath, newLines.join('\n'), 'utf8');
    return {
        removedCode,
        insertLine: startLine,
        insertColumn: startCol,
    };
}
exports.removeFragmentFromFile = removeFragmentFromFile;
