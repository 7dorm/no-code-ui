import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import WebView from './WebView';
import BlockEditorPanel from './BlockEditorPanel';
import { instrumentJsx } from './blockEditor/JsxInstrumenter';
import { instrumentHtml } from './blockEditor/HtmlInstrumenter';
import { MRPAK_MSG, MRPAK_CMD, isMrpakMessage } from './blockEditor/EditorProtocol';
import { applyStylePatch, applyHtmlOp, applyJsxDelete, applyJsxInsert, applyJsxReparent, applyJsxSetText, parseStyleImports, applyExternalStylePatch, replaceStyleReferenceInJsx } from './blockEditor/PatchEngine';
import { loadLayerNames, upsertLayerName } from './blockEditor/LayerNamesStore';
import { ViewModeTabs } from './shared/ui/view-mode-tabs';
import { MonacoEditorWrapper } from './shared/ui/monaco-editor-wrapper';
import { getFileType, getMonacoLanguage } from './shared/lib/file-type-detector';
import { readFile, writeFile, watchFile, unwatchFile, onFileChanged, readDirectory, readFileBase64 } from './shared/api/electron-api';
import { injectBlockEditorScript } from './features/file-renderer/lib/block-editor-script';
import { findProjectRoot, resolvePath, resolvePathSync } from './features/file-renderer/lib/path-resolver';
import { extractImports, detectComponents } from './features/file-renderer/lib/react-processor';
import { createFramework, isFrameworkSupported } from './frameworks/FrameworkFactory';

