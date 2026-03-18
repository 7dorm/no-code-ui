import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { DeleteConfirmDialog } from './shared/ui/dialogs/delete-confirm-dialog';
import { RenameDialog } from './shared/ui/dialogs/rename-dialog';
import { CreateFileDialog } from './shared/ui/dialogs/create-file-dialog';
import { CreateFolderDialog } from './shared/ui/dialogs/create-folder-dialog';
import { loadDirectory, renameItem, deleteItem, deleteDir, createFile, createFolder } from './features/file-operations/lib/file-operations';
import { readDirectory, deleteFile, deleteDirectory, readFile } from './shared/api/filesystem-api';
import { detectComponents } from './features/file-renderer/lib/react-processor';

export type FileSelection = {
  filePath: string;
  componentName?: string | null;
  selectionKey?: string;
};

export type ComponentDragPayload = {
  sourceFilePath: string;
  componentName: string;
  importKind: 'default' | 'named';
  hasProps: boolean;
  propsCount: number;
  supportsStyleOnlyArg?: boolean;
};

export type FileDragPayload = {
  sourceFilePath: string;
  kind: 'image';
};

interface FileTreeItem {
  path: string;
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  children?: FileTreeItem[];
  componentName?: string | null;
  componentHasProps?: boolean;
  componentPropsCount?: number;
  componentSupportsStyleOnlyArg?: boolean;
  componentImportKind?: 'default' | 'named' | 'none';
  parentFilePath?: string;
  kind?: 'directory' | 'file' | 'component';
}

function isComponentSelectableFile(item: FileTreeItem) {
  return item.isFile && /\.(jsx|tsx)$/i.test(item.name);
}

function isImageFileName(name: string) {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(String(name || ''));
}

function buildComponentSelectionKey(filePath: string, componentName: string) {
  return `${filePath}#component:${componentName}`;
}

async function annotateRenderableComponents(items: FileTreeItem[]): Promise<FileTreeItem[]> {
  const nextItems = await Promise.all(
    items.map(async (item) => {
      if (!isComponentSelectableFile(item)) {
        return {
          ...item,
          kind: item.isDirectory ? 'directory' : 'file',
        };
      }

      try {
        const result = await readFile(item.path);
        if (!result.success || !result.content) {
          return {
            ...item,
            kind: 'file',
          };
        }

        const components = detectComponents(result.content).filter((component) => Boolean(component?.name));
        if (components.length === 1) {
          const component = components[0];
          return {
            ...item,
            kind: 'file',
            componentName: component.name,
            componentHasProps: Boolean(component.hasProps),
            componentPropsCount: Number(component.propsCount || 0),
            componentSupportsStyleOnlyArg: Boolean(component.supportsStyleOnlyArg),
            componentImportKind: component.exportType || 'none',
          };
        }

        if (components.length > 1) {
          return {
            ...item,
            kind: 'file',
            children: components.map((component) => ({
              path: buildComponentSelectionKey(item.path, component.name),
              name: component.name,
              isDirectory: false,
              isFile: false,
              kind: 'component',
              componentName: component.name,
              componentHasProps: Boolean(component.hasProps),
              componentPropsCount: Number(component.propsCount || 0),
              componentSupportsStyleOnlyArg: Boolean(component.supportsStyleOnlyArg),
              componentImportKind: component.exportType || 'none',
              parentFilePath: item.path,
            })),
          };
        }
      } catch (error) {
        console.warn('[FileTree] Failed to inspect components for file:', item.path, error);
      }

      return {
        ...item,
        kind: 'file',
      };
    })
  );

  return nextItems;
}
 
// Update the ContextMenu component with proper types
interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onDelete?: () => void;
  onRename?: () => void;
}

