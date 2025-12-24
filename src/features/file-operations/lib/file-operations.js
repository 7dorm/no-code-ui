import { readDirectory, rename, deleteFile, deleteDirectory, writeFile, ensureDir } from '../../../shared/api/electron-api';

/**
 * Загрузка содержимого директории
 * @param {string} dirPath - путь к директории
 * @returns {Promise<{success: boolean, items?: Array, error?: string}>}
 */
export async function loadDirectory(dirPath) {
  try {
    const result = await readDirectory(dirPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Переименование файла или директории
 * @param {string} oldPath - старый путь
 * @param {string} newPath - новый путь
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function renameItem(oldPath, newPath) {
  try {
    const result = await rename(oldPath, newPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление файла
 * @param {string} filePath - путь к файлу
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteItem(filePath) {
  try {
    const result = await deleteFile(filePath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Удаление директории
 * @param {string} dirPath - путь к директории
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteDir(dirPath) {
  try {
    const result = await deleteDirectory(dirPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Создание нового файла
 * @param {string} filePath - путь к файлу
 * @param {string} content - содержимое файла
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createFile(filePath, content) {
  try {
    const result = await writeFile(filePath, content, { backup: false });
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Создание новой папки
 * @param {string} folderPath - путь к папке
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createFolder(folderPath) {
  try {
    const result = await ensureDir(folderPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Создание нового проекта с базовыми файлами
 * @param {string} parentPath - родительская директория (относительный путь, игнорируется в File System API)
 * @param {string} projectName - название проекта
 * @param {string} projectType - тип проекта ('react', 'react-native', 'html')
 * @returns {Promise<{success: boolean, projectPath?: string, error?: string}>}
 */
export async function createProject(parentPath, projectName, projectType = 'react') {
  try {
    // В File System API мы работаем с относительными путями от корневой директории
    const projectPath = projectName;
    
    // Создаем папку проекта
    const folderResult = await ensureDir(projectPath);
    if (!folderResult.success) {
      return { success: false, error: folderResult.error };
    }

    // Определяем содержимое файлов в зависимости от типа проекта
    let files = [];
    
    if (projectType === 'react') {
      // React проект
      files = [
        {
          name: 'App.jsx',
          content: `import React, { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🚀 Добро пожаловать в ${projectName}</h1>
      <p>Это базовый React компонент</p>
      
      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={() => setCount(count + 1)}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Счетчик: {count}
        </button>
      </div>
    </div>
  );
}

export default App;`
        },
        {
          name: 'index.html',
          content: `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>`
        }
      ];
    } else if (projectType === 'react-native') {
      // React Native проект
      files = [
        {
          name: 'App.jsx',
          content: `import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

function App() {
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚀 Добро пожаловать в ${projectName}</Text>
      <Text style={styles.subtitle}>Это базовый React Native компонент</Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => setCount(count + 1)}
      >
        <Text style={styles.buttonText}>Счетчик: {count}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  button: {
    padding: 15,
    backgroundColor: '#667eea',
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;`
        }
      ];
    } else if (projectType === 'html') {
      // HTML проект
      files = [
        {
          name: 'App.html',
          content: `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
        }
        button {
            padding: 10px 20px;
            font-size: 16px;
            background-color: #667eea;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 20px;
        }
        button:hover {
            background-color: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Добро пожаловать в ${projectName}</h1>
        <p>Это базовая HTML страница</p>
        
        <button onclick="handleClick()">Счетчик: <span id="count">0</span></button>
    </div>

    <script>
        let count = 0;
        
        function handleClick() {
            count++;
            document.getElementById('count').textContent = count;
        }
    </script>
</body>
</html>`
        }
      ];
    }

    // Создаем файлы
    for (const file of files) {
      const filePath = `${projectPath}/${file.name}`;
      const result = await writeFile(filePath, file.content, { backup: false });
      if (!result.success) {
        return { success: false, error: `Ошибка создания ${file.name}: ${result.error}` };
      }
    }

    return { success: true, projectPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

