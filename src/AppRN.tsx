import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import RenderFile from './RenderFile';
import FileTree, { type FileSelection } from './FileTree';
import { openDirectoryDialog, setRootDirectory, isFileSystemAPIAvailable } from './shared/api/filesystem-api';
import { CreateProjectDialog } from './shared/ui/dialogs/create-project-dialog';
import { createProject } from './features/file-operations/lib/file-operations';

function AppRN() {
  const [viewMode, setViewMode] = useState<'preview' | 'split' | 'changes'>('preview');
  const [showSplitSidebar, setShowSplitSidebar] = useState(true);
  const [showSplitPreview, setShowSplitPreview] = useState(true);
  const [showSplitCode, setShowSplitCode] = useState(true);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileSelection | null>(null);
  const [fileTreeVersion, setFileTreeVersion] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const leftPanelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createProjectDialogVisible, setCreateProjectDialogVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);;

  // Обработчики для сворачивания левой панели
  const handleLeftPanelMouseEnter = () => {
    // Отменяем таймер сворачивания при наведении
    if (leftPanelTimeoutRef.current) {
      clearTimeout(leftPanelTimeoutRef.current);
      leftPanelTimeoutRef.current = null;
    }
    setIsLeftPanelCollapsed(false);
  };

  const handleLeftPanelMouseLeave = () => {
    leftPanelTimeoutRef.current = setTimeout(() => {
      setIsLeftPanelCollapsed(true);
      leftPanelTimeoutRef.current = null;
    }, 350);
  };

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (leftPanelTimeoutRef.current) {
        clearTimeout(leftPanelTimeoutRef.current);
      }
    };
  }, []);

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
        setSelectedFile(null); // Сбрасываем выбранный файл при смене проекта
        setError(null); // Очищаем ошибки при успешном открытии
      } else if (result.canceled) {
        // Пользователь отменил выбор - это нормально, не показываем ошибку
        console.log('Выбор папки отменен пользователем');
      } else {
        console.warn('Неожиданный результат выбора папки:', result);
        setError('Не удалось получить доступ к выбранной папке');
      }
    } catch (error: any) {
      console.error('Ошибка при выборе папки:', error);
      setError(`Ошибка при выборе папки: ${error.message || error.toString()}`);
    }
  };

  const handleSelectFile = (selection: FileSelection | string | null) => {
    if (!selection) {
      setSelectedFile(null);
      return;
    }

    if (typeof selection === 'string') {
      setSelectedFile({ filePath: selection, selectionKey: selection });
      setViewMode('preview');
      return;
    }

    setSelectedFile({
      ...selection,
      selectionKey: selection.selectionKey || selection.filePath,
    });
    setViewMode('preview');
  };

  const handleCreateProject = async (projectName: string, projectType: string) => {
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
            setSelectedFile(null);
            setCreateProjectDialogVisible(false);
          } else {
            setError(`Ошибка создания проекта: ${createResult.error}`);
          }
        } catch (dirError: any) {
          setError(`Ошибка создания папки проекта: ${dirError.message}`);
        }
      }
    } catch (err: any) {
      setError(`Ошибка: ${err.message}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Верхняя панель */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title} numberOfLines={1}>
            NO-CODE UI
          </Text>
        </View>
        <View style={styles.headerRight}>
          {selectedFile?.filePath && (
            <View style={styles.topToolbar}>
              <TouchableOpacity
                style={[styles.modeButton, viewMode === 'preview' && styles.modeButtonActive]}
                onPress={() => setViewMode('preview')}
              >
                <Text style={[styles.modeButtonText, viewMode === 'preview' && styles.modeButtonTextActive]}>Превью</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, viewMode === 'split' && styles.modeButtonActive]}
                onPress={() => setViewMode('split')}
              >
                <Text style={[styles.modeButtonText, viewMode === 'split' && styles.modeButtonTextActive]}>Сплит</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, viewMode === 'changes' && styles.modeButtonActive]}
                onPress={() => setViewMode('changes')}
              >
                <Text style={[styles.modeButtonText, viewMode === 'changes' && styles.modeButtonTextActive]}>Изменения</Text>
              </TouchableOpacity>
              {viewMode === 'split' && (
                <View style={styles.splitButtons}>
                  <TouchableOpacity
                    style={[styles.modeButton, showSplitSidebar && styles.modeButtonActive]}
                    onPress={() => setShowSplitSidebar((prev) => !prev)}
                  >
                    <Text style={[styles.modeButtonText, showSplitSidebar && styles.modeButtonTextActive]}>Панель</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeButton, showSplitPreview && styles.modeButtonActive]}
                    onPress={() => setShowSplitPreview((prev) => !prev)}
                  >
                    <Text style={[styles.modeButtonText, showSplitPreview && styles.modeButtonTextActive]}>Превью</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeButton, showSplitCode && styles.modeButtonActive]}
                    onPress={() => setShowSplitCode((prev) => !prev)}
                  >
                    <Text style={[styles.modeButtonText, showSplitCode && styles.modeButtonTextActive]}>Код</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
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
        <View 
          style={[
            styles.sidebar,
            isLeftPanelCollapsed ? styles.sidebarCollapsed : { width: sidebarWidth }
          ]}
          onPointerEnter={handleLeftPanelMouseEnter}
          onPointerLeave={handleLeftPanelMouseLeave}
        >
          
          {/* Содержимое левой панели */}
          <View 
            style={[
              styles.sidebarContent,
              isLeftPanelCollapsed && styles.sidebarContentCollapsed
            ]}
          >
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>Файлы проекта</Text>
            </View>
            <FileTree
              key={`file-tree-${projectPath || 'none'}-${fileTreeVersion}`}
              rootPath={projectPath!}
              onSelectFile={handleSelectFile}
              selectedPath={selectedFile?.selectionKey || ''}
            />
          </View>
        </View>

        {/* Разделитель */}
        <View style={styles.divider} />

        {/* Правая панель: рендеринг файла */}
        <View style={styles.content}>
          {selectedFile?.filePath ? (
            <RenderFile
              filePath={selectedFile.filePath}
              selectedComponentName={selectedFile.componentName || null}
              projectPath={projectPath}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              showSplitSidebar={showSplitSidebar}
              showSplitPreview={showSplitPreview}
              showSplitCode={showSplitCode}
              onProjectFilesChanged={() => setFileTreeVersion((v) => v + 1)}
              onOpenFile={handleSelectFile}
            />
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
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#181818',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2d2e',
  },
  headerLeft: {
    flexShrink: 0,
    marginRight: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  topToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: '#2a2d2e',
    borderRadius: 6,
  },
  splitButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 2,
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: '#2a2d2e',
  },
  modeButton: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: '#094771',
    borderColor: '#0e639c',
  },
  modeButtonText: {
    color: '#cccccc',
    fontSize: 12,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#cccccc',
  },
  selectButton: {
    minHeight: 28,
    backgroundColor: '#0e639c',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1177bb',
  },
  createButton: {
    backgroundColor: '#2d7d46',
    borderColor: '#3c9c5a',
  },
  selectButtonText: {
    fontSize: 12,
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
    color: '#8c8c8c',
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
    transition: 'width 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebarCollapsed: {
    width: 40,
  },
  sidebarContent: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    minWidth: 260, // Минимальная ширина для комфортного отображения
    transition: 'opacity 0.2s ease',
  },
  sidebarContentCollapsed: {
    opacity: 0,
    pointerEvents: 'none',
  },
  sidebarToggle: {
    position: 'absolute',
    right: -20,
    top: '50%',
    transform: [{ translateY: -20 }],
    width: 40,
    height: 40,
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 11,
  },
  sidebarToggleText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
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
    position: 'relative',
    overflow: 'hidden',
  },
  rightPanel: {
    width: 400,
    backgroundColor: '#1e1e1e',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
    transition: 'width 0.3s ease',
  },
  rightPanelCollapsed: {
    width: 40,
  },
  rightPanelToggle: {
    position: 'absolute',
    left: -20,
    top: '50%',
    transform: [{ translateY: -20 }],
    width: 40,
    height: 40,
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 11,
  },
  rightPanelToggleText: {
    color: '#888',
    fontSize: 16,
    fontWeight: 'bold',
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