// Компонент контекстного меню
function ContextMenu({ visible, x, y, onClose, onDelete, onRename }: ContextMenuProps) {
  const menuRef = useRef<View>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x, y });
  const [isPositioned, setIsPositioned] = useState(false);

  // Обновляем позицию при изменении координат
  useEffect(() => {
    if (visible) {
      setAdjustedPosition({ x, y });
      setIsPositioned(false);
    }
  }, [visible, x, y]);

  // Корректируем позицию после рендера
  useEffect(() => {
    if (!visible || isPositioned) return;

    // Корректируем позицию меню, чтобы оно не выходило за пределы экрана
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // Проверяем, не выходит ли меню за правую границу
      if (x + menuRect.width > viewportWidth) {
        adjustedX = Math.max(10, viewportWidth - menuRect.width - 10);
      }

      // Проверяем, не выходит ли меню за нижнюю границу
      if (y + menuRect.height > viewportHeight) {
        adjustedY = Math.max(10, viewportHeight - menuRect.height - 10);
      }

      // Проверяем минимальные значения
      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);

      if (adjustedX !== x || adjustedY !== y) {
        setAdjustedPosition({ x: adjustedX, y: adjustedY });
      }
      setIsPositioned(true);
    }
  }, [visible, isPositioned, x, y]);

  // Обработчики событий
  useEffect(() => {
    if (!visible) return;

    const handleClick = (e: any) => {
      onClose();
    };

    const handleContextMenu = (e: any) => {
      e.preventDefault();
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      style={contextMenuStyles.overlay}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={menuRef}
        id="context-menu"
        style={{
          ...contextMenuStyles.menu,
          position: 'fixed',
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
          zIndex: 999999999,
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {onRename && (
          <div
            style={{
              ...contextMenuStyles.menuItem,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(102, 126, 234, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRename();
              onClose();
            }}
          >
            <span style={contextMenuStyles.menuItemText}>✏️ Переименовать</span>
          </div>
        )}
        {onDelete && (
          <div
            data-name={'asdasd'}
            style={{
              ...contextMenuStyles.menuItem,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 107, 107, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
              onClose();
            }}
          >
            <span style={contextMenuStyles.menuItemText}>🗑️ Удалить</span>
          </div>
        )}
      </div>
    </div>
  );
}

// CreateFileDialog вынесен в shared/ui/dialogs/create-file-dialog

function FileTreeItem({ item, level = 0, onSelectFile, selectedPath, expandedPaths, onToggleExpand, onCreateFile, onCreateFolder, onDelete, onRename, onStartComponentDrag, onEndComponentDrag, onStartFileDrag, onEndFileDrag, onUnsupportedComponentDrag }: {
  item: FileTreeItem;
  level?: number;
  onSelectFile?: (selection: FileSelection | null) => void;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onCreateFile?: (path: string) => void;
  onCreateFolder?: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
  onStartComponentDrag?: (payload: ComponentDragPayload) => void;
  onEndComponentDrag?: () => void;
  onStartFileDrag?: (payload: FileDragPayload) => void;
  onEndFileDrag?: () => void;
  onUnsupportedComponentDrag?: (message: string) => void;
}) {
  const isExpanded = expandedPaths.has(item.path);
  const isSelected = selectedPath === item.path;
  const hasChildren = item.isDirectory || Boolean(item.children?.length);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const itemRef = useRef(null);
  const containerRef = useRef(null);
  const componentDragPayload: ComponentDragPayload | null = (() => {
    const componentName = String(item.componentName || '').trim();
    const sourceFilePath = String(item.parentFilePath || item.path || '').trim();
    if (!componentName || !sourceFilePath) return null;
    const isComponentNode = item.kind === 'component';
    const isSingleComponentFile =
      item.kind === 'file' && item.isFile && /\.(jsx|tsx)$/i.test(item.name) && !item.children?.length;
    if (!isComponentNode && !isSingleComponentFile) return null;
    const importKind = item.componentImportKind === 'named' ? 'named' : 'default';
    return {
      sourceFilePath,
      componentName,
      importKind,
      hasProps: Boolean(item.componentHasProps),
      propsCount: Number(item.componentPropsCount || 0),
      supportsStyleOnlyArg: Boolean(item.componentSupportsStyleOnlyArg),
    };
  })();
  const fileDragPayload: FileDragPayload | null =
    item.isFile && isImageFileName(item.name)
      ? { sourceFilePath: String(item.path || ''), kind: 'image' }
      : null;

  const handlePress = () => {
    if (item.kind === 'component' && item.parentFilePath) {
      onSelectFile?.({
        filePath: item.parentFilePath,
        componentName: item.componentName || null,
        selectionKey: item.path,
      });
      return;
    }

    if (item.isFile && item.children?.length) {
      onToggleExpand(item.path);
      return;
    }

    if (item.isFile) {
      onSelectFile?.({
        filePath: item.path,
        componentName: item.componentName || null,
        selectionKey: item.path,
      });
    } else {
      onToggleExpand(item.path);
    }
  };

  const handleLongPress = (e: any) => {
    // Для контекстного меню используем правый клик через onContextMenu
    // Но в React Native Web можно использовать длительное нажатие
    if (e) {
      const x = e.nativeEvent?.clientX || e.nativeEvent?.pageX || 0;
      const y = e.nativeEvent?.clientY || e.nativeEvent?.pageY || 0;
      setContextMenuPos({ x, y });
      setShowContextMenu(true);
    }
  };

  // Используем прямой обработчик через DOM API для правильного получения координат
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextMenu = (e: any) => {
      e.preventDefault();
      e.stopPropagation();

      // Получаем точные координаты клика относительно viewport
      const x = e.clientX;
      const y = e.clientY;

      console.log('Context menu at:', { x, y });

      setContextMenuPos({ x, y });
      setShowContextMenu(true);
    };

    (container as any).addEventListener('contextmenu', handleContextMenu);

    return () => {
      (container as any).removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  const getIcon = () => {
    if (item.kind === 'component') {
      return '◧';
    }
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
    return icons[ext as keyof typeof icons] || '📄';
  };

  const handleDragStart = (event: any) => {
    if (!componentDragPayload && !fileDragPayload) return;
    if (componentDragPayload) {
      if (componentDragPayload.hasProps && !componentDragPayload.supportsStyleOnlyArg) {
        event?.preventDefault?.();
        onUnsupportedComponentDrag?.(
          `Компонент "${componentDragPayload.componentName}" принимает аргументы кроме "style". Сейчас поддерживаются только компоненты без аргументов или только со style.`
        );
        return;
      }
      try {
        if (event?.dataTransfer) {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(
            'text/plain',
            `mrpak-component:${componentDragPayload.sourceFilePath}:${componentDragPayload.componentName}`
          );
        }
      } catch {}
      onStartComponentDrag?.(componentDragPayload);
      return;
    }

    if (fileDragPayload) {
      try {
        if (event?.dataTransfer) {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('text/plain', `mrpak-file:${fileDragPayload.sourceFilePath}`);
        }
      } catch {}
      onStartFileDrag?.(fileDragPayload);
      return;
    }
  };

  const handleDragEnd = () => {
    if (componentDragPayload) {
      onEndComponentDrag?.();
      return;
    }
    if (fileDragPayload) {
      onEndFileDrag?.();
      return;
    }
  };

  const actionButtons = (
    <View style={styles.actionButtons}>
      {item.isDirectory && (
        <>
        <TouchableOpacity
          style={styles.addButton}
          onPress={(e: any) => {
            e.stopPropagation();
            onCreateFile && onCreateFile(item.path);
          }}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
          <TouchableOpacity
            style={styles.addFolderButton}
            onPress={(e: any) => {
              e.stopPropagation();
              onCreateFolder && onCreateFolder(item.path);
            }}
          >
            <Text style={styles.addFolderButtonText}>📁</Text>
          </TouchableOpacity>
        </>
      )}
      {item.kind !== 'component' && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={(e: any) => {
            e.stopPropagation();
            onDelete && onDelete(item.path);
          }}
        >
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          position: 'relative',
        }}
        ref={containerRef}
        draggable={Boolean(componentDragPayload || fileDragPayload)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
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
        {actionButtons}
      </div>
      {item.kind !== 'component' && (
        <ContextMenu
          visible={showContextMenu}
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={() => setShowContextMenu(false)}
          onDelete={() => {
            onDelete && onDelete(item.path);
          }}
          onRename={() => {
            onRename && onRename(item.path);
          }}
        />
      )}
    </View>
  );
}

function FileTree({
  rootPath,
  onSelectFile,
  selectedPath,
  onStartComponentDrag,
  onEndComponentDrag,
  onStartFileDrag,
  onEndFileDrag,
  onUnsupportedComponentDrag,
}: {
  rootPath: string;
  onSelectFile: (selection: FileSelection | null) => void;
  selectedPath: string;
  onStartComponentDrag?: (payload: ComponentDragPayload) => void;
  onEndComponentDrag?: () => void;
  onStartFileDrag?: (payload: FileDragPayload) => void;
  onEndFileDrag?: () => void;
  onUnsupportedComponentDrag?: (message: string) => void;
}) {
  const [tree, setTree] = useState<FileTreeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [createDialogPath, setCreateDialogPath] = useState<string | null>(null);
  const [createFolderDialogVisible, setCreateFolderDialogVisible] = useState(false);
  const [createFolderDialogPath, setCreateFolderDialogPath] = useState<string | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FileTreeItem | null>(null);
  const [renameDialogVisible, setRenameDialogVisible] = useState(false);
  const [itemToRename, setItemToRename] = useState<FileTreeItem | null>(null);

  const loadDirectory = useCallback(async (dirPath: string, isRoot = false) => {
    // dirPath - это относительный путь внутри проекта (пустая строка для корня)
    if (loadedPaths.has(dirPath) && !isRoot) {
      return; // Уже загружено (кроме корня)
    }

    if (isRoot) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await readDirectory(dirPath);

      if (result.success) {
        const annotatedItems = await annotateRenderableComponents(result.items as FileTreeItem[]);
        setLoadedPaths(prev => new Set([...prev, dirPath]));

        // Обновляем дерево
        const updateTree = (items: FileTreeItem[], targetPath: string, newItems: FileTreeItem[]): FileTreeItem[] => {
          return items.map((item: FileTreeItem) => {
            if (item.path === targetPath && item.isDirectory) {
              return { ...item, children: newItems };
            }
            if (item.children) {
              return { ...item, children: updateTree(item.children, targetPath, newItems) };
            }
            return item;
          });
        };

        if (isRoot) {
          setTree(annotatedItems);
        } else {
          setTree(prev => updateTree(prev, dirPath, annotatedItems));
        }
      } else {
        if (isRoot) {
          setError(`Ошибка загрузки: ${result.error}`);
        }
      }
    } catch (err) {
      if (isRoot) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${errorMessage}`);
      }
    } finally {
      if (isRoot) {
        setLoading(false);
      }
    }
  }, [loadedPaths]);

  useEffect(() => {
    if (rootPath) {
      setTree([]);
      setExpandedPaths(new Set());
      setLoadedPaths(new Set());
      // Используем пустую строку для корневой директории в File System API
      loadDirectory('', true);
    }
  }, [rootPath]);

  const handleToggleExpand = (path: string) => {
    // path - это относительный путь (уже нормализован из item.path)
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

  const handleCreateFile = (parentPath: string) => {
    setCreateDialogPath(parentPath);
    setCreateDialogVisible(true);
  };

  const handleCreateFolder = (parentPath: string) => {
    setCreateFolderDialogPath(parentPath);
    setCreateFolderDialogVisible(true);
  };

  const handleDelete = (path: string) => {
    // Find the item in the tree by path
    const findItemByPath = (items: FileTreeItem[], targetPath: string): FileTreeItem | null => {
      for (const item of items) {
        if (item.path === targetPath) return item;
        if (item.children) {
          const found = findItemByPath(item.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    const item = findItemByPath(tree, path);
    if (item) {
      setItemToDelete(item);
      setDeleteDialogVisible(true);
    }
  };

  const handleRename = (path: string) => {
    // Find the item in the tree by path
    const findItemByPath = (items: FileTreeItem[], targetPath: string): FileTreeItem | null => {
      for (const item of items) {
        if (item.path === targetPath) return item;
        if (item.children) {
          const found = findItemByPath(item.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    const item = findItemByPath(tree, path);
    if (item) {
      setItemToRename(item);
      setRenameDialogVisible(true);
    }
  };

  const handleRenameConfirm = async (newName: string) => {
    if (!itemToRename || !newName) return;

    try {
        // Определяем родительскую директорию (itemToRename.path уже относительный)
        const parts = itemToRename.path.split(/[/\\]/);
        const parentPath = parts.slice(0, -1).join('/');
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;

      const result = await renameItem(itemToRename.path, newPath);

        if (result.success) {
          // Если переименован выбранный файл, обновляем выбор
          if ((selectedPath === itemToRename.path || selectedPath.startsWith(`${itemToRename.path}#component:`)) && onSelectFile) {
            onSelectFile({ filePath: newPath, selectionKey: newPath });
          }

          // Сбрасываем кэш для родительской директории
          setLoadedPaths((prev : Set<string>) => {
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
          await loadDirectory(parentPath, parentPath === '');

          setRenameDialogVisible(false);
          setItemToRename(null);
        } else {
          setError(`Ошибка переименования: ${result.error}`);
          setRenameDialogVisible(false);
          setItemToRename(null);
        }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${errorMessage}`);
      setRenameDialogVisible(false);
      setItemToRename(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      let result;
      if (itemToDelete.isDirectory) {
        result = await deleteDirectory(itemToDelete.path);
      } else {
        result = await deleteFile(itemToDelete.path);
      }

      if (result.success) {
        // Если удален выбранный файл, сбрасываем выбор
        if ((selectedPath === itemToDelete.path || selectedPath.startsWith(`${itemToDelete.path}#component:`)) && onSelectFile) {
          onSelectFile(null);
        }

        // Определяем родительскую директорию для перезагрузки (itemToDelete.path уже относительный)
        const parts = itemToDelete.path.split(/[/\\]/);
        const parentDir = parts.slice(0, -1).join('/') || '';

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
        await loadDirectory(parentDir, parentDir === '');

        setDeleteDialogVisible(false);
        setItemToDelete(null);
      } else {
        setError(`Ошибка удаления: ${result.error}`);
        setDeleteDialogVisible(false);
        setItemToDelete(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${errorMessage}`);
      setDeleteDialogVisible(false);
      setItemToDelete(null);
    }
  };

  const handleCreateFileConfirm = async (fileName: string) => {
    if (!createDialogPath || !fileName) return;

    try {
      // createDialogPath - это относительный путь директории
      const filePath = createDialogPath ? `${createDialogPath}/${fileName}` : fileName;

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
        await loadDirectory(parentDir, parentDir === '');
        // Автоматически выбираем созданный файл
        if (onSelectFile) {
          onSelectFile({ filePath, selectionKey: filePath });
        }
      } else {
        setError(`Ошибка создания файла: ${result.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${errorMessage}`);
    }
  };

  const handleCreateFolderConfirm = async (folderName: string) => {
    if (!createFolderDialogPath || !folderName) return;

    try {
      // createFolderDialogPath - это относительный путь директории
      const folderPath = createFolderDialogPath ? `${createFolderDialogPath}/${folderName}` : folderName;

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
        await loadDirectory(parentDir, parentDir === '');
      } else {
        setError(`Ошибка создания папки: ${result.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Ошибка: ${errorMessage}`);
    }
  };

  const renderTree = (items: FileTreeItem[], level = 0) => {
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
            onStartComponentDrag={onStartComponentDrag}
            onEndComponentDrag={onEndComponentDrag}
            onStartFileDrag={onStartFileDrag}
            onEndFileDrag={onEndFileDrag}
            onUnsupportedComponentDrag={onUnsupportedComponentDrag}
          />
          {(item.isDirectory || children.length > 0) && isExpanded && children.length > 0 && (
            <View>
              {renderTree(children, level + 1)}
            </View>
          )}
        </View>
      );
    });
  };

  // rootPath используется только для отображения, реальная проверка - это наличие rootDirectoryHandle
  // Для File System API мы всегда показываем дерево, если rootPath установлен
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
    <View style={styles.treeRoot}>
      {rootPath && (
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.createFileButton}
            onPress={() => handleCreateFile('')}
          >
            <Text style={styles.createFileButtonText}>+ Создать файл</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createFolderButton}
            onPress={() => handleCreateFolder('')}
          >
            <Text style={styles.createFolderButtonText}>📁 Создать папку</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {renderTree(tree)}
      </ScrollView>
      <CreateFileDialog
        visible={createDialogVisible}
        onClose={() => {
          setCreateDialogVisible(false);
          setCreateDialogPath(null);
        }}
        onCreate={handleCreateFileConfirm}
        parentPath={createDialogPath || ''}
      />
      <CreateFolderDialog
        visible={createFolderDialogVisible}
        onClose={() => {
          setCreateFolderDialogVisible(false);
          setCreateFolderDialogPath(null);
        }}
        onCreate={handleCreateFolderConfirm}
        parentPath={createFolderDialogPath || ''}
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
  treeRoot: {
    flex: 1,
    minHeight: 0,
  },
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#1e1e1e',
  },
  scrollContent: {
    paddingBottom: 16,
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

const contextMenuStyles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999998,
    backgroundColor: 'transparent',
    pointerEvents: 'auto',
  },
  menu: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 4,
    minWidth: 180,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
  },
  menuItem: {
    padding: '10px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    userSelect: 'none',
  },
  menuItemText: {
    fontSize: '14px',
    color: '#ffffff',
    userSelect: 'none',
    display: 'block',
    whiteSpace: 'nowrap',
  },
};

export default FileTree;
