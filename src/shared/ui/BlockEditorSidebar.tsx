import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

const htmlInputStyle = {
  width: '100%',
  height: '32px',
  borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(0,0,0,0.25)',
  color: '#ffffff',
  paddingLeft: '10px',
  paddingRight: '10px',
  outline: 'none',
};

export function BlockEditorSidebar(props) {
  const {
    styles,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    selectedBlockIds,
    onExtractSelection,
    selectedBlock,
    layersTree,
    renderTreeNode,
    fileType,
    setInsertMode,
    insertMode,
    insertTag,
    setInsertTag,
    insertText,
    setInsertText,
    insertStyleMode,
    setInsertStyleMode,
    insertStyleRows,
    setInsertStyleRows,
    insertStyleText,
    setInsertStyleText,
    handleDeleteSelected,
    handleConfirmInsert,
    reparentMode,
    setReparentMode,
    reparentTargetId,
    setReparentTargetId,
    handleToggleReparentMode,
    handleApplyReparent,
    onDeleteBlock,
    lastDeleteTimeRef,
    livePosition,
    left,
    top,
    width,
    height,
    leftMode,
    topMode,
    widthMode,
    heightMode,
    widthUnit,
    heightUnit,
    handleLeftChange,
    handleTopChange,
    handleWidthChange,
    handleHeightChange,
    handleLeftModeChange,
    handleTopModeChange,
    handleWidthModeChange,
    handleHeightModeChange,
    handleWidthUnitChange,
    handleHeightUnitChange,
    NumberField,
    textValue,
    setTextValue,
    handleStageText,
    onSetText,
    lastSetTextTimeRef,
    TextField,
    moveMode,
    handleMoveModeChange,
    moveUnit,
    handleMoveUnitChange,
    handlePositionPreset,
    onSendCommand,
    styleMode,
    setStyleMode,
    styleRows,
    setStyleRows,
    styleText,
    setStyleText,
    stageLocalStyles,
    styleSnapshot,
    bg,
    setBg,
    color,
    setColor,
    borderRadiusValue,
    setBorderRadiusValue,
    borderWidthValue,
    setBorderWidthValue,
    borderColorValue,
    setBorderColorValue,
    boxShadowValue,
    setBoxShadowValue,
    fontFamilyValue,
    setFontFamilyValue,
    fontSizeValue,
    setFontSizeValue,
    fontWeightValue,
    setFontWeightValue,
    outlineValue,
    setOutlineValue,
    outlineColorValue,
    setOutlineColorValue,
    opacityValue,
    setOpacityValue,
    marginValue,
    setMarginValue,
    paddingValue,
    setPaddingValue,
    transformValue,
    setTransformValue,
    displayValue,
    setDisplayValue,
    justifyContentValue,
    setJustifyContentValue,
    alignItemsValue,
    setAlignItemsValue,
    gapValue,
    setGapValue,
    flexDirectionValue,
    setFlexDirectionValue,
    flexWrapValue,
    setFlexWrapValue,
    backgroundSizeValue,
    setBackgroundSizeValue,
    lineHeightValue,
    setLineHeightValue,
    letterSpacingValue,
    setLetterSpacingValue,
    textAlignValue,
    setTextAlignValue,
    textTransformValue,
    setTextTransformValue,
    flexValue,
    setFlexValue,
    styleLibraryEntries,
    onImportStyleTemplate,
    onImportStyleFromPicker,
    onApplyStyleLibraryEntry,
    onAddProjectDependency,
    onInsertComponentFromLibrary,
    canApply,
    handleApply,
  } = props;

  const colorPalette = [
    '#0f172a',
    '#1e293b',
    '#334155',
    '#475569',
    '#64748b',
    '#94a3b8',
    '#e2e8f0',
    '#f1f5f9',
    '#ffffff',
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#84cc16',
    '#22c55e',
    '#14b8a6',
    '#0ea5e9',
    '#6366f1',
    '#8b5cf6',
    '#ec4899',
  ];

  const normalizeHex = (value, fallback) => {
    const v = String(value || '').trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return v;
    return fallback;
  };
  const CollapsibleSection = ({ title, children, defaultOpen = false }) => (
    <details open={defaultOpen} style={{ marginBottom: 10 }}>
      <summary
        style={{
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 12,
          fontWeight: 700,
          listStyle: 'none',
          marginBottom: 8,
        }}
      >
        {title}
      </summary>
      <div style={{ paddingTop: 4 }}>{children}</div>
    </details>
  );
  const SelectField = ({ label, hint, value, onChange, options }) => (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          color: 'rgba(255,255,255,0.85)',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        <span>{label}</span>
        <span
          title={hint}
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'rgba(255,255,255,0.8)',
            cursor: 'help',
          }}
        >
          ?
        </span>
      </div>
      <select
        style={htmlInputStyle}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {(options || []).map((opt) => (
          <option key={`${label}-${opt.value}`} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
  const ColorPaletteRow = ({ selected, onSelect }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
      {colorPalette.map((c) => (
        <TouchableOpacity
          key={`mini-${c}`}
          onPress={() => onSelect?.(c)}
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            marginRight: 5,
            marginBottom: 5,
            backgroundColor: c,
            border:
              c.toLowerCase() === String(selected || '').toLowerCase()
                ? '2px solid rgba(255,255,255,0.95)'
                : c.toLowerCase() === '#ffffff'
                ? '1px solid rgba(0,0,0,0.35)'
                : '1px solid rgba(255,255,255,0.25)',
          }}
        />
      ))}
    </View>
  );
  const ColorFieldWithPalette = ({ label, hint, value, onChange, fallback = '#000000' }) => (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          color: 'rgba(255,255,255,0.85)',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        <span>{label}</span>
        {hint ? (
          <span
            title={hint}
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.4)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: 'rgba(255,255,255,0.8)',
              cursor: 'help',
            }}
          >
            ?
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          style={{ ...htmlInputStyle, flex: 1 }}
          type="text"
          value={value ?? ''}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={normalizeHex(value, fallback)}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 32,
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            padding: 0,
          }}
        />
      </div>
      <ColorPaletteRow selected={value} onSelect={onChange} />
    </div>
  );
  const HintedTextField = ({ label, hint, value, onChange, placeholder }) => (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          color: 'rgba(255,255,255,0.85)',
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        <span>{label}</span>
        <span
          title={hint}
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'rgba(255,255,255,0.8)',
            cursor: 'help',
          }}
        >
          ?
        </span>
      </div>
      <input
        style={htmlInputStyle}
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
  const parseShadowParts = (raw) => {
    const text = String(raw || '').trim();
    const inset = /\binset\b/.test(text);
    const colorMatch = text.match(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*$/);
    const color = colorMatch ? colorMatch[1] : '';
    let base = text.replace(/\binset\b/g, '').trim();
    if (colorMatch) base = base.slice(0, colorMatch.index).trim();
    const parts = base.split(/\s+/).filter(Boolean);
    return {
      inset,
      x: parts[0] || '0px',
      y: parts[1] || '0px',
      blur: parts[2] || '0px',
      spread: parts[3] || '0px',
      color: color || '#000000',
    };
  };
  const parseOutlineParts = (raw) => {
    const text = String(raw || '').trim();
    const parts = text.split(/\s+/).filter(Boolean);
    const width = parts[0] || '1px';
    const style = parts[1] || 'solid';
    const color = parts.slice(2).join(' ') || '#60a5fa';
    return { width, style, color };
  };
  const parseTransformParts = (raw) => {
    const text = String(raw || '');
    const getArg = (fnName) => {
      const m = text.match(new RegExp(`${fnName}\\(([^)]+)\\)`));
      return m ? m[1].trim() : '';
    };
    return {
      translateX: getArg('translateX'),
      translateY: getArg('translateY'),
      scale: getArg('scale'),
      rotate: getArg('rotate'),
    };
  };

  const shadowInitial = React.useMemo(() => parseShadowParts(boxShadowValue), [boxShadowValue]);
  const [shadowInset, setShadowInset] = React.useState(false);
  const [shadowX, setShadowX] = React.useState('0px');
  const [shadowY, setShadowY] = React.useState('0px');
  const [shadowBlur, setShadowBlur] = React.useState('0px');
  const [shadowSpread, setShadowSpread] = React.useState('0px');
  const [shadowColor, setShadowColor] = React.useState('#000000');
  React.useEffect(() => {
    setShadowInset(shadowInitial.inset);
    setShadowX(shadowInitial.x);
    setShadowY(shadowInitial.y);
    setShadowBlur(shadowInitial.blur);
    setShadowSpread(shadowInitial.spread);
    setShadowColor(shadowInitial.color);
  }, [shadowInitial]);
  const applyBoxShadow = (next = {}) => {
    const inset = next.inset ?? shadowInset;
    const x = (next.x ?? shadowX ?? '0px').trim();
    const y = (next.y ?? shadowY ?? '0px').trim();
    const blur = (next.blur ?? shadowBlur ?? '0px').trim();
    const spread = (next.spread ?? shadowSpread ?? '0px').trim();
    const color = (next.color ?? shadowColor ?? '').trim();
    const composed = `${inset ? 'inset ' : ''}${x} ${y} ${blur} ${spread}${color ? ` ${color}` : ''}`.trim();
    setBoxShadowValue(composed);
  };

  const outlineInitial = React.useMemo(() => parseOutlineParts(outlineValue), [outlineValue]);
  const [outlineWidthArg, setOutlineWidthArg] = React.useState('1px');
  const [outlineStyleArg, setOutlineStyleArg] = React.useState('solid');
  const [outlineColorArg, setOutlineColorArg] = React.useState('#60a5fa');
  React.useEffect(() => {
    setOutlineWidthArg(outlineInitial.width);
    setOutlineStyleArg(outlineInitial.style);
    setOutlineColorArg(outlineInitial.color);
  }, [outlineInitial]);
  const applyOutline = (next = {}) => {
    const widthArg = (next.width ?? outlineWidthArg ?? '1px').trim();
    const styleArg = (next.style ?? outlineStyleArg ?? 'solid').trim();
    const colorArg = (next.color ?? outlineColorArg ?? '').trim();
    const composed = `${widthArg}${styleArg ? ` ${styleArg}` : ''}${colorArg ? ` ${colorArg}` : ''}`.trim();
    setOutlineValue(composed);
    setOutlineColorValue(colorArg);
  };

  const transformInitial = React.useMemo(() => parseTransformParts(transformValue), [transformValue]);
  const [transformTranslateX, setTransformTranslateX] = React.useState('');
  const [transformTranslateY, setTransformTranslateY] = React.useState('');
  const [transformScale, setTransformScale] = React.useState('');
  const [transformRotate, setTransformRotate] = React.useState('');
  React.useEffect(() => {
    setTransformTranslateX(transformInitial.translateX);
    setTransformTranslateY(transformInitial.translateY);
    setTransformScale(transformInitial.scale);
    setTransformRotate(transformInitial.rotate);
  }, [transformInitial]);
  const applyTransform = (next = {}) => {
    const tx = (next.translateX ?? transformTranslateX ?? '').trim();
    const ty = (next.translateY ?? transformTranslateY ?? '').trim();
    const sc = (next.scale ?? transformScale ?? '').trim();
    const rot = (next.rotate ?? transformRotate ?? '').trim();
    const parts = [];
    if (tx) parts.push(`translateX(${tx})`);
    if (ty) parts.push(`translateY(${ty})`);
    if (sc) parts.push(`scale(${sc})`);
    if (rot) parts.push(`rotate(${rot})`);
    setTransformValue(parts.join(' '));
  };

  const handleDeletePress = () => {
    if (typeof handleDeleteSelected === 'function') {
      handleDeleteSelected();
      return;
    }

    if (!selectedBlock?.id || !onDeleteBlock || !lastDeleteTimeRef) return;
    const now = Date.now();
    if (now - lastDeleteTimeRef.current < 300) return;
    lastDeleteTimeRef.current = now;
    onDeleteBlock(selectedBlock.id);
  };

  const handleStageTextPress = () => {
    if (typeof handleStageText === 'function') {
      handleStageText();
      return;
    }

    if (!canApply || !selectedBlock?.id || !onSetText || !lastSetTextTimeRef) return;
    const now = Date.now();
    if (now - lastSetTextTimeRef.current < 300) return;
    lastSetTextTimeRef.current = now;
    onSetText({ blockId: selectedBlock.id, text: textValue });
  };

  const [sidebarTab, setSidebarTab] = React.useState<'inspector' | 'library' | 'styles'>('inspector');
  const [libraryDragTag, setLibraryDragTag] = React.useState<string | null>(null);
  const [iconSearch, setIconSearch] = React.useState('');
  const [librarySearch, setLibrarySearch] = React.useState('');
  const [libraryVersion, setLibraryVersion] = React.useState('latest');
  const [iconPreviewWarning, setIconPreviewWarning] = React.useState(false);
  const [libraryActionNote, setLibraryActionNote] = React.useState('');
  const supportsCssSpecialValues = fileType !== 'react-native';
  const positionModeOptions =
    supportsCssSpecialValues && moveMode !== 'relative'
      ? [
          { value: 'value', label: 'Value' },
          { value: 'auto', label: 'Auto' },
        ]
      : null;
  const widthModeOptions = supportsCssSpecialValues
    ? [
        { value: 'value', label: 'Value' },
        { value: 'auto', label: 'Auto' },
        { value: 'min-content', label: 'Min' },
        { value: 'max-content', label: 'Max' },
        { value: 'fit-content', label: 'Fit' },
      ]
    : null;
  const heightModeOptions = supportsCssSpecialValues
    ? [
        { value: 'value', label: 'Value' },
        { value: 'auto', label: 'Auto' },
      ]
    : null;
  const blockLibraryItems =
    fileType === 'react-native'
      ? ['View', 'Text', 'TouchableOpacity', 'Image', 'ScrollView']
      : ['div', 'span', 'button', 'section', 'img'];
  const iconLibraries = React.useMemo(
    () => [
      {
        prefix: 'Fa',
        title: 'Font Awesome',
        importPath: 'react-icons/fa',
        icons: [
          'FaHome', 'FaUser', 'FaSearch', 'FaHeart', 'FaStar', 'FaBell', 'FaEnvelope',
          'FaPhone', 'FaCamera', 'FaShoppingCart', 'FaCheck', 'FaTimes', 'FaPlus',
          'FaMinus', 'FaEdit', 'FaTrash', 'FaLock', 'FaUnlock', 'FaPlay', 'FaPause',
          'FaGithub', 'FaFacebook', 'FaInstagram', 'FaTwitter',
        ],
      },
      {
        prefix: 'Md',
        title: 'Material Design',
        importPath: 'react-icons/md',
        icons: [
          'MdHome', 'MdPerson', 'MdSearch', 'MdFavorite', 'MdStar', 'MdNotifications',
          'MdMail', 'MdPhone', 'MdCameraAlt', 'MdShoppingCart', 'MdCheck', 'MdClose',
          'MdAdd', 'MdRemove', 'MdEdit', 'MdDelete', 'MdLock', 'MdLockOpen',
          'MdPlayArrow', 'MdPause', 'MdMenu', 'MdSettings', 'MdInfo', 'MdWarning',
        ],
      },
      {
        prefix: 'Hi',
        title: 'Heroicons',
        importPath: 'react-icons/hi',
        icons: [
          'HiHome', 'HiUser', 'HiSearch', 'HiHeart', 'HiStar', 'HiBell', 'HiMail',
          'HiPhone', 'HiCamera', 'HiShoppingCart', 'HiCheck', 'HiX', 'HiPlus',
          'HiMinus', 'HiPencil', 'HiTrash', 'HiLockClosed', 'HiLockOpen',
          'HiPlay', 'HiPause', 'HiMenu', 'HiCog', 'HiInformationCircle', 'HiExclamation',
        ],
      },
      {
        prefix: 'Io5',
        title: 'Ionicons 5',
        importPath: 'react-icons/io5',
        icons: [
          'IoHome',
          'IoHomeOutline',
          'IoSearch',
          'IoSearchOutline',
          'IoPerson',
          'IoPersonOutline',
          'IoHeart',
          'IoHeartOutline',
          'IoStar',
          'IoStarOutline',
          'IoMail',
          'IoMailOutline',
          'IoCall',
          'IoCallOutline',
          'IoCamera',
          'IoCameraOutline',
          'IoCart',
          'IoCartOutline',
          'IoAdd',
          'IoRemove',
          'IoCheckmark',
          'IoClose',
          'IoMenu',
          'IoSettings',
          'IoInformationCircle',
          'IoWarning',
        ],
      },
    ],
    []
  );
  const knownLibraries = React.useMemo(
    () => [
      { name: 'react-icons', description: 'Fa / Md / Hi and many others' },
      { name: 'react-icons/io5', description: 'Ionicons 5 subpath for imports' },
      { name: 'lucide-react', description: 'Lucide icon set for React' },
      { name: '@mui/icons-material', description: 'Material UI icon package' },
      { name: 'framer-motion', description: 'Animation library' },
      { name: 'clsx', description: 'ClassName utility' },
    ],
    []
  );
  const startComponentDrag = (componentName, importPath) => {
    if (!onSendCommand || !componentName || !importPath) return;
    setLibraryDragTag(`icon:${componentName}`);
    onSendCommand({
      type: 'MRPAK_CMD_START_DRAG',
      source: 'component',
      componentName,
      importPath,
      importKind: 'named',
      hasProps: false,
      propsCount: 0,
      supportsStyleOnlyArg: false,
    });
  };
  const normalizedIconSearch = String(iconSearch || '').trim().toLowerCase();
  const filteredIconLibraries = React.useMemo(() => {
    if (!normalizedIconSearch) return iconLibraries;
    return iconLibraries
      .map((lib) => ({
        ...lib,
        icons: lib.icons.filter((name) => name.toLowerCase().includes(normalizedIconSearch)),
      }))
      .filter((lib) => lib.icons.length > 0);
  }, [iconLibraries, normalizedIconSearch]);
  const normalizedLibrarySearch = String(librarySearch || '').trim().toLowerCase();
  const filteredKnownLibraries = React.useMemo(() => {
    if (!normalizedLibrarySearch) return knownLibraries;
    return knownLibraries.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const description = String(item.description || '').toLowerCase();
      return name.includes(normalizedLibrarySearch) || description.includes(normalizedLibrarySearch);
    });
  }, [knownLibraries, normalizedLibrarySearch]);
  const toIconSlug = (name = '', prefix = '') => {
    const effectivePrefix = prefix === 'Io5' ? 'Io' : prefix;
    const raw = String(name || '').replace(new RegExp(`^${effectivePrefix}`), '');
    return raw
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/_/g, '-')
      .toLowerCase();
  };
  const getIconPreviewUrl = (libPrefix = '', iconName = '') => {
    const slug = toIconSlug(iconName, libPrefix);
    if (!slug) return '';
    if (libPrefix === 'Fa') return `https://api.iconify.design/fa6-solid:${slug}.svg`;
    if (libPrefix === 'Md') return `https://api.iconify.design/mdi:${slug}.svg`;
    if (libPrefix === 'Hi') return `https://api.iconify.design/heroicons-solid:${slug}.svg`;
    if (libPrefix === 'Io5') return `https://api.iconify.design/ion:${slug}.svg`;
    return '';
  };
  const getIconFallbackUrl = (libPrefix = '', iconName = '') => {
    const slug = toIconSlug(iconName, libPrefix);
    if (!slug) return '';
    if (libPrefix === 'Fa') return `https://api.iconify.design/fa6-brands:${slug}.svg`;
    if (libPrefix === 'Hi') return `https://api.iconify.design/heroicons-outline:${slug}.svg`;
    if (libPrefix === 'Io5') return `https://api.iconify.design/ion:${slug}-outline.svg`;
    return '';
  };
  const normalizePackageInput = (value = '') => {
    const v = String(value || '').trim();
    if (!v) return '';
    if (v.startsWith('react-icons/')) return 'react-icons';
    return v;
  };
  const handleAddLibrary = async (rawPackageName, rawVersion) => {
    const pkg = normalizePackageInput(rawPackageName);
    if (!pkg) {
      setLibraryActionNote('Введите имя пакета.');
      return;
    }
    try {
      setLibraryActionNote(`Добавляю ${pkg}...`);
      const result = await Promise.resolve(
        onAddProjectDependency?.(pkg, String(rawVersion || '').trim() || 'latest')
      );
      if (result === false) {
        setLibraryActionNote(`Не удалось добавить ${pkg}.`);
      } else {
        setLibraryActionNote(`Добавлено: ${pkg}`);
        if (String(rawPackageName || '').trim() !== pkg) {
          setLibrarySearch(pkg);
        }
      }
    } catch (error) {
      setLibraryActionNote(`Ошибка: ${String(error || '')}`);
    }
  };
  const styleLibraryColumns = React.useMemo(() => {
    const map = new Map<string, any[]>();
    (styleLibraryEntries || []).forEach((entry: any) => {
      const fileKey = String(entry?.sourceFileName || entry?.path || 'styles.css');
      const list = map.get(fileKey) || [];
      list.push(entry);
      map.set(fileKey, list);
    });
    return Array.from(map.entries()).map(([fileName, entries]) => ({
      fileName,
      entries: entries.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    }));
  }, [styleLibraryEntries]);

  const startLibraryDrag = (tag: string) => {
    if (!onSendCommand) return;
    setLibraryDragTag(tag);
    onSendCommand({ type: 'MRPAK_CMD_START_DRAG', source: 'library', tag });
  };

  React.useEffect(() => {
    if (!libraryDragTag || !onSendCommand || typeof window === 'undefined') return;
    const finish = () => {
      onSendCommand({ type: 'MRPAK_CMD_END_DRAG', source: 'library', tag: libraryDragTag });
      setLibraryDragTag(null);
    };
    window.addEventListener('mouseup', finish, true);
    window.addEventListener('touchend', finish, true);
    window.addEventListener('blur', finish, true);
    return () => {
      window.removeEventListener('mouseup', finish, true);
      window.removeEventListener('touchend', finish, true);
      window.removeEventListener('blur', finish, true);
    };
  }, [libraryDragTag, onSendCommand]);

  return (
    <View style={styles.sidebar}>
      <ScrollView
        style={styles.sidebarScroll}
        contentContainerStyle={styles.sidebarScrollContent}
      >
        <View style={styles.undoRedoContainer}>
          <TouchableOpacity
            style={[styles.undoRedoBtn, !canUndo && styles.undoRedoBtnDisabled]}
            onPress={onUndo}
            disabled={!canUndo}
          >
            <Text style={styles.undoRedoBtnText}>↶ Отменить (Ctrl+Z)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.undoRedoBtn, !canRedo && styles.undoRedoBtnDisabled]}
            onPress={onRedo}
            disabled={!canRedo}
          >
            <Text style={styles.undoRedoBtnText}>↷ Повторить (Ctrl+Shift+Z)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stylesTabs}>
          <TouchableOpacity
            style={[styles.stylesTab, sidebarTab === 'inspector' && styles.stylesTabActive]}
            onPress={() => setSidebarTab('inspector')}
          >
            <Text style={styles.stylesTabText}>Inspector</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stylesTab, sidebarTab === 'library' && styles.stylesTabActive]}
            onPress={() => setSidebarTab('library')}
          >
            <Text style={styles.stylesTabText}>Library</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stylesTab, sidebarTab === 'styles' && styles.stylesTabActive]}
            onPress={() => setSidebarTab('styles')}
          >
            <Text style={styles.stylesTabText}>Styles</Text>
          </TouchableOpacity>
        </View>

        {sidebarTab === 'inspector' ? (
          <>
        <Text style={styles.sidebarTitle}>Блок</Text>
        <Text style={styles.sidebarMeta}>
          {selectedBlock?.id ? selectedBlock.id : 'Ничего не выбрано'}
        </Text>

        <Text style={styles.hint}>
          Выбрано: {Array.isArray(selectedBlockIds) && selectedBlockIds.length > 0 ? selectedBlockIds.length : (selectedBlock?.id ? 1 : 0)}. Мультивыбор sibling: Ctrl+Shift+Click.
        </Text>
        <View style={styles.stylesActionsRow}>
          <TouchableOpacity
            style={[
              styles.layerSaveBtn,
              (!selectedBlock?.id && (!Array.isArray(selectedBlockIds) || selectedBlockIds.length === 0)) && styles.layerOpBtnDisabled,
            ]}
            disabled={!selectedBlock?.id && (!Array.isArray(selectedBlockIds) || selectedBlockIds.length === 0)}
            onPress={() => onExtractSelection?.()}
          >
            <Text style={styles.layerSaveBtnText}>Extract to file</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Слои</Text>

          {layersTree?.rootIds?.length ? (
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {layersTree.rootIds.map((rid: any) => renderTreeNode(rid, 0))}
            </div>
          ) : (
            <Text style={styles.hint}>Дерево слоёв загружается…</Text>
          )}

          <View style={styles.layerOpsRow}>
            <TouchableOpacity
              style={[styles.layerOpBtn, !selectedBlock?.id && styles.layerOpBtnDisabled]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return;
                setInsertMode('child');
              }}
            >
              <Text style={styles.layerOpBtnText}>+ child</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.layerOpBtn, !selectedBlock?.id && styles.layerOpBtnDisabled]}
              disabled={!selectedBlock?.id}
              onPress={() => {
                if (!selectedBlock?.id) return;
                setInsertMode('sibling');
              }}
            >
              <Text style={styles.layerOpBtnText}>+ sibling</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.layerOpBtnDanger, !selectedBlock?.id && styles.layerOpBtnDisabled]}
              disabled={!selectedBlock?.id}
              onPress={handleDeletePress}
            >
              <Text style={styles.layerOpBtnText}>Удалить</Text>
            </TouchableOpacity>
          </View>

          {insertMode && (
            <View style={styles.insertBox}>
              <Text style={styles.insertTitle}>Добавить блок ({insertMode})</Text>

              <Text style={styles.insertLabel}>Тип</Text>
              <select
                style={{ ...htmlInputStyle, height: '36px' }}
                value={insertTag}
                onChange={(e) => setInsertTag(e.target.value)}
              >
                {fileType === 'react-native' ? (
                  <>
                    <option value="View">View</option>
                    <option value="Text">Text</option>
                    <option value="TouchableOpacity">TouchableOpacity</option>
                  </>
                ) : (
                  <>
                    <option value="div">div</option>
                    <option value="span">span</option>
                    <option value="button">button</option>
                    <option value="section">section</option>
                  </>
                )}
              </select>

              <Text style={styles.insertLabel}>Текст</Text>
              <input
                style={htmlInputStyle}
                type="text"
                value={insertText}
                onChange={(e) => setInsertText(e.target.value)}
              />

              <View style={styles.stylesHeaderRow}>
                <Text style={styles.insertLabel}>Стили</Text>
                <View style={styles.stylesTabs}>
                  <TouchableOpacity
                    style={[styles.stylesTab, insertStyleMode === 'kv' && styles.stylesTabActive]}
                    onPress={() => setInsertStyleMode('kv')}
                  >
                    <Text style={styles.stylesTabText}>KV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.stylesTab, insertStyleMode === 'text' && styles.stylesTabActive]}
                    onPress={() => setInsertStyleMode('text')}
                  >
                    <Text style={styles.stylesTabText}>Text</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.reparentBox}>
                <TouchableOpacity
                  style={styles.layerOpBtn}
                  onPress={() => {
                    if (typeof handleToggleReparentMode === 'function') {
                      handleToggleReparentMode();
                      return;
                    }
                    setReparentMode((v) => !v);
                    setReparentTargetId(null);
                  }}
                >
                  <Text style={styles.layerOpBtnText}>
                    {reparentMode ? 'Отмена переноса' : 'Перенести: выбрать родителя'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.layerSaveBtn,
                    (!selectedBlock?.id || !reparentTargetId) && styles.layerOpBtnDisabled,
                  ]}
                  disabled={!selectedBlock?.id || !reparentTargetId}
                  onPress={() => {
                    if (typeof handleApplyReparent === 'function') {
                      handleApplyReparent();
                    }
                  }}
                >
                  <Text style={styles.layerSaveBtnText}>Перенести в выбранного</Text>
                </TouchableOpacity>
              </View>

              {insertStyleMode === 'kv' ? (
                <div style={{ maxHeight: 120, overflow: 'auto' }}>
                  {insertStyleRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        style={htmlInputStyle}
                        type="text"
                        placeholder={fileType === 'html' ? 'prop-kebab' : 'propCamel'}
                        value={row.key}
                        onChange={(e) => {
                          const value = e.target.value;
                          setInsertStyleRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, key: value } : r))
                          );
                        }}
                      />
                      <input
                        style={htmlInputStyle}
                        type="text"
                        placeholder="value"
                        value={row.value}
                        onChange={(e) => {
                          const value = e.target.value;
                          setInsertStyleRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, value } : r))
                          );
                        }}
                      />
                      <button
                        style={{
                          height: '32px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          padding: '0 10px',
                          cursor: 'pointer',
                        }}
                        onClick={() => setInsertStyleRows((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  style={{
                    width: '100%',
                    minHeight: '110px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(0,0,0,0.25)',
                    color: '#fff',
                    padding: '10px',
                    outline: 'none',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  }}
                  placeholder={'color: red;\nwidth: 120px;'}
                  value={insertStyleText}
                  onChange={(e) => setInsertStyleText(e.target.value)}
                />
              )}

              <View style={styles.insertActionsRow}>
                <TouchableOpacity
                  style={styles.layerOpBtn}
                  onPress={() => setInsertStyleRows((prev) => [...prev, { key: '', value: '' }])}
                >
                  <Text style={styles.layerOpBtnText}>+ стиль</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.layerSaveBtn} onPress={handleConfirmInsert}>
                  <Text style={styles.layerSaveBtnText}>Добавить</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.layerCancelBtn} onPress={() => setInsertMode(null)}>
                  <Text style={styles.layerCancelBtnText}>Отмена</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Позиция/Размер</Text>

          {typeof handleMoveModeChange === 'function' && (
            <>
              <Text style={styles.insertLabel}>Режим перемещения</Text>
              <select
                style={{ ...htmlInputStyle, height: '36px', marginBottom: '10px' }}
                value={moveMode || 'absolute'}
                onChange={(e) => handleMoveModeChange(e.target.value)}
              >
                <option value="absolute">AbsoluteToParent</option>
                <option value="relative">Relative</option>
                <option value="grid8">GridSnap(8)</option>
              </select>
              <Text style={styles.insertLabel}>Единицы</Text>
              <select
                style={{ ...htmlInputStyle, height: '36px', marginBottom: '10px' }}
                value={moveMode === 'grid8' ? 'px' : (moveUnit || 'px')}
                onChange={(e) => handleMoveUnitChange?.(e.target.value as 'px' | '%')}
                disabled={moveMode === 'grid8'}
              >
                <option value="px">Pixels</option>
                <option value="%">Percent</option>
              </select>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginBottom: '10px' }}>
                {moveMode === 'absolute' && 'Позиционирование относительно родителя с точными координатами'}
                {moveMode === 'relative' && 'Позиционирование относительно текущей позиции элемента'}
                {moveMode === 'grid8' && 'Позиционирование с привязкой к сетке 8px для точного выравнивания'}
              </Text>
            </>
          )}

          <Text style={styles.insertLabel}>Позиционные пресеты</Text>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '6px',
              marginBottom: '12px',
            }}
          >
            {[
              { h: 'left', v: 'top', label: '↖' },
              { h: 'center', v: 'top', label: '↑' },
              { h: 'right', v: 'top', label: '↗' },
              { h: 'left', v: 'center', label: '←' },
              { h: 'center', v: 'center', label: '•' },
              { h: 'right', v: 'center', label: '→' },
              { h: 'left', v: 'bottom', label: '↙' },
              { h: 'center', v: 'bottom', label: '↓' },
              { h: 'right', v: 'bottom', label: '↘' },
            ].map((preset) => (
              <button
                key={preset.label}
                style={{
                  height: '34px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  cursor: selectedBlock?.id ? 'pointer' : 'not-allowed',
                  opacity: selectedBlock?.id ? 1 : 0.45,
                  fontSize: '15px',
                  fontWeight: 700,
                }}
                disabled={!selectedBlock?.id}
                onClick={() =>
                  handlePositionPreset?.(
                    preset.h as 'left' | 'center' | 'right',
                    preset.v as 'top' | 'center' | 'bottom'
                  )
                }
              >
                {preset.label}
              </button>
            ))}
          </div>

          <NumberField
            label="left"
            value={leftMode === 'value' ? (livePosition?.left ?? left) : null}
            onChange={handleLeftChange}
            mode={leftMode}
            modeOptions={positionModeOptions}
            onModeChange={handleLeftModeChange}
          />
          <NumberField
            label="top"
            value={topMode === 'value' ? (livePosition?.top ?? top) : null}
            onChange={handleTopChange}
            mode={topMode}
            modeOptions={positionModeOptions}
            onModeChange={handleTopModeChange}
          />
          <NumberField
            label="width"
            value={widthMode === 'value' ? (livePosition?.width ?? width) : null}
            onChange={handleWidthChange}
            mode={widthMode}
            modeOptions={widthModeOptions}
            onModeChange={handleWidthModeChange}
          />
          {widthMode === 'value' ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <select
                style={{ ...htmlInputStyle, width: '92px', height: '30px' }}
                value={widthUnit || 'px'}
                onChange={(e) => handleWidthUnitChange?.(e.target.value as 'px' | '%')}
              >
                <option value="px">px</option>
                <option value="%">%</option>
              </select>
            </div>
          ) : null}
          <NumberField
            label="height"
            value={heightMode === 'value' ? (livePosition?.height ?? height) : null}
            onChange={handleHeightChange}
            mode={heightMode}
            modeOptions={heightModeOptions}
            onModeChange={handleHeightModeChange}
          />
          {heightMode === 'value' ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <select
                style={{ ...htmlInputStyle, width: '92px', height: '30px' }}
                value={heightUnit || 'px'}
                onChange={(e) => handleHeightUnitChange?.(e.target.value as 'px' | '%')}
              >
                <option value="px">px</option>
                <option value="%">%</option>
              </select>
            </div>
          ) : null}

          {livePosition && (
            livePosition.left !== null ||
            livePosition.top !== null ||
            livePosition.width !== null ||
            livePosition.height !== null
          ) && (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginTop: '6px', fontStyle: 'italic' }}>
              ● Обновляется в реальном времени
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Текст</Text>
          <TextField
            label="text"
            value={textValue}
            onChange={setTextValue}
            placeholder="Текст блока"
          />

          <View style={styles.stylesActionsRow}>
            <TouchableOpacity
              style={[styles.layerOpBtn, !canApply && styles.layerOpBtnDisabled]}
              disabled={!canApply}
              onPress={handleStageTextPress}
            >
              <Text style={styles.layerOpBtnText}>Stage текст</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.stylesHeaderRow}>
            <Text style={styles.sectionTitle}>Стили</Text>
            <View style={styles.stylesTabs}>
              <TouchableOpacity
                style={[styles.stylesTab, styleMode === 'kv' && styles.stylesTabActive]}
                onPress={() => setStyleMode('kv')}
              >
                <Text style={styles.stylesTabText}>KV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stylesTab, styleMode === 'text' && styles.stylesTabActive]}
                onPress={() => setStyleMode('text')}
              >
                <Text style={styles.stylesTabText}>Text</Text>
              </TouchableOpacity>
            </View>
          </View>

          {styleMode === 'kv' ? (
            <div style={{ maxHeight: 180, overflow: 'auto' }}>
              {styleRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    style={htmlInputStyle}
                    type="text"
                    placeholder={fileType === 'html' ? 'prop-kebab' : 'propCamel'}
                    value={row.key}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStyleRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, key: value } : r))
                      );
                    }}
                  />
                  <input
                    style={htmlInputStyle}
                    type="text"
                    placeholder="value"
                    value={row.value}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStyleRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, value } : r))
                      );
                    }}
                  />
                  <button
                    style={{
                      height: '32px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      padding: '0 10px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setStyleRows((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <textarea
              style={{
                width: '100%',
                minHeight: '160px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.25)',
                color: '#fff',
                padding: '10px',
                outline: 'none',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
              placeholder={'color: red;\nwidth: 120px;'}
              value={styleText}
              onChange={(e) => setStyleText(e.target.value)}
            />
          )}

          <View style={styles.stylesActionsRow}>
            <TouchableOpacity
              style={[styles.layerOpBtn, !canApply && styles.layerOpBtnDisabled]}
              disabled={!canApply}
              onPress={() => setStyleRows((prev) => [...prev, { key: '', value: '' }])}
            >
              <Text style={styles.layerOpBtnText}>+ стиль</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.layerOpBtn, !canApply && styles.layerOpBtnDisabled]}
              disabled={!canApply}
              onPress={stageLocalStyles}
            >
              <Text style={styles.layerOpBtnText}>Stage (локально)</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            HTML: kebab-case и px; React/RN: camelCase, числа можно без px.
          </Text>

          {styleSnapshot?.computedStyle && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '12px', marginBottom: '6px' }}>
                computed (для справки)
              </div>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  padding: '10px',
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '11px',
                  lineHeight: '14px',
                  maxHeight: '120px',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(styleSnapshot.computedStyle, null, 2)}
              </pre>
            </div>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Цвета</Text>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <TextField label="bg" value={bg} onChange={setBg} placeholder="#ffffff" />
            </div>
            <input
              type="color"
              aria-label="bg color picker"
              value={normalizeHex(bg, '#ffffff')}
              onChange={(e) => setBg?.(e.target.value)}
              style={{
                width: 36,
                height: 32,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                padding: 0,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <TextField label="color" value={color} onChange={setColor} placeholder="#000000" />
            </div>
            <input
              type="color"
              aria-label="text color picker"
              value={normalizeHex(color, '#000000')}
              onChange={(e) => setColor?.(e.target.value)}
              style={{
                width: 36,
                height: 32,
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                padding: 0,
              }}
            />
          </div>
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginBottom: '6px' }}>
              Палитра
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', marginBottom: '4px' }}>bg</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {colorPalette.map((c) => (
                <TouchableOpacity
                  key={`bg-${c}`}
                  onPress={() => setBg?.(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    marginRight: 6,
                    marginBottom: 6,
                    backgroundColor: c,
                    border: c.toLowerCase() === '#ffffff' ? '1px solid rgba(0,0,0,0.35)' : '1px solid rgba(255,255,255,0.25)',
                  }}
                />
              ))}
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', marginTop: 6, marginBottom: '4px' }}>color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {colorPalette.map((c) => (
                <TouchableOpacity
                  key={`color-${c}`}
                  onPress={() => setColor?.(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    marginRight: 6,
                    marginBottom: 6,
                    backgroundColor: c,
                    border: c.toLowerCase() === '#ffffff' ? '1px solid rgba(0,0,0,0.35)' : '1px solid rgba(255,255,255,0.25)',
                  }}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Стиль (по темам)</Text>

          <CollapsibleSection title="Layout & Flex" defaultOpen={true}>
            <SelectField
              label="display"
              hint="Тип отображения элемента: block, inline, flex, grid..."
              value={displayValue}
              onChange={setDisplayValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'block', label: 'block' },
                { value: 'inline', label: 'inline' },
                { value: 'inline-block', label: 'inline-block' },
                { value: 'flex', label: 'flex' },
                { value: 'inline-flex', label: 'inline-flex' },
                { value: 'grid', label: 'grid' },
                { value: 'none', label: 'none' },
              ]}
            />
            <SelectField
              label="justifyContent"
              hint="Выравнивание дочерних элементов по главной оси."
              value={justifyContentValue}
              onChange={setJustifyContentValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'flex-start', label: 'flex-start' },
                { value: 'center', label: 'center' },
                { value: 'flex-end', label: 'flex-end' },
                { value: 'space-between', label: 'space-between' },
                { value: 'space-around', label: 'space-around' },
                { value: 'space-evenly', label: 'space-evenly' },
              ]}
            />
            <SelectField
              label="alignItems"
              hint="Выравнивание дочерних элементов по поперечной оси."
              value={alignItemsValue}
              onChange={setAlignItemsValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'stretch', label: 'stretch' },
                { value: 'flex-start', label: 'flex-start' },
                { value: 'center', label: 'center' },
                { value: 'flex-end', label: 'flex-end' },
                { value: 'baseline', label: 'baseline' },
              ]}
            />
            <HintedTextField label="gap" hint="Расстояние между дочерними элементами в flex/grid контейнере." value={gapValue} onChange={setGapValue} placeholder="12px" />
            <SelectField
              label="flexDirection"
              hint="Направление основной оси flex-контейнера."
              value={flexDirectionValue}
              onChange={setFlexDirectionValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'row', label: 'row' },
                { value: 'row-reverse', label: 'row-reverse' },
                { value: 'column', label: 'column' },
                { value: 'column-reverse', label: 'column-reverse' },
              ]}
            />
            <SelectField
              label="flexWrap"
              hint="Перенос элементов на новую строку."
              value={flexWrapValue}
              onChange={setFlexWrapValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'nowrap', label: 'nowrap' },
                { value: 'wrap', label: 'wrap' },
                { value: 'wrap-reverse', label: 'wrap-reverse' },
              ]}
            />
            <HintedTextField label="flex" hint="Насколько элемент растягивается/сжимается внутри flex-контейнера." value={flexValue} onChange={setFlexValue} placeholder="1" />
            <HintedTextField label="margin" hint="Внешние отступы элемента." value={marginValue} onChange={setMarginValue} placeholder="16px 24px" />
            <HintedTextField label="padding" hint="Внутренние отступы элемента." value={paddingValue} onChange={setPaddingValue} placeholder="12px 16px" />
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>transform</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input style={htmlInputStyle} type="text" value={transformTranslateX} placeholder="translateX(10px)" onChange={(e) => { const v = e.target.value; setTransformTranslateX(v); applyTransform({ translateX: v }); }} />
                <input style={htmlInputStyle} type="text" value={transformTranslateY} placeholder="translateY(10px)" onChange={(e) => { const v = e.target.value; setTransformTranslateY(v); applyTransform({ translateY: v }); }} />
                <input style={htmlInputStyle} type="text" value={transformScale} placeholder="scale(1.1)" onChange={(e) => { const v = e.target.value; setTransformScale(v); applyTransform({ scale: v }); }} />
                <input style={htmlInputStyle} type="text" value={transformRotate} placeholder="rotate(10deg)" onChange={(e) => { const v = e.target.value; setTransformRotate(v); applyTransform({ rotate: v }); }} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Typography">
            <TextField label="fontFamily" value={fontFamilyValue} onChange={setFontFamilyValue} placeholder="Georgia, serif" />
            <NumberField label="fontSize" value={fontSizeValue} onChange={setFontSizeValue} />
            <TextField label="fontWeight" value={fontWeightValue} onChange={setFontWeightValue} placeholder="700" />
            <HintedTextField label="lineHeight" hint="Высота строки текста." value={lineHeightValue} onChange={setLineHeightValue} placeholder="1.5" />
            <HintedTextField label="letterSpacing" hint="Расстояние между буквами." value={letterSpacingValue} onChange={setLetterSpacingValue} placeholder="0.02em" />
            <SelectField
              label="textAlign"
              hint="Горизонтальное выравнивание текста."
              value={textAlignValue}
              onChange={setTextAlignValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'left', label: 'left' },
                { value: 'center', label: 'center' },
                { value: 'right', label: 'right' },
                { value: 'justify', label: 'justify' },
              ]}
            />
            <SelectField
              label="textTransform"
              hint="Преобразование регистра."
              value={textTransformValue}
              onChange={setTextTransformValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'none', label: 'none' },
                { value: 'uppercase', label: 'uppercase' },
                { value: 'lowercase', label: 'lowercase' },
                { value: 'capitalize', label: 'capitalize' },
              ]}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Visual">
            <NumberField label="borderRadius" value={borderRadiusValue} onChange={setBorderRadiusValue} />
            <NumberField label="borderWidth" value={borderWidthValue} onChange={setBorderWidthValue} />
            <ColorFieldWithPalette label="borderColor" value={borderColorValue} onChange={setBorderColorValue} fallback="#334155" />
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>boxShadow</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input style={htmlInputStyle} type="text" value={shadowX} placeholder="offsetX (0px)" onChange={(e) => { const v = e.target.value; setShadowX(v); applyBoxShadow({ x: v }); }} />
                <input style={htmlInputStyle} type="text" value={shadowY} placeholder="offsetY (8px)" onChange={(e) => { const v = e.target.value; setShadowY(v); applyBoxShadow({ y: v }); }} />
                <input style={htmlInputStyle} type="text" value={shadowBlur} placeholder="blur (24px)" onChange={(e) => { const v = e.target.value; setShadowBlur(v); applyBoxShadow({ blur: v }); }} />
                <input style={htmlInputStyle} type="text" value={shadowSpread} placeholder="spread (0px)" onChange={(e) => { const v = e.target.value; setShadowSpread(v); applyBoxShadow({ spread: v }); }} />
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={shadowInset}
                    onChange={(e) => {
                      const v = !!e.target.checked;
                      setShadowInset(v);
                      applyBoxShadow({ inset: v });
                    }}
                    style={{ marginRight: 6 }}
                  />
                  inset
                </label>
              </div>
              <ColorFieldWithPalette label="shadowColor" value={shadowColor} onChange={(v) => { setShadowColor(v); applyBoxShadow({ color: v }); }} fallback="#000000" />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 }}>outline</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input style={htmlInputStyle} type="text" value={outlineWidthArg} placeholder="width (1px)" onChange={(e) => { const v = e.target.value; setOutlineWidthArg(v); applyOutline({ width: v }); }} />
                <select style={htmlInputStyle} value={outlineStyleArg} onChange={(e) => { const v = e.target.value; setOutlineStyleArg(v); applyOutline({ style: v }); }}>
                  <option value="">(unset)</option>
                  <option value="solid">solid</option>
                  <option value="dashed">dashed</option>
                  <option value="dotted">dotted</option>
                  <option value="double">double</option>
                  <option value="none">none</option>
                </select>
              </div>
              <ColorFieldWithPalette label="outlineColor" value={outlineColorArg} onChange={(v) => { setOutlineColorArg(v); applyOutline({ color: v }); }} fallback="#60a5fa" />
            </div>
            <NumberField label="opacity" value={opacityValue} onChange={setOpacityValue} />
            <SelectField
              label="backgroundSize"
              hint="Размер фонового изображения."
              value={backgroundSizeValue}
              onChange={setBackgroundSizeValue}
              options={[
                { value: '', label: '(unset)' },
                { value: 'auto', label: 'auto' },
                { value: 'cover', label: 'cover' },
                { value: 'contain', label: 'contain' },
                { value: '100% 100%', label: '100% 100%' },
                { value: '100% auto', label: '100% auto' },
                { value: 'auto 100%', label: 'auto 100%' },
              ]}
            />
          </CollapsibleSection>
        </View>

        <TouchableOpacity
          style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
          onPress={handleApply}
          disabled={!canApply}
        >
          <Text style={styles.applyBtnText}>Применить в файлы</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Подсказка: кликните по элементу в превью, чтобы выбрать блок.
        </Text>
          </>
        ) : sidebarTab === 'library' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Block Library</Text>
            <Text style={styles.hint}>Каталог блоков (заглушка, функционал добавим далее).</Text>
            {blockLibraryItems.map((item) => (
              <View key={`library-${item}`} style={{ marginBottom: '8px', opacity: 0.75 }}>
                <TouchableOpacity
                  style={styles.layerOpBtn}
                  onPressIn={() => startLibraryDrag(item)}
                >
                  <Text style={styles.layerOpBtnText}>+ {item}</Text>
                </TouchableOpacity>
              </View>
            ))}
            {libraryDragTag ? (
              <Text style={styles.hint}>Перетащите на холст. Колесико: смена target-родителя.</Text>
            ) : (
              <Text style={styles.hint}>Зажмите элемент и наведите на холст для вставки в child.</Text>
            )}

            {fileType !== 'react-native' ? (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.sectionTitle}>Library Search</Text>
                <Text style={styles.hint}>Введите npm пакет и добавьте его в package.json проекта.</Text>
                <input
                  style={{ ...htmlInputStyle, marginBottom: 8 }}
                  type="text"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Например: react-icons"
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, marginBottom: 8 }}>
                  <input
                    style={htmlInputStyle}
                    type="text"
                    value={libraryVersion}
                    onChange={(e) => setLibraryVersion(e.target.value)}
                    placeholder="latest"
                  />
                  <TouchableOpacity
                    style={styles.layerSaveBtn}
                    onPress={() => handleAddLibrary(librarySearch, libraryVersion)}
                  >
                    <Text style={styles.layerSaveBtnText}>Добавить</Text>
                  </TouchableOpacity>
                </div>
                {libraryActionNote ? <Text style={styles.hint}>{libraryActionNote}</Text> : null}
                {filteredKnownLibraries.slice(0, 6).map((item) => (
                  <div
                    key={`lib-${item.name}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 6,
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12 }}>{item.name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11 }}>{item.description}</div>
                    </div>
                    <TouchableOpacity
                      style={styles.layerOpBtn}
                      onPress={() => handleAddLibrary(item.name, 'latest')}
                    >
                      <Text style={styles.layerOpBtnText}>+ Add</Text>
                    </TouchableOpacity>
                  </div>
                ))}

                <Text style={styles.sectionTitle}>Icon Library</Text>
                <Text style={styles.hint}>Fa / Md / Hi / Io5. Клик по карточке вставляет иконку, зажатие позволяет drag-and-drop.</Text>
                <input
                  style={{ ...htmlInputStyle, marginBottom: 8 }}
                  type="text"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Поиск иконки (например: home, user, heart)"
                />
                <View style={styles.stylesActionsRow}>
                  <TouchableOpacity
                    style={styles.layerSaveBtn}
                    onPress={() => {
                      try {
                        if (typeof window !== 'undefined') window.open('https://react-icons.github.io/react-icons/', '_blank');
                      } catch (e) {}
                    }}
                  >
                    <Text style={styles.layerSaveBtnText}>Открыть react-icons</Text>
                  </TouchableOpacity>
                </View>
                {(filteredIconLibraries || []).map((lib) => (
                  <details key={`icons-${lib.prefix}`} style={{ marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: 700 }}>
                      {lib.prefix} → {lib.title} ({lib.icons.length})
                    </summary>
                    <div
                      style={{
                        marginTop: 8,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(58px, 1fr))',
                        gap: 'clamp(4px, 1vw, 8px)',
                      }}
                    >
                      {lib.icons.map((iconName) => (
                        <View key={`${lib.prefix}-${iconName}`}>
                          <TouchableOpacity
                            style={{
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: 10,
                              minHeight: 'clamp(40px, 12vw, 60px)',
                              width: '100%',
                              padding: '8px 4px',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'rgba(15,23,42,0.55)',
                            }}
                            onPress={() => onInsertComponentFromLibrary?.(iconName, lib.importPath, 'named')}
                            onPressIn={() => startComponentDrag(iconName, lib.importPath)}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                display: 'flex',
                                marginTop: 5,
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.06)',
                                overflow: 'hidden',
                              }}
                            >
                              <img
                                src={getIconPreviewUrl(lib.prefix, iconName)}
                                alt={iconName}
                                style={{
                                  width: 20,
                                  height: 20,
                                  objectFit: 'contain',
                                  color: '#ffffff',
                                  filter: 'brightness(0) invert(1)',
                                }}
                                onError={(e) => {
                                  try {
                                    const current = String(e.currentTarget.src || '');
                                    const fallbackUrl = getIconFallbackUrl(lib.prefix, iconName);
                                    if (fallbackUrl && !current.includes(fallbackUrl)) {
                                      e.currentTarget.src = fallbackUrl;
                                      return;
                                    }
                                    e.currentTarget.style.display = 'none';
                                  } catch (error) {}
                                  setIconPreviewWarning(true);
                                }}
                              />
                            </div>
                            <Text
                              style={{
                                color: '#e2e8f0',
                                fontSize: 10,
                                textAlign: 'center',
                              }}
                            >
                              {iconName}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </div>
                  </details>
                ))}
                {normalizedIconSearch && filteredIconLibraries.length === 0 ? (
                  <Text style={styles.hint}>Ничего не найдено. Попробуйте открыть полный каталог на react-icons.</Text>
                ) : null}
                {iconPreviewWarning ? (
                  <Text style={styles.hint}>Часть превью иконок недоступна (404), но перетаскивание и вставка работают.</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Styles Library</Text>
            <Text style={styles.hint}>Импортируйте шаблон или CSS файл, затем примените стиль к выбранному блоку.</Text>
            <View style={styles.stylesActionsRow}>
              <TouchableOpacity style={styles.layerOpBtn} onPress={() => onImportStyleTemplate?.('landing-soft')}>
                <Text style={styles.layerOpBtnText}>+ Landing Soft</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.layerOpBtn} onPress={() => onImportStyleTemplate?.('dashboard-clean')}>
                <Text style={styles.layerOpBtnText}>+ Dashboard Clean</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.stylesActionsRow}>
              <TouchableOpacity style={styles.layerSaveBtn} onPress={() => onImportStyleFromPicker?.()}>
                <Text style={styles.layerSaveBtnText}>Выбрать CSS из проводника</Text>
              </TouchableOpacity>
            </View>
            {!styleLibraryColumns?.length ? (
              <Text style={styles.hint}>Пока нет CSS классов. Импортируйте шаблон/файл или добавьте import '*.css' в код.</Text>
            ) : (
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 'max-content' }}>
                  {styleLibraryColumns.map((column: any) => (
                    <div
                      key={`style-col-${column.fileName}`}
                      style={{
                        minWidth: 220,
                        width: 220,
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 12, marginBottom: 8, fontWeight: 700 }}>
                        {column.fileName}
                      </div>
                      {column.entries.map((entry: any) => {
                        const previewStyle = entry?.stylePatch || {};
                        return (
                          <div
                            key={entry.id}
                            style={{
                              marginBottom: 10,
                              border: '1px solid rgba(255,255,255,0.10)',
                              borderRadius: 8,
                              padding: 8,
                            }}
                          >
                            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, marginBottom: 6 }}>{entry.name}</div>
                            <div
                              style={{
                                background: '#ffffff',
                                borderRadius: 8,
                                padding: 10,
                                marginBottom: 8,
                                minHeight: 72,
                                maxHeight: 72,
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <div style={{ ...previewStyle }}>
                                Preview
                              </div>
                            </div>
                            <TouchableOpacity
                              style={[styles.layerSaveBtn, !selectedBlock?.id && styles.layerOpBtnDisabled]}
                              disabled={!selectedBlock?.id}
                              onPress={() => onApplyStyleLibraryEntry?.(entry.id)}
                            >
                              <Text style={styles.layerSaveBtnText}>Применить</Text>
                            </TouchableOpacity>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
