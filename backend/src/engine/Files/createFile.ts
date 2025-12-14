import fs from 'fs';
import path from 'path';

export function createTsxComponent(
  folderPath: string,
  componentName: string
): { path: string; line: number; column: number } {
  const absFolder = path.resolve(folderPath);

  if (!fs.existsSync(absFolder)) {
    fs.mkdirSync(absFolder, { recursive: true });
  }

  const fileName = `${componentName}.tsx`;
  const filePath = path.join(absFolder, fileName);

  const template = `import React from 'react';

type Props = {
};

export default function ${componentName}({ title }: Props) {
  return (
    <></>
  );
}
`;

  fs.writeFileSync(filePath, template, 'utf8');

  return {
    path: filePath,
    line: 8,
    column: 7,
  };
}