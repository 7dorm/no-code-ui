/**
 * Утилиты для определения типа файла
 */

/**
 * Определяет тип файла по расширению и содержимому
 * @param {string} path - путь к файлу
 * @param {string} content - содержимое файла
 * @returns {string} тип файла
 */
export function getFileType(path, content = '') {
  const lowerPath = path.toLowerCase();
  
  // HTML
  if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
    return 'html';
  }
  
  // React/JSX/TSX
  if (lowerPath.endsWith('.jsx') || lowerPath.endsWith('.tsx')) {
    const hasRNImport = /from\s+['"]react-native['"]/.test(content) || 
                        /require\s*\(\s*['"]react-native['"]/.test(content);
    if (hasRNImport || lowerPath.endsWith('.rn.jsx') || lowerPath.endsWith('.rn.js')) {
      return 'react-native';
    }
    return 'react';
  }
  
  // JavaScript
  if (lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.cjs')) {
    const hasRNImport = /from\s+['"]react-native['"]/.test(content) || 
                        /require\s*\(\s*['"]react-native['"]/.test(content);
    if (hasRNImport || lowerPath.includes('react-native')) {
      return 'react-native';
    }
    return 'javascript';
  }
  
  // TypeScript
  if (lowerPath.endsWith('.ts') || lowerPath.endsWith('.d.ts')) {
    return 'typescript';
  }
  
  // CSS
  if (lowerPath.endsWith('.css') || lowerPath.endsWith('.scss') || lowerPath.endsWith('.sass') || lowerPath.endsWith('.less')) {
    return 'css';
  }
  
  // JSON
  if (lowerPath.endsWith('.json')) {
    return 'json';
  }
  
  // Markdown
  if (lowerPath.endsWith('.md') || lowerPath.endsWith('.markdown')) {
    return 'markdown';
  }
  
  // Python
  if (lowerPath.endsWith('.py') || lowerPath.endsWith('.pyw') || lowerPath.endsWith('.pyi')) {
    return 'python';
  }
  
  // Java
  if (lowerPath.endsWith('.java')) {
    return 'java';
  }
  
  // C/C++
  if (lowerPath.endsWith('.c') || lowerPath.endsWith('.cpp') || lowerPath.endsWith('.cc') || 
      lowerPath.endsWith('.cxx') || lowerPath.endsWith('.h') || lowerPath.endsWith('.hpp') || 
      lowerPath.endsWith('.hxx')) {
    return 'cpp';
  }
  
  // C#
  if (lowerPath.endsWith('.cs')) {
    return 'csharp';
  }
  
  // Go
  if (lowerPath.endsWith('.go')) {
    return 'go';
  }
  
  // Rust
  if (lowerPath.endsWith('.rs')) {
    return 'rust';
  }
  
  // PHP
  if (lowerPath.endsWith('.php') || lowerPath.endsWith('.phtml')) {
    return 'php';
  }
  
  // Ruby
  if (lowerPath.endsWith('.rb') || lowerPath.endsWith('.rake')) {
    return 'ruby';
  }
  
  // Shell scripts
  if (lowerPath.endsWith('.sh') || lowerPath.endsWith('.bash') || lowerPath.endsWith('.zsh') || 
      lowerPath.endsWith('.fish') || lowerPath.endsWith('.ps1')) {
    return 'shell';
  }
  
  // XML
  if (lowerPath.endsWith('.xml') || lowerPath.endsWith('.xsd') || lowerPath.endsWith('.xsl')) {
    return 'xml';
  }
  
  // YAML
  if (lowerPath.endsWith('.yaml') || lowerPath.endsWith('.yml')) {
    return 'yaml';
  }
  
  // SQL
  if (lowerPath.endsWith('.sql')) {
    return 'sql';
  }
  
  // Dockerfile
  if (lowerPath.endsWith('dockerfile') || lowerPath.includes('dockerfile.')) {
    return 'dockerfile';
  }
  
  // Makefile
  if (lowerPath.endsWith('makefile') || lowerPath.includes('makefile.') || lowerPath.endsWith('.mk')) {
    return 'makefile';
  }
  
  // Lua
  if (lowerPath.endsWith('.lua')) {
    return 'lua';
  }
  
  // Perl
  if (lowerPath.endsWith('.pl') || lowerPath.endsWith('.pm')) {
    return 'perl';
  }
  
  // Swift
  if (lowerPath.endsWith('.swift')) {
    return 'swift';
  }
  
  // Kotlin
  if (lowerPath.endsWith('.kt') || lowerPath.endsWith('.kts')) {
    return 'kotlin';
  }
  
  // Vue
  if (lowerPath.endsWith('.vue')) {
    return 'vue';
  }
  
  // Бинарные файлы
  const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
                             '.zip', '.tar', '.gz', '.rar', '.7z',
                             '.pdf', '.doc', '.docx', '.xls', '.xlsx',
                             '.mp3', '.mp4', '.avi', '.mov', '.wmv',
                             '.exe', '.dll', '.so', '.dylib'];
  if (binaryExtensions.some(ext => lowerPath.endsWith(ext))) {
    return 'binary';
  }
  
  // По умолчанию - текстовый файл
  return 'text';
}

/**
 * Определяет язык для Monaco Editor по типу файла
 * @param {string} type - тип файла
 * @param {string} filePath - путь к файлу
 * @returns {string|null} язык для Monaco Editor
 */
export function getMonacoLanguage(type, filePath) {
  const lowerPath = filePath?.toLowerCase() || '';
  
  // HTML
  if (type === 'html') return 'html';
  
  // React/JSX/TSX
  if (type === 'react' || type === 'react-native') {
    if (lowerPath.endsWith('.tsx')) return 'typescript';
    return 'javascript';
  }
  
  // JavaScript
  if (type === 'javascript') return 'javascript';
  
  // TypeScript
  if (type === 'typescript') return 'typescript';
  
  // CSS (включая SCSS, SASS, LESS)
  if (type === 'css') {
    if (lowerPath.endsWith('.scss') || lowerPath.endsWith('.sass')) return 'scss';
    if (lowerPath.endsWith('.less')) return 'less';
    return 'css';
  }
  
  // JSON
  if (type === 'json') return 'json';
  
  // Markdown
  if (type === 'markdown') return 'markdown';
  
  // Python
  if (type === 'python') return 'python';
  
  // Java
  if (type === 'java') return 'java';
  
  // C/C++
  if (type === 'cpp') return 'cpp';
  
  // C#
  if (type === 'csharp') return 'csharp';
  
  // Go
  if (type === 'go') return 'go';
  
  // Rust
  if (type === 'rust') return 'rust';
  
  // PHP
  if (type === 'php') return 'php';
  
  // Ruby
  if (type === 'ruby') return 'ruby';
  
  // Shell scripts
  if (type === 'shell') {
    if (lowerPath.endsWith('.ps1')) return 'powershell';
    return 'shell';
  }
  
  // XML
  if (type === 'xml') return 'xml';
  
  // YAML
  if (type === 'yaml') return 'yaml';
  
  // SQL
  if (type === 'sql') return 'sql';
  
  // Dockerfile
  if (type === 'dockerfile') return 'dockerfile';
  
  // Makefile
  if (type === 'makefile') return 'makefile';
  
  // Lua
  if (type === 'lua') return 'lua';
  
  // Perl
  if (type === 'perl') return 'perl';
  
  // Swift
  if (type === 'swift') return 'swift';
  
  // Kotlin
  if (type === 'kotlin') return 'kotlin';
  
  // Vue
  if (type === 'vue') return 'vue';
  
  // Бинарные файлы
  if (type === 'binary') return null;
  
  // Текстовые файлы по умолчанию
  if (type === 'text') return 'plaintext';
  
  // По умолчанию
  return 'plaintext';
}

