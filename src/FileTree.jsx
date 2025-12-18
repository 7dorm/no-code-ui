import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { DeleteConfirmDialog } from './shared/ui/dialogs/delete-confirm-dialog';
import { RenameDialog } from './shared/ui/dialogs/rename-dialog';
import { CreateFileDialog } from './shared/ui/dialogs/create-file-dialog';
import { CreateFolderDialog } from './shared/ui/dialogs/create-folder-dialog';
import { loadDirectory, renameItem, deleteItem, deleteDir, createFile, createFolder } from './features/file-operations/lib/file-operations';

// Диалоги вынесены в shared/ui/dialogs

// Компонент контекстного меню
function ContextMenu({ visible, x, y, onClose, onDelete, onRename }) {
  useEffect(() => {
    if (!visible) return;
    
    const handleClick = (e) => {
      onClose();
    };
    
    const handleMenuClick = (e) => {
      e.stopPropagation();
    };
    
    document.addEventListener('click', handleClick);
    const menu = document.getElementById('context-menu');
    if (menu) {
      menu.addEventListener('click', handleMenuClick);
    }
    
    return () => {
      document.removeEventListener('click', handleClick);
      if (menu) {
        menu.removeEventListener('click', handleMenuClick);
      }
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      style={contextMenuStyles.overlay}
      onClick={onClose}
    >
      <div
        id="context-menu"
        style={{
          ...contextMenuStyles.menu,
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          zIndex: 999999999,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {onRename && (
          <div
            style={{
              ...contextMenuStyles.menuItem,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onRename) {
                onRename();
              }
              onClose();
            }}
          >
            <Text style={contextMenuStyles.menuItemText}>✏️ Переименовать</Text>
          </div>
        )}
        {onDelete && (
          <div
            style={{
              ...contextMenuStyles.menuItem,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onDelete) {
                onDelete();
              }
              onClose();
            }}
          >
            <Text style={contextMenuStyles.menuItemText}>🗑️ Удалить</Text>
          </div>
        )}
      </div>
    </div>
  );
}

// CreateFileDialog вынесен в shared/ui/dialogs/create-file-dialog

function FileTreeItem({ item, level = 0, onSelectFile, selectedPath, expandedPaths, onToggleExpand, onCreateFile, onCreateFolder, onDelete, onRename }) {
  const isExpanded = expandedPaths.has(item.path);
  const isSelected = selectedPath === item.path;
  const hasChildren = item.isDirectory;
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const itemRef = useRef(null);
  
  const handlePress = () => {
    if (item.isFile) {
      onSelectFile(item.path);
    } else {
      onToggleExpand(item.path);
    }
  };

  const handleLongPress = (e) => {
    // Для контекстного меню используем правый клик через onContextMenu
    // Но в React Native Web можно использовать длительное нажатие
    if (e) {
      const x = e.nativeEvent?.clientX || e.nativeEvent?.pageX || 0;
      const y = e.nativeEvent?.clientY || e.nativeEvent?.pageY || 0;
      setContextMenuPos({ x, y });
      setShowContextMenu(true);
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e) {
      // Используем clientX/clientY для правильного позиционирования относительно viewport
      const x = e.clientX || (e.nativeEvent && e.nativeEvent.clientX) || 0;
      const y = e.clientY || (e.nativeEvent && e.nativeEvent.clientY) || 0;
      setContextMenuPos({ x, y });
      setShowContextMenu(true);
    }
  };

  const getIcon = () => {
    if (item.isDirectory) {
      return isExpanded ? '📂' : '📁';
    }
    const ext = item.name.split('.').pop()?.toLowerCase();
    const icons = {
      'js': '📜',
      'jsx': '⚛️',
      'ts': '📘',
      'tsx': '⚛️',
      'html': '🌐',
      'css': '🎨',
      'json': '📋',
      'md': '📝',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'svg': '🖼️',
    };
    return icons[ext] || '📄';
  };

  return (
    <View>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          position: 'relative',
        }}
        ref={itemRef}
        onContextMenu={handleContextMenu}
      >
        <TouchableOpacity
          style={[
            styles.item,
            { paddingLeft: 12 + level * 20 },
            isSelected && styles.selectedItem
          ]}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          <Text style={styles.icon}>{getIcon()}</Text>
          <Text 
            style={[styles.itemName, isSelected && styles.selectedItemName]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {hasChildren && (
            <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
          )}
        </TouchableOpacity>
        <View style={styles.actionButtons}>
          {item.isDirectory && (
            <>
              <TouchableOpacity
                style={styles.addButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onCreateFile && onCreateFile(item.path);
                }}
              >
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addFolderButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onCreateFolder && onCreateFolder(item.path);
                }}
              >
                <Text style={styles.addFolderButtonText}>📁</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={(e) => {
              e.stopPropagation();
              onDelete && onDelete(item);
            }}
          >
            <Text style={styles.deleteButtonText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </div>
      <ContextMenu
        visible={showContextMenu}
        x={contextMenuPos.x}
        y={contextMenuPos.y}
        onClose={() => setShowContextMenu(false)}
        onDelete={() => {
          onDelete && onDelete(item);
        }}
        onRename={() => {
          onRename && onRename(item);
        }}
      />
    </View>
  );
}

function FileTree({ rootPath, onSelectFile, selectedPath }) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [loadedPaths, setLoadedPaths] = useState(new Set());
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [createDialogPath, setCreateDialogPath] = useState(null);
  const [createFolderDialogVisible, setCreateFolderDialogVisible] = useState(false);
  const [createFolderDialogPath, setCreateFolderDialogPath] = useState(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);

  const loadDirectory = useCallback(async (dirPath, isRoot = false) => {
    if (loadedPaths.has(dirPath) && !isRoot) {
      return; // Уже загружено (кроме корня)
    }

    if (isRoot) {
      setLoading(true);
    }
    setError(null);

    try {
      if (window.electronAPI && window.electronAPI.readDirectory) {
        const result = await window.electronAPI.readDirectory(dirPath);
        
        if (result.success) {
          setLoadedPaths(prev => new Set([...prev, dirPath]));
          
          // Обновляем дерево
          const updateTree = (items, targetPath, newItems) => {
            return items.map(item => {
              if (item.path === targetPath && item.isDirectory) {
                return { ...item, children: newItems };
              }
              if (item.children) {
                return { ...item, children: updateTree(item.children, targetPath, newItems) };
              }
              return item;
            });
          };

          if (isRoot || dirPath === rootPath) {
            setTree(result.items);
          } else {
            setTree(prev => updateTree(prev, dirPath, result.items));
          }
        } else {
          if (isRoot) {
            setError(`Ошибка загрузки: ${result.error}`);
          }
        }
      } else {
        if (isRoot) {
          setError('Electron API не доступен');
        }
      }
    } catch (err) {
      if (isRoot) {
        setError(`Ошибка: ${err.message}`);
      }
    } finally {
      if (isRoot) {
        setLoading(false);
      }
    }
  }, [rootPath, loadedPaths]);

  useEffect(() => {
    if (rootPath) {
      setTree([]);
      setExpandedPaths(new Set());
      setLoadedPaths(new Set());
      loadDirectory(rootPath, true);
    }
  }, [rootPath]);

  const handleToggleExpand = (path) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      // Загружаем содержимое директории, если еще не загружено
      if (!loadedPaths.has(path)) {
        loadDirectory(path, false);
      }
    }
    setExpandedPaths(newExpanded);
  };

  const handleCreateFile = (parentPath) => {
    setCreateDialogPath(parentPath);
    setCreateDialogVisible(true);
  };

  const handleCreateFolder = (parentPath) => {
    setCreateFolderDialogPath(parentPath);
    setCreateFolderDialogVisible(true);
  };

  const handleDelete = (item) => {
    setItemToDelete(item);
    setDeleteDialogVisible(true);
  };

  const handleRename = (item) => {
    if (!item) return;
    setItemToRename(item);
    setRenameDialogVisible(true);
  };

  const handleRenameConfirm = async (newName) => {
    if (!itemToRename || !newName || !rootPath) return;

    try {
      // Определяем родительскую директорию
      const parentPath = itemToRename.path.split(/[/\\]/).slice(0, -1).join('/');
      const newPath = `${parentPath}/${newName}`;

      const result = await renameItem(itemToRename.path, newPath);
        
        if (result.success) {
          // Если переименован выбранный файл, обновляем выбор
          if (selectedPath === itemToRename.path && onSelectFile) {
            onSelectFile(newPath);
          }

          // Сбрасываем кэш для родительской директории
          setLoadedPaths(prev => {
            const newSet = new Set(prev);
            newSet.delete(parentPath);
            // Также удаляем кэш для всех поддиректорий переименованного элемента
            for (const path of prev) {
              if (path.startsWith(itemToRename.path)) {
                newSet.delete(path);
              }
            }
            return newSet;
          });

          // Перезагружаем родительскую директорию
          await loadDirectory(parentPath, parentPath === rootPath);

          setRenameDialogVisible(false);
          setItemToRename(null);
        } else {
          setError(`Ошибка переименования: ${result.error}`);
          setRenameDialogVisible(false);
          setItemToRename(null);
        }
    } catch (err) {
      setError(`Ошибка: ${err.message}`);
      setRenameDialogVisible(false);
      setItemToRename(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete || !rootPath) return;

    try {
      let result;
      if (itemToDelete.isDirectory) {
        if (window.electronAPI && window.electronAPI.deleteDirectory) {
          result = await window.electronAPI.deleteDirectory(itemToDelete.path);
        } else {
          setError('API удаления директории не доступен');
          setDeleteDialogVisible(false);
          setItemToDelete(null);
          return;
        }
      } else {
        if (window.electronAPI && window.electronAPI.deleteFile) {
          result = await window.electronAPI.deleteFile(itemToDelete.path);
        } else {
          setError('API удаления файла не доступен');
          setDeleteDialogVisible(false);
          setItemToDelete(null);
          return;
        }
      }

      if (result.success) {
        // Если удален выбранный файл, сбрасываем выбор
        if (selectedPath === itemToDelete.path && onSelectFile) {
          onSelectFile(null);
        }

        // Определяем родительскую директорию для перезагрузки
        const parentPath = itemToDelete.path.split(/[/\\]/).slice(0, -1).join('/');
        const parentDir = parentPath || rootPath;

        // Сбрасываем кэш для родительской директории
        setLoadedPaths(prev => {
          const newSet = new Set(prev);
          newSet.delete(parentDir);
          // Также удаляем кэш для всех поддиректорий удаленного элемента
          for (const path of prev) {
            if (path.startsWith(itemToDelete.path)) {
              newSet.delete(path);
            }
          }
          return newSet;
        });

        // Перезагружаем родительскую директорию
        await loadDirectory(parentDir, parentDir === rootPath);

        setDeleteDialogVisible(false);
        setItemToDelete(null);
      } else {
        setError(`Ошибка удаления: ${result.error}`);
        setDeleteDialogVisible(false);
        setItemToDelete(null);
      }
    } catch (err) {
      setError(`Ошибка: ${err.message}`);
      setDeleteDialogVisible(false);
      setItemToDelete(null);
    }
  };

  const handleCreateFileConfirm = async (fileName) => {
    if (!createDialogPath || !fileName) return;

    try {
      const filePath = `${createDialogPath}/${fileName}`;
      
      // Определяем начальное содержимое по расширению
      const ext = fileName.split('.').pop()?.toLowerCase();
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      const componentName = baseName.split(/[-_]/).map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join('');

      let initialContent = '';
      if (ext === 'jsx') {
        initialContent = `import React from 'react';

function ${componentName}() {
  return (
    <div>
      <h1>${componentName}</h1>
    </div>
  );
}

export default ${componentName};`;
      } else if (ext === 'tsx') {
        initialContent = `import React from 'react';

function ${componentName}(): JSX.Element {
  return (
    <div>
      <h1>${componentName}</h1>
    </div>
  );
}

export default ${componentName};`;
      } else if (ext === 'js') {
        initialContent = `// ${fileName}\n`;
      } else if (ext === 'ts') {
        initialContent = `// ${fileName}\n`;
      } else if (ext === 'html') {
        initialContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${baseName}</title>
</head>
<body>
    <h1>${baseName}</h1>
</body>
</html>`;
      } else if (ext === 'css') {
        initialContent = `/* ${fileName} */\n`;
      } else if (ext === 'json') {
        initialContent = `{\n  "name": "${baseName}"\n}\n`;
      } else if (ext === 'md') {
        initialContent = `# ${baseName}\n\n`;
      } else {
        initialContent = '';
      }

      const result = await createFile(filePath, initialContent);
      if (result.success) {
        // Обновляем дерево
        const parentDir = createDialogPath;
        setLoadedPaths(prev => {
          const newSet = new Set(prev);
          newSet.delete(parentDir); // Сбрасываем кэш, чтобы перезагрузить
          return newSet;
        });
        // Перезагружаем директорию
        await loadDirectory(parentDir, parentDir === rootPath);
        // Автоматически выбираем созданный файл
        if (onSelectFile) {
          onSelectFile(filePath);
        }
      } else {
        setError(`Ошибка создания файла: ${result.error}`);
      }
    } catch (err) {
      setError(`Ошибка: ${err.message}`);
    }
  };

  const handleCreateFolderConfirm = async (folderName) => {
    if (!createFolderDialogPath || !folderName) return;

    try {
      const folderPath = `${createFolderDialogPath}/${folderName}`;
      
      const result = await createFolder(folderPath);
      if (result.success) {
        // Обновляем дерево
        const parentDir = createFolderDialogPath;
        setLoadedPaths(prev => {
          const newSet = new Set(prev);
          newSet.delete(parentDir); // Сбрасываем кэш, чтобы перезагрузить
          return newSet;
        });
        // Перезагружаем директорию
        await loadDirectory(parentDir, parentDir === rootPath);
      } else {
        setError(`Ошибка создания папки: ${result.error}`);
      }
    } catch (err) {
      setError(`Ошибка: ${err.message}`);
    }
  };

  const renderTree = (items, level = 0) => {
    return items.map((item) => {
      const isExpanded = expandedPaths.has(item.path);
      const children = item.children || [];
      
      return (
        <View key={item.path}>
          <FileTreeItem
            item={item}
            level={level}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onToggleExpand={handleToggleExpand}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onDelete={handleDelete}
            onRename={handleRename}
          />
          {item.isDirectory && isExpanded && children.length > 0 && (
            <View>
              {renderTree(children, level + 1)}
            </View>
          )}
        </View>
      );
    });
  };

  if (!rootPath) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📁</Text>
        <Text style={styles.emptyText}>Нет открытого проекта</Text>
        <Text style={styles.emptyHint}>
          Создайте новый проект или откройте существующую папку
        </Text>
      </View>
    );
  }

  if (loading && tree.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {rootPath && (
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.createFileButton}
            onPress={() => handleCreateFile(rootPath)}
          >
            <Text style={styles.createFileButtonText}>+ Создать файл</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createFolderButton}
            onPress={() => handleCreateFolder(rootPath)}
          >
            <Text style={styles.createFolderButtonText}>📁 Создать папку</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView style={styles.container}>
        {renderTree(tree)}
      </ScrollView>
      <CreateFileDialog
        visible={createDialogVisible}
        onClose={() => {
          setCreateDialogVisible(false);
          setCreateDialogPath(null);
        }}
        onCreate={handleCreateFileConfirm}
        parentPath={createDialogPath || rootPath}
      />
      <CreateFolderDialog
        visible={createFolderDialogVisible}
        onClose={() => {
          setCreateFolderDialogVisible(false);
          setCreateFolderDialogPath(null);
        }}
        onCreate={handleCreateFolderConfirm}
        parentPath={createFolderDialogPath || rootPath}
      />
      <DeleteConfirmDialog
        visible={deleteDialogVisible}
        onClose={() => {
          setDeleteDialogVisible(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        itemName={itemToDelete?.name || ''}
        isDirectory={itemToDelete?.isDirectory || false}
      />
      <RenameDialog
        visible={renameDialogVisible}
        onClose={() => {
          setRenameDialogVisible(false);
          setItemToRename(null);
        }}
        onRename={handleRenameConfirm}
        itemName={itemToRename?.name || ''}
        itemPath={itemToRename?.path || ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  selectedItem: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#667eea',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
    width: 20,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: '#d4d4d4',
    fontFamily: 'monospace',
  },
  selectedItemName: {
    color: '#ffffff',
    fontWeight: '600',
  },
  expandIcon: {
    fontSize: 10,
    color: '#888',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d4d4d4',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
  },
  errorContainer: {
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#ff6b6b',
    textAlign: 'center',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'absolute',
    right: 8,
  },
  addButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(102, 126, 234, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.7,
  },
  addButtonText: {
    color: '#667eea',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  addFolderButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 176, 59, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.7,
  },
  addFolderButtonText: {
    fontSize: 12,
    lineHeight: 20,
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.7,
  },
  deleteButtonText: {
    fontSize: 14,
    lineHeight: 20,
  },
  headerActions: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    gap: 8,
  },
  createFileButton: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    flex: 1,
  },
  createFileButtonText: {
    color: '#667eea',
    fontSize: 13,
    fontWeight: '600',
  },
  createFolderButton: {
    backgroundColor: 'rgba(255, 176, 59, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    flex: 1,
  },
  createFolderButtonText: {
    color: '#ffb03b',
    fontSize: 13,
    fontWeight: '600',
  },
});

const dialogStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000000000,
  },
  dialog: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    minWidth: 400,
    maxWidth: 500,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.3)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  path: {
    fontSize: 12,
    color: '#888',
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#d4d4d4',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    paddingHorizontal: 12,
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  select: {
    width: '100%',
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    paddingHorizontal: 12,
    color: '#ffffff',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonPrimary: {
    backgroundColor: '#667eea',
  },
  buttonText: {
    color: '#d4d4d4',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonPrimaryText: {
    color: '#ffffff',
  },
  warning: {
    fontSize: 13,
    color: '#ff6b6b',
    marginBottom: 20,
    lineHeight: 18,
  },
  buttonDanger: {
    backgroundColor: '#ff6b6b',
  },
  buttonDangerText: {
    color: '#ffffff',
  },
};

const contextMenuStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    backgroundColor: 'transparent',
  },
  menu: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 4,
    minWidth: 150,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  menuItem: {
    padding: '10px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  menuItemText: {
    fontSize: 14,
    color: '#ffffff',
  },
};

export default FileTree;
