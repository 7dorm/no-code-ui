"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndInsertBlock = void 0;
const utils_1 = require("../parsers/utils");
const addElement_1 = require("./addElement");
function createAndInsertBlock({ blocks, cssBlocks, type, name, absPath, relPath, parentId, index, startLine, startCol, endLine, endCol, }) {
    const id = (0, utils_1.generateId)(relPath, type, name);
    const newBlock = {
        id,
        type,
        name,
        filePath: absPath.replace(/\\/g, '/'),
        relPath: relPath,
        sourceCode: '',
        startLine,
        startCol,
        endLine,
        endCol,
        parentId,
        childrenIds: [],
        uses: [],
        usedIn: [],
    };
    (0, addElement_1.insertBlockIntoTree)({
        blocks,
        cssBlocks,
        parentId,
        block: newBlock,
        index,
        startLine,
        startCol,
        endLine,
        endCol,
    });
    return newBlock;
}
exports.createAndInsertBlock = createAndInsertBlock;
