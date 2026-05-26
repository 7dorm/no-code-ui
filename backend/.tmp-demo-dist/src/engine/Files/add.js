"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertTextToFile = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function insertTextToFile(filePath, text, line, column) {
    const absPath = path_1.default.resolve(filePath);
    if (!fs_1.default.existsSync(absPath)) {
        throw new Error(`File not found: ${absPath}`);
    }
    const fileSource = fs_1.default.readFileSync(absPath, 'utf8');
    const lines = fileSource.split(/\r?\n/);
    const lineIdx = line - 1;
    if (lineIdx < 0 || lineIdx > lines.length) {
        throw new Error(`Invalid line number: ${line}`);
    }
    if (lineIdx === lines.length) {
        // вставка в новую последнюю строку
        lines.push(' '.repeat(column) + text);
    }
    else {
        const originalLine = lines[lineIdx];
        lines[lineIdx] =
            originalLine.slice(0, column) +
                text +
                originalLine.slice(column);
    }
    fs_1.default.writeFileSync(absPath, lines.join('\n'), 'utf8');
    return {
        insertLine: line,
        insertColumn: column,
    };
}
exports.insertTextToFile = insertTextToFile;
