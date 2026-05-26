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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBlockPropInFile = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const generator_1 = __importDefault(require("@babel/generator"));
const t = __importStar(require("@babel/types"));
function updateBlockPropInFile(block, propName, newValue) {
    const filePath = path_1.default.resolve(block.filePath);
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const source = fs_1.default.readFileSync(filePath, 'utf8');
    const ast = (0, parser_1.parse)(source, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
    });
    let updated = false;
    (0, traverse_1.default)(ast, {
        JSXOpeningElement(path) {
            const node = path.node;
            // 🔒 Жёсткая привязка по координатам
            if (!node.loc ||
                node.loc.start.line !== block.startLine ||
                node.loc.start.column !== block.startCol) {
                return;
            }
            // Ищем атрибут
            let attr = node.attributes.find(a => t.isJSXAttribute(a) &&
                t.isJSXIdentifier(a.name) &&
                a.name.name === propName);
            const newAttrValue = createJsxValue(newValue);
            if (attr) {
                // Обновляем существующий
                attr.value = newAttrValue;
            }
            else {
                // Добавляем новый
                node.attributes.push(t.jsxAttribute(t.jsxIdentifier(propName), newAttrValue));
            }
            updated = true;
            path.stop();
        },
    });
    if (!updated) {
        throw new Error(`JSX element for block ${block.id} not found in file`);
    }
    const output = (0, generator_1.default)(ast, {
        retainLines: true,
        jsescOption: { minimal: true },
    }).code;
    fs_1.default.writeFileSync(filePath, output, 'utf8');
}
exports.updateBlockPropInFile = updateBlockPropInFile;
function createJsxValue(value) {
    // {expression}
    if (value.startsWith('{') &&
        value.endsWith('}')) {
        const expr = value.slice(1, -1);
        return t.jsxExpressionContainer(parseExpression(expr));
    }
    // число
    if (!isNaN(Number(value))) {
        return t.jsxExpressionContainer(t.numericLiteral(Number(value)));
    }
    // boolean
    if (value === 'true' || value === 'false') {
        return t.jsxExpressionContainer(t.booleanLiteral(value === 'true'));
    }
    // строка
    return t.stringLiteral(value);
}
const parser_2 = require("@babel/parser");
function parseExpression(expr) {
    return (0, parser_2.parseExpression)(expr, {
        plugins: ['typescript', 'jsx'],
    });
}
