"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findJsxNodeById = exports.generateId = void 0;
// src/engine/parsers/utils.ts
let counter = 0;
const generateId = (filePath, type, name = '') => {
    const cleanPath = filePath.replace(/[\/\\.]/g, '_');
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'anon';
    return `${cleanPath}__${type}__${cleanName}_${counter++}`;
};
exports.generateId = generateId;
function findJsxNodeById(source, blockId) {
    let found = null;
    source.forDescendants((node) => {
        if (node.getKindName().includes('Jsx') && node.getLeadingCommentRanges) {
            const comments = node.getLeadingCommentRanges?.();
            if (comments) {
                for (const comment of comments) {
                    if (comment.getText().includes(blockId)) {
                        found = node;
                        return false;
                    }
                }
            }
        }
    });
    return found;
}
exports.findJsxNodeById = findJsxNodeById;
