import React from 'react';
import { Text, View } from 'react-native';
import { MonacoEditorWrapper } from '../../../shared/ui/monaco-editor-wrapper';
import { getMonacoLanguage } from '../../../shared/lib/file-type-detector';
import { styles } from '../styles';

const LANGUAGE_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  python: 'Python',
  java: 'Java',
  cpp: 'C/C++',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  shell: 'Shell',
  xml: 'XML',
  yaml: 'YAML',
  sql: 'SQL',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  lua: 'Lua',
  perl: 'Perl',
  swift: 'Swift',
  kotlin: 'Kotlin',
  vue: 'Vue',
  plaintext: 'Text',
};

type RenderFileContentProps = {
  fileType: string | null;
  filePath: string;
  fileContent: string | null;
  unsavedContent: string | null;
  isModified: boolean;
  monacoEditorRef: React.MutableRefObject<any>;
  onEditorChange: (content: string) => void;
  onSave: () => void;
  onCodeCtrlClick: (payload: any) => void;
  renderContentMetaOverlay: (label: string, componentName?: string | null) => React.ReactNode;
};

export function RenderFileContent({
  fileType,
  filePath,
  fileContent,
  unsavedContent,
  isModified,
  monacoEditorRef,
  onEditorChange,
  onSave,
  onCodeCtrlClick,
  renderContentMetaOverlay,
}: RenderFileContentProps) {
  const monacoLanguage = getMonacoLanguage(fileType, filePath);

  return (
    <View style={styles.textContainer}>
      {renderContentMetaOverlay(LANGUAGE_NAMES[monacoLanguage] || 'Text')}
      <View style={styles.editorContainer}>
        <MonacoEditorWrapper
          value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
          language={monacoLanguage}
          filePath={filePath}
          onChange={onEditorChange}
          onSave={onSave}
          editorRef={monacoEditorRef}
          onCodeCtrlClick={onCodeCtrlClick}
        />
        {isModified && (
          <View style={styles.saveIndicator}>
            <Text style={styles.saveIndicatorText}>* Unsaved changes (Ctrl+S to save)</Text>
          </View>
        )}
      </View>
    </View>
  );
}
