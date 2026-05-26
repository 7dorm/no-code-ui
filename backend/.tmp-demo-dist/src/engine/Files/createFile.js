"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTsxComponent = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function createTsxComponent(folderPath, componentName) {
    const absFolder = path_1.default.resolve(folderPath);
    if (!fs_1.default.existsSync(absFolder)) {
        fs_1.default.mkdirSync(absFolder, { recursive: true });
    }
    const fileName = `${componentName}.tsx`;
    const filePath = path_1.default.join(absFolder, fileName);
    const template = `import React from 'react';

type Props = {
};

export default function ${componentName}({ title }: Props) {
  return (
    <></>
  );
}
`;
    fs_1.default.writeFileSync(filePath, template, 'utf8');
    return {
        path: filePath,
        line: 8,
        column: 7,
    };
}
exports.createTsxComponent = createTsxComponent;
