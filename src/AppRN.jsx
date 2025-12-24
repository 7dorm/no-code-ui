import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import RenderFile from './RenderFile';
import FileTree from './FileTree';
import { openDirectoryDialog, setRootDirectory, isFileSystemAPIAvailable } from './shared/api/filesystem-api';
import { CreateProjectDialog } from './shared/ui/dialogs/create-project-dialog';
import { createProject } from './features/file-operations/lib/file-operations';

function AppRN() {
  const [projectPath, setProjectPath] = useState(null);
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [createProjectDialogVisible, setCreateProjectDialogVisible] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectProject = async () => {
    try {
      setError(null);
      
      // Проверяем доступность File System API
      if (!isFileSystemAPIAvailable()) {
        const isSecureContext = window.isSecureContext;
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const hasDirectoryPicker = 'showDirectoryPicker' in window;
        const hasFilePicker = 'showOpenFilePicker' in window;
        
        let errorMsg = `File System API недоступен. `;
        if (!hasDirectoryPicker || !hasFilePicker) {
          errorMsg += `Ваш браузер не поддерживает File System API. Требуется Chrome 86+, Edge 86+ или Opera 72+. `;
        } else {
          errorMsg += `Убедитесь, что вы используете HTTPS или localhost. `;
        }
        errorMsg += `Протокол: ${protocol}, hostname: ${hostname}, secure context: ${isSecureContext}`;
        setError(errorMsg);
        return;
      }
      
      console.log('Открываем диалог выбора папки...');
      const result = await openDirectoryDialog();
      console.log('Результат выбора папки:', result);
      
      if (result.error) {
        setError(`Ошибка при открытии диалога: ${result.error}`);
        return;
      }
      
      if (!result.canceled && result.directoryHandle) {
        // Устанавливаем корневую директорию для File System API
        console.log('Устанавливаем корневую директорию:', result.directoryHandle.name);
        setRootDirectory(result.directoryHandle);
        setProjectPath(result.directoryHandle.name);
        setSelectedFilePath(null); // Сбрасываем выбранный файл при смене проекта
        setError(null); // Очищаем ошибки при успешном открытии
      } else if (result.canceled) {
        // Пользователь отменил выбор - это нормально, не показываем ошибку
        console.log('Выбор папки отменен пользователем');
      } else {
        console.warn('Неожиданный результат выбора папки:', result);
        setError('Не удалось получить доступ к выбранной папке');
      }
    } catch (error) {
      console.error('Ошибка при выборе папки:', error);
      setError(`Ошибка при выборе папки: ${error.message || error.toString()}`);
    }
  };

  const handleSelectFile = (filePath) => {
    setSelectedFilePath(filePath);
  };

  const handleCreateProject = async (projectName, projectType) => {
    try {
      setError(null);
      
      // Открываем диалог выбора родительской папки
      const result = await openDirectoryDialog();
      
      if (!result.canceled && result.directoryHandle) {
        // Создаем проект внутри выбранной директории
        // Сначала создаем папку проекта внутри выбранной директории
        try {
          const projectDirHandle = await result.directoryHandle.getDirectoryHandle(projectName, { create: true });
          // Устанавливаем корневую директорию для File System API как папку проекта
          setRootDirectory(projectDirHandle);
          
          // Создаем проект (передаем пустую строку как parentPath, так как мы уже в корне проекта)
          const createResult = await createProject('', projectName, projectType);
          
          if (createResult.success) {
            // Устанавливаем путь к созданному проекту
            setProjectPath(projectName);
            setSelectedFilePath(null);
            setCreateProjectDialogVisible(false);
          } else {
            setError(`Ошибка создания проекта: ${createResult.error}`);
          }
        } catch (dirError) {
          setError(`Ошибка создания папки проекта: ${dirError.message}`);
        }
      }
    } catch (err) {
      setError(`Ошибка: ${err.message}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Верхняя панель */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>🚀 No-code UI</Text>
        </View>
        <View style={styles.headerRight}>
          {!projectPath && (
            <TouchableOpacity 
              style={[styles.selectButton, styles.createButton]}
              onPress={() => setCreateProjectDialogVisible(true)}
            >
              <Text style={styles.selectButtonText}>
                ✨ Создать проект
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.selectButton}
            onPress={handleSelectProject}
          >
            <Text style={styles.selectButtonText}>
              {projectPath ? '📁 Сменить папку' : '📁 Выбрать папку проекта'}
            </Text>
          </TouchableOpacity>
          {projectPath && (
            <Text style={styles.projectPath} numberOfLines={1}>
              {projectPath}
            </Text>
          )}
        </View>
      </View>

      {/* Сообщение об ошибке */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Основной контент: две колонки */}
      <View style={styles.mainContent}>
        {/* Левая панель: файловое дерево */}
        <View style={[styles.sidebar, { width: sidebarWidth }]}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>Файлы проекта</Text>
          </View>
          <FileTree
            rootPath={projectPath}
            onSelectFile={handleSelectFile}
            selectedPath={selectedFilePath}
          />
        </View>

        {/* Разделитель */}
        <View style={styles.divider} />

        {/* Правая панель: рендеринг файла */}
        <View style={styles.content}>
          {selectedFilePath ? (
            <RenderFile filePath={selectedFilePath} />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>📄</Text>
              <Text style={styles.placeholderText}>
                Выберите файл из дерева проекта
              </Text>
              <Text style={styles.placeholderHint}>
                Поддерживаются: HTML, React (JSX/TSX), JavaScript, TypeScript, CSS, JSON, Markdown
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Диалог создания проекта */}
      <CreateProjectDialog
        visible={createProjectDialogVisible}
        onClose={() => setCreateProjectDialogVisible(false)}
        onCreate={handleCreateProject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  selectButton: {
    backgroundColor: '#667eea',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  createButton: {
    backgroundColor: '#10b981',
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.5)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
    flex: 1,
  },
  errorClose: {
    color: '#fca5a5',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 10,
  },
  projectPath: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    maxWidth: 300,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    zIndex: 0,
  },
  sidebar: {
    backgroundColor: '#1e1e1e',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
  },
  sidebarHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#252525',
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  divider: {
    width: 4,
    backgroundColor: '#2a2a2a',
    zIndex: -1,
  },
  content: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    zIndex: -1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  placeholderIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center',
  },
  placeholderHint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default AppRN;
