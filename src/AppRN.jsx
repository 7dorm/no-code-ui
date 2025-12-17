import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import RenderFile from './RenderFile';
import FileTree from './FileTree';
import { openDirectoryDialog } from './shared/api/electron-api';

function AppRN() {
  const [projectPath, setProjectPath] = useState(null);
  const [selectedFilePath, setSelectedFilePath] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  const handleSelectProject = async () => {
    try {
      const result = await openDirectoryDialog();
      
      if (!result.canceled && result.directoryPath) {
        setProjectPath(result.directoryPath);
        setSelectedFilePath(null); // Сбрасываем выбранный файл при смене проекта
      }
    } catch (error) {
      console.error('Ошибка при выборе папки:', error);
    }
  };

  const handleSelectFile = (filePath) => {
    setSelectedFilePath(filePath);
  };

  return (
    <View style={styles.container}>
      {/* Верхняя панель */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>🚀 Render MRPAK</Text>
        </View>
        <View style={styles.headerRight}>
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
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
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