function RenderFile({ filePath }) {
  const [fileContent, setFileContent] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unsavedContent, setUnsavedContent] = useState(null); // Несохраненные изменения
  const [isModified, setIsModified] = useState(false); // Флаг изменений
  const monacoEditorRef = useRef(null);
  
  // Хуки для React и React Native файлов (всегда вызываются)
  const [reactHTML, setReactHTML] = useState('');
  const [isProcessingReact, setIsProcessingReact] = useState(false);
  const [reactNativeHTML, setReactNativeHTML] = useState('');
  const [isProcessingReactNative, setIsProcessingReactNative] = useState(false);
  const [renderVersion, setRenderVersion] = useState(0); // увеличиваем, чтобы форсировать перерисовку WebView
  
  // Пути к зависимым файлам для отслеживания изменений
  const [dependencyPaths, setDependencyPaths] = useState([]);
  
  // Хуки для HTML файлов (всегда вызываются)
  const [processedHTML, setProcessedHTML] = useState('');
  const [htmlDependencyPaths, setHtmlDependencyPaths] = useState([]);
  const [isProcessingHTML, setIsProcessingHTML] = useState(false);
  
  // Режим просмотра: 'preview' или 'code'
  const [viewMode, setViewMode] = useState('preview');

  // Состояние редактора блоков
  const [blockMap, setBlockMap] = useState({});
  // blockMap для исходного файла (для записи патчей в исходный код, без зависимости от обработанного превью)
  const [blockMapForFile, setBlockMapForFile] = useState({});
  const [selectedBlock, setSelectedBlock] = useState(null); // { id, meta? }
  const [changesLog, setChangesLog] = useState([]); // [{ ts, filePath, blockId, patch }]
  const [editorHTML, setEditorHTML] = useState('');
  const [stagedPatches, setStagedPatches] = useState({}); // { [blockId]: patchObject }
  const [hasStagedChanges, setHasStagedChanges] = useState(false);
  const [layersTree, setLayersTree] = useState(null); // { nodes: {id:...}, rootIds: [] }
  const [layerNames, setLayerNames] = useState({}); // { [mrpakId]: "Name" }
  const [projectRoot, setProjectRoot] = useState(null);
  const [iframeCommand, setIframeCommand] = useState(null); // { type, ...payload, ts }
  const [stagedOps, setStagedOps] = useState([]); // [{type:'insert'|'delete', ...}]
  const [styleSnapshots, setStyleSnapshots] = useState({}); // { [mrpakId]: { inlineStyle: string, computedStyle?: object } }
  const [textSnapshots, setTextSnapshots] = useState({}); // { [mrpakId]: text }
  const [externalStylesMap, setExternalStylesMap] = useState({}); // { [varName]: { path: string, type: string } }

  // Рефы для актуальных значений staged состояний (чтобы избегать устаревших замыканий)
  const stagedPatchesRef = useRef(stagedPatches);
  const stagedOpsRef = useRef(stagedOps);
  const hasStagedChangesRef = useRef(hasStagedChanges);
  
  // Хелперы для синхронного обновления state + ref одновременно
  const updateStagedPatches = useCallback((updater) => {
    setStagedPatches((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      stagedPatchesRef.current = next; // СИНХРОННО обновляем ref
      return next;
    });
  }, []);
  
  const updateStagedOps = useCallback((updater) => {
    setStagedOps((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      stagedOpsRef.current = next; // СИНХРОННО обновляем ref
      return next;
    });
  }, []);
  
  const updateHasStagedChanges = useCallback((value) => {
    setHasStagedChanges(value);
    hasStagedChangesRef.current = value; // СИНХРОННО обновляем ref
  }, []);

  // Ref для stageReparentBlock (используется в handleEditorMessage до определения функции)
  const stageReparentBlockRef = useRef(null);

  // getFileType и getMonacoLanguage импортированы из shared/lib/file-type-detector.js

  // injectBlockEditorScript теперь импортируется из модуля

  const applyBlockPatch = useCallback(
    async (blockId, patch) => {
      try {
        // Для сохранения прогресса в редакторе мы НЕ применяем изменения сразу.
        // Вместо этого — накапливаем staged-патчи и применяем их при смене таба или по кнопке.
        if (!blockId) return;
        updateStagedPatches((prev) => ({
          ...prev,
          [blockId]: { ...(prev?.[blockId] || {}), ...(patch || {}) },
        }));
        updateHasStagedChanges(true);
      } catch (e) {
        console.error('BlockEditor apply error:', e);
        setError(`Ошибка применения изменений: ${e.message}`);
      }
    },
    [updateStagedPatches, updateHasStagedChanges]
  );

  const commitStagedPatches = useCallback(async () => {
    // Берём актуальные значения из рефов, чтобы не зависеть от замыканий
    const currentStagedPatches = stagedPatchesRef.current || {};
    const currentStagedOps = stagedOpsRef.current || [];
    const currentHasStagedChanges = hasStagedChangesRef.current;
    
    const entries = Object.entries(currentStagedPatches).filter(
      ([id, p]) => id && p && Object.keys(p).length > 0
    );
    const ops = Array.isArray(currentStagedOps) ? currentStagedOps : [];
    
    console.log('commitStagedPatches called:', {
      hasStagedChanges: currentHasStagedChanges,
      entriesCount: entries.length,
      opsCount: ops.length,
      fileType,
      filePath
    });
    
    try {
      if (!currentHasStagedChanges) {
        if (entries.length === 0 && ops.length === 0) {
          updateHasStagedChanges(false);
        }
        return;
      }

      if (entries.length === 0 && ops.length === 0) {
        console.log('commitStagedPatches: no changes to commit');
        updateHasStagedChanges(false);
        return;
      }
      
      // Получаем актуальный blockMap для поиска элементов
      const currentBlockMap = blockMap || {};
      const currentBlockMapForFile = blockMapForFile || {};
      
      console.log('commitStagedPatches: committing changes', {
        entries: entries.map(([id]) => id),
        ops: ops.map(o => ({ type: o.type, blockId: o.blockId || o.targetId })),
        blockMapKeys: Object.keys(currentBlockMap).length,
        blockMapForFileKeys: Object.keys(currentBlockMapForFile).length
      });

      // API проверяется в функции writeFile

      // Используем Framework для коммита патчей
      if (!isFrameworkSupported(fileType)) {
        console.warn('commitStagedPatches: Unsupported file type:', fileType);
        return;
      }

      const framework = createFramework(fileType, filePath);
      const result = await framework.commitPatches({
        originalCode: String(fileContent ?? ''),
        stagedPatches: currentStagedPatches,
        stagedOps: ops,
        blockMapForFile: currentBlockMapForFile,
            externalStylesMap,
        filePath,
        resolvePath,
        readFile,
        writeFile
      });

      if (!result.ok) {
        throw new Error(result.error || 'Ошибка применения изменений');
      }

      const newContent = result.code || String(fileContent ?? '');

      // Обрабатываем внешние патчи, если они есть
      if (result.externalPatches && result.externalPatches.length > 0) {
        for (const extPatch of result.externalPatches) {
          console.log('commitStagedPatches: External patch applied:', extPatch);
        }
      }

      // Проверяем, что newContent не пустой и не undefined
      if (!newContent || typeof newContent !== 'string') {
        console.error('commitStagedPatches: newContent is invalid', { 
          type: typeof newContent, 
          isNull: newContent === null, 
          isUndefined: newContent === undefined,
          length: newContent?.length 
        });
        throw new Error('Результат применения изменений пуст или некорректен');
      }
      
      if (newContent.length === 0) {
        console.error('commitStagedPatches: newContent is empty string');
        throw new Error('Результат применения изменений пуст');
      }
      
      // Проверяем, что новый контент не короче оригинального более чем на 90%
      // (это может указывать на ошибку в логике)
      const originalLength = String(fileContent ?? '').length;
      if (originalLength > 100 && newContent.length < originalLength * 0.1) {
        console.error('commitStagedPatches: newContent is suspiciously short', {
          originalLength,
          newLength: newContent.length,
          ratio: newContent.length / originalLength
        });
        throw new Error('Результат применения изменений подозрительно короткий - возможна ошибка в логике');
      }

      const writeRes = await writeFile(filePath, newContent, { backup: true });
      if (!writeRes?.success) {
        throw new Error(writeRes?.error || 'Ошибка записи файла');
      }

      console.log('commitStagedPatches: file written successfully', {
        filePath,
        newContentLength: newContent.length,
        originalLength: String(fileContent ?? '').length
      });

      setFileContent(newContent);
      setRenderVersion((v) => v + 1);
      setChangesLog((prev) => [
        ...entries.map(([blockId, patch]) => ({ ts: Date.now(), filePath, blockId, patch })),
        ...ops.map((o) => ({ ts: Date.now(), filePath, blockId: o.blockId || o.targetId, patch: { op: o.type } })),
        ...prev,
      ]);
      updateStagedPatches({});
      updateStagedOps([]);
      updateHasStagedChanges(false);
      
      console.log('commitStagedPatches: state updated, fileContent will trigger useEffect to update blockMap');
      
      // После сохранения нужно обновить blockMap и editorHTML, так как файл изменился
      // Это произойдет автоматически через useEffect, который зависит от fileContent
    } catch (e) {
      console.error('commitStagedPatches error:', e);
      console.error('commitStagedPatches error stack:', e.stack);
      // Определяем entries и ops для логирования, если они еще не определены
      const entriesForLog = Object.entries(currentStagedPatches || {}).filter(
        ([id, p]) => id && p && Object.keys(p).length > 0
      );
      const opsForLog = Array.isArray(currentStagedOps) ? currentStagedOps : [];
      console.error('commitStagedPatches error details:', {
        filePath,
        fileType,
        entriesCount: entriesForLog.length,
        opsCount: opsForLog.length,
        originalContentLength: String(fileContent ?? '').length,
      });
      setError(`Ошибка применения изменений: ${e.message}`);
      // НЕ сохраняем файл при ошибке - это предотвратит обнуление кода
      return;
    }
  }, [fileContent, fileType, filePath, blockMap, externalStylesMap, updateStagedPatches, updateStagedOps, updateHasStagedChanges]);

  const applyAndCommitPatch = useCallback(
    async (blockId, patch) => {
      if (!blockId) {
        console.warn('applyAndCommitPatch: blockId is missing');
        return;
      }
      console.log('applyAndCommitPatch called:', { blockId, patch });
      
      // Stage текущий patch и сразу планируем коммит с актуальными рефами
      updateStagedPatches((prev) => {
        const next = {
          ...prev,
          [blockId]: { ...(prev?.[blockId] || {}), ...(patch || {}) },
        };
        console.log('applyAndCommitPatch: staged patches updated', {
          blockId,
          patch,
          allPatches: Object.keys(next),
        });
        return next;
      });
      updateHasStagedChanges(true);
      setTimeout(() => {
        commitStagedPatches();
      }, 0);
    },
    [commitStagedPatches, updateStagedPatches, updateHasStagedChanges]
  );

  const handleEditorMessage = useCallback(
    async (event) => {
      const data = event?.nativeEvent?.data;
      if (!isMrpakMessage(data)) return;

      if (data.type === MRPAK_MSG.SELECT) {
        setSelectedBlock({ id: data.id, meta: data.meta });
        return;
      }

      if (data.type === MRPAK_MSG.TREE) {
        if (data.tree) {
          setLayersTree(data.tree);
        }
        return;
      }

      if (data.type === MRPAK_MSG.STYLE_SNAPSHOT) {
        if (data.id) {
          setStyleSnapshots((prev) => ({
            ...prev,
            [data.id]: { inlineStyle: data.inlineStyle || '', computedStyle: data.computedStyle || null },
          }));
        }
        return;
      }

      if (data.type === MRPAK_MSG.TEXT_SNAPSHOT) {
        if (data.id) {
          setTextSnapshots((prev) => ({
            ...prev,
            [data.id]: data.text ?? '',
          }));
        }
        return;
      }

      if (data.type === MRPAK_MSG.APPLY) {
        const id = data.id;
        const patch = data.patch || {};
        if (!id) return;

        // Если из iframe пришло reparent, используем ref на stageReparentBlock
        if (patch.__reparentTo) {
          console.log('handleEditorMessage: reparent detected', { 
            sourceId: id, 
            targetParentId: patch.__reparentTo,
            hasRef: !!stageReparentBlockRef.current 
          });
          if (stageReparentBlockRef.current) {
            stageReparentBlockRef.current({ sourceId: id, targetParentId: patch.__reparentTo });
          } else {
            console.error('handleEditorMessage: stageReparentBlockRef.current is null!');
          }
          return;
        }

        // Не применяем сразу — накапливаем.
        await applyBlockPatch(id, patch);
        return;
      }

      if (data.type === MRPAK_MSG.DROP_TARGET) {
        // пока только подсветка / возможная дальнейшая логика
        return;
      }
    },
    [applyBlockPatch]
  );

  const handleModeChange = useCallback(
    async (nextMode) => {
      // Если уходим с "Редактор" — сначала применяем накопленные изменения
      if (viewMode === 'edit' && nextMode !== 'edit') {
        await commitStagedPatches();
      }
      setViewMode(nextMode);
    },
    [viewMode, commitStagedPatches]
  );

  const handleRenameLayer = useCallback(
    async (mrpakId, name) => {
      try {
        if (!projectRoot || !filePath) return;
        setLayerNames((prev) => ({ ...prev, [mrpakId]: String(name ?? '') }));
        await upsertLayerName({ projectRoot, targetFilePath: filePath, mrpakId, name });
      } catch (e) {
        console.warn('Rename layer failed:', e);
      }
    },
    [projectRoot, filePath]
  );

  const sendIframeCommand = useCallback((cmd) => {
    setIframeCommand({ ...cmd, ts: Date.now() });
  }, []);

  // Создаем framework экземпляр для использования в компоненте
  const framework = useMemo(() => {
    if (!fileType || !filePath || !isFrameworkSupported(fileType)) {
      return null;
    }
    return createFramework(fileType, filePath);
  }, [fileType, filePath]);

  // Добавляет data-no-code-ui-id в HTML/JSX сниппет (в первый открывающий тег), если атрибут ещё не задан.
  // Использует framework.ensureSnippetHasMrpakId, если framework доступен
  const ensureSnippetHasMrpakId = useCallback((snippet, mrpakId) => {
    if (framework) {
      return framework.ensureSnippetHasMrpakId(snippet, mrpakId);
    }
    // Fallback для случаев, когда framework еще не создан
    const s = String(snippet || '').trim();
    if (!s) return s;
    if (/\bdata-no-code-ui-id\s*=/.test(s) || /\bdata-mrpak-id\s*=/.test(s)) return s;
    // Вставляем сразу после имени тега: <Tag ...> / <div ...>
    return s.replace(
      /^<\s*([A-Za-z_$][A-Za-z0-9_$.-]*)\b/,
      `<$1 data-no-code-ui-id="${String(mrpakId)}"`
    );
  }, [framework]);

  const makeTempMrpakId = useCallback(() => {
    return `mrpak:temp:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
  }, []);

  const stageDeleteBlock = useCallback(
    (blockId) => {
      if (!blockId) return;
      const entry = blockMapForFile ? blockMapForFile[blockId] : null;
      updateStagedOps((prev) => [
        ...prev,
        {
          type: 'delete',
          blockId,
          fileType,
          filePath,
          mapEntry: entry || null,
        },
      ]);
      updateHasStagedChanges(true);
      // Локально удаляем в iframe
      sendIframeCommand({ type: MRPAK_CMD.DELETE, id: blockId });
    },
    [blockMapForFile, fileType, filePath, sendIframeCommand, updateStagedOps, updateHasStagedChanges]
  );

  const stageInsertBlock = useCallback(
    ({ targetId, mode, snippet }) => {
      if (!targetId) return;
      const entry = blockMapForFile ? blockMapForFile[targetId] : null;
      const newId = makeTempMrpakId();
      const snippetWithId = ensureSnippetHasMrpakId(snippet, newId);
      updateStagedOps((prev) => [
        ...prev,
        {
          type: 'insert',
          targetId,
          mode: mode === 'sibling' ? 'sibling' : 'child',
          snippet: String(snippetWithId || ''),
          blockId: newId, // чтобы история/патчи могли ссылаться на вставленный элемент
          fileType,
          filePath,
          mapEntry: entry || null,
        },
      ]);
      updateHasStagedChanges(true);
      // Локально вставляем в iframe (html для DOM вставки)
      sendIframeCommand({
        type: MRPAK_CMD.INSERT,
        targetId,
        mode: mode === 'sibling' ? 'sibling' : 'child',
        html: String(snippetWithId || ''),
      });
    },
    [blockMapForFile, ensureSnippetHasMrpakId, fileType, filePath, makeTempMrpakId, sendIframeCommand, updateStagedOps, updateHasStagedChanges, framework]
  );

  const stageReparentBlock = useCallback(
    ({ sourceId, targetParentId }) => {
      console.log('stageReparentBlock called:', { sourceId, targetParentId });
      if (!sourceId || !targetParentId || sourceId === targetParentId) {
        console.log('stageReparentBlock: skipping - invalid ids');
        return;
      }
      const sourceEntry = blockMapForFile ? blockMapForFile[sourceId] : null;
      const targetEntry = blockMapForFile ? blockMapForFile[targetParentId] : null;
      console.log('stageReparentBlock: entries found', { 
        hasSourceEntry: !!sourceEntry, 
        hasTargetEntry: !!targetEntry,
        sourceEntry,
        targetEntry,
        blockMapKeys: Object.keys(blockMapForFile || {}), // все ключи для отладки
        sourceIdInBlockMap: sourceId in (blockMapForFile || {}),
        targetIdInBlockMap: targetParentId in (blockMapForFile || {})
      });
      updateStagedOps((prev) => {
        const newOps = [
          ...prev,
          {
            type: 'reparent',
            sourceId,
            targetParentId,
            fileType,
            filePath,
            mapEntrySource: sourceEntry || null,
            mapEntryTarget: targetEntry || null,
          },
        ];
        console.log('stageReparentBlock: ops updated, count:', newOps.length);
        return newOps;
      });
      updateHasStagedChanges(true);
      console.log('stageReparentBlock: sending iframe command');
      // Локально переносим в iframe
      sendIframeCommand({ type: MRPAK_CMD.REPARENT, sourceId, targetParentId });
    },
    [blockMapForFile, fileType, filePath, sendIframeCommand, updateStagedOps, updateHasStagedChanges]
  );
  
  // Обновляем ref для использования в handleEditorMessage
  stageReparentBlockRef.current = stageReparentBlock;

  const stageSetText = useCallback(
    ({ blockId, text }) => {
      if (!blockId) return;
      const entry = blockMapForFile ? blockMapForFile[blockId] : null;
      updateStagedOps((prev) => [
        ...prev,
        {
          type: 'setText',
          blockId,
          text: String(text ?? ''),
          fileType,
          filePath,
          mapEntry: entry || null,
        },
      ]);
      updateHasStagedChanges(true);
      // Локально применяем в iframe
      sendIframeCommand({ type: MRPAK_CMD.SET_TEXT, id: blockId, text: String(text ?? '') });
    },
    [blockMapForFile, fileType, filePath, sendIframeCommand, updateStagedOps, updateHasStagedChanges]
  );

  // Функция сохранения файла
  const saveFile = useCallback(async (contentToSave = null) => {
    if (!filePath) return;
    
    // Приоритет получения содержимого:
    // 1. Явно переданный contentToSave
    // 2. Текущее значение из редактора (самое актуальное)
    // 3. unsavedContent из состояния
    // 4. fileContent
    let content = contentToSave;
    if (content === null || content === undefined) {
      // Пытаемся получить текущее значение из редактора напрямую
      if (monacoEditorRef?.current) {
        try {
          content = monacoEditorRef.current.getValue();
        } catch (e) {
          console.warn('Failed to get value from editor:', e);
        }
      }
      // Если не удалось получить из редактора, используем состояние
      if (content === null || content === undefined) {
        content = unsavedContent !== null ? unsavedContent : fileContent;
      }
    }
    
    if (content === null || content === undefined) {
      console.warn('saveFile: content is null or undefined');
      return;
    }

    try {
      const writeRes = await writeFile(filePath, content, { backup: true });
        if (writeRes?.success) {
          // Обновляем состояния после успешного сохранения
          setFileContent(content);
          setUnsavedContent(null);
          setIsModified(false);
          
          // Обновляем парсинг импортов стилей для React/React Native файлов
          if (fileType === 'react' || fileType === 'react-native') {
            const imports = parseStyleImports(content);
            setExternalStylesMap(imports);
          }
          
          console.log('RenderFile: File saved successfully, length:', content.length);
        } else {
          setError(`Ошибка сохранения файла: ${writeRes?.error || 'Неизвестная ошибка'}`);
        }
    } catch (e) {
      console.error('Error saving file:', e);
      setError(`Ошибка сохранения файла: ${e.message}`);
    }
  }, [filePath, unsavedContent, fileContent, fileType]);

  // Обработка изменений в редакторе (без автосохранения)
  const handleEditorChange = useCallback((newValue) => {
    setUnsavedContent(newValue);
    setIsModified(true);
  }, []);

  // Обработка Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        if ((isModified || viewMode === 'code') && filePath) {
          // Получаем текущее значение из редактора, если доступно
          let contentToSave = null;
          if (monacoEditorRef?.current) {
            try {
              contentToSave = monacoEditorRef.current.getValue();
            } catch (e) {
              console.warn('Failed to get value from editor in global handler:', e);
            }
          }
          saveFile(contentToSave);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModified, filePath, saveFile, viewMode]);

  const loadFile = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    setFileContent(null);
    setUnsavedContent(null);
    setIsModified(false);

    try {
      console.log('RenderFile: Loading file:', path);
      const result = await readFile(path);
        console.log('RenderFile: File read result:', result);
        
        if (result.success) {
          console.log('RenderFile: File content loaded, length:', result.content?.length);
          setFileContent(result.content);
          setUnsavedContent(null);
          setIsModified(false);
          
          // Парсим импорты стилей для React/React Native файлов
          const type = getFileType(path, result.content);
          if (type === 'react' || type === 'react-native') {
            const imports = parseStyleImports(result.content);
            setExternalStylesMap(imports);
            console.log('RenderFile: Parsed style imports:', imports);
          } else {
            setExternalStylesMap({});
          }
        } else {
          console.error('RenderFile: File read failed:', result.error);
          setError(`Ошибка при чтении файла: ${result.error}`);
        }
    } catch (err) {
      console.error('RenderFile: Exception:', err);
      setError(`Ошибка: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка projectRoot + имён слоёв при входе в редактор
  // ВАЖНО: не включаем findProjectRoot в deps, иначе будет TDZ (findProjectRoot объявлен ниже по файлу).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (viewMode !== 'edit' || !filePath) return;
      try {
        const root = await findProjectRoot(filePath);
        if (cancelled) return;
        setProjectRoot(root);
        if (root) {
          const res = await loadLayerNames({ projectRoot: root, targetFilePath: filePath });
          if (!cancelled && res?.ok) {
            setLayerNames(res.names || {});
          }
        }
      } catch (e) {
        // ignore
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filePath]);

  // Переопределяем тип файла после загрузки содержимого
  useEffect(() => {
    if (fileContent && filePath) {
      const refinedType = getFileType(filePath, fileContent);
      if (refinedType !== fileType) {
        console.log(`RenderFile: Refining file type from ${fileType} to ${refinedType} based on content`);
        setFileType(refinedType);
      }
    }
  }, [fileContent, filePath]); // fileType не включаем в deps, чтобы избежать циклов

  useEffect(() => {
    let currentFilePath = filePath;
    
    if (!filePath) {
      console.log('RenderFile: No file path provided');
      setFileContent(null);
      setFileType(null);
      setError(null);
      setReactHTML('');
      setReactNativeHTML('');
      setIsProcessingReact(false);
      setIsProcessingReactNative(false);
      setUnsavedContent(null);
      setIsModified(false);
      return;
    }

    console.log('RenderFile: File path changed:', filePath);
    // Сначала определяем тип по пути (предварительно)
    // После загрузки файла тип будет уточнён на основе содержимого
    const initialType = getFileType(filePath);
    console.log('RenderFile: Initial file type:', initialType);
    setFileType(initialType);
    setViewMode('preview'); // Сбрасываем режим просмотра при смене файла
    setBlockMap({});
    setBlockMapForFile({});
    setSelectedBlock(null);
    setChangesLog([]);
    setEditorHTML('');
    // Сбрасываем staged изменения через update* для синхронизации рефов
    updateStagedPatches({});
    updateHasStagedChanges(false);
    updateStagedOps([]);
    setLayersTree(null);
    setLayerNames({});
    setProjectRoot(null);
    setIframeCommand(null);
    setUnsavedContent(null);
    setIsModified(false);
    setRenderVersion((v) => v + 1);
    loadFile(filePath);
    
    // Начинаем отслеживание изменений файла
    watchFile(filePath).then((result) => {
      if (result.success) {
        console.log('RenderFile: Started watching file:', filePath);
      } else {
        console.warn('RenderFile: Failed to watch file:', result.error);
      }
    });
    
    // Обработчик изменений файла
    const handleFileChanged = (changedFilePath) => {
      if (changedFilePath === currentFilePath) {
        console.log('RenderFile: File changed, reloading:', changedFilePath);
        // Небольшая задержка для гарантии, что файл записан
        setTimeout(() => {
          loadFile(changedFilePath);
        }, 100);
      }
    };
    
    // Подписываемся на события изменения файла
    const unsubscribe = onFileChanged(handleFileChanged);

    // Cleanup: останавливаем отслеживание при размонтировании или смене файла
    return () => {
      // Отписываемся от событий
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
      
      // Останавливаем watcher
      if (currentFilePath) {
        unwatchFile(currentFilePath);
        console.log('RenderFile: Stopped watching file:', currentFilePath);
      }
    };
  }, [filePath, loadFile, updateStagedPatches, updateHasStagedChanges, updateStagedOps]);

  // Обработка React файлов с зависимостями
  useEffect(() => {
    if (fileType === 'react' && fileContent && filePath) {
      const generateHTML = async () => {
        setIsProcessingReact(true);
        try {
          console.log('RenderFile: Rendering React file, content length:', fileContent.length);
          const framework = createFramework('react', filePath);
          const result = await framework.generateHTML(fileContent, filePath, { viewMode });
          console.log('RenderFile: Generated React HTML length:', result.html.length);
          console.log('RenderFile: Dependency paths:', result.dependencyPaths);
          setReactHTML(result.html);
          setBlockMap(result.blockMapForEditor || result.blockMap || {});
          setBlockMapForFile(result.blockMapForFile || {});
          setDependencyPaths(result.dependencyPaths); // Сохраняем пути зависимостей
        } catch (error) {
          console.error('RenderFile: Error generating HTML:', error);
          setReactHTML(`<html><body><div class="error">Ошибка обработки: ${error.message}</div></body></html>`);
          setDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingReact(false);
        }
      };
      generateHTML();
    } else {
      setReactHTML('');
      setIsProcessingReact(false);
      setDependencyPaths([]);
    }
  }, [fileType, fileContent, filePath, viewMode]);

  // Обработка React Native файлов с зависимостями
  useEffect(() => {
    if (fileType === 'react-native' && fileContent && filePath) {
      const generateHTML = async () => {
        setIsProcessingReactNative(true);
        try {
          console.log('RenderFile: Rendering React Native file, content length:', fileContent.length);
          const framework = createFramework('react-native', filePath);
          const result = await framework.generateHTML(fileContent, filePath, { viewMode });
          console.log('RenderFile: Generated React Native HTML length:', result.html.length);
          console.log('RenderFile: Dependency paths:', result.dependencyPaths);
          setReactNativeHTML(result.html);
          setBlockMap(result.blockMapForEditor || result.blockMap || {});
          setBlockMapForFile(result.blockMapForFile || {});
          setDependencyPaths(result.dependencyPaths); // Сохраняем пути зависимостей
        } catch (error) {
          console.error('RenderFile: Error generating HTML:', error);
          setReactNativeHTML(`<html><body><div class="error">Ошибка обработки: ${error.message}</div></body></html>`);
          setDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingReactNative(false);
        }
      };
      generateHTML();
    } else {
      setReactNativeHTML('');
      setIsProcessingReactNative(false);
      setDependencyPaths([]);
    }
  }, [fileType, fileContent, filePath, viewMode]);

  // Отслеживание изменений зависимых файлов
  useEffect(() => {
    if (!filePath || dependencyPaths.length === 0) {
      return;
    }

    console.log('RenderFile: Setting up watchers for dependencies:', dependencyPaths);

    const watchers = [];
    const unsubscribers = [];

    // Создаем обработчик изменений зависимого файла
    const handleDependencyChanged = (changedFilePath) => {
      console.log('RenderFile: Dependency file changed:', changedFilePath);
      console.log('RenderFile: Reloading main file:', filePath);
      // Перезагружаем основной файл при изменении зависимости
      if (loadFile) {
        loadFile(filePath);
      }
    };

    // Подписываемся на изменения всех зависимых файлов
    dependencyPaths.forEach((depPath) => {
      // Начинаем отслеживание каждого зависимого файла
      watchFile(depPath).then((result) => {
        if (result.success) {
          console.log('RenderFile: Started watching dependency:', depPath);
        } else {
          console.warn('RenderFile: Failed to watch dependency:', depPath, result.error);
        }
      });

      // Подписываемся на события изменения (глобальный обработчик, который проверит путь)
      const unsubscribe = onFileChanged((changedFilePath) => {
        if (changedFilePath === depPath) {
          handleDependencyChanged(changedFilePath);
        }
      });
      unsubscribers.push(unsubscribe);
    });

    // Cleanup: останавливаем отслеживание всех зависимых файлов
    return () => {
      console.log('RenderFile: Cleaning up dependency watchers');
      
      // Отписываемся от событий
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });

      // Останавливаем watchers
      dependencyPaths.forEach((depPath) => {
        unwatchFile(depPath);
      });
    };
  }, [dependencyPaths, filePath, loadFile]);

  // Извлекаем все импорты из кода
  // extractImports теперь импортируется из модуля

  // findProjectRoot и resolvePath теперь импортируются из модуля
  const findProjectRootMemo = useCallback(findProjectRoot, []);
  const resolvePathMemo = useCallback(resolvePath, []);

  // Загружаем зависимый файл относительно основного файла
  const loadDependency = useCallback(async (basePath, importPath) => {
    try {
      // Разрешаем путь к зависимому файлу (теперь асинхронно для поддержки @ путей)
      let resolvedPath = await resolvePathMemo(basePath, importPath);
      
      // Если файл без расширения, пробуем добавить .js, .jsx, .css и т.д.
      const extMatch = resolvedPath.match(/\.([^.]+)$/);
      if (!extMatch) {
        const tryPaths = [
          resolvedPath + '.js',
          resolvedPath + '.jsx',
          resolvedPath + '.css',
          resolvedPath + '/index.js',
          resolvedPath + '/index.jsx'
        ];
        
        for (const tryPath of tryPaths) {
          try {
            const result = await readFile(tryPath);
            if (result.success) {
              return { success: true, content: result.content, path: tryPath };
            }
          } catch (e) {
            // Пробуем следующий путь
          }
        }
      } else {
        // Прямой путь с расширением
        const result = await readFile(resolvedPath);
        if (result.success) {
          return { success: true, content: result.content, path: resolvedPath };
        }
      }
      
      return { success: false, error: `Файл не найден: ${importPath}` };
    } catch (error) {
      console.error('RenderFile: Error loading dependency:', error);
      return { success: false, error: error.message };
    }
  }, [resolvePathMemo]);

  // Функция для обработки HTML с загрузкой зависимостей
  const processHTMLWithDependencies = useCallback(async (htmlContent, basePath) => {
    const dependencyPaths = [];
    let processedHTML = htmlContent;

    // Регулярные выражения для поиска внешних зависимостей
    const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const imgSrcRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const linkHrefRegex = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;

    // Обработка CSS файлов
    const cssMatches = [...htmlContent.matchAll(cssLinkRegex)];
    for (const match of cssMatches) {
      const cssPath = match[1];
      // Пропускаем внешние URL
      if (cssPath.startsWith('http://') || cssPath.startsWith('https://') || cssPath.startsWith('//')) {
        continue;
      }
      
      const depResult = await loadDependency(basePath, cssPath);
      if (depResult.success) {
        dependencyPaths.push(depResult.path);
        // Заменяем link на style с встроенным CSS
        const styleTag = `<style>\n/* ${cssPath} */\n${depResult.content}\n</style>`;
        processedHTML = processedHTML.replace(match[0], styleTag);
        console.log('RenderFile: Inlined CSS:', cssPath);
      } else {
        console.warn('RenderFile: Failed to load CSS:', cssPath, depResult.error);
      }
    }

    // Обработка внешних JS файлов (не модулей)
    const scriptMatches = [...htmlContent.matchAll(scriptSrcRegex)];
    for (const match of scriptMatches) {
      const scriptPath = match[1];
      // Пропускаем внешние URL и CDN
      if (scriptPath.startsWith('http://') || scriptPath.startsWith('https://') || scriptPath.startsWith('//')) {
        continue;
      }
      
      const depResult = await loadDependency(basePath, scriptPath);
      if (depResult.success) {
        dependencyPaths.push(depResult.path);
        // Заменяем script src на встроенный script
        const scriptTag = `<script>\n/* ${scriptPath} */\n${depResult.content}\n</script>`;
        processedHTML = processedHTML.replace(match[0], scriptTag);
        console.log('RenderFile: Inlined JS:', scriptPath);
      } else {
        console.warn('RenderFile: Failed to load JS:', scriptPath, depResult.error);
      }
    }

    // Обработка изображений (конвертируем в base64 для локальных файлов)
    const imgMatches = [...htmlContent.matchAll(imgSrcRegex)];
    for (const match of imgMatches) {
      const imgPath = match[1];
      // Пропускаем внешние URL и data: URLs
      if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('//') || imgPath.startsWith('data:')) {
        continue;
      }
      
      // Разрешаем путь к изображению
      const resolvedPath = await resolvePathMemo(basePath, imgPath);
      
      // Читаем изображение как base64
      try {
        const result = await readFileBase64(resolvedPath);
        if (result.success) {
          dependencyPaths.push(resolvedPath);
          // Заменяем путь на data URL
          const dataUrl = `data:${result.mimeType};base64,${result.base64}`;
          processedHTML = processedHTML.replace(match[1], dataUrl);
          console.log('RenderFile: Converted image to base64:', imgPath);
        } else {
          console.warn('RenderFile: Failed to load image:', imgPath, result.error);
        }
      } catch (e) {
        console.warn('RenderFile: Could not process image:', imgPath, e);
      }
    }

    return { html: processedHTML, dependencyPaths };
  }, [loadDependency, resolvePathMemo]);

  // Обработка HTML файлов с зависимостями
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:1155',message:'HTML useEffect hook called',data:{fileType,hasFileContent:!!fileContent,hasFilePath:!!filePath},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (fileType === 'html' && fileContent && filePath) {
      const processHTML = async () => {
        setIsProcessingHTML(true);
        try {
          console.log('RenderFile: Processing HTML with dependencies');
          const framework = createFramework('html', filePath);
          const result = await framework.generateHTML(fileContent, filePath, { viewMode });
          setProcessedHTML(result.html);
          setHtmlDependencyPaths(result.dependencyPaths);
          setBlockMap(result.blockMapForEditor || {});
          setBlockMapForFile(result.blockMapForFile || {});
          console.log('RenderFile: HTML processed, dependencies:', result.dependencyPaths);
        } catch (error) {
          console.error('RenderFile: Error processing HTML:', error);
          setProcessedHTML(fileContent); // Fallback на оригинальный HTML
          setHtmlDependencyPaths([]);
          setBlockMapForFile({});
        } finally {
          setIsProcessingHTML(false);
        }
      };
      processHTML();
    } else {
      setProcessedHTML('');
      setHtmlDependencyPaths([]);
      setIsProcessingHTML(false);
    }
  }, [fileType, fileContent, filePath, viewMode]);

  // Отслеживание изменений зависимых файлов для HTML
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:1182',message:'HTML dependencies useEffect hook called',data:{fileType,hasFilePath:!!filePath,dependencyPathsCount:htmlDependencyPaths.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!filePath || htmlDependencyPaths.length === 0 || fileType !== 'html') {
      return;
    }

    console.log('RenderFile: Setting up watchers for HTML dependencies:', htmlDependencyPaths);

    const unsubscribers = [];

    const handleDependencyChanged = (changedFilePath) => {
      console.log('RenderFile: HTML dependency file changed:', changedFilePath);
      // Перезагружаем HTML файл при изменении зависимости
      // Используем текущий filePath из замыкания
      const currentPath = filePath;
      if (window.electronAPI && window.electronAPI.readFile) {
        window.electronAPI.readFile(currentPath).then((result) => {
          if (result.success) {
            setFileContent(result.content);
          }
        });
      }
    };

    if (window.electronAPI && window.electronAPI.watchFile && window.electronAPI.onFileChanged) {
      htmlDependencyPaths.forEach((depPath) => {
        window.electronAPI.watchFile(depPath).then((result) => {
          if (result.success) {
            console.log('RenderFile: Started watching HTML dependency:', depPath);
          }
        });

        const unsubscribe = window.electronAPI.onFileChanged((changedFilePath) => {
          if (changedFilePath === depPath) {
            handleDependencyChanged(changedFilePath);
          }
        });
        unsubscribers.push(unsubscribe);
      });
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });

      htmlDependencyPaths.forEach((depPath) => {
        if (window.electronAPI && window.electronAPI.unwatchFile) {
          window.electronAPI.unwatchFile(depPath);
        }
      });
    };
  }, [htmlDependencyPaths, filePath, fileType]);

  // Подготовка HTML для режима "Редактор"
  useEffect(() => {
    if (viewMode !== 'edit') {
      setEditorHTML('');
      return;
    }

    try {
      if (fileType === 'html') {
        const base = processedHTML || fileContent || '';
        const inst = instrumentHtml(base, filePath);
        setBlockMap(inst.map || {});
        setBlockMapForFile(inst.map || {});
        // Передаем режим в скрипт блочного редактора
        setEditorHTML(injectBlockEditorScript(inst.html, 'html', viewMode === 'edit' ? 'edit' : 'preview'));
        return;
      }

      if (fileType === 'react' && reactHTML) {
        // Для React файлов blockMap уже установлен при генерации reactHTML через createReactHTML
        // Используем готовый blockMap, который содержит правильные позиции для обработанного кода
        // Передаем режим в скрипт блочного редактора
        setEditorHTML(injectBlockEditorScript(reactHTML, 'react', viewMode === 'edit' ? 'edit' : 'preview'));
        return;
      }

      if (fileType === 'react-native' && reactNativeHTML) {
        // Для React Native файлов blockMap уже установлен при генерации reactNativeHTML через createReactNativeHTML
        // Используем готовый blockMap, который содержит правильные позиции для обработанного кода
        // Передаем режим в скрипт блочного редактора
        setEditorHTML(injectBlockEditorScript(reactNativeHTML, 'react-native', viewMode === 'edit' ? 'edit' : 'preview'));
        return;
      }
    } catch (e) {
      console.warn('RenderFile: Failed to prepare editor HTML:', e);
      setEditorHTML('');
    }
  }, [
    viewMode,
    fileType,
    filePath,
    fileContent,
    processedHTML,
    reactHTML,
    reactNativeHTML,
    injectBlockEditorScript,
  ]);

  // resolvePathSync теперь импортируется из модуля

  // Вспомогательная функция для поиска модуля по различным путям
  // Синхронная версия, использует уже разрешенные пути из pathMap
  const findModulePath = (importPath, basePath, pathMap, dependencyModules) => {
    // Пробуем найти по оригинальному пути (включая @ пути, которые уже разрешены)
    if (pathMap[importPath]) {
      return pathMap[importPath];
    }
    
    // Ищем в dependencyModules
    if (dependencyModules[importPath]) {
      return dependencyModules[importPath];
    }
    
    // Разрешаем относительный путь синхронно (для путей без @)
    if (!importPath.startsWith('@/') && !importPath.startsWith('http')) {
      const resolvedPath = resolvePathSync(basePath, importPath);
      
      console.log('RenderFile: findModulePath resolving:', {
        importPath,
        basePath,
        resolvedPath,
        pathMapHasResolved: !!pathMap[resolvedPath],
        pathMapKeys: Object.keys(pathMap).filter(k => k.includes(importPath) || k.includes(resolvedPath.split('/').pop())).slice(0, 5)
      });
      
      // Пробуем найти по разрешенному пути
      if (pathMap[resolvedPath]) {
        return pathMap[resolvedPath];
      }
      
      if (dependencyModules[resolvedPath]) {
        return dependencyModules[resolvedPath];
      }
      
      // Извлекаем имя файла из разрешенного пути для более гибкого поиска
      const fileName = resolvedPath.split('/').pop().replace(/\.(js|jsx|ts|tsx)$/, '');
      const pathWithoutExt = resolvedPath.replace(/\.(js|jsx|ts|tsx)$/, '');
      const lastPart = resolvedPath.split('/').slice(-2).join('/'); // Последние 2 части пути
      
      // Также пробуем найти по разрешенному пути в ключах
      // Нормализуем пути для сравнения (убираем начальные/конечные слеши)
      const normalizedResolved = resolvedPath.replace(/^\/+|\/+$/g, '');
      const normalizedPathWithoutExt = pathWithoutExt.replace(/^\/+|\/+$/g, '');
      const normalizedLastPart = lastPart.replace(/^\/+|\/+$/g, '');
      
      // Ищем по всем значениям в pathMap (абсолютным путям)
      for (const [key, value] of Object.entries(pathMap)) {
        const normalizedKey = key.replace(/^\/+|\/+$/g, '');
        const normalizedValue = String(value).replace(/^\/+|\/+$/g, '');
        
        // Точное совпадение
        if (normalizedKey === normalizedResolved || normalizedKey === normalizedPathWithoutExt) {
          return value;
        }
        
        // Проверяем, заканчивается ли ключ или значение на разрешенный путь
        if (normalizedKey.endsWith('/' + normalizedResolved) || 
            normalizedResolved.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedKey)) {
          return value;
        }
        
        // Проверяем значение (абсолютный путь)
        if (normalizedValue.endsWith('/' + normalizedResolved) || 
            normalizedResolved.endsWith('/' + normalizedValue) ||
            normalizedValue.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedValue) ||
            normalizedValue.includes('/' + fileName + '.') ||
            normalizedValue.endsWith('/' + normalizedLastPart) ||
            normalizedLastPart.endsWith('/' + normalizedValue)) {
          return value;
        }
        
        // Проверяем по имени файла
        if (normalizedKey.includes('/' + fileName) || normalizedValue.includes('/' + fileName + '.')) {
          return value;
        }
      }
      
      // Пробуем найти в dependencyModules по разрешенному пути
      for (const [key, value] of Object.entries(dependencyModules)) {
        const normalizedKey = String(key).replace(/^\/+|\/+$/g, '');
        if (normalizedKey === normalizedResolved || 
            normalizedKey === normalizedPathWithoutExt ||
            normalizedKey.endsWith('/' + normalizedResolved) ||
            normalizedResolved.endsWith('/' + normalizedKey) ||
            normalizedKey.endsWith('/' + normalizedPathWithoutExt) ||
            normalizedPathWithoutExt.endsWith('/' + normalizedKey) ||
            normalizedKey.includes('/' + fileName) ||
            normalizedKey.endsWith('/' + normalizedLastPart)) {
          return value;
        }
      }
      
      // Последняя попытка: ищем по всем значениям в pathMap, которые заканчиваются на имя файла
      for (const [key, value] of Object.entries(pathMap)) {
        const valueStr = String(value);
        if (valueStr.includes(fileName + '.js') || valueStr.includes(fileName + '.jsx') || 
            valueStr.endsWith('/' + fileName) || valueStr.endsWith('/' + fileName + '.js') ||
            valueStr.endsWith('/' + fileName + '.jsx')) {
          // Проверяем, что это действительно нужный файл по последним частям пути
          const valueParts = valueStr.split('/');
          const resolvedParts = resolvedPath.split('/');
          if (valueParts.length >= 2 && resolvedParts.length >= 2) {
            const valueLast2 = valueParts.slice(-2).join('/');
            const resolvedLast2 = resolvedParts.slice(-2).join('/');
            if (valueLast2 === resolvedLast2 || valueLast2.endsWith(resolvedLast2) || resolvedLast2.endsWith(valueLast2)) {
              console.log(`[findModulePath] Found by value matching: ${importPath} -> ${value} (key: ${key})`);
              return value;
            }
          }
        }
      }
      
      // Еще одна попытка: ищем по всем ключам, которые содержат последние части пути
      const resolvedParts = resolvedPath.split('/');
      if (resolvedParts.length >= 2) {
        const targetLast2 = resolvedParts.slice(-2).join('/');
        const targetLast2NoExt = targetLast2.replace(/\.(js|jsx|ts|tsx)$/, '');
        
        for (const [key, value] of Object.entries(pathMap)) {
          const keyStr = String(key);
          const valueStr = String(value);
          
          // Проверяем, содержит ли ключ или значение последние части пути
          if (keyStr.includes(targetLast2) || keyStr.includes(targetLast2NoExt) ||
              valueStr.includes(targetLast2) || valueStr.includes(targetLast2NoExt) ||
              keyStr.endsWith(targetLast2) || keyStr.endsWith(targetLast2NoExt) ||
              valueStr.endsWith(targetLast2) || valueStr.endsWith(targetLast2NoExt)) {
            // Проверяем, что это действительно нужный файл
            const valueParts = valueStr.split('/');
            if (valueParts.length >= 2) {
              const valueLast2 = valueParts.slice(-2).join('/');
              if (valueLast2 === targetLast2 || valueLast2 === targetLast2NoExt ||
                  valueLast2.endsWith(targetLast2) || targetLast2.endsWith(valueLast2)) {
                console.log(`[findModulePath] Found by last parts matching: ${importPath} -> ${value} (key: ${key})`);
                return value;
              }
            }
          }
        }
      }
    }
    
    // Если путь с @, пробуем найти его разрешенную версию
    if (importPath.startsWith('@/')) {
      // Ищем все ключи, которые могут соответствовать этому @ пути
      for (const [key, value] of Object.entries(pathMap)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
      // Также ищем в dependencyModules
      for (const [key, value] of Object.entries(dependencyModules)) {
        if (key.includes(importPath.substring(2)) || value.includes(importPath.substring(2))) {
          return value;
        }
      }
    }
    
    console.warn('RenderFile: findModulePath failed to find:', {
      importPath,
      basePath,
      resolvedPath: !importPath.startsWith('@/') && !importPath.startsWith('http') ? resolvePathSync(basePath, importPath) : 'N/A'
    });
    
    // Возвращаем оригинальный путь как fallback
    return importPath;
  };

  // Рекурсивная функция для загрузки всех зависимостей
  const loadAllDependencies = async (importPath, basePath, loadedDeps = new Set(), dependencyMap = {}, dependencyPaths = [], pathMap = {}, actualPathMap = {}) => {
    const baseFileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';
    
    console.log(`[LoadAllDependencies] Starting to load dependency:`, {
      importPath,
      fromFile: baseFileName,
      basePath,
      alreadyLoaded: loadedDeps.has(importPath)
    });
    
    // Разрешаем путь (теперь асинхронно для поддержки @ путей)
    const resolvedPath = await resolvePathMemo(basePath, importPath);
    
    console.log(`[LoadAllDependencies] Resolved path:`, {
      importPath,
      fromFile: baseFileName,
      resolvedPath
    });
    
    // Используем абсолютный путь как ключ для предотвращения дублирования
    if (loadedDeps.has(resolvedPath)) {
      // Если файл уже загружен, добавляем только маппинг относительного пути
      console.log(`[LoadAllDependencies] Dependency already loaded: ${importPath} (resolved: ${resolvedPath}) from ${baseFileName}`);
      pathMap[importPath] = resolvedPath;
      return { pathMap, actualPathMap };
    }
    loadedDeps.add(resolvedPath);
    
    // Загружаем зависимость по разрешенному пути
    const depResult = await loadDependency(basePath, importPath);
    if (!depResult.success) {
      console.warn(`[LoadAllDependencies] Failed to load dependency from ${baseFileName}:`, {
        importPath,
        resolvedPath,
        error: depResult.error,
        fromFile: baseFileName
      });
      return { pathMap, actualPathMap };
    }
    
    console.log(`[LoadAllDependencies] Successfully loaded file:`, {
      importPath,
      resolvedPath,
      actualPath: depResult.path,
      fromFile: baseFileName,
      contentLength: depResult.content?.length || 0
    });
    
    // Сохраняем фактический путь файла для разрешенного пути
    actualPathMap[resolvedPath] = depResult.path;
    actualPathMap[depResult.path] = depResult.path;
    
    // Сохраняем по абсолютному пути как основному ключу
    dependencyMap[resolvedPath] = depResult.content;
    dependencyPaths.push(depResult.path);
    
    // Сохраняем маппинг: относительный путь -> абсолютный путь
    pathMap[importPath] = resolvedPath;
    // Также сохраняем маппинг разрешенного пути (если он отличается от фактического пути файла)
    if (resolvedPath !== depResult.path) {
      pathMap[resolvedPath] = depResult.path;
    }
    // Сохраняем маппинг фактического пути файла к самому себе
    pathMap[depResult.path] = depResult.path;
    
    // Для относительных путей также сохраняем разрешенный путь как ключ
    // Это поможет найти модуль, когда мы разрешаем относительный путь в findModulePath
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Разрешаем путь синхронно для сохранения маппинга
      const syncResolved = resolvePathSync(basePath, importPath);
      if (syncResolved !== resolvedPath && syncResolved !== depResult.path && !pathMap[syncResolved]) {
        pathMap[syncResolved] = depResult.path;
      }
      // Также сохраняем путь без расширения
      const syncResolvedNoExt = syncResolved.replace(/\.(js|jsx|ts|tsx)$/, '');
      if (syncResolvedNoExt !== syncResolved && syncResolvedNoExt !== depResult.path && !pathMap[syncResolvedNoExt]) {
        pathMap[syncResolvedNoExt] = depResult.path;
      }
      // Сохраняем последние 2 части пути (например, styles/commonStyles)
      const pathParts = syncResolved.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        if (last2Parts !== syncResolved && last2Parts !== depResult.path && !pathMap[last2Parts]) {
          pathMap[last2Parts] = depResult.path;
        }
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx)$/, '');
        if (last2PartsNoExt !== last2Parts && last2PartsNoExt !== depResult.path && !pathMap[last2PartsNoExt]) {
          pathMap[last2PartsNoExt] = depResult.path;
        }
      }
    }
    
    // Также сохраняем путь без расширения для фактического пути файла
    const depPathNoExt = depResult.path.replace(/\.(js|jsx|ts|tsx)$/, '');
    if (depPathNoExt !== depResult.path && !pathMap[depPathNoExt]) {
      pathMap[depPathNoExt] = depResult.path;
    }
    
    // Сохраняем последние 2 части фактического пути файла
    const depPathParts = depResult.path.split('/');
    if (depPathParts.length >= 2) {
      const depLast2Parts = depPathParts.slice(-2).join('/');
      if (depLast2Parts !== depResult.path && !pathMap[depLast2Parts]) {
        pathMap[depLast2Parts] = depResult.path;
      }
      const depLast2PartsNoExt = depLast2Parts.replace(/\.(js|jsx|ts|tsx)$/, '');
      if (depLast2PartsNoExt !== depLast2Parts && depLast2PartsNoExt !== depResult.path && !pathMap[depLast2PartsNoExt]) {
        pathMap[depLast2PartsNoExt] = depResult.path;
      }
    }
    
    console.log('RenderFile: Saved path mappings for:', {
      importPath,
      resolvedPath,
      actualPath: depResult.path,
      savedKeys: Object.keys(pathMap).filter(k => pathMap[k] === depResult.path).slice(0, 10)
    });
    
    // Извлекаем импорты из загруженной зависимости
    const depFileName = depResult.path.split('/').pop() || depResult.path.split('\\').pop() || 'unknown';
    const depImports = extractImports(depResult.content, depFileName);
    
    console.log(`[LoadAllDependencies] Found ${depImports.length} imports in ${depFileName}:`, {
      file: depResult.path,
      fileName: depFileName,
      imports: depImports.map(i => ({ path: i.path, line: i.line }))
    });
    
    // Рекурсивно загружаем зависимости зависимостей
    const depBasePath = depResult.path; // Используем фактический путь файла как базовый
    for (const depImp of depImports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      // Теперь обрабатываем локальные импорты, включая @ пути
      if ((depImp.path.startsWith('react') && !depImp.path.startsWith('react/') && !depImp.path.startsWith('@')) || 
          depImp.path.startsWith('react-native') || 
          depImp.path.startsWith('http')) {
        console.log(`[LoadAllDependencies] Skipping external library in ${depFileName}: ${depImp.path}`);
        continue;
      }
      
      console.log(`[LoadAllDependencies] Recursively loading dependency from ${depFileName}:`, {
        importPath: depImp.path,
        fromFile: depFileName,
        importLine: depImp.line,
        basePath: depBasePath
      });
      
      // Рекурсивно загружаем с правильным базовым путем (фактический путь файла)
      const result = await loadAllDependencies(depImp.path, depBasePath, loadedDeps, dependencyMap, dependencyPaths, pathMap, actualPathMap);
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[LoadAllDependencies] Successfully loaded recursive dependency: ${depImp.path} from ${depFileName}`);
      } else {
        console.warn(`[LoadAllDependencies] Failed to load recursive dependency: ${depImp.path} from ${depFileName}`);
      }
    }
    
    return { pathMap, actualPathMap };
  };

  // Обрабатываем код React файла с поддержкой зависимостей
  const processReactCode = async (code, basePath) => {
    // Извлекаем импорты
    const fileName = basePath.split('/').pop() || basePath.split('\\').pop() || 'unknown';
    const imports = extractImports(code, fileName);
    console.log(`[ProcessReactCode] Processing file: ${fileName}`, {
      file: basePath,
      fileName,
      importsCount: imports.length,
      imports: imports.map(i => ({ path: i.path, line: i.line }))
    });
    
    const dependencies = {};
    const dependencyModules = {};
    const dependencyPaths = []; // Массив путей к зависимым файлам
    const loadedDeps = new Set(); // Для предотвращения циклических зависимостей
    const pathMap = {}; // Маппинг: относительный путь -> абсолютный путь
    const actualPathMap = {}; // Маппинг: разрешенный путь -> фактический путь файла
    
    // Загружаем все зависимости рекурсивно
    for (const imp of imports) {
      // Пропускаем только внешние библиотеки (npm пакеты)
      // Теперь обрабатываем локальные импорты, включая @ пути
      if (imp.path.startsWith('react') && !imp.path.startsWith('react/') && 
          !imp.path.startsWith('react-dom') && 
          !imp.path.startsWith('react-native') && 
          !imp.path.startsWith('http')) {
        console.log(`[ProcessReactCode] Skipping external library: ${imp.path} from ${fileName}`);
        continue;
      }
      
      console.log(`[ProcessReactCode] Loading dependency from ${fileName}:`, {
        sourceFile: fileName,
        importPath: imp.path,
        importLine: imp.line,
        basePath
      });
      
      const result = await loadAllDependencies(imp.path, basePath, loadedDeps, dependencies, dependencyPaths, pathMap, actualPathMap);
      // Объединяем результаты
      if (result) {
        Object.assign(pathMap, result.pathMap);
        Object.assign(actualPathMap, result.actualPathMap);
        console.log(`[ProcessReactCode] Successfully loaded dependency: ${imp.path} from ${fileName}`);
      } else {
        console.warn(`[ProcessReactCode] Failed to load dependency: ${imp.path} from ${fileName}`);
      }
    }
    
    // Используем pathMap для заполнения dependencyModules
    // Основной ключ - абсолютный путь, но также сохраняем маппинг относительных путей
    for (const [relativePath, absolutePath] of Object.entries(pathMap)) {
      // Сохраняем маппинг относительного пути к абсолютному
      dependencyModules[relativePath] = absolutePath;
      // Также сохраняем абсолютный путь как ключ (если он еще не сохранен)
      if (!dependencyModules[absolutePath]) {
        dependencyModules[absolutePath] = absolutePath;
      }
    }
    
    // Обрабатываем код - удаляем импорты React, но сохраняем локальные
    // Сначала сохраняем информацию о default export перед удалением
    let defaultExportInfo = null;
    const defaultExportMatch = code.match(/export\s+default\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (defaultExportMatch) {
      defaultExportInfo = {
        name: defaultExportMatch[1],
        type: 'default-export'
      };
    }
    
    let processedCode = code
      // Удаляем import React from 'react'
      .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')
      // Удаляем import { ... } from 'react'
      .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')
      // Удаляем export default, оставляем только определение
      .replace(/export\s+default\s+/g, '')
      .trim();
    
    // Создаем код для модулей зависимостей
    let modulesCode = '';
    let importReplacements = {};
    
    // Собираем уникальные абсолютные пути из pathMap
    const uniqueAbsolutePaths = new Set(Object.values(pathMap));
    const processedDeps = new Set(); // Для отслеживания уже обработанных абсолютных путей
    
    // Собираем информацию о зависимостях каждого модуля для сортировки
    const moduleDependencies = new Map(); // absolutePath -> Set of absolute paths of dependencies
    
    // Сначала собираем зависимости для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }
      
      const content = dependencies[absolutePath] || (() => {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            return dependencies[relPath];
          }
        }
        return null;
      })();
      
      if (!content) continue;
      
      // Извлекаем импорты из модуля
      const depImports = extractImports(content, absolutePath);
      const depSet = new Set();
      
      for (const imp of depImports) {
        // Пропускаем внешние библиотеки
        if (!imp.path.startsWith('.') && !imp.path.startsWith('/') && !imp.path.startsWith('@')) {
          continue;
        }
        
        // Находим абсолютный путь зависимости
        const depResolvedPath = pathMap[imp.path] || dependencyModules[imp.path];
        if (depResolvedPath && uniqueAbsolutePaths.has(depResolvedPath)) {
          depSet.add(depResolvedPath);
        }
      }
      
      moduleDependencies.set(absolutePath, depSet);
    }
    
    // Топологическая сортировка модулей по зависимостям
    const sortedModules = [];
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (modulePath) => {
      if (visiting.has(modulePath)) {
        // Циклическая зависимость - пропускаем
        return;
      }
      if (visited.has(modulePath)) {
        return;
      }
      
      visiting.add(modulePath);
      const deps = moduleDependencies.get(modulePath) || new Set();
      for (const dep of deps) {
        if (uniqueAbsolutePaths.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(modulePath);
      visited.add(modulePath);
      sortedModules.push(modulePath);
    };
    
    // Запускаем топологическую сортировку
    for (const absolutePath of uniqueAbsolutePaths) {
      if (!visited.has(absolutePath)) {
        visit(absolutePath);
      }
    }
    
    console.log('RenderFile: Sorted modules by dependencies:', sortedModules.map(p => p.split('/').pop()));
    
    // Обрабатываем каждую зависимость в отсортированном порядке
    processedDeps.clear(); // Сбрасываем для повторного использования
    for (const absolutePath of sortedModules) {
      if (processedDeps.has(absolutePath)) {
        continue;
      }
      processedDeps.add(absolutePath);
      
      // Получаем контент по абсолютному пути
      let content = dependencies[absolutePath];
      // Если не найдено по абсолютному пути, ищем по относительному из pathMap
      if (!content) {
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === absolutePath) {
            content = dependencies[relPath];
            if (content) break;
          }
        }
      }
      
      if (!content) {
        continue;
      }
      
      // Используем абсолютный путь как основной ключ для обработки
      const importPath = absolutePath;
      // Обрабатываем зависимость
      // Сначала извлекаем все экспорты
      let moduleExports = {};
      let hasDefaultExport = false;
      let defaultExportName = null;
      const namedExports = [];
      
      // Получаем фактический путь файла для текущей зависимости (для разрешения относительных путей)
      // Используем actualPathMap для получения фактического пути файла
      const currentDepResolvedPath = dependencyModules[importPath] || importPath;
      const currentDepActualPath = actualPathMap[currentDepResolvedPath] || currentDepResolvedPath;
      const currentDepBasePath = currentDepActualPath.substring(0, currentDepActualPath.lastIndexOf('/'));
      
      // Отладочная информация
      console.log('RenderFile: Processing dependency:', {
        importPath,
        currentDepResolvedPath,
        currentDepActualPath,
        currentDepBasePath,
        pathMapKeys: Object.keys(pathMap).slice(0, 10) // Первые 10 ключей для отладки
      });
      
      // Обрабатываем экспорты
      let processedDep = content;
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:605',message:'Processing dependency before removing imports',data:{importPath,contentLength:processedDep.length,hasImports:processedDep.includes('import'),hasExports:processedDep.includes('export')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // СНАЧАЛА обрабатываем экспорты, ПОТОМ удаляем импорты
      // Named exports: export const/let/var (обрабатываем ДО удаления импортов)
      const namedConstExports = [];
      processedDep = processedDep.replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, (match, keyword, name) => {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:612',message:'Found named export const',data:{importPath,name,keyword},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        namedConstExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `${keyword} ${name} =`;
      });
      
      // Named exports: export function (обрабатываем ДО удаления импортов)
      const namedFunctionExports = [];
      processedDep = processedDep.replace(/export\s+function\s+(\w+)/g, (match, name) => {
        namedFunctionExports.push(name);
        if (!namedExports.includes(name)) {
          namedExports.push(name);
        }
        return `function ${name}`;
      });
      
      // Обрабатываем импорты из зависимого файла перед встраиванием
      // Импорты React и React Native будут доступны глобально
      // Для локальных импортов заменяем их на код доступа к модулям
      processedDep = processedDep
        // Удаляем import React from 'react'
        .replace(/import\s+React\s+from\s+['"]react['"];?\s*/gi, '')
        // Удаляем import { ... } from 'react'
        .replace(/import\s*\{[^}]*\}\s*from\s+['"]react['"];?\s*/gi, '')
        // Удаляем import { ... } from 'react-native'
        .replace(/import\s*\{[^}]*\}\s*from\s+['"]react-native['"];?\s*/gi, '')
        // Заменяем все остальные импорты на код доступа к модулям
        .replace(/import\s+(.*?)\s+from\s+['"](.*?)['"];?\s*/g, (match, importSpec, depImportPath) => {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:635',message:'Processing import in dependency',data:{depImportPath,importSpec,importStatement:match.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          
          const currentDepFileName = currentDepActualPath.split('/').pop() || currentDepActualPath.split('\\').pop() || 'unknown';
          
          // Пропускаем только внешние библиотеки (npm пакеты)
          // Теперь обрабатываем локальные импорты, включая @ пути
          if ((depImportPath.startsWith('react') && !depImportPath.startsWith('react/') && !depImportPath.startsWith('@')) || 
              depImportPath.startsWith('react-native') || 
              depImportPath.startsWith('http')) {
            console.log(`[ProcessDependency] Skipping external import in ${currentDepFileName}: ${depImportPath}`);
            return ''; // Удаляем импорт
          }
          
          // Для локальных импортов заменяем на код доступа к модулям
          // Используем фактический путь файла зависимости для разрешения относительных путей
          const finalDepPath = findModulePath(depImportPath, currentDepActualPath, pathMap, dependencyModules);
          
          // Разрешаем путь синхронно для генерации всех возможных вариантов ключей
          const resolvedPathSync = resolvePathSync(currentDepActualPath, depImportPath);
          const resolvedPathNoExt = resolvedPathSync.replace(/\.(js|jsx|ts|tsx)$/, '');
          const resolvedParts = resolvedPathSync.split('/');
          const resolvedLast2 = resolvedParts.length >= 2 ? resolvedParts.slice(-2).join('/') : '';
          const resolvedLast2NoExt = resolvedLast2.replace(/\.(js|jsx|ts|tsx)$/, '');
          const resolvedFileName = resolvedParts[resolvedParts.length - 1] || '';
          const resolvedFileNameNoExt = resolvedFileName.replace(/\.(js|jsx|ts|tsx)$/, '');
          
          // Создаем список всех возможных ключей для поиска модуля
          const possibleKeys = [
            finalDepPath,
            depImportPath,
            resolvedPathSync,
            resolvedPathNoExt,
            resolvedLast2,
            resolvedLast2NoExt,
            resolvedFileName,
            resolvedFileNameNoExt
          ].filter(Boolean);
          
          // Сериализуем для использования в шаблонной строке
          const possibleKeysJson = JSON.stringify(possibleKeys);
          
          console.log(`[ProcessDependency] Processing import in ${currentDepFileName}:`, {
            file: currentDepFileName,
            filePath: currentDepActualPath,
            importPath: depImportPath,
            importSpec,
            resolvedPath: finalDepPath,
            resolvedPathSync,
            possibleKeys,
            foundInPathMap: !!pathMap[depImportPath] || !!pathMap[finalDepPath],
            pathMapKeys: Object.keys(pathMap).filter(k => 
              k.includes(depImportPath.replace(/\.\.?\//g, '')) || 
              k.includes('commonStyles') ||
              k.includes(finalDepPath.split('/').pop() || '')
            ).slice(0, 10)
          });
          
          if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
            return names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              return `const ${alias} = (() => {
                // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
                const waitForModule = (maxAttempts = 50) => {
                  const possibleKeys = ${possibleKeysJson};
                  let module = null;
                  
                  for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    // Пробуем найти модуль по всем возможным ключам
                    // Игнорируем null значения (предварительно зарегистрированные слоты)
                    for (const key of possibleKeys) {
                      if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                        module = window.__modules__[key];
                        break;
                      }
                    }
                    
                    // Если не нашли по точным ключам, ищем по частичному совпадению
                    if (!module && window.__modules__) {
                      const fileName = '${resolvedFileNameNoExt}';
                      const last2Parts = '${resolvedLast2NoExt}';
                      const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                      for (const key of Object.keys(window.__modules__)) {
                        const value = window.__modules__[key];
                        // Игнорируем null значения
                        if (value !== null && value !== undefined && 
                            (key.includes(fileName) || key.includes(last2Parts) || 
                            key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                          module = value;
                          break;
                        }
                      }
                    }
                    
                    if (module) break;
                    
                    // Если модуль не найден, ждем немного и пробуем снова
                    if (attempt < maxAttempts - 1) {
                      // Синхронное ожидание (не идеально, но работает)
                      const start = Date.now();
                      while (Date.now() - start < 10) {
                        // Ждем 10ms
                      }
                    }
                  }
                  
                  return module;
                };
                
                const module = waitForModule();
                
                if (!module || module === null) {
                  console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Module values:', Object.entries(window.__modules__ || {}).map(([k, v]) => [k, v === null ? 'null' : typeof v]).slice(0, 10));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Module not found.');
                }
                
                const value = module?.${orig} || module?.default?.${orig};
                if (value === undefined) {
                  console.error('Export ${orig} not found in module. Module keys:', Object.keys(module || {}));
                  throw new Error('Failed to import ${orig} from ${depImportPath}. Export not found.');
                }
                return value;
              })();`;
            }).join('\n');
          } else {
            // Default import: import name from ...
            return `const ${importSpec.trim()} = (() => {
              // Ждем, пока модули загрузятся (на случай, если модуль еще загружается)
              const waitForModule = (maxAttempts = 50) => {
                const possibleKeys = ${possibleKeysJson};
                let module = null;
                
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                  // Пробуем найти модуль по всем возможным ключам
                  // Игнорируем null значения (предварительно зарегистрированные слоты)
                  for (const key of possibleKeys) {
                    if (window.__modules__ && window.__modules__[key] !== null && window.__modules__[key] !== undefined) {
                      module = window.__modules__[key];
                      break;
                    }
                  }
                  
                  // Если не нашли по точным ключам, ищем по частичному совпадению
                  if (!module && window.__modules__) {
                    const fileName = '${resolvedFileNameNoExt}';
                    const last2Parts = '${resolvedLast2NoExt}';
                    const importPathClean = '${depImportPath.replace(/\.\.?\//g, '')}';
                    for (const key of Object.keys(window.__modules__)) {
                      const value = window.__modules__[key];
                      // Игнорируем null значения
                      if (value !== null && value !== undefined && 
                          (key.includes(fileName) || key.includes(last2Parts) || 
                          key.endsWith('${depImportPath}') || key.includes(importPathClean))) {
                        module = value;
                        break;
                      }
                    }
                  }
                  
                  if (module) break;
                  
                  // Если модуль не найден, ждем немного и пробуем снова
                  if (attempt < maxAttempts - 1) {
                    // Синхронное ожидание (не идеально, но работает)
                    const start = Date.now();
                    while (Date.now() - start < 10) {
                      // Ждем 10ms
                    }
                  }
                }
                
                return module;
              };
              
              const module = waitForModule();
              
              if (!module || module === null) {
                console.error('Module not found for ${depImportPath}. Tried keys:', ${possibleKeysJson});
                console.error('Available modules:', Object.keys(window.__modules__ || {}));
                console.error('Module values:', Object.entries(window.__modules__ || {}).map(([k, v]) => [k, v === null ? 'null' : typeof v]).slice(0, 10));
                throw new Error('Failed to import default from ${depImportPath}. Module not found.');
              }
              
              const value = module?.default || module?.styles || module;
              if (value === undefined) {
                console.error('Default export not found in module. Module keys:', Object.keys(module || {}));
                throw new Error('Failed to import default from ${depImportPath}. Default export not found.');
              }
              return value;
            })();`;
          }
        })
        .trim();
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:650',message:'Dependency processed after removing imports',data:{importPath,processedLength:processedDep.length,hasImports:processedDep.includes('import'),hasExports:processedDep.includes('export'),namedExportsCount:namedExports.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Default export: export default ...
      const defaultExportMatch = processedDep.match(/export\s+default\s+(.+?)(;|$)/s);
      if (defaultExportMatch) {
        hasDefaultExport = true;
        const exportValue = defaultExportMatch[1].trim();
        // Если это переменная или выражение
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportValue)) {
          defaultExportName = exportValue;
          // Удаляем строку export default полностью
          processedDep = processedDep.replace(/export\s+default\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*;?\s*/g, '');
        } else {
          defaultExportName = '__defaultExport';
          processedDep = processedDep.replace(/export\s+default\s+/g, 'const __defaultExport = ');
        }
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:695',message:'After processing exports',data:{importPath,hasDefaultExport,defaultExportName,hasExports:processedDep.includes('export')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      
      // Named exports: export { ... }
      const namedExportsMatch = processedDep.match(/export\s+\{([^}]+)\}/);
      if (namedExportsMatch) {
        const exports = namedExportsMatch[1].split(',').map(e => e.trim()).filter(e => e);
        exports.forEach(exp => {
          const parts = exp.includes(' as ') ? exp.split(' as ') : [exp, exp];
          const orig = parts[0].trim();
          const alias = parts[1].trim();
          moduleExports[alias] = orig;
          if (!namedExports.includes(orig)) {
            namedExports.push(orig);
          }
        });
        processedDep = processedDep.replace(/export\s+\{([^}]+)\}/g, '');
      }
      
      // Если нет default export, но есть named export 'styles', используем его как default
      if (!hasDefaultExport && namedExports.includes('styles')) {
        defaultExportName = 'styles';
        hasDefaultExport = true;
      }
      
      // Удаляем все оставшиеся экспорты (на случай, если что-то пропустили)
      processedDep = processedDep.replace(/export\s+default\s+.*?;?\s*/g, '');
      processedDep = processedDep.replace(/export\s+\{[^}]+\}\s*;?\s*/g, '');
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:740',message:'Before creating module code',data:{importPath,hasExports:processedDep.includes('export'),processedLength:processedDep.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Получаем абсолютный путь для этого модуля (importPath уже равен absolutePath из цикла)
      const moduleAbsolutePath = dependencyModules[importPath] || importPath;
      
      // Находим все относительные пути, которые указывают на этот абсолютный путь
      const allRelativePaths = Object.entries(pathMap)
        .filter(([relPath, absPath]) => absPath === moduleAbsolutePath)
        .map(([relPath]) => relPath);
      
      // Также находим все возможные варианты путей, которые могут быть использованы из разных контекстов
      // Это включает пути, которые могут быть разрешены относительно разных базовых путей
      const allPossiblePaths = new Set(allRelativePaths);
      
      // Добавляем абсолютный путь
      allPossiblePaths.add(moduleAbsolutePath);
      
      // Добавляем путь без расширения
      const pathWithoutExt = moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx)$/, '');
      allPossiblePaths.add(pathWithoutExt);
      
      // Добавляем последние 2 части пути (например, styles/commonStyles)
      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        const last2Parts = pathParts.slice(-2).join('/');
        allPossiblePaths.add(last2Parts);
        const last2PartsNoExt = last2Parts.replace(/\.(js|jsx|ts|tsx)$/, '');
        allPossiblePaths.add(last2PartsNoExt);
      }
      
      // Добавляем имя файла
      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        allPossiblePaths.add(fileName);
        const fileNameNoExt = fileName.replace(/\.(js|jsx|ts|tsx)$/, '');
        allPossiblePaths.add(fileNameNoExt);
      }
      
      // Для каждого относительного пути из pathMap, который указывает на этот модуль,
      // генерируем возможные варианты, которые могут быть использованы из других контекстов
      for (const relPath of allRelativePaths) {
        // Добавляем сам относительный путь
        allPossiblePaths.add(relPath);
        
        // Добавляем путь без расширения
        const relPathNoExt = relPath.replace(/\.(js|jsx|ts|tsx)$/, '');
        allPossiblePaths.add(relPathNoExt);
        
        // Если путь начинается с ./, добавляем вариант без ./
        if (relPath.startsWith('./')) {
          allPossiblePaths.add(relPath.substring(2));
        }
        
        // Если путь начинается с ../, добавляем последние части
        if (relPath.startsWith('../')) {
          const relParts = relPath.split('/');
          if (relParts.length >= 2) {
            const relLast2 = relParts.slice(-2).join('/');
            allPossiblePaths.add(relLast2);
            const relLast2NoExt = relLast2.replace(/\.(js|jsx|ts|tsx)$/, '');
            allPossiblePaths.add(relLast2NoExt);
          }
        }
      }
      
      console.log(`[ProcessDependency] All possible paths for module ${moduleAbsolutePath}:`, Array.from(allPossiblePaths));
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:752',message:'Creating module code',data:{importPath,absolutePath:moduleAbsolutePath,hasDefaultExport,defaultExportName,namedExportsCount:namedExports.length,namedExports:namedExports.slice(0,5),allRelativePathsCount:allRelativePaths.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Создаем модуль
      modulesCode += `
        // Модуль: ${importPath} (absolute: ${moduleAbsolutePath})
        (function() {
          // Убеждаемся, что window.__modules__ инициализирован
          window.__modules__ = window.__modules__ || {};
          
          // Убеждаемся, что React Native доступен (для StyleSheet и т.д.)
          const { StyleSheet } = (typeof window !== 'undefined' && window.ReactNative) || {};
          
          // ВАЖНО: Выполняем код модуля ПОСЛЕ того, как все модули предварительно зарегистрированы
          // Это гарантирует, что когда код модуля обращается к другим модулям через window.__modules__,
          // эти модули уже существуют (даже если они еще не выполнились)
          ${processedDep}
          
          // Теперь все переменные должны быть доступны в этой области видимости
          const moduleExports = {};
          
          // Добавляем named exports - используем прямую проверку в текущей области видимости
          ${namedExports.length > 0 ? namedExports.map(name => 
            `// #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-export',message:'Checking export variable',data:{name:'${name}',importPath:'${importPath}',isDefined:typeof ${name} !== "undefined",valueType:typeof ${name}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            if (typeof ${name} !== "undefined") { 
              moduleExports.${name} = ${name}; 
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-export',message:'Export added successfully',data:{name:'${name}',importPath:'${importPath}',exportKeys:Object.keys(moduleExports)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              console.log('Added named export ${name} to module ${importPath}:', ${name});
            } else { 
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-export',message:'Export variable undefined',data:{name:'${name}',importPath:'${importPath}'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              console.error('Named export ${name} is undefined in module ${importPath}!');
              console.error('Trying to find variable in different ways...');
              // Пробуем найти переменную через различные способы
              try {
                // Пробуем через window (если была объявлена глобально)
                if (typeof window !== 'undefined' && typeof window.${name} !== 'undefined') {
                  moduleExports.${name} = window.${name};
                  console.log('Found ${name} on window object');
                } else {
                  // Пробуем через this (в строгом режиме это не сработает, но попробуем)
                  try {
                    if (typeof this !== 'undefined' && typeof this.${name} !== 'undefined') {
                      moduleExports.${name} = this.${name};
                      console.log('Found ${name} on this object');
                    }
                  } catch(e) {}
                  // Если не нашли, выводим отладочную информацию
                  if (!moduleExports.${name}) {
                    console.error('Could not find ${name} in any scope');
                    console.error('Available variables:', Object.keys(typeof window !== 'undefined' ? window : {}));
                  }
                }
              } catch(e) {
                console.error('Error while trying to find ${name}:', e);
              }
            }`
          ).join('\n          ') : '// No named exports'}
          
          // Добавляем default export
          ${hasDefaultExport && defaultExportName ? 
            `moduleExports.default = typeof ${defaultExportName} !== "undefined" ? ${defaultExportName} : (moduleExports.styles || moduleExports);` : 
            'moduleExports.default = moduleExports.styles || moduleExports;'
          }
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-register',message:'Registering module',data:{importPath:'${importPath}',absolutePath:'${moduleAbsolutePath}',exportKeys:Object.keys(moduleExports),namedExports:${JSON.stringify(namedExports)}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          console.log('Module loaded:', '${importPath}', 'absolute:', '${moduleAbsolutePath}', moduleExports);
          console.log('Module named exports list:', ${JSON.stringify(namedExports)});
          console.log('Module exports keys:', Object.keys(moduleExports));
          
          // Регистрируем модуль по абсолютному пути (нормализованному)
          window.__modules__['${moduleAbsolutePath}'] = moduleExports;
          // Также регистрируем по всем относительным путям из pathMap для обратной совместимости
          window.__modules__['${importPath}'] = moduleExports;
          
          // Регистрируем по всем путям, которые указывают на этот абсолютный путь
          const allPaths = ${JSON.stringify(allRelativePaths)};
          allPaths.forEach(path => {
            window.__modules__[path] = moduleExports;
          });
          
          // Регистрируем по всем возможным вариантам путей для поддержки импортов из разных контекстов
          const allPossiblePaths = ${JSON.stringify(Array.from(allPossiblePaths))};
          allPossiblePaths.forEach(path => {
            if (path && path.trim()) {
              // Экранируем путь для безопасного использования в качестве ключа
              const escapedPath = path.replace(/'/g, "\\'");
              window.__modules__[path] = moduleExports;
            }
          });
          
          // Дополнительно регистрируем по имени файла без расширения для лучшей совместимости
          const fileName = '${moduleAbsolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (fileName) {
            window.__modules__[fileName] = moduleExports;
          }
          
          // Также регистрируем по всем вариантам путей, которые могут быть использованы из разных контекстов
          // (например, '../components/Header' из HomeScreen и './components/Header' из App)
          const resolvedVariants = [
            '${moduleAbsolutePath}',
            '${moduleAbsolutePath.replace(/\.(js|jsx|ts|tsx)$/, '')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/')}',
            '${moduleAbsolutePath.split('/').slice(-2).join('/').replace(/\.(js|jsx|ts|tsx)$/, '')}',
            '${moduleAbsolutePath.split('/').pop()}',
            '${moduleAbsolutePath.split('/').pop().replace(/\.(js|jsx|ts|tsx)$/, '')}'
          ];
          resolvedVariants.forEach(variant => {
            if (variant && variant.trim()) {
              window.__modules__[variant] = moduleExports;
            }
          });
          
          console.log('Registered module under keys:', allPossiblePaths);
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:module-register',message:'Module registered',data:{importPath:'${importPath}',absolutePath:'${moduleAbsolutePath}',allModules:Object.keys(window.__modules__||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
        })();
      `;
      
      // Заменяем импорт на доступ к модулю
      // Ищем импорт по всем возможным путям (относительному и абсолютному)
      let importStatement = imports.find(imp => imp.path === importPath);
      if (!importStatement) {
        // Если не найдено по абсолютному пути, ищем по относительным путям из pathMap
        for (const [relPath, absPath] of Object.entries(pathMap)) {
          if (absPath === importPath) {
            importStatement = imports.find(imp => imp.path === relPath);
            if (importStatement) break;
          }
        }
      }
      if (importStatement) {
        // Парсим, что именно импортируется
        const match = importStatement.fullStatement.match(/import\s+(.*?)\s+from/);
        if (match) {
          const importSpec = match[1].trim();
          // Проверяем import * as name from ...
          const starAsMatch = importStatement.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
          if (starAsMatch) {
            const alias = starAsMatch[1];
            importReplacements[importStatement.fullStatement] = `const ${alias} = window.__modules__['${importPath}'];`;
          } else if (importSpec.startsWith('{')) {
            // Named imports: import { a, b as c } from ...
            const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
            // Получаем абсолютный путь для этого модуля
            const absolutePath = dependencyModules[importPath] || importPath;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:795',message:'Processing named imports',data:{importPath,absolutePath,importSpec,names,namedExports:namedExports.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            const replacements = names.map(name => {
              const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
              let orig = parts[0].trim();
              let alias = parts[1].trim();
              // Валидация имени переменной: убираем недопустимые символы
              alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
                // Если имя невалидно, используем безопасное имя
                alias = 'imported_' + Math.random().toString(36).substr(2, 9);
              }
              // Также валидируем orig, так как он используется в module.${orig}
              orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
              if (!orig) {
                orig = 'default';
              }
              // Пробуем сначала абсолютный путь, потом относительный
              // Добавляем проверку и логирование для отладки
              return `const ${alias} = (() => {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Resolving import',data:{orig:'${orig}',alias:'${alias}',importPath:'${importPath}',absolutePath:'${absolutePath}',modulesAvailable:Object.keys(window.__modules__||{}).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                // Ищем модуль по всем возможным путям
                const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
                const module2 = window.__modules__ && window.__modules__['${importPath}'];
                // Также пробуем найти модуль по любому пути, который содержит имя файла
                let module3 = null;
                const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
                if (window.__modules__) {
                  for (const key of Object.keys(window.__modules__)) {
                    if (key.includes(fileName) || key.endsWith('${importPath}') || key === fileName) {
                      module3 = window.__modules__[key];
                      break;
                    }
                  }
                }
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Module lookup',data:{orig:'${orig}',hasModule1:!!module1,hasModule2:!!module2,hasModule3:!!module3,module1Keys:module1?Object.keys(module1):[],module2Keys:module2?Object.keys(module2):[],module3Keys:module3?Object.keys(module3):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                const module = module1 || module2 || module3;
                if (!module) {
                  console.error('Module not found for ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Tried paths: ${absolutePath}, ${importPath}');
                  throw new Error('Module not found: ${importPath}');
                }
                const value = module.${orig} || module.default?.${orig};
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:import-resolver',message:'Import result',data:{orig:'${orig}',alias:'${alias}',valueDefined:value!==undefined,valueType:typeof value,moduleKeys:Object.keys(module)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                if (value === undefined) {
                  console.error('Failed to import ${orig} from ${importPath}.');
                  console.error('Module found:', module);
                  console.error('Module keys:', Object.keys(module || {}));
                  console.error('Available modules:', Object.keys(window.__modules__ || {}));
                  console.error('Module ${absolutePath}:', module1);
                  console.error('Module ${importPath}:', module2);
                  console.error('Searched module:', module3);
                  throw new Error('Failed to import ${orig} from ${importPath}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
                }
                return value;
              })();`;
            });
            importReplacements[importStatement.fullStatement] = replacements.join('\n');
          } else {
            // Default import: import name from ...
            // Получаем абсолютный путь для этого модуля (используем ту же логику, что и для named imports)
            const absolutePath = dependencyModules[importPath] || importPath;
            
            // Получаем информацию о default export из обработанной зависимости
            // Ищем модуль в dependencies по абсолютному пути
            const depContent = dependencies[absolutePath] || dependencies[importPath];
            let hasDefaultExport2 = false;
            let defaultExportName2 = null;
            
            if (depContent) {
              // Проверяем наличие default export в содержимом
              const defaultExportMatch = depContent.match(/export\s+default\s+(.+?)(;|$)/s);
              if (defaultExportMatch) {
                hasDefaultExport2 = true;
                const exportValue = defaultExportMatch[1].trim();
                if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportValue)) {
                  defaultExportName2 = exportValue;
                } else {
                  defaultExportName2 = '__defaultExport';
                }
              }
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:885',message:'Processing default import',data:{importPath,absolutePath,importSpec,hasDefaultExport:hasDefaultExport2,defaultExportName:defaultExportName2},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            // Создаем код для импорта default значения
            importReplacements[importStatement.fullStatement] = `const ${importSpec} = (() => {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Resolving default import',data:{importSpec:'${importSpec}',importPath:'${importPath}',absolutePath:'${absolutePath}'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
              const module2 = window.__modules__ && window.__modules__['${importPath}'];
              // Также пробуем найти модуль по любому пути, который содержит имя файла
              let module3 = null;
              const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
              if (window.__modules__) {
                for (const key of Object.keys(window.__modules__)) {
                  if (key.includes(fileName) || key.endsWith('${importPath}')) {
                    module3 = window.__modules__[key];
                    break;
                  }
                }
              }
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Module lookup for default import',data:{importSpec:'${importSpec}',hasModule1:!!module1,hasModule2:!!module2,hasModule3:!!module3,module1Keys:module1?Object.keys(module1):[],module2Keys:module2?Object.keys(module2):[],module3Keys:module3?Object.keys(module3):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              const module = module1 || module2 || module3;
              const value = module?.default || module?.styles || module;
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:default-import-resolver',message:'Default import result',data:{importSpec:'${importSpec}',valueDefined:value!==undefined,valueType:typeof value,isFunction:typeof value==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              if (value === undefined) {
                console.error('Failed to import default from ${importPath}. Available modules:', Object.keys(window.__modules__ || {}));
                console.error('Module ${absolutePath}:', module1);
                console.error('Module ${importPath}:', module2);
                console.error('Searched module:', module3);
                throw new Error('Failed to import default from ${importPath}. Module not found or default export not available.');
              }
              return value;
            })();`;
          }
        }
      }
    }
    
    // Обрабатываем импорты в основном файле
    for (const imp of imports) {
      // Пропускаем внешние библиотеки
      if (imp.path.startsWith('react') || imp.path.startsWith('react-native') || 
          imp.path.startsWith('@') || imp.path.startsWith('http')) {
        continue;
      }
      
      // Получаем абсолютный путь для этого импорта
      const absolutePath = dependencyModules[imp.path] || pathMap[imp.path] || imp.path;
      
      // Парсим, что именно импортируется
      const match = imp.fullStatement.match(/import\s+(.*?)\s+from/);
      if (!match) continue;
      
      const importSpec = match[1].trim();
      
      // Проверяем import * as name from ...
      const starAsMatch = imp.fullStatement.match(/import\s+\*\s+as\s+(\w+)/);
      if (starAsMatch) {
        const alias = starAsMatch[1];
        importReplacements[imp.fullStatement] = `const ${alias} = window.__modules__ && window.__modules__['${absolutePath}'] || window.__modules__ && window.__modules__['${imp.path}'] || {};`;
      } else if (importSpec.startsWith('{')) {
        // Named imports: import { a, b as c } from ...
        const names = importSpec.replace(/[{}]/g, '').split(',').map(n => n.trim()).filter(n => n);
        const replacements = names.map(name => {
          const parts = name.includes(' as ') ? name.split(' as ') : [name, name];
          let orig = parts[0].trim();
          let alias = parts[1].trim();
          // Валидация имени переменной: убираем недопустимые символы
          alias = alias.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!alias || !/^[a-zA-Z_$]/.test(alias)) {
            // Если имя невалидно, используем безопасное имя
            alias = 'imported_' + Math.random().toString(36).substr(2, 9);
          }
          // Также валидируем orig, так как он используется в module.${orig}
          orig = orig.replace(/[^a-zA-Z0-9_$]/g, '');
          if (!orig) {
            orig = 'default';
          }
          return `const ${alias} = (() => {
            const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
            const module2 = window.__modules__ && window.__modules__['${imp.path}'];
            let module3 = null;
            const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
            if (window.__modules__) {
              for (const key of Object.keys(window.__modules__)) {
                if (key.includes(fileName) || key.endsWith('${imp.path}') || key === fileName) {
                  module3 = window.__modules__[key];
                  break;
                }
              }
            }
            const module = module1 || module2 || module3;
            if (!module) {
              console.error('Module not found for ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Module not found: ${imp.path}');
            }
            const value = module.${orig} || module.default?.${orig};
            if (value === undefined) {
              console.error('Failed to import ${orig} from ${imp.path}.');
              console.error('Module found:', module);
              console.error('Module keys:', Object.keys(module || {}));
              console.error('Available modules:', Object.keys(window.__modules__ || {}));
              throw new Error('Failed to import ${orig} from ${imp.path}. Export "${orig}" not found in module. Available exports: ' + Object.keys(module || {}).join(', '));
            }
            return value;
          })();`;
        });
        importReplacements[imp.fullStatement] = replacements.join('\n');
      } else {
        // Default import: import name from ...
        importReplacements[imp.fullStatement] = `const ${importSpec} = (() => {
          const module1 = window.__modules__ && window.__modules__['${absolutePath}'];
          const module2 = window.__modules__ && window.__modules__['${imp.path}'];
          let module3 = null;
          const fileName = '${absolutePath}'.split('/').pop().replace(/\.(js|jsx)$/, '');
          if (window.__modules__) {
            for (const key of Object.keys(window.__modules__)) {
              if (key.includes(fileName) || key.endsWith('${imp.path}')) {
                module3 = window.__modules__[key];
                break;
              }
            }
          }
          const module = module1 || module2 || module3;
          const value = module?.default || module?.styles || module;
          if (value === undefined) {
            console.error('Failed to import default from ${imp.path}. Available modules:', Object.keys(window.__modules__ || {}));
            throw new Error('Failed to import default from ${imp.path}. Module not found or default export not available.');
          }
          return value;
        })();`;
      }
    }
    
    // Заменяем импорты в коде
    console.log('RenderFile: Import replacements:', importReplacements);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:817',message:'Before replacing imports',data:{importReplacementsCount:Object.keys(importReplacements).length,processedCodeLength:processedCode.length,importReplacements:Object.keys(importReplacements).map(k=>k.substring(0,50))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    for (const [original, replacement] of Object.entries(importReplacements)) {
      if (processedCode.includes(original)) {
        processedCode = processedCode.replace(original, replacement);
        console.log('RenderFile: Replaced import:', original, 'with:', replacement);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:822',message:'Replaced import',data:{original:original.substring(0,50),replacement:replacement.substring(0,100),hasHeader:replacement.includes('Header')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } else {
        console.warn('RenderFile: Import not found in code:', original);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RenderFile.jsx:827',message:'Import not found in code',data:{original:original.substring(0,50),codeContains:processedCode.includes(original)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      }
    }
    
    // Удаляем оставшиеся локальные импорты (которые не были заменены)
    processedCode = processedCode.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
    
    console.log('RenderFile: Processed code length:', processedCode.length);
    console.log('RenderFile: Modules code length:', modulesCode.length);
    console.log('RenderFile: Dependency paths:', dependencyPaths);
    
    // Создаем код для предварительной регистрации всех модулей
    // Это гарантирует, что модули будут доступны, даже если они еще не выполнились
    const allModulePaths = new Set();
    // Собираем все возможные пути для каждого модуля
    for (const [relPath, absPath] of Object.entries(pathMap)) {
      allModulePaths.add(relPath);
      allModulePaths.add(absPath);
      // Также добавляем варианты без расширения и последние части пути
      const absPathNoExt = absPath.replace(/\.(js|jsx|ts|tsx)$/, '');
      allModulePaths.add(absPathNoExt);
      const parts = absPath.split('/');
      if (parts.length >= 2) {
        allModulePaths.add(parts.slice(-2).join('/'));
        allModulePaths.add(parts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
      if (parts.length > 0) {
        allModulePaths.add(parts[parts.length - 1]);
        allModulePaths.add(parts[parts.length - 1].replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
    }
    
    // Также добавляем все пути из allPossiblePaths для каждого модуля
    for (const absolutePath of uniqueAbsolutePaths) {
      const moduleAbsolutePath = dependencyModules[absolutePath] || absolutePath;
      const pathParts = moduleAbsolutePath.split('/');
      if (pathParts.length >= 2) {
        allModulePaths.add(pathParts.slice(-2).join('/'));
        allModulePaths.add(pathParts.slice(-2).join('/').replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
      if (pathParts.length > 0) {
        allModulePaths.add(pathParts[pathParts.length - 1]);
        allModulePaths.add(pathParts[pathParts.length - 1].replace(/\.(js|jsx|ts|tsx)$/, ''));
      }
    }
    
    const preRegisterCode = Array.from(allModulePaths).filter(Boolean).map(path => {
      // Экранируем кавычки в пути
      const escapedPath = path.replace(/'/g, "\\'");
      return `window.__modules__['${escapedPath}'] = window.__modules__['${escapedPath}'] || null;`;
    }).join('\n        ');
    
    // Обертываем modulesCode, чтобы сначала предварительно зарегистрировать модули
    const wrappedModulesCode = `
        // Предварительная регистрация всех модулей (создаем пустые слоты)
        ${preRegisterCode}
        
        console.log('Pre-registered ${allModulePaths.size} module paths:', ${JSON.stringify(Array.from(allModulePaths).slice(0, 20))});
        
        // Теперь загружаем модули (они заполнят предварительно зарегистрированные слоты)
        ${modulesCode}
        
        console.log('All modules loaded. Total modules:', Object.keys(window.__modules__ || {}).length);
        console.log('Registered module keys:', Object.keys(window.__modules__ || {}));
    `;
    
    return {
      code: processedCode,
      modulesCode: wrappedModulesCode,
      dependencyPaths: dependencyPaths, // Возвращаем пути зависимых файлов
      defaultExportInfo: defaultExportInfo // Сохраняем информацию о default export
    };
  };

  // detectComponents теперь импортируется из модуля react-processor

  // Создаем HTML обертку для React файлов
  const createReactHTML = async (code, basePath) => {
    // ВАЖНО: сначала инструментируем ИСХОДНЫЙ код, чтобы data-no-code-ui-id были стабильны относительно файла.
    // Потом уже прогоняем processReactCode — он не должен ломать data-no-code-ui-id.
    console.log('🔵 createReactHTML: инструментируем исходный код', {
      codeLength: code.length,
      codePreview: code.substring(0, 300),
      hasJsxElements: /<[A-Za-z]/.test(code)
    });
    const instOriginal = instrumentJsx(code, basePath);
    console.log('🔵 createReactHTML: результат инструментации исходного кода', {
      instOriginalMapKeys: Object.keys(instOriginal.map).length,
      instOriginalMapSample: Object.keys(instOriginal.map).slice(0, 5),
      instOriginalCodeLength: instOriginal.code.length,
      instOriginalCodeHasIds: (instOriginal.code.match(/data-no-code-ui-id/g) || []).length
    });

    // Сначала обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await processReactCode(instOriginal.code, basePath);
    const processedCodeBeforeInst = processed.code; // уже содержит data-no-code-ui-id (или legacy data-mrpak-id)
    const modulesCode = processed.modulesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;
    
    // Собираем карту для превью/редактора на обработанном коде (атрибуты уже есть).
    const instProcessed = instrumentJsx(processedCodeBeforeInst, basePath);
    const processedCode = instProcessed.code;
    
    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);
    
    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
    }
    
    // Находим компонент для рендеринга по приоритету
    let componentToRender = null;
    let componentName = null;
    
    // Приоритет: default export > named exports > остальные компоненты
    for (const comp of detectedComponents) {
      // Проверяем, что компонент действительно существует в коде
      const componentExists = new RegExp(`(?:const|let|var|function)\\s+${comp.name}\\s*[=(]`).test(processedCode) ||
                               new RegExp(`\\b${comp.name}\\s*=`).test(processedCode);
      if (componentExists) {
        componentToRender = comp.name;
        componentName = comp.name;
        break;
      }
    }
    
    // Fallback: пробуем стандартные имена
    if (!componentToRender) {
      const standardNames = ['App', 'MyComponent', 'Component'];
      for (const name of standardNames) {
        if (new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
          componentToRender = name;
          componentName = name;
          break;
        }
      }
    }
    
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
    </script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #f5f5f5;
        }
        #root {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px 0;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>React Component Preview</strong><br>
        Компонент загружается из выбранного файла...
    </div>
    <div id="root"></div>
    <script type="text/babel" data-type="module">
        // React доступен глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        
        // Инициализируем window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация
        console.log('Available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          console.log('Module:', path, window.__modules__[path]);
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = cur.tagName.toLowerCase();
              const parent = cur.parentElement;
              if (!parent || parent === rootElement || parent === document.body || parent === document.documentElement) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const makeMrpakId = (filePath, selector, tagName) => {
            const base = safeBasename(filePath);
            return \`mrpak:\${base}:\${tagName || 'el'}:\${selector}\`;
          };
          
          const used = new Set();
          const all = rootElement.querySelectorAll ? Array.from(rootElement.querySelectorAll('*')) : [];
          
          all.forEach((el) => {
            // Пропускаем элементы, которые уже имеют id-атрибут
            const existing = (el.getAttribute && (el.getAttribute('data-no-code-ui-id') || el.getAttribute('data-mrpak-id'))) || null;
            if (existing) {
              used.add(existing);
              return;
            }
            
            // Пропускаем script, style и другие служебные элементы
            const tagName = (el.tagName || '').toLowerCase();
            if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
              return;
            }
            
            const selector = makeSelectorForElement(el);
            let id = makeMrpakId(filePath, selector, tagName);
            
            // Убеждаемся, что ID уникален
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            
            if (el.setAttribute) {
              el.setAttribute('data-no-code-ui-id', id);
            }
          });
        }
        
        try {
            ${processedCode}
            
            // Автоматически находим компонент для рендеринга
            let Component = null;
            ${componentToRender ? 
              `// Используем автоматически найденный компонент: ${componentName}
              if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `// Пробуем стандартные имена как fallback
              if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              } else {
                // Пробуем найти любой компонент с заглавной буквы
                const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
                for (const varName of allVars) {
                  if (varName[0] === varName[0].toUpperCase() && 
                      typeof window[varName] === 'function' &&
                      varName !== 'React' && varName !== 'ReactDOM') {
                    Component = window[varName];
                    break;
                  }
                }
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                // После рендеринга React инструментируем DOM и блокируем интерактивные элементы
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  // Инструментируем DOM элементы с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
                  instrumentReactDOM(rootElement, filePath);
                  
                  // Обновляем дерево слоев после инструментирования
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  // Используем MutationObserver для отслеживания новых элементов
                  const observer = new MutationObserver((mutations) => {
                    // Инструментируем новые элементы
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      instrumentReactDOM(rootElement, filePath);
                      // Обновляем дерево слоев после инструментирования
                      if (typeof buildTree === 'function') {
                        buildTree();
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }, 100);
            } else {
                const foundComponents = ${JSON.stringify(detectedComponents.map(c => c.name))};
                const errorMsg = foundComponents.length > 0 
                  ? 'Найдены компоненты: ' + foundComponents.join(', ') + '. Но не удалось их использовать для рендеринга.'
                  : 'Не найден компонент для рендеринга. Убедитесь, что файл содержит React компонент (функцию с заглавной буквы, возвращающую JSX).';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Ошибка выполнения:</strong><br>' + error.message + '</div>';
            console.error('React execution error:', error);
        }
    </script>
</body>
</html>
    `;
    
    console.log('🔵 createReactHTML: финальный результат', {
      blockMapForEditorKeys: Object.keys(instProcessed.map).length,
      blockMapForFileKeys: Object.keys(instOriginal.map).length,
      blockMapForFileSample: Object.keys(instOriginal.map).slice(0, 5),
      blockMapForEditorSample: Object.keys(instProcessed.map).slice(0, 5)
    });
    
    return {
      html,
      dependencyPaths,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
    };
  };

  // Создаем HTML обертку для React Native файлов
  const createReactNativeHTML = async (code, basePath) => {
    // ВАЖНО: сначала инструментируем ИСХОДНЫЙ код, чтобы data-no-code-ui-id были стабильны относительно файла.
    const instOriginal = instrumentJsx(code, basePath);

    // Сначала обрабатываем код (загружаем зависимости, заменяем импорты)
    const processed = await processReactCode(instOriginal.code, basePath);
    const processedCodeBeforeInst = processed.code; // уже содержит data-no-code-ui-id (или legacy data-mrpak-id)
    const modulesCode = processed.modulesCode || '';
    const dependencyPaths = processed.dependencyPaths || [];
    const defaultExportInfo = processed.defaultExportInfo || null;
    
    // Собираем карту для превью/редактора на обработанном коде (атрибуты уже есть).
    const instProcessed = instrumentJsx(processedCodeBeforeInst, basePath);
    const processedCode = instProcessed.code;
    
    // Детектируем компоненты в обработанном коде
    const detectedComponents = detectComponents(processedCode);
    
    // Если есть информация о default export, добавляем её с наивысшим приоритетом
    if (defaultExportInfo && !detectedComponents.find(c => c.name === defaultExportInfo.name && c.type === 'default-export')) {
      detectedComponents.unshift({
        name: defaultExportInfo.name,
        type: 'default-export',
        priority: 0
      });
    }
    
    // Находим компонент для рендеринга по приоритету
    let componentToRender = null;
    let componentName = null;
    
    // Приоритет: default export > named exports > остальные компоненты
    for (const comp of detectedComponents) {
      // Проверяем, что компонент действительно существует в коде
      const componentExists = new RegExp(`(?:const|let|var|function)\\s+${comp.name}\\s*[=(]`).test(processedCode) ||
                               new RegExp(`\\b${comp.name}\\s*=`).test(processedCode);
      if (componentExists) {
        componentToRender = comp.name;
        componentName = comp.name;
        break;
      }
    }
    
    // Fallback: пробуем стандартные имена
    if (!componentToRender) {
      const standardNames = ['App', 'MyComponent', 'Component'];
      for (const name of standardNames) {
        if (new RegExp(`(?:const|let|var|function)\\s+${name}\\s*[=(]`).test(processedCode)) {
          componentToRender = name;
          componentName = name;
          break;
        }
      }
    }
    
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React Native Web Component Preview</title>
    <script>
        // Передаем filePath в глобальную переменную для использования в скрипте
        window.__MRPAK_FILE_PATH__ = ${JSON.stringify(basePath)};
    </script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script>
      // Функция для нормализации стилей React Native в CSS стили
      function normalizeStyle(style) {
        if (!style) return {};
        if (Array.isArray(style)) {
          // Если массив стилей, объединяем их, пропуская null/undefined
          const validStyles = style.filter(s => s != null && typeof s === 'object');
          if (validStyles.length === 0) return {};
          // Рекурсивно нормализуем и объединяем
          const merged = {};
          validStyles.forEach(s => {
            const normalized = normalizeStyle(s);
            Object.assign(merged, normalized);
          });
          return merged;
        }
        if (typeof style !== 'object' || style === null) return {};
        
        // Создаем новый объект для безопасной работы
        const result = {};
        for (const key in style) {
          if (style.hasOwnProperty(key)) {
            const value = style[key];
            // Пропускаем null, undefined, функции и объекты (кроме Date)
            if (value === null || value === undefined) continue;
            if (typeof value === 'function') continue;
            if (typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
              // Пропускаем объекты типа shadowOffset, transform и т.д.
              // Они не поддерживаются напрямую в CSS
              continue;
            }
            
            // Список свойств, которые требуют 'px' для числовых значений
            const pixelProperties = [
              'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
              'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
              'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
              'top', 'right', 'bottom', 'left',
              'fontSize', 'lineHeight', 'letterSpacing',
              'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
              'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 
              'borderBottomLeftRadius', 'borderBottomRightRadius',
              'outlineWidth', 'gap', 'rowGap', 'columnGap'
            ];
            
            // Обрабатываем значения - ВАЖНО: только примитивы
            let cssValue;
            if (typeof value === 'number') {
              // Для числовых значений добавляем 'px' для размеров
              if (pixelProperties.includes(key)) {
                cssValue = value + 'px';
              } else if (key === 'opacity' || key === 'zIndex' || key === 'flex' || 
                         key === 'flexGrow' || key === 'flexShrink' || key === 'order' ||
                         key === 'fontWeight') {
                // Эти свойства остаются числами
                cssValue = value;
              } else {
                // По умолчанию для других числовых значений тоже добавляем px
                cssValue = value + 'px';
              }
            } else if (typeof value === 'string') {
              cssValue = value;
            } else if (Array.isArray(value)) {
              // Массивы преобразуем в строки, но только если элементы примитивы
              cssValue = value.map(v => String(v)).join(' ');
            } else if (value instanceof Date) {
              cssValue = value.toISOString();
            } else {
              // Пропускаем все остальное
              continue;
            }
            
            // Проверяем, что значение действительно примитив
            if (typeof cssValue !== 'string' && typeof cssValue !== 'number' && typeof cssValue !== 'boolean') {
              continue;
            }
            
            // ВАЖНО: React требует camelCase для inline стилей, НЕ kebab-case!
            // kebab-case используется только в CSS файлах, но не в inline стилях через объекты
            // Поэтому оставляем ключ как есть (camelCase)
            const cssKey = key; // НЕ конвертируем в kebab-case!
            
            // Убеждаемся, что мы устанавливаем только строку или число
            // Но оставляем числа как числа (для opacity, zIndex и т.д.)
            if (typeof cssValue === 'number' && (key === 'opacity' || key === 'zIndex' || key === 'flex' || 
                key === 'flexGrow' || key === 'flexShrink' || key === 'order' || key === 'fontWeight')) {
              result[cssKey] = cssValue;
            } else {
              result[cssKey] = String(cssValue);
            }
          }
        }
        return result;
      }
      
      // React Native Web компоненты через полифилл
      // Создаем базовые компоненты, совместимые с React
      window.ReactNative = {
        View: React.forwardRef((props, ref) => {
          const { style, ...otherProps } = props;
          const baseStyle = { display: 'flex', flexDirection: 'column' };
          // ВАЖНО: normalizeStyle всегда вызывается, даже если style undefined
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка: убеждаемся, что computedStyle не содержит массивов или объектов
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            ...otherProps
          }, props.children);
        }),
        Text: React.forwardRef((props, ref) => {
          const { style, ...otherProps } = props;
          const baseStyle = { display: 'inline' };
          // ВАЖНО: normalizeStyle всегда вызывается, даже если style undefined
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка: убеждаемся, что computedStyle не содержит массивов или объектов
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          return React.createElement('span', {
            ref,
            style: safeStyle,
            ...otherProps
          }, props.children);
        }),
        ScrollView: React.forwardRef((props, ref) => {
          const { style, contentContainerStyle, ...otherProps } = props;
          const baseStyle = {
            overflow: 'auto',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          };
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка для безопасности
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          const safeContentStyle = contentContainerStyle ? normalizeStyle(contentContainerStyle) : null;
          const safeContentStyleObj = {};
          if (safeContentStyle) {
            for (const key in safeContentStyle) {
              const value = safeContentStyle[key];
              if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
                safeContentStyleObj[key] = value;
              }
            }
          }
          
          const children = contentContainerStyle 
            ? React.createElement('div', { style: safeContentStyleObj }, props.children)
            : props.children;
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            ...otherProps
          }, children);
        }),
        TouchableOpacity: React.forwardRef((props, ref) => {
          const { style, onPress, ...otherProps } = props;
          const baseStyle = {
            cursor: 'pointer',
            transition: 'opacity 0.2s',
            display: 'inline-block'
          };
          const normalizedStyle = normalizeStyle(style);
          const computedStyle = Object.assign({}, baseStyle, normalizedStyle);
          
          // Дополнительная проверка для безопасности
          const safeStyle = {};
          for (const key in computedStyle) {
            const value = computedStyle[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              safeStyle[key] = value;
            }
          }
          
          const handleClick = (e) => {
            if (onPress) {
              onPress(e);
            }
          };
          
          return React.createElement('div', {
            ref,
            style: safeStyle,
            onClick: handleClick,
            ...otherProps
          }, props.children);
        }),
        ActivityIndicator: ({ size = 'small', color = '#667eea' }) => {
          const sizeValue = size === 'large' ? '36px' : '20px';
          return React.createElement('div', {
            style: {
              display: 'inline-block',
              width: sizeValue,
              height: sizeValue,
              border: '3px solid rgba(0,0,0,0.1)',
              borderTopColor: color,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }
          });
        },
        StyleSheet: {
          create: (styles) => {
            // Возвращаем стили как есть, но с нормализацией при использовании
            const result = {};
            for (const key in styles) {
              if (styles.hasOwnProperty(key)) {
                result[key] = styles[key];
              }
            }
            return result;
          },
          flatten: (style) => {
            if (Array.isArray(style)) {
              return Object.assign({}, ...style);
            }
            return style || {};
          }
        }
      };
      
      // Добавляем анимацию для ActivityIndicator
      const styleEl = document.createElement('style');
      styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(styleEl);
    </script>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }
        #root {
            width: 100%;
            min-height: 100vh;
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px;
        }
        .info {
            color: #666;
            padding: 10px;
            background: #e3f2fd;
            border-radius: 4px;
            margin: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>React Native Web Component Preview</strong><br>
        Компонент загружается из выбранного файла...
    </div>
    <div id="root"></div>
    <script type="text/babel" data-type="module">
        // React и React Native Web доступны глобально через CDN
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        const ReactNative = window.ReactNative || {};
        const { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } = ReactNative;
        
        // Деструктурируем для использования в коде
        const RN = ReactNative;
        
        // Инициализируем window.__modules__ ДО загрузки модулей
        window.__modules__ = window.__modules__ || {};
        console.log('Before loading modules, window.__modules__ initialized');
        
        // Загружаем модули зависимостей
        ${modulesCode}
        
        // Отладочная информация - проверяем, что модули загружены
        console.log('After loading modules, available modules:', Object.keys(window.__modules__ || {}));
        Object.keys(window.__modules__ || {}).forEach(path => {
          const module = window.__modules__[path];
          console.log('Module:', path, 'exports:', Object.keys(module || {}));
          if (path.includes('commonStyles')) {
            console.log('commonStyles module details:', module);
            console.log('  - colors:', module?.colors);
            console.log('  - commonStyles:', module?.commonStyles);
          }
        });
        
        // Функция для инструментирования DOM элементов с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
        function instrumentReactDOM(rootElement, filePath) {
          if (!rootElement) return;
          
          const safeBasename = (path) => {
            try {
              const norm = String(path || '').replace(/\\\\/g, '/');
              return norm.split('/').pop() || 'unknown';
            } catch {
              return 'unknown';
            }
          };
          
          const makeSelectorForElement = (el) => {
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1) {
              const tag = cur.tagName.toLowerCase();
              const parent = cur.parentElement;
              if (!parent || parent === rootElement || parent === document.body || parent === document.documentElement) {
                parts.push(tag);
                break;
              }
              const children = Array.from(parent.children);
              const idx = children.indexOf(cur);
              const nth = idx >= 0 ? idx + 1 : 1;
              parts.push(\`\${tag}:nth-child(\${nth})\`);
              cur = parent;
            }
            return parts.reverse().join(' > ');
          };
          
          const makeMrpakId = (filePath, selector, tagName) => {
            const base = safeBasename(filePath);
            return \`mrpak:\${base}:\${tagName || 'el'}:\${selector}\`;
          };
          
          const used = new Set();
          const all = rootElement.querySelectorAll ? Array.from(rootElement.querySelectorAll('*')) : [];
          
          all.forEach((el) => {
            // Пропускаем элементы, которые уже имеют id-атрибут
            const existing = (el.getAttribute && (el.getAttribute('data-no-code-ui-id') || el.getAttribute('data-mrpak-id'))) || null;
            if (existing) {
              used.add(existing);
              return;
            }
            
            // Пропускаем script, style и другие служебные элементы
            const tagName = (el.tagName || '').toLowerCase();
            if (['script', 'style', 'meta', 'link', 'title', 'head'].includes(tagName)) {
              return;
            }
            
            const selector = makeSelectorForElement(el);
            let id = makeMrpakId(filePath, selector, tagName);
            
            // Убеждаемся, что ID уникален
            if (used.has(id)) {
              let i = 2;
              while (used.has(\`\${id}:\${i}\`)) i += 1;
              id = \`\${id}:\${i}\`;
            }
            used.add(id);
            
            if (el.setAttribute) {
              el.setAttribute('data-no-code-ui-id', id);
            }
          });
        }
        
        // Перехватываем createElement для обработки массивов стилей в обычных HTML элементах
        const originalCreateElement = React.createElement;
        React.createElement = function(type, props, ...children) {
          // Если это строковый тип (HTML элемент) и есть style prop
          if (typeof type === 'string' && props && props.style) {
            // Обрабатываем массив стилей, если он есть
            if (Array.isArray(props.style)) {
              props = { ...props, style: normalizeStyle(props.style) };
            } else if (props.style && typeof props.style === 'object') {
              // Нормализуем даже одиночные объекты стилей
              props = { ...props, style: normalizeStyle(props.style) };
            }
          }
          return originalCreateElement.call(this, type, props, ...children);
        };
        
        try {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/2e43c4f2-f860-4c1d-996d-b01b5a2a2171',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'generated:main-code',message:'About to execute processed code',data:{modulesAvailable:Object.keys(window.__modules__||{}).length,codeLength:${processedCode.length}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            ${processedCode}
            
            // Автоматически находим компонент для рендеринга
            let Component = null;
            ${componentToRender ? 
              `// Используем автоматически найденный компонент: ${componentName}
              if (typeof ${componentName} !== 'undefined') {
                Component = ${componentName};
              }` : 
              `// Пробуем стандартные имена как fallback
              if (typeof App !== 'undefined') {
                Component = App;
              } else if (typeof MyComponent !== 'undefined') {
                Component = MyComponent;
              } else if (typeof Component !== 'undefined') {
                Component = Component;
              } else {
                // Пробуем найти любой компонент с заглавной буквы
                const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
                for (const varName of allVars) {
                  if (varName[0] === varName[0].toUpperCase() && 
                      typeof window[varName] === 'function' &&
                      varName !== 'React' && varName !== 'ReactDOM') {
                    Component = window[varName];
                    break;
                  }
                }
              }`
            }
            
            if (Component) {
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(Component));
                
                // После рендеринга React инструментируем DOM и блокируем интерактивные элементы
                setTimeout(() => {
                  const rootElement = document.getElementById('root');
                  const filePath = window.__MRPAK_FILE_PATH__ || '';
                  
                  // Инструментируем DOM элементы с data-no-code-ui-id (legacy data-mrpak-id поддерживаем)
                  instrumentReactDOM(rootElement, filePath);
                  
                  // Обновляем дерево слоев после инструментирования
                  if (window.__MRPAK_BUILD_TREE__ && typeof window.__MRPAK_BUILD_TREE__ === 'function') {
                    window.__MRPAK_BUILD_TREE__();
                  }
                  
                  // Используем MutationObserver для отслеживания новых элементов
                  const observer = new MutationObserver((mutations) => {
                    // Инструментируем новые элементы
                    const rootElement = document.getElementById('root');
                    if (rootElement) {
                      instrumentReactDOM(rootElement, filePath);
                      // Обновляем дерево слоев после инструментирования
                      if (typeof buildTree === 'function') {
                        buildTree();
                      }
                    }
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }, 100);
            } else {
                const foundComponents = ${JSON.stringify(detectedComponents.map(c => c.name))};
                const errorMsg = foundComponents.length > 0 
                  ? 'Найдены компоненты: ' + foundComponents.join(', ') + '. Но не удалось их использовать для рендеринга.'
                  : 'Не найден компонент для рендеринга. Убедитесь, что файл содержит React компонент (функцию с заглавной буквы, возвращающую JSX).';
                document.getElementById('root').innerHTML = '<div class="error">' + errorMsg + '</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error"><strong>Ошибка выполнения:</strong><br>' + error.message + '<br><br><pre>' + error.stack + '</pre></div>';
            console.error('React Native execution error:', error);
        }
    </script>
</body>
</html>
    `;
    
    return {
      html,
      dependencyPaths,
      blockMapForEditor: instProcessed.map,
      blockMapForFile: instOriginal.map,
    };
  };
  

  if (!filePath) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholderText}>
          Выберите файл для отображения
        </Text>
        <Text style={styles.hintText}>
          Поддерживаются: HTML, React (JSX/TSX), JavaScript, TypeScript, CSS, JSON
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Загрузка файла...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!fileContent) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholderText}>
          Контент файла не загружен
        </Text>
      </View>
    );
  }

  // Рендеринг HTML файлов
  if (fileType === 'html' && fileContent) {
    if (isProcessingHTML) {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>HTML</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Обработка зависимостей...</Text>
          </View>
        </View>
      );
    }

    const htmlToRender = processedHTML || fileContent;
    console.log('RenderFile: Rendering HTML file, content length:', htmlToRender.length);
    console.log('RenderFile: HTML content preview:', htmlToRender.substring(0, 100));
    
    return (
      <View style={styles.htmlContainer}>
        <View style={styles.headerContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>HTML</Text>
          </View>
          <ViewModeTabs viewMode={viewMode} onModeChange={handleModeChange} enableEditor={true} />
        </View>
        {viewMode === 'preview' ? (
          <WebView
            key={`html-${filePath}-${htmlDependencyPaths.length}-${renderVersion}-${(htmlToRender || '').length}`}
            source={{ html: htmlToRender }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={false}
            allowExternalScripts={true}
            onLoad={() => {
              console.log('RenderFile: HTML content loaded successfully');
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('RenderFile: WebView error:', nativeEvent);
            }}
          />
        ) : viewMode === 'edit' ? (
          <BlockEditorPanel
            fileType="html"
            html={editorHTML || htmlToRender}
            selectedBlock={selectedBlock}
            onMessage={handleEditorMessage}
            onApplyPatch={applyAndCommitPatch}
            onStagePatch={applyBlockPatch}
            layersTree={layersTree}
            layerNames={layerNames}
            onRenameLayer={handleRenameLayer}
            outgoingMessage={iframeCommand}
            onSendCommand={sendIframeCommand}
            onInsertBlock={stageInsertBlock}
            onDeleteBlock={stageDeleteBlock}
            styleSnapshot={selectedBlock?.id ? styleSnapshots[selectedBlock.id] : null}
            textSnapshot={selectedBlock?.id ? textSnapshots[selectedBlock.id] : ''}
            onReparentBlock={stageReparentBlock}
            onSetText={stageSetText}
            framework={framework}
          />
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>История изменений</Text>
            {hasStagedChanges && (
              <Text style={styles.changesStagedHint}>
                Есть несохранённые изменения из редактора — перейдите на другой таб или нажмите «Применить в файлы».
              </Text>
            )}
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>Изменений пока нет</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Блок: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>Файл: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.editorContainer}>
            <MonacoEditorWrapper
              value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
              language={getMonacoLanguage(fileType, filePath)}
              filePath={filePath}
              onChange={handleEditorChange}
              onSave={saveFile}
              editorRef={monacoEditorRef}
            />
            {isModified && (
              <View style={styles.saveIndicator}>
                <Text style={styles.saveIndicatorText}>● Несохраненные изменения (Ctrl+S для сохранения)</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  // Рендеринг React файлов (JSX/TSX)
  if (fileType === 'react' && fileContent) {
    // В режиме 'code' всегда показываем редактор, даже если идет обработка
    if ((isProcessingReact || !reactHTML) && viewMode !== 'code') {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Component</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Обработка зависимостей...</Text>
          </View>
        </View>
      );
    }
    
    return (
      <View style={styles.htmlContainer}>
        <View style={styles.headerContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Component</Text>
          </View>
          <ViewModeTabs viewMode={viewMode} onModeChange={handleModeChange} enableEditor={true} />
        </View>
        {viewMode === 'preview' ? (
          <WebView
            key={`react-${filePath}-${renderVersion}-${reactHTML?.length || 0}`}
            source={{ html: reactHTML }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowExternalScripts={true}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#667eea" />
              </View>
            )}
            onLoad={() => {
              console.log('RenderFile: React component loaded successfully');
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('RenderFile: WebView error:', nativeEvent);
            }}
          />
        ) : viewMode === 'edit' ? (
          <BlockEditorPanel
            fileType="react"
            html={editorHTML || reactHTML}
            selectedBlock={selectedBlock}
            onMessage={handleEditorMessage}
            onApplyPatch={applyAndCommitPatch}
            onStagePatch={applyBlockPatch}
            layersTree={layersTree}
            layerNames={layerNames}
            onRenameLayer={handleRenameLayer}
            outgoingMessage={iframeCommand}
            onSendCommand={sendIframeCommand}
            onInsertBlock={stageInsertBlock}
            onDeleteBlock={stageDeleteBlock}
            styleSnapshot={selectedBlock?.id ? styleSnapshots[selectedBlock.id] : null}
            textSnapshot={selectedBlock?.id ? textSnapshots[selectedBlock.id] : ''}
            onReparentBlock={stageReparentBlock}
            onSetText={stageSetText}
            framework={framework}
          />
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>История изменений</Text>
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>Изменений пока нет</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Блок: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>Файл: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.editorContainer}>
            <MonacoEditorWrapper
              value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
              language={getMonacoLanguage(fileType, filePath)}
              filePath={filePath}
              onChange={handleEditorChange}
              onSave={saveFile}
              editorRef={monacoEditorRef}
            />
            {isModified && (
              <View style={styles.saveIndicator}>
                <Text style={styles.saveIndicatorText}>● Несохраненные изменения (Ctrl+S для сохранения)</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  // Рендеринг React Native файлов
  if (fileType === 'react-native' && fileContent) {
    // В режиме 'code' всегда показываем редактор, даже если идет обработка
    if ((isProcessingReactNative || !reactNativeHTML) && viewMode !== 'code') {
      return (
        <View style={styles.htmlContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Native Component</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.loadingText}>Обработка зависимостей...</Text>
          </View>
        </View>
      );
    }
    
    return (
      <View style={styles.htmlContainer}>
        <View style={styles.headerContainer}>
          <View style={styles.fileTypeBadge}>
            <Text style={styles.fileTypeText}>React Native Component</Text>
          </View>
          <ViewModeTabs viewMode={viewMode} onModeChange={handleModeChange} enableEditor={true} />
        </View>
        {viewMode === 'preview' ? (
          <WebView
            key={`react-native-${filePath}-${renderVersion}-${reactNativeHTML?.length || 0}`}
            source={{ html: reactNativeHTML }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowExternalScripts={true}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#667eea" />
              </View>
            )}
            onLoad={() => {
              console.log('RenderFile: React Native component loaded successfully');
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('RenderFile: WebView error:', nativeEvent);
            }}
          />
        ) : viewMode === 'edit' ? (
          <BlockEditorPanel
            fileType="react-native"
            html={editorHTML || reactNativeHTML}
            selectedBlock={selectedBlock}
            onMessage={handleEditorMessage}
            onApplyPatch={applyAndCommitPatch}
            onStagePatch={applyBlockPatch}
            layersTree={layersTree}
            layerNames={layerNames}
            onRenameLayer={handleRenameLayer}
            outgoingMessage={iframeCommand}
            onSendCommand={sendIframeCommand}
            onInsertBlock={stageInsertBlock}
            onDeleteBlock={stageDeleteBlock}
            styleSnapshot={selectedBlock?.id ? styleSnapshots[selectedBlock.id] : null}
            textSnapshot={selectedBlock?.id ? textSnapshots[selectedBlock.id] : ''}
            onReparentBlock={stageReparentBlock}
            onSetText={stageSetText}
            framework={framework}
          />
        ) : viewMode === 'changes' ? (
          <View style={styles.changesContainer}>
            <Text style={styles.changesTitle}>История изменений</Text>
            {changesLog.length === 0 ? (
              <Text style={styles.changesEmpty}>Изменений пока нет</Text>
            ) : (
              <ScrollView style={styles.changesScroll}>
                {changesLog.map((c) => (
                  <View key={c.ts} style={styles.changeItem}>
                    <Text style={styles.changeItemTitle}>{new Date(c.ts).toLocaleString()}</Text>
                    <Text style={styles.changeItemText}>Блок: {c.blockId}</Text>
                    <Text style={styles.changeItemText}>Файл: {c.filePath}</Text>
                    <Text style={styles.changeItemText}>Patch: {JSON.stringify(c.patch)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.editorContainer}>
            <MonacoEditorWrapper
              value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
              language={getMonacoLanguage(fileType, filePath)}
              filePath={filePath}
              onChange={handleEditorChange}
              onSave={saveFile}
              editorRef={monacoEditorRef}
            />
            {isModified && (
              <View style={styles.saveIndicator}>
                <Text style={styles.saveIndicatorText}>● Несохраненные изменения (Ctrl+S для сохранения)</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  // Рендеринг бинарных файлов
  if (fileType === 'binary') {
    const lowerPath = filePath?.toLowerCase() || '';
    const isImage = lowerPath.endsWith('.png') || lowerPath.endsWith('.jpg') || 
                     lowerPath.endsWith('.jpeg') || lowerPath.endsWith('.gif') || 
                     lowerPath.endsWith('.bmp') || lowerPath.endsWith('.ico') || 
                     lowerPath.endsWith('.svg') || lowerPath.endsWith('.webp');
    
    return (
      <View style={styles.binaryContainer}>
        <View style={styles.fileTypeBadge}>
          <Text style={styles.fileTypeText}>Бинарный файл</Text>
        </View>
        <View style={styles.binaryInfo}>
          <Text style={styles.binaryTitle}>Этот файл не может быть отредактирован в текстовом редакторе</Text>
          <Text style={styles.binaryPath}>Путь: {filePath}</Text>
          {isImage && (
            <View style={styles.imagePreview}>
              <img 
                src={`file://${filePath}`} 
                alt={filePath.split(/[/\\]/).pop()}
                style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </View>
          )}
          <Text style={styles.binaryHint}>
            {isImage 
              ? 'Это изображение. Для редактирования используйте графический редактор.'
              : 'Этот файл содержит бинарные данные и не может быть отредактирован как текст.'}
          </Text>
        </View>
      </View>
    );
  }

  // Рендеринг текстовых файлов (JS, TS, CSS, JSON, Markdown и др.)
  console.log('RenderFile: Rendering text file, type:', fileType, 'content length:', fileContent?.length);
  const monacoLanguage = getMonacoLanguage(fileType, filePath);
  const languageNames = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'css': 'CSS',
    'json': 'JSON',
    'markdown': 'Markdown',
    'html': 'HTML',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C/C++',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'php': 'PHP',
    'ruby': 'Ruby',
    'shell': 'Shell',
    'xml': 'XML',
    'yaml': 'YAML',
    'sql': 'SQL',
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile',
    'lua': 'Lua',
    'perl': 'Perl',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'vue': 'Vue',
    'plaintext': 'Текст',
  };
  
  return (
    <View style={styles.textContainer}>
      <View style={styles.fileTypeBadge}>
        <Text style={styles.fileTypeText}>
          {languageNames[monacoLanguage] || 'Текст'}
        </Text>
      </View>
      <View style={styles.editorContainer}>
        <MonacoEditorWrapper
          value={unsavedContent !== null ? unsavedContent : (fileContent || '')}
          language={monacoLanguage}
          filePath={filePath}
          onChange={handleEditorChange}
          onSave={saveFile}
          editorRef={monacoEditorRef}
        />
        {isModified && (
          <View style={styles.saveIndicator}>
            <Text style={styles.saveIndicatorText}>● Несохраненные изменения (Ctrl+S для сохранения)</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
  placeholderText: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 12,
  },
  hintText: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.5,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.8,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.4)',
    alignItems: 'center',
    maxWidth: '100%',
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  htmlContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  webview: {
    flex: 1,
    width: '100%',
    minHeight: 600,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  fileTypeBadge: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  fileTypeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    padding: 2,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 80,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#667eea',
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  editorContainer: {
    flex: 1,
    width: '100%',
    minHeight: 600,
    backgroundColor: '#1e1e1e',
  },
  changesContainer: {
    flex: 1,
    width: '100%',
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    padding: 16,
  },
  changesTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  changesStagedHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },
  changesEmpty: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  changesScroll: {
    flex: 1,
  },
  changeItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  changeItemTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  changeItemText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  textContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
  },
  codeScrollView: {
    flex: 1,
  },
  codeContainer: {
    padding: 0,
  },
  codeWrapper: {
    backgroundColor: '#1e1e1e',
    padding: 16,
    borderRadius: 4,
  },
  codeText: {
    fontFamily: 'Monaco, "Courier New", monospace',
    fontSize: 14,
    color: '#d4d4d4',
    lineHeight: 20,
  },
  binaryContainer: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
  },
  binaryInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  binaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  binaryPath: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 20,
    textAlign: 'center',
  },
  binaryHint: {
    fontSize: 14,
    color: '#d4d4d4',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 20,
  },
  imagePreview: {
    marginTop: 20,
    marginBottom: 20,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveIndicator: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    zIndex: 1000,
  },
  saveIndicatorText: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '600',
  },
});

export default RenderFile;
