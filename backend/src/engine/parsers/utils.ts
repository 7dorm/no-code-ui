// src/engine/parsers/utils.ts
let counter = 0;
export const generateId = (filePath: string, type: string, name: string = ''): string => {
  const cleanPath = filePath.replace(/[\/\\.]/g, '_');
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'anon';
  return `${cleanPath}__${type}__${cleanName}_${counter++}`;
};

export function findJsxNodeById(source: any, blockId: string) {
  let found: any = null;

  source.forDescendants((node: any) => {
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