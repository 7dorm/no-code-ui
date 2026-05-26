"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addComponentAsChild = void 0;
const utils_1 = require("../parsers/utils");
const path_1 = __importDefault(require("path"));
function findParentComponent(blocks, startId) {
    let current = blocks[startId];
    while (current) {
        if (current.type === 'component')
            return current;
        if (!current.parentId)
            return null;
        current = blocks[current.parentId];
    }
    return null;
}
function hasImport(component, localName) {
    return (component.imports?.some(imp => {
        const [, , name] = imp.split('|');
        return name === localName;
    }) ?? false);
}
function addComponentAsChild({ blocks, cssBlocks, parentElementId, componentId, index, props, startLine, startCol, endLine, endCol, }) {
    const parentElement = blocks[parentElementId];
    const component = blocks[componentId];
    if (!parentElement) {
        throw new Error(`Parent element ${parentElementId} not found`);
    }
    if (!component || component.type !== 'component') {
        throw new Error(`Block ${componentId} is not a component`);
    }
    // 1️⃣ Создаём блок-использование компоненты (instance)
    const instanceId = (0, utils_1.generateId)(parentElement.relPath, 'component-instance', component.name);
    const instanceBlock = {
        id: instanceId,
        type: 'component-instance',
        name: component.name,
        filePath: parentElement.filePath,
        relPath: parentElement.relPath,
        sourceCode: '',
        startLine: startLine ?? 0,
        startCol: startCol ?? 0,
        endLine: endLine ?? 0,
        endCol: endCol ?? 0,
        parentId: parentElementId,
        childrenIds: [],
        props: props ?? {},
        uses: [componentId],
        usedIn: [],
        refId: componentId,
    };
    blocks[instanceId] = instanceBlock;
    // 2️⃣ Вставляем в childrenIds родителя
    parentElement.childrenIds ?? (parentElement.childrenIds = []);
    if (typeof index === 'number' &&
        index >= 0 &&
        index <= parentElement.childrenIds.length) {
        parentElement.childrenIds.splice(index, 0, instanceId);
    }
    else {
        parentElement.childrenIds.push(instanceId);
    }
    // 3️⃣ Обновляем usedIn/usages у компоненты
    component.usedIn ?? (component.usedIn = []);
    if (!component.usedIn.includes(instanceId)) {
        component.usedIn.push(instanceId);
    }
    component.usages ?? (component.usages = []);
    if (!component.usages.some(u => u.usageId === instanceId)) {
        component.usages.push({
            usageId: instanceId,
            filePath: instanceBlock.filePath,
            relPath: instanceBlock.relPath,
            startLine: instanceBlock.startLine,
            endLine: instanceBlock.endLine,
            startCol: instanceBlock.startCol,
            endCol: instanceBlock.endCol,
            parentId: parentElementId,
            props: instanceBlock.props,
        });
    }
    // 4️⃣ Находим родительскую компоненту (чтобы добавить import)
    const parentComponent = findParentComponent(blocks, parentElementId);
    if (!parentComponent) {
        throw new Error(`Parent component not found for element ${parentElementId}`);
    }
    parentComponent.imports ?? (parentComponent.imports = []);
    // 5️⃣ Добавляем импорт, если его нет
    if (!hasImport(parentComponent, component.name)) {
        const fromDir = path_1.default.dirname(parentComponent.filePath);
        let rel = path_1.default.relative(fromDir, component.filePath).replace(/\\/g, '/');
        rel = rel.replace(/\.(tsx|ts|jsx|js)$/, '');
        if (!rel.startsWith('.'))
            rel = `./${rel}`;
        parentComponent.imports.push(`${rel}|default|${component.name}`);
    }
}
exports.addComponentAsChild = addComponentAsChild;
