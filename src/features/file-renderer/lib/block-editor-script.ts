import { MRPAK_MSG, MRPAK_CMD } from '../../../blockEditor/EditorProtocol';

/**
 * Р“РµРЅРµСЂРёСЂСѓРµС‚ СЃРєСЂРёРїС‚ РґР»СЏ Р±Р»РѕС‡РЅРѕРіРѕ СЂРµРґР°РєС‚РѕСЂР°, РєРѕС‚РѕСЂС‹Р№ РёРЅР¶РµРєС‚РёСЂСѓРµС‚СЃСЏ РІ HTML
 * @param {string} type - С‚РёРї С„Р°Р№Р»Р° ('html', 'react', 'react-native')
 * @param {string} mode - СЂРµР¶РёРј СЂР°Р±РѕС‚С‹ ('preview' | 'edit')
 */
export function generateBlockEditorScript(type: string, mode: string = 'preview', rootFileBasename: string = '') {
  const isEditMode = mode === 'edit';
  
  return `
      <style>
        [data-no-code-ui-id].mrpak-selected, [data-mrpak-id].mrpak-selected { outline: 2px solid #667eea !important; outline-offset: 2px; }
        [data-no-code-ui-id].mrpak-multi-selected, [data-mrpak-id].mrpak-multi-selected { outline: 2px solid #22c55e !important; outline-offset: 2px; }
        [data-mrpak-component-boundary="1"].mrpak-selected > * { outline: 2px solid #667eea !important; outline-offset: 2px; }
        [data-mrpak-component-boundary="1"].mrpak-multi-selected > * { outline: 2px solid #22c55e !important; outline-offset: 2px; }
        .mrpak-box-overlay { position: fixed; z-index: 9998; pointer-events: none; box-sizing: border-box; }
        .mrpak-box-overlay.mrpak-margin { border: 1px dashed rgba(245, 158, 11, 0.95); background: rgba(245, 158, 11, 0.06); }
        .mrpak-box-overlay.mrpak-padding { border: 1px dashed rgba(34, 197, 94, 0.95); background: rgba(34, 197, 94, 0.05); }
        .mrpak-box-overlay.mrpak-content { border: 1px solid rgba(59, 130, 246, 0.95); background: rgba(59, 130, 246, 0.08); }
        .mrpak-box-overlay.mrpak-connector { border: 0; border-top: 1px solid rgba(56, 189, 248, 0.85); background: transparent; transform-origin: 0 0; }
        .mrpak-box-overlay.mrpak-parent { border: 2px dashed rgba(246, 85, 49, 0.8); background: rgba(59, 131, 246, 0); pointer-events: none; }
        .mrpak-box-overlay.mrpak-drop-target { border: 2px solid rgba(59, 130, 246, 0.95); background: rgba(59, 130, 246, 0.12); pointer-events: none; }
        .mrpak-drop-label { position: fixed; z-index: 10000; pointer-events: none; background: rgba(15, 23, 42, 0.92); color: #fff; border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 8px; padding: 6px 8px; font: 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.25); max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mrpak-shift-badge { position: fixed; z-index: 10001; pointer-events: none; background: rgba(15, 23, 42, 0.92); color: #fff; border: 1px solid rgba(245, 158, 11, 0.65); border-radius: 6px; padding: 4px 6px; font: 11px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; box-shadow: 0 3px 8px rgba(0,0,0,0.22); }
        .mrpak-hint { position: fixed; z-index: 9999; bottom: 10px; right: 10px; background: rgba(15,23,42,0.85); color: #fff; padding: 8px 10px; border-radius: 8px; font: 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; }
        ${isEditMode ? `
        /* Р‘Р»РѕРєРёСЂСѓРµРј РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹ С‚РѕР»СЊРєРѕ РІ СЂРµР¶РёРјРµ СЂРµРґР°РєС‚РѕСЂР° */
        [data-no-code-ui-id] button,
        [data-no-code-ui-id] input,
        [data-no-code-ui-id] select,
        [data-no-code-ui-id] textarea,
        [data-no-code-ui-id] a,
        [data-no-code-ui-id] [role="button"],
        [data-no-code-ui-id] [role="link"],
        [data-mrpak-id] button,
        [data-mrpak-id] input,
        [data-mrpak-id] select,
        [data-mrpak-id] textarea,
        [data-mrpak-id] a,
        [data-mrpak-id] [role="button"],
        [data-mrpak-id] [role="link"] {
          user-select: none !important;
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
        }
        /* Р Р°Р·СЂРµС€Р°РµРј pointer-events С‚РѕР»СЊРєРѕ РґР»СЏ РІС‹Р±РѕСЂР° Р±Р»РѕРєРѕРІ */
        [data-no-code-ui-id],
        [data-mrpak-id] {
          cursor: pointer;
        }
        ` : ''}
      </style>
      <script>
        (function() {
          const INSTANCE_TOKEN = 'mrpak-editor:' + Date.now() + ':' + Math.random().toString(16).slice(2, 8);
          window.__MRPAK_BLOCK_EDITOR_ACTIVE_TOKEN__ = INSTANCE_TOKEN;
          const isActiveInstance = () => window.__MRPAK_BLOCK_EDITOR_ACTIVE_TOKEN__ === INSTANCE_TOKEN;
          try {
            Array.from(document.querySelectorAll('.mrpak-selected, .mrpak-multi-selected')).forEach((el) => {
              try {
                el.classList.remove('mrpak-selected');
                el.classList.remove('mrpak-multi-selected');
              } catch (e) {}
            });
            Array.from(document.querySelectorAll('.mrpak-box-overlay, .mrpak-hint, .mrpak-drop-label, .mrpak-shift-badge')).forEach((el) => {
              try { el.remove(); } catch (e) {}
            });
          } catch (e) {}

          const EDIT_MODE = ${isEditMode ? 'true' : 'false'};
          const ATTR_NEW = 'data-no-code-ui-id';
          const ATTR_OLD = 'data-mrpak-id';
          const SEL_ALL = '[data-no-code-ui-id],[data-mrpak-id]';
          const ROOT_FILE_BASENAME = ${JSON.stringify(String(rootFileBasename || ''))};
          const getId = (el) => {
            try {
              return (el && el.getAttribute && (el.getAttribute(ATTR_NEW) || el.getAttribute(ATTR_OLD))) || null;
            } catch (e) {
              return null;
            }
          };
          const ensureId = (el) => {
            try {
              if (!el || !el.getAttribute || !el.setAttribute) return null;
              const id = getId(el);
              if (id) {
                if (!el.getAttribute(ATTR_NEW)) el.setAttribute(ATTR_NEW, id);
                if (el.getAttribute(ATTR_OLD)) el.removeAttribute(ATTR_OLD);
                return id;
              }
              const tmp = 'mrpak:temp:' + Date.now() + ':' + Math.random().toString(16).slice(2, 8);
              el.setAttribute(ATTR_NEW, tmp);
              return tmp;
            } catch (e) {
              return null;
            }
          };
          const byIdSelector = (id) => {
            const safe = String(id || '').replace(/\"/g,'');
            return '[data-no-code-ui-id=\"' + safe + '\"],[data-mrpak-id=\"' + safe + '\"]';
          };
          const getElementsById = (id) => {
            try {
              return Array.from(document.querySelectorAll(byIdSelector(id)));
            } catch (e) {
              return [];
            }
          };
          const getSelectedGroupNodes = () => {
            if (Array.isArray(selectedGroup) && selectedGroup.length > 0) {
              return selectedGroup.filter(Boolean);
            }
            return selected ? [selected] : [];
          };
          const applyToSelectedGroup = (cb) => {
            const nodes = getSelectedGroupNodes();
            nodes.forEach((node, index) => {
              try {
                cb(node, index);
              } catch (e) {}
            });
          };
          const getIdFileBasename = (id) => {
            const m = String(id || '').match(/^mrpak:([^:]+):/);
            return m ? m[1] : '';
          };
          const isImportedId = (id) => {
            const base = getIdFileBasename(id);
            return !!base && !!ROOT_FILE_BASENAME && base !== ROOT_FILE_BASENAME;
          };
          const getBoundaryBlock = (el) => {
            const boundary = el && el.closest ? el.closest('[data-mrpak-component-boundary="1"]') : null;
            if (boundary) return boundary;
            const block = el && el.closest ? el.closest(SEL_ALL) : el;
            if (!block) return null;
            let current = block;
            let currentId = getId(current);
            if (!currentId || !isImportedId(currentId)) {
              return current;
            }
            while (current && current.parentElement) {
              const parent = current.parentElement.closest ? current.parentElement.closest(SEL_ALL) : null;
              if (!parent) break;
              const parentId = getId(parent);
              if (!parentId) break;
              if (getIdFileBasename(parentId) !== getIdFileBasename(currentId)) break;
              current = parent;
              currentId = parentId;
            }
            return current;
          };
          const MSG_SELECT = '${MRPAK_MSG.SELECT}';
          const MSG_APPLY = '${MRPAK_MSG.APPLY}';
          const MSG_SAVE = '${MRPAK_MSG.SAVE}';
          const MSG_TREE = '${MRPAK_MSG.TREE}';
          const MSG_READY = '${MRPAK_MSG.READY}';
          const MSG_STYLE_SNAPSHOT = '${MRPAK_MSG.STYLE_SNAPSHOT}';
          const MSG_TEXT_SNAPSHOT = '${MRPAK_MSG.TEXT_SNAPSHOT}';
          const MSG_DROP_TARGET = '${MRPAK_MSG.DROP_TARGET}';
          const CMD_SELECT = '${MRPAK_CMD.SELECT}';
          const CMD_INSERT = '${MRPAK_CMD.INSERT}';
          const CMD_DELETE = '${MRPAK_CMD.DELETE}';
          const CMD_SET_STYLE = '${MRPAK_CMD.SET_STYLE}';
          const CMD_REQ_STYLE = '${MRPAK_CMD.REQUEST_STYLE_SNAPSHOT}';
          const CMD_REPARENT = '${MRPAK_CMD.REPARENT}';
          const CMD_SET_MOVE_MODE = '${MRPAK_CMD.SET_MOVE_MODE}';
          const CMD_ALIGN = '${MRPAK_CMD.ALIGN}';
          const CMD_SET_TEXT = '${MRPAK_CMD.SET_TEXT}';
          const CMD_REQ_TEXT = '${MRPAK_CMD.REQUEST_TEXT_SNAPSHOT}';
          const CMD_START_DRAG = '${MRPAK_CMD.START_DRAG}';
          const CMD_END_DRAG = '${MRPAK_CMD.END_DRAG}';
          const CMD_SET_RESIZE_TARGET = '${MRPAK_CMD.SET_RESIZE_TARGET}';
          let selected = null;
          let selectedGroup = [];
          let selectedIds = [];
          let lastSelectedId = null;
          let moveMode = 'absolute'; // absolute | relative | grid8
          let moveUnit = 'px'; // px | %
          let gridStep = 8;
          let resizeTargetMode = 'size'; // size | margin | padding | content-lock
          let dragging = null; // {sourceId}
          let dropTarget = null;
          let externalDrag = null; // { tag, source: 'library' }
          let externalHoverCandidates = [];
          let externalHoverIndex = 0;
          let externalPointer = { x: 0, y: 0 };

          const overlay = {
            margin: null,
            padding: null,
            content: null,
            parent: null,
            dropTarget: null,
            connTL: null,
            connTR: null,
            connBL: null,
            connBR: null,
          };

          let dropLabel = null;
          let shiftBadge = null;

          const ensureOverlay = () => {
            if (!overlay.margin) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-margin';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.margin = el;
            }
            if (!overlay.padding) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-padding';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.padding = el;
            }
            if (!overlay.parent) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-parent';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.parent = el;
            }
            if (!overlay.content) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-content';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.content = el;
            }
            if (!overlay.dropTarget) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-drop-target';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.dropTarget = el;
            }
            if (!overlay.connTL) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-connector';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.connTL = el;
            }
            if (!overlay.connTR) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-connector';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.connTR = el;
            }
            if (!overlay.connBL) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-connector';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.connBL = el;
            }
            if (!overlay.connBR) {
              const el = document.createElement('div');
              el.className = 'mrpak-box-overlay mrpak-connector';
              el.style.display = 'none';
              document.body.appendChild(el);
              overlay.connBR = el;
            }
            if (!dropLabel) {
              const label = document.createElement('div');
              label.className = 'mrpak-drop-label';
              label.style.display = 'none';
              document.body.appendChild(label);
              dropLabel = label;
            }
            if (!shiftBadge) {
              const badge = document.createElement('div');
              badge.className = 'mrpak-shift-badge';
              badge.style.display = 'none';
              document.body.appendChild(badge);
              shiftBadge = badge;
            }
          };

          const toNum = (v) => {
            const n = parseFloat(String(v || '0'));
            return Number.isFinite(n) ? n : 0;
          };

          const setRect = (el, r) => {
            if (!el) return;
            if (!r) {
              el.style.display = 'none';
              return;
            }
            el.style.display = 'block';
            el.style.left = r.left + 'px';
            el.style.top = r.top + 'px';
            el.style.width = Math.max(0, r.width) + 'px';
            el.style.height = Math.max(0, r.height) + 'px';
          };
          const setConnector = (el, x1, y1, x2, y2) => {
            if (!el) return;
            if (![x1, y1, x2, y2].every(Number.isFinite)) {
              el.style.display = 'none';
              return;
            }
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (!Number.isFinite(len) || len < 0.5) {
              el.style.display = 'none';
              return;
            }
            el.style.display = 'block';
            el.style.left = x1 + 'px';
            el.style.top = y1 + 'px';
            el.style.width = len + 'px';
            el.style.height = '0px';
            el.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
          };
          const hideConnectors = () => {
            setConnector(overlay.connTL, NaN, NaN, NaN, NaN);
            setConnector(overlay.connTR, NaN, NaN, NaN, NaN);
            setConnector(overlay.connBL, NaN, NaN, NaN, NaN);
            setConnector(overlay.connBR, NaN, NaN, NaN, NaN);
          };

          const updateResizeOverlayStyles = () => {
            try {
              ensureOverlay();
              const mode = resizeTargetMode || 'size';
              if (overlay.margin) overlay.margin.style.borderStyle = mode === 'margin' ? 'solid' : 'dashed';
              if (overlay.padding) overlay.padding.style.borderStyle = mode === 'padding' ? 'solid' : 'dashed';
              if (overlay.content) overlay.content.style.borderStyle = (mode === 'size' || mode === 'content-lock') ? 'solid' : 'dashed';
            } catch (e) {}
          };

          const setShiftBadge = (text, x, y) => {
            if (!shiftBadge) return;
            if (!text) {
              shiftBadge.style.display = 'none';
              return;
            }
            shiftBadge.style.display = 'block';
            shiftBadge.textContent = text;
            shiftBadge.style.left = Math.round(x) + 'px';
            shiftBadge.style.top = Math.round(y) + 'px';
          };

          const getElementVisualRect = (el) => {
            if (!el || !el.getBoundingClientRect) return null;
            try {
              if (el.getAttribute && el.getAttribute('data-mrpak-component-boundary') === '1') {
                const descendants = Array.from(el.querySelectorAll('*')).filter((node) => {
                  if (!node || !node.getBoundingClientRect) return false;
                  const rect = node.getBoundingClientRect();
                  return rect.width > 0.5 && rect.height > 0.5;
                });
                if (descendants.length > 0) {
                  let left = Infinity;
                  let top = Infinity;
                  let right = -Infinity;
                  let bottom = -Infinity;
                  descendants.forEach((node) => {
                    const rect = node.getBoundingClientRect();
                    left = Math.min(left, rect.left);
                    top = Math.min(top, rect.top);
                    right = Math.max(right, rect.right);
                    bottom = Math.max(bottom, rect.bottom);
                  });
                  if (Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)) {
                    return {
                      left,
                      top,
                      right,
                      bottom,
                      width: Math.max(0, right - left),
                      height: Math.max(0, bottom - top),
                      x: left,
                      y: top,
                    };
                  }
                }
              }
              const rect = el.getBoundingClientRect();
              return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                x: rect.x,
                y: rect.y,
              };
            } catch (e) {
              return null;
            }
          };

          const updateBoxOverlay = () => {
            if (!isActiveInstance()) return;
            try {
              ensureOverlay();
              if (!selected) {
                setRect(overlay.margin, null);
                setRect(overlay.padding, null);
                setRect(overlay.content, null);
                setRect(overlay.parent, null);
                hideConnectors();
                setShiftBadge('', 0, 0);
                return;
              }
              const rect = getElementVisualRect(selected);
              if (!rect) {
                setRect(overlay.margin, null);
                setRect(overlay.padding, null);
                setRect(overlay.content, null);
                setRect(overlay.parent, null);
                hideConnectors();
                setShiftBadge('', 0, 0);
                return;
              }
              const cs = window.getComputedStyle(selected);
              const bt = toNum(cs.borderTopWidth);
              const br = toNum(cs.borderRightWidth);
              const bb = toNum(cs.borderBottomWidth);
              const bl = toNum(cs.borderLeftWidth);
              const mt = toNum(cs.marginTop);
              const mr = toNum(cs.marginRight);
              const mb = toNum(cs.marginBottom);
              const ml = toNum(cs.marginLeft);
              const pt = toNum(cs.paddingTop);
              const pr = toNum(cs.paddingRight);
              const pb = toNum(cs.paddingBottom);
              const pl = toNum(cs.paddingLeft);
              
              // РџРѕРєР°Р·С‹РІР°РµРј СЂРѕРґРёС‚РµР»СЊСЃРєСѓСЋ СЂР°РјРєСѓ
              const parentInfo = getParentContentRect(selected);
              const parent = parentInfo.parent;
              if (parent && parent !== document.body && parent !== document.documentElement) {
                const parentRect = parentInfo.rect;
                const parentPt = parentInfo.padding.top;
                const parentPr = parentInfo.padding.right;
                const parentPb = parentInfo.padding.bottom;
                const parentPl = parentInfo.padding.left;
                
                setRect(overlay.parent, {
                  left: parentRect.left + parentPl,
                  top: parentRect.top + parentPt,
                  width: parentRect.width - parentPl - parentPr,
                  height: parentRect.height - parentPt - parentPb,
                });
              } else {
                setRect(overlay.parent, null);
              }
              
              setRect(overlay.margin, {
                left: rect.left - ml,
                top: rect.top - mt,
                width: rect.width + ml + mr,
                height: rect.height + mt + mb,
              });
              setRect(overlay.padding, {
                left: rect.left + bl,
                top: rect.top + bt,
                width: rect.width - bl - br,
                height: rect.height - bt - bb,
              });
              setRect(overlay.content, {
                left: rect.left + bl + pl,
                top: rect.top + bt + pt,
                width: rect.width - bl - br - pl - pr,
                height: rect.height - bt - bb - pt - pb,
              });
              if ((resizeTargetMode || 'size') === 'content-lock') {
                const padLeft = rect.left + bl;
                const padTop = rect.top + bt;
                const padRight = rect.right - br;
                const padBottom = rect.bottom - bb;
                const contentLeft = rect.left + bl + pl;
                const contentTop = rect.top + bt + pt;
                const contentRight = rect.right - br - pr;
                const contentBottom = rect.bottom - bb - pb;
                setConnector(overlay.connTL, padLeft, padTop, contentLeft, contentTop);
                setConnector(overlay.connTR, padRight, padTop, contentRight, contentTop);
                setConnector(overlay.connBL, padLeft, padBottom, contentLeft, contentBottom);
                setConnector(overlay.connBR, padRight, padBottom, contentRight, contentBottom);
              } else {
                hideConnectors();
              }

              const mode = cs.position === 'relative' ? 'relative' : moveMode;
              const hasVisibleOffset = mode === 'relative' || Math.abs(ml) > 0.5 || Math.abs(mt) > 0.5;
              if (hasVisibleOffset) {
                const labelText = 'offset ml:' + Math.round(ml) + ' mt:' + Math.round(mt);
                setShiftBadge(labelText, rect.left - ml, rect.top - mt - 24);
              } else {
                setShiftBadge('', 0, 0);
              }
              updateResizeOverlayStyles();
            } catch (e) {
              try {
                setRect(overlay.margin, null);
                setRect(overlay.padding, null);
                setRect(overlay.content, null);
                setRect(overlay.parent, null);
                hideConnectors();
                setShiftBadge('', 0, 0);
              } catch (e2) {}
            }
          };

          const updateRelativeParentPreview = (el, dx, dy) => {
            try {
              ensureOverlay();
              if (!el || !overlay.parent || !overlay.margin) return;
              const rect = getElementVisualRect(el);
              if (!rect) return;
              const cs = window.getComputedStyle(el);
              const mt = toNum(cs.marginTop);
              const mr = toNum(cs.marginRight);
              const mb = toNum(cs.marginBottom);
              const ml = toNum(cs.marginLeft);
              const bt = toNum(cs.borderTopWidth);
              const br = toNum(cs.borderRightWidth);
              const bb = toNum(cs.borderBottomWidth);
              const bl = toNum(cs.borderLeftWidth);
              const pt = toNum(cs.paddingTop);
              const pr = toNum(cs.paddingRight);
              const pb = toNum(cs.paddingBottom);
              const pl = toNum(cs.paddingLeft);
              const futureMl = ml + dx;
              const futureMt = mt + dy;
              const parentInfo = getParentContentRect(el);
              const parent = parentInfo.parent;
              if (!parent || parent === document.body || parent === document.documentElement) return;

              const parentRect = parentInfo.rect;
              const parentLeft = parentRect.left + parentInfo.padding.left;
              const parentTop = parentRect.top + parentInfo.padding.top;
              const parentRight = parentRect.right - parentInfo.padding.right;
              const parentBottom = parentRect.bottom - parentInfo.padding.bottom;

              const movedLeft = rect.left - futureMl;
              const movedTop = rect.top - futureMt;
              const movedRight = rect.right + mr;
              const movedBottom = rect.bottom + mb;

              setRect(overlay.margin, {
                left: movedLeft,
                top: movedTop,
                width: Math.max(0, rect.width + futureMl + mr),
                height: Math.max(0, rect.height + futureMt + mb),
              });
              setRect(overlay.content, {
                left: rect.left + bl + pl,
                top: rect.top + bt + pt,
                width: Math.max(0, rect.width - bl - br - pl - pr),
                height: Math.max(0, rect.height - bt - bb - pt - pb),
              });
              setRect(overlay.padding, {
                left: rect.left + bl,
                top: rect.top + bt,
                width: Math.max(0, rect.width - bl - br),
                height: Math.max(0, rect.height - bt - bb),
              });

              const unionLeft = Math.min(parentLeft, movedLeft);
              const unionTop = Math.min(parentTop, movedTop);
              const unionRight = Math.max(parentRight, movedRight);
              const unionBottom = Math.max(parentBottom, movedBottom);

              setRect(overlay.parent, {
                left: unionLeft,
                top: unionTop,
                width: Math.max(0, unionRight - unionLeft),
                height: Math.max(0, unionBottom - unionTop),
              });
              setShiftBadge('offset ml:' + Math.round(futureMl) + ' mt:' + Math.round(futureMt), movedLeft, movedTop - 24);
            } catch (e) {}
          };

          const snap = (v) => {
            if (moveMode !== 'grid8') return v;
            const step = gridStep || 8;
            return Math.round(v / step) * step;
          };

          const pxToPercent = (value, total) => {
            if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
            return (value / total) * 100;
          };

          const getMoveAxisReferenceSize = (mode, axis, width, height) => {
            if (mode === 'relative') {
              // CSS % margins are resolved against the containing block width.
              return Math.max(1, width);
            }
            return axis === 'x' ? Math.max(1, width) : Math.max(1, height);
          };

          const formatMoveValue = (value, axisSize, modeForValue) => {
            if (modeForValue === 'grid8' || moveUnit !== '%') {
              return '${type}' === 'html' ? (value + 'px') : value;
            }
            const pct = pxToPercent(value, axisSize);
            return pct + '%';
          };
          const getMovePatchKeys = (mode) => {
            if (mode === 'relative') {
              return { x: 'marginLeft', y: 'marginTop' };
            }
            return { x: 'left', y: 'top' };
          };
          const getElementMoveMode = (el) => {
            if (!el || !el.getAttribute) {
              return moveMode;
            }
            const saved = el.getAttribute('data-move-mode');
            if (saved === 'relative' || saved === 'absolute' || saved === 'grid8') {
              return saved;
            }
            try {
              const position = window.getComputedStyle(el).position;
              if (position === 'relative') return 'relative';
              if (position === 'absolute' || position === 'fixed') return 'absolute';
            } catch (e) {}
            return moveMode;
          };
          const getResizeAnchorRect = (el, resizeTarget) => {
            const rect = getElementVisualRect(el);
            if (!rect) return null;
            const cs = window.getComputedStyle(el);
            const bt = toNum(cs.borderTopWidth);
            const br = toNum(cs.borderRightWidth);
            const bb = toNum(cs.borderBottomWidth);
            const bl = toNum(cs.borderLeftWidth);
            const mt = toNum(cs.marginTop);
            const mr = toNum(cs.marginRight);
            const mb = toNum(cs.marginBottom);
            const ml = toNum(cs.marginLeft);
            const pt = toNum(cs.paddingTop);
            const pr = toNum(cs.paddingRight);
            const pb = toNum(cs.paddingBottom);
            const pl = toNum(cs.paddingLeft);

            if (resizeTarget === 'margin') {
              return {
                left: rect.left - ml,
                top: rect.top - mt,
                right: rect.right + mr,
                bottom: rect.bottom + mb,
                width: rect.width + ml + mr,
                height: rect.height + mt + mb,
              };
            }
            if (resizeTarget === 'padding') {
              return {
                left: rect.left + bl,
                top: rect.top + bt,
                right: rect.right - br,
                bottom: rect.bottom - bb,
                width: Math.max(0, rect.width - bl - br),
                height: Math.max(0, rect.height - bt - bb),
              };
            }
            // size/content target
            return {
              left: rect.left + bl + pl,
              top: rect.top + bt + pt,
              right: rect.right - br - pr,
              bottom: rect.bottom - bb - pb,
              width: Math.max(0, rect.width - bl - br - pl - pr),
              height: Math.max(0, rect.height - bt - bb - pt - pb),
            };
          };
          const getResizeHandleFromPoint = (rect, x, y) => {
            if (!rect) return 'se';
            const corners = [
              { h: 'nw', x: rect.left, y: rect.top },
              { h: 'ne', x: rect.right, y: rect.top },
              { h: 'sw', x: rect.left, y: rect.bottom },
              { h: 'se', x: rect.right, y: rect.bottom },
            ];
            let best = corners[3];
            let bestD = Infinity;
            for (const c of corners) {
              const dx = x - c.x;
              const dy = y - c.y;
              const d = dx * dx + dy * dy;
              if (d < bestD) {
                bestD = d;
                best = c;
              }
            }
            return best.h;
          };
          const getResizeDeltaByHandle = (handle, dx, dy) => {
            const h = String(handle || 'se');
            const widthDelta = h.indexOf('w') >= 0 ? -dx : dx;
            const heightDelta = h.indexOf('n') >= 0 ? -dy : dy;
            const shiftX = h.indexOf('w') >= 0 ? dx : 0;
            const shiftY = h.indexOf('n') >= 0 ? dy : 0;
            return { widthDelta, heightDelta, shiftX, shiftY };
          };
          const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
          const computeStyleSizeFromContent = (contentSize, padA, padB, borderA, borderB, boxSizing) => {
            if (String(boxSizing || '').toLowerCase() === 'border-box') {
              return Math.max(0, contentSize + padA + padB + borderA + borderB);
            }
            return Math.max(0, contentSize);
          };
          const applyAlignmentPreset = (el, horizontal, vertical) => {
            if (!el) return;
            const id = ensureId(el);
            const rect = getElementVisualRect(el);
            const parentInfo = getParentContentRect(el);
            if (!rect || !parentInfo || !parentInfo.rect) return;

            const activeMoveMode = getElementMoveMode(el);
            const parentRect = parentInfo.rect;
            const contentLeft = parentRect.left + parentInfo.padding.left;
            const contentTop = parentRect.top + parentInfo.padding.top;
            const contentWidth = Math.max(1, parentRect.width - parentInfo.padding.left - parentInfo.padding.right);
            const contentHeight = Math.max(1, parentRect.height - parentInfo.padding.top - parentInfo.padding.bottom);
            const desiredLeft =
              horizontal === 'left'
                ? contentLeft
                : horizontal === 'center'
                ? contentLeft + (contentWidth - rect.width) / 2
                : contentLeft + contentWidth - rect.width;
            const desiredTop =
              vertical === 'top'
                ? contentTop
                : vertical === 'center'
                ? contentTop + (contentHeight - rect.height) / 2
                : contentTop + contentHeight - rect.height;

            if (activeMoveMode === 'relative') {
              const cs = window.getComputedStyle(el);
              const baseMl = toNum(cs.marginLeft);
              const baseMt = toNum(cs.marginTop);
              const deltaX = desiredLeft - rect.left;
              const deltaY = desiredTop - rect.top;
              const nextMl = snap(baseMl + deltaX);
              const nextMt = snap(baseMt + deltaY);
              const leftValue = formatMoveValue(
                nextMl,
                getMoveAxisReferenceSize('relative', 'x', contentWidth, contentHeight),
                'relative'
              );
              const topValue = formatMoveValue(
                nextMt,
                getMoveAxisReferenceSize('relative', 'y', contentWidth, contentHeight),
                'relative'
              );
              const moveKeys = getMovePatchKeys('relative');
              el.style.position = 'relative';
              el.style.left = '';
              el.style.top = '';
              el.style.transform = '';
              el.style[moveKeys.x] = String(leftValue);
              el.style[moveKeys.y] = String(topValue);
              el.setAttribute('data-move-mode', 'relative');
              post(MSG_APPLY, {
                id,
                patch: {
                  position: 'relative',
                  left: '',
                  top: '',
                  transform: '',
                  [moveKeys.x]: leftValue,
                  [moveKeys.y]: topValue,
                },
                isIntermediate: false,
              });
            } else {
              const parentEl = el.parentElement;
              if (parentEl && parentEl !== document.body && parentEl !== document.documentElement) {
                const parentCs = window.getComputedStyle(parentEl);
                if (parentCs.position === 'static') {
                  parentEl.style.position = 'relative';
                  const parentId = ensureId(parentEl);
                  post(MSG_APPLY, {
                    id: parentId,
                    patch: { position: 'relative' },
                    isIntermediate: false,
                  });
                }
              }
              const leftPx = snap(desiredLeft - contentLeft);
              const topPx = snap(desiredTop - contentTop);
              const leftValue = formatMoveValue(
                leftPx,
                getMoveAxisReferenceSize('absolute', 'x', contentWidth, contentHeight),
                'absolute'
              );
              const topValue = formatMoveValue(
                topPx,
                getMoveAxisReferenceSize('absolute', 'y', contentWidth, contentHeight),
                'absolute'
              );
              el.style.position = 'absolute';
              el.style.left = String(leftValue);
              el.style.top = String(topValue);
              el.style.marginLeft = '';
              el.style.marginTop = '';
              el.style.transform = '';
              el.setAttribute('data-move-mode', activeMoveMode === 'grid8' ? 'grid8' : 'absolute');
              post(MSG_APPLY, {
                id,
                patch: {
                  position: 'absolute',
                  left: leftValue,
                  top: topValue,
                  marginLeft: '',
                  marginTop: '',
                  transform: '',
                },
                isIntermediate: false,
              });
            }


            updateBoxOverlay();
          };

          const getOffsetParent = (el) => {
            if (!el) return document.body;
            
            // РС‰РµРј СЂРѕРґРёС‚РµР»СЏ СЃ РѕРіСЂР°РЅРёС‡РµРЅРёСЏРјРё (СЃ position: relative/absolute РёР»Рё СЃ overflow)
            let parent = el.parentElement;
            while (parent && parent !== document.body && parent !== document.documentElement) {
              const cs = window.getComputedStyle(parent);
              const position = cs.position;
              const overflow = cs.overflow;
              const overflowX = cs.overflowX;
              const overflowY = cs.overflowY;
              
              // Р•СЃР»Рё СЂРѕРґРёС‚РµР»СЊ РёРјРµРµС‚ РїРѕР·РёС†РёРѕРЅРёСЂРѕРІР°РЅРёРµ РёР»Рё overflow, СЌС‚Рѕ РЅР°С€ РєРѕРЅС‚РµР№РЅРµСЂ
              if (position !== 'static' || overflow !== 'visible' || overflowX !== 'visible' || overflowY !== 'visible') {
                return parent;
              }
              
              parent = parent.parentElement;
            }
            
            // Р•СЃР»Рё РЅРµ РЅР°С€Р»Рё РїРѕРґС…РѕРґСЏС‰РµРіРѕ СЂРѕРґРёС‚РµР»СЏ, РёСЃРїРѕР»СЊР·СѓРµРј offsetParent РёР»Рё body
            return el.offsetParent || document.body;
          };

          const getLogicalParentBlock = (el) => {
            if (!el) return null;
            let parent = el.parentElement;
            while (parent && parent !== document.body && parent !== document.documentElement) {
              if (parent.hasAttribute && (parent.hasAttribute(ATTR_NEW) || parent.hasAttribute(ATTR_OLD))) {
                return parent;
              }
              parent = parent.parentElement;
            }
            return null;
          };

          const hasUsableRect = (el) => {
            if (!el || !el.getBoundingClientRect) return false;
            try {
              const rect = el.getBoundingClientRect();
              return rect.width > 0.5 && rect.height > 0.5;
            } catch (e) {
              return false;
            }
          };

          const getVisualParent = (el) => {
            if (!el) return null;
            let parent = el.parentElement;
            while (parent && parent !== document.body && parent !== document.documentElement) {
              const cs = window.getComputedStyle(parent);
              if (cs.display !== 'contents' && hasUsableRect(parent)) {
                return parent;
              }
              parent = parent.parentElement;
            }
            return null;
          };

          const getConstraintParent = (el) => {
            const logicalParent = getLogicalParentBlock(el);
            if (logicalParent && hasUsableRect(logicalParent)) return logicalParent;

            const visualParent = getVisualParent(el);
            if (visualParent) return visualParent;

            const offsetParent = getOffsetParent(el);
            if (offsetParent && offsetParent !== document.body && offsetParent !== document.documentElement && hasUsableRect(offsetParent)) {
              return offsetParent;
            }

            return offsetParent || document.body;
          };

          const getParentContentRect = (el) => {
            const parent = getConstraintParent(el);
            if (!parent || parent === document.body || parent === document.documentElement) {
              return {
                parent,
                rect: {
                  left: 0,
                  top: 0,
                  width: window.innerWidth,
                  height: window.innerHeight,
                },
                padding: { left: 0, top: 0, right: 0, bottom: 0 },
              };
            }

            const rect = parent.getBoundingClientRect();
            const cs = window.getComputedStyle(parent);
            const padding = {
              left: toNum(cs.paddingLeft),
              top: toNum(cs.paddingTop),
              right: toNum(cs.paddingRight),
              bottom: toNum(cs.paddingBottom),
            };

            return { parent, rect, padding };
          };

          const pxToNum = (s) => {
            const m = String(s || '').match(/(-?\\d+(?:\\.\\d+)?)px/);
            return m ? Number(m[1]) : 0;
          };

          function post(type, payload) {
            if (!isActiveInstance()) return;
            try {
              window.parent && window.parent.postMessage({ type, ...payload }, '*');
            } catch (e) {}
          }

          function buildTree() {
            if (!isActiveInstance()) return;
            const nodes = {};
            const rootIds = [];
            const all = Array.from(document.querySelectorAll(SEL_ALL))
              .map((el) => getBoundaryBlock(el))
              .filter(Boolean)
              .filter((el, index, arr) => arr.indexOf(el) === index);
            
            // РЎРЅР°С‡Р°Р»Р° СЃРѕР·РґР°РµРј РІСЃРµ СѓР·Р»С‹
            for (const el of all) {
              const id = ensureId(el);
              if (!id) continue;
              
              // РС‰РµРј СЂРѕРґРёС‚РµР»СЏ Р±РѕР»РµРµ С‚РѕС‡РЅРѕ: РёРґРµРј РІРІРµСЂС… РїРѕ DOM РґРµСЂРµРІСѓ Рё РёС‰РµРј Р±Р»РёР¶Р°Р№С€РёР№ СЌР»РµРјРµРЅС‚ СЃ id-Р°С‚СЂРёР±СѓС‚РѕРј
              let parentEl = null;
              let current = el.parentElement;
              while (current && current !== document.body && current !== document.documentElement) {
                if (current.hasAttribute && (current.hasAttribute(ATTR_NEW) || current.hasAttribute(ATTR_OLD))) {
                  parentEl = getBoundaryBlock(current);
                  break;
                }
                current = current.parentElement;
              }
              
              const parentId = parentEl ? getId(parentEl) : null;
              nodes[id] = {
                id,
                tagName: el.getAttribute('data-mrpak-component-name') || el.tagName,
                parentId,
                childIds: [],
                isIsolatedComponent: el.getAttribute('data-mrpak-component-boundary') === '1' || isImportedId(id),
                componentName: el.getAttribute('data-mrpak-component-name') || null,
                sourcePath: el.getAttribute('data-mrpak-source') || null,
              };
            }
            
            // РћРїСЂРµРґРµР»СЏРµРј РґРµС‚РµР№ Рё РєРѕСЂРЅРµРІС‹Рµ СЌР»РµРјРµРЅС‚С‹
            for (const id of Object.keys(nodes)) {
              const p = nodes[id].parentId;
              if (p && nodes[p]) {
                nodes[p].childIds.push(id);
              } else {
                rootIds.push(id);
              }
            }
            
            // РЈРїРѕСЂСЏРґРѕС‡РёРІР°РµРј children РїРѕ РїРѕСЂСЏРґРєСѓ РІ DOM
            for (const id of Object.keys(nodes)) {
              const el = document.querySelector(byIdSelector(id));
              if (!el) continue;
              
              const parentEl = el.parentElement;
              if (parentEl) {
                // РС‰РµРј СЂРѕРґРёС‚РµР»СЏ СЃ id-Р°С‚СЂРёР±СѓС‚РѕРј
                let parentWithId = null;
                let current = parentEl;
                while (current && current !== document.body && current !== document.documentElement) {
                  if (current.hasAttribute && (current.hasAttribute(ATTR_NEW) || current.hasAttribute(ATTR_OLD))) {
                    parentWithId = getBoundaryBlock(current);
                    break;
                  }
                  current = current.parentElement;
                }
                
                if (parentWithId) {
                  const pid = ensureId(parentWithId);
                  if (pid && nodes[pid]) {
                    // РџРѕР»СѓС‡Р°РµРј РїСЂСЏРјС‹С… РґРµС‚РµР№ СЃ id-Р°С‚СЂРёР±СѓС‚РѕРј РІ РїРѕСЂСЏРґРєРµ DOM
                    const directChildren = Array.from(parentWithId.children)
                      .map(child => getBoundaryBlock(child))
                      .filter(child => child && child.hasAttribute && (child.hasAttribute(ATTR_NEW) || child.hasAttribute(ATTR_OLD)))
                      .filter((child, index, arr) => arr.indexOf(child) === index)
                      .map(child => ensureId(child))
                      .filter(Boolean);
                    nodes[pid].childIds = directChildren;
                  }
                }
              }
            }
            
            post(MSG_TREE, { tree: { nodes, rootIds } });
          }
          
          // Р”РµР»Р°РµРј buildTree РґРѕСЃС‚СѓРїРЅРѕР№ РіР»РѕР±Р°Р»СЊРЅРѕ РґР»СЏ РІС‹Р·РѕРІР° РёР· СЃРєСЂРёРїС‚Р° React
          window.__MRPAK_BUILD_TREE__ = buildTree;

          function clearSelected() {
            if (!isActiveInstance()) return;
            try {
              const allSelected = Array.from(document.querySelectorAll('.mrpak-selected, .mrpak-multi-selected'));
              allSelected.forEach((el) => {
                try {
                  el.classList.remove('mrpak-selected');
                  el.classList.remove('mrpak-multi-selected');
                } catch(e) {}
              });
            } catch(e) {}
            selected = null;
            selectedGroup = [];
            selectedIds = [];
            updateBoxOverlay();
          }

          function applySelectionClasses() {
            try {
              const allSelected = Array.from(document.querySelectorAll('.mrpak-selected, .mrpak-multi-selected'));
              allSelected.forEach((el) => {
                try {
                  el.classList.remove('mrpak-selected');
                  el.classList.remove('mrpak-multi-selected');
                } catch(e) {}
              });
              selectedIds.forEach((sid, idx) => {
                const group = getElementsById(sid);
                group.forEach((node) => {
                  try {
                    node.classList.add(idx === 0 ? 'mrpak-selected' : 'mrpak-multi-selected');
                  } catch(e) {}
                });
              });
            } catch (e) {}
          }

          function emitSelection() {
            if (!selected) return;
            const id = selectedIds[0] || ensureId(selected);
            const rect = getElementVisualRect(selected);
            post(MSG_SELECT, {
              id,
              ids: selectedIds.slice(),
              meta: {
                tagName: selected.tagName,
                instances: selectedGroup.length,
                selectedCount: selectedIds.length,
                rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
              },
            });
          }

          function selectEl(el) {
            if (!isActiveInstance()) return;
            if (!el) return;
            clearSelected();
            el = getBoundaryBlock(el);
            const id = ensureId(el);
            selectedGroup = id ? getElementsById(id) : [];
            selected = selectedGroup[0] || el;
            selectedIds = id ? [id] : [];
            applySelectionClasses();
            lastSelectedId = id;
            emitSelection();
            updateBoxOverlay();
            buildTree();
            // РѕС‚РїСЂР°РІР»СЏРµРј СЃРЅР°РїС€РѕС‚ inline style, С‡С‚РѕР±С‹ UI РјРѕРі РїРѕРєР°Р·Р°С‚СЊ Р±Р°Р·РѕРІС‹Рµ СЃС‚РёР»Рё
            try {
              const inline = selected.getAttribute('style') || '';
              const cs = window.getComputedStyle(selected);
              const computed = {
                position: cs.getPropertyValue('position'),
                left: cs.getPropertyValue('left'),
                top: cs.getPropertyValue('top'),
                width: cs.getPropertyValue('width'),
                height: cs.getPropertyValue('height'),
                color: cs.getPropertyValue('color'),
                backgroundColor: cs.getPropertyValue('background-color'),
                fontSize: cs.getPropertyValue('font-size'),
                display: cs.getPropertyValue('display'),
                flex: cs.getPropertyValue('flex'),
                justifyContent: cs.getPropertyValue('justify-content'),
                alignItems: cs.getPropertyValue('align-items'),
                margin: cs.getPropertyValue('margin'),
                padding: cs.getPropertyValue('padding'),
              };
              post(MSG_STYLE_SNAPSHOT, { id, inlineStyle: inline, computedStyle: computed });
              const txt = selected.innerText || '';
              post(MSG_TEXT_SNAPSHOT, { id, text: txt });
            } catch(e) {}
          }

          function getLogicalParentIdForElement(el) {
            const p = getLogicalParentBlock(el);
            return p ? ensureId(p) : null;
          }

          function toggleSiblingSelection(el) {
            if (!el) return;
            const id = ensureId(el);
            if (!id) return;
            if (!selected || selectedIds.length === 0) {
              selectEl(el);
              return;
            }

            const anchorEl = getElementsById(selectedIds[0])[0] || selected;
            const anchorParentId = getLogicalParentIdForElement(anchorEl);
            const candidateParentId = getLogicalParentIdForElement(el);
            if (anchorParentId !== candidateParentId) {
              return;
            }
            if (id === selectedIds[0]) {
              return;
            }

            const existingIdx = selectedIds.indexOf(id);
            if (existingIdx >= 0) {
              selectedIds = selectedIds.filter((sid) => sid !== id);
            } else {
              selectedIds = [...selectedIds, id];
            }
            selectedGroup = selectedIds[0] ? getElementsById(selectedIds[0]) : [];
            selected = selectedGroup[0] || anchorEl;
            applySelectionClasses();
            emitSelection();
            updateBoxOverlay();
          }

          // Р’ СЂРµР¶РёРјРµ СЂРµРґР°РєС‚РѕСЂР° РґРµР»Р°РµРј РєРѕРЅС‚РµРЅС‚ "РЅРµРёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рј":
          // - РіР°СЃРёРј РєР»РёРєРё/submit/РєР»Р°РІРёР°С‚СѓСЂРЅС‹Рµ Р°РєС‚РёРІР°С†РёРё РїРѕ РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рј СЌР»РµРјРµРЅС‚Р°Рј
          // - РїСЂРё СЌС‚РѕРј СЃРѕС…СЂР°РЅСЏРµРј РІРѕР·РјРѕР¶РЅРѕСЃС‚СЊ РІС‹Р±РёСЂР°С‚СЊ Р±Р»РѕРєРё РєР»РёРєРѕРј Рё РґРІРёРіР°С‚СЊ Shift/Alt+Drag
          const isPointWithinRect = (rect, x, y) => {
            if (!rect) return false;
            return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
          };

          const isPointerInsideSelectedGroup = (x, y) => {
            if (!selectedGroup || selectedGroup.length === 0) return false;
            return selectedGroup.some((node) => {
              try {
                return isPointWithinRect(node.getBoundingClientRect(), x, y);
              } catch (e) {
                return false;
              }
            });
          };

          const shouldKeepCurrentSelectionForGesture = (ev) => {
            return !!(selected && (ev && (ev.shiftKey || ev.altKey)));
          };

          const getDirectChildBlockAtPoint = (parentEl, x, y) => {
            if (!parentEl) return null;
            let hovered = null;
            try {
              hovered = document.elementFromPoint(x, y);
            } catch (e) {
              hovered = null;
            }
            if (!hovered) return null;
            let current = hovered.nodeType === 1 ? hovered : hovered.parentElement;
            let candidate = null;
            while (current && current !== parentEl) {
              if (current.matches && current.matches(SEL_ALL)) {
                candidate = current;
              }
              current = current.parentElement;
            }
            return candidate;
          };

          const getCandidateBlocksAtPoint = (x, y) => {
            let hovered = null;
            try {
              hovered = document.elementFromPoint(x, y);
            } catch (e) {
              hovered = null;
            }
            if (!hovered) return [];
            const result = [];
            let current = hovered.nodeType === 1 ? hovered : hovered.parentElement;
            while (current && current !== document.body && current !== document.documentElement) {
              if (current.matches && current.matches(SEL_ALL)) {
                const id = ensureId(current);
                if (id && !result.some((item) => item.id === id)) {
                  result.push({ id, el: current });
                }
              }
              current = current.parentElement;
            }
            return result;
          };

          const setExternalDropTarget = (entry) => {
            if (!entry || !entry.id || !entry.el) {
              dropTarget = null;
              setRect(overlay.dropTarget, null);
              if (dropLabel) dropLabel.style.display = 'none';
              if (externalDrag) {
                post(MSG_DROP_TARGET, {
                  sourceId: externalDrag.tag || externalDrag.componentName || 'external',
                  targetId: null,
                  source: externalDrag.source || 'library'
                });
              }
              return;
            }

            dropTarget = entry.id;
            const rect = entry.el.getBoundingClientRect();
            setRect(overlay.dropTarget, rect);
            if (dropLabel) {
              const tag = (entry.el.tagName || 'Element').toLowerCase();
              const shortId = String(entry.id).slice(-48);
              dropLabel.textContent = 'Child of: <' + tag + '> ' + shortId;
              dropLabel.style.display = 'block';
              dropLabel.style.left = Math.max(8, rect.left) + 'px';
              dropLabel.style.top = Math.max(8, rect.top - 30) + 'px';
            }
            if (externalDrag) {
              post(MSG_DROP_TARGET, {
                sourceId: externalDrag.tag || externalDrag.componentName || 'external',
                targetId: entry.id,
                source: externalDrag.source || 'library'
              });
            }
          };

          const updateExternalDropCandidate = (x, y) => {
            if (!externalDrag) return;
            externalPointer = { x, y };
            externalHoverCandidates = getCandidateBlocksAtPoint(x, y);
            if (externalHoverCandidates.length === 0) {
              externalHoverIndex = 0;
              setExternalDropTarget(null);
              return;
            }
            if (externalHoverIndex >= externalHoverCandidates.length) {
              externalHoverIndex = 0;
            }
            setExternalDropTarget(externalHoverCandidates[externalHoverIndex]);
          };

          const clearExternalDrag = () => {
            const externalSource = externalDrag && externalDrag.source ? externalDrag.source : 'library';
            externalDrag = null;
            externalHoverCandidates = [];
            externalHoverIndex = 0;
            dropTarget = null;
            setRect(overlay.dropTarget, null);
            if (dropLabel) dropLabel.style.display = 'none';
            post(MSG_DROP_TARGET, { sourceId: 'external', targetId: null, source: externalSource });
          };

          function isInteractive(el) {
            if (!el || el.nodeType !== 1) return false;
            const tag = (el.tagName || '').toUpperCase();
            if (['A','BUTTON','INPUT','SELECT','TEXTAREA','LABEL','FORM','SUMMARY'].includes(tag)) return true;
            if (el.hasAttribute && el.hasAttribute('contenteditable')) return true;
            const role = el.getAttribute ? (el.getAttribute('role') || '') : '';
            if (role === 'button' || role === 'link' || role === 'checkbox' || role === 'switch') return true;
            if (typeof el.onclick === 'function') return true;
            return false;
          }

          // Hover РґР»СЏ drop target РїСЂРё РїРµСЂРµС‚Р°СЃРєРёРІР°РЅРёРё (СЂРµР¶РёРј reparent)
          document.addEventListener('mousemove', (ev) => {
            if (!isActiveInstance()) return;
            if (externalDrag) {
              updateExternalDropCandidate(ev.clientX, ev.clientY);
              return;
            }
            if (!dragging || !dragging.sourceId || dragging.mode !== 'reparent') return;
            const el = ev.target && ev.target.closest ? ev.target.closest(SEL_ALL) : null;
            const sid = dragging.sourceId;
            if (el) {
              const id = ensureId(el);
              if (id && id !== sid) {
                dropTarget = id;
                post(MSG_DROP_TARGET, { sourceId: sid, targetId: id });
              }
            } else {
              dropTarget = null;
              post(MSG_DROP_TARGET, { sourceId: sid, targetId: null });
            }
          }, true);

          // Р‘Р»РѕРєРёСЂСѓРµРј submit С„РѕСЂРј С‚РѕР»СЊРєРѕ РІ СЂРµР¶РёРјРµ СЂРµРґР°РєС‚РѕСЂР°
          if (EDIT_MODE) {
            document.addEventListener('submit', (ev) => {
              if (!isActiveInstance()) return;
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
              } catch(e) {}
            }, true);
          }

          // Р‘Р»РѕРєРёСЂСѓРµРј РІСЃРµ СЃРѕР±С‹С‚РёСЏ РЅР° РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹С… СЌР»РµРјРµРЅС‚Р°С… С‚РѕР»СЊРєРѕ РІ СЂРµР¶РёРјРµ СЂРµРґР°РєС‚РѕСЂР°
          const blockInteractiveEvents = (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return;
            if (drag || dragging) return;
            if (shouldKeepCurrentSelectionForGesture(ev)) return;
            let t = ev.target;
            if (t && t.nodeType === 3) {
              t = t.parentElement;
            }
            if (!t) return;
            // РџСЂРѕРІРµСЂСЏРµРј, СЏРІР»СЏРµС‚СЃСЏ Р»Рё СЌР»РµРјРµРЅС‚ РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рј
            if (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,label,form,[role=button],[role=link],[role=checkbox],[role=switch],[contenteditable]'))) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                // Р•СЃР»Рё Сѓ РёРЅС‚РµСЂР°РєС‚РёРІРЅРѕРіРѕ СЌР»РµРјРµРЅС‚Р° РµСЃС‚СЊ id-Р°С‚СЂРёР±СѓС‚, РІС‹Р±РёСЂР°РµРј РµРіРѕ РЅР°РїСЂСЏРјСѓСЋ
                if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                  selectEl(t);
                  return;
                }
                // РРЅР°С‡Рµ РІС‹Р±РёСЂР°РµРј СЂРѕРґРёС‚РµР»СЊСЃРєРёР№ Р±Р»РѕРє
                const block = t.closest(SEL_ALL);
                if (block && block !== t) {
                  selectEl(block);
                }
              } catch(e) {}
            }
          };

          // Р‘Р»РѕРєРёСЂСѓРµРј hover/enter СЃРѕР±С‹С‚РёСЏ, С‡С‚РѕР±С‹ onPointerEnter/onMouseEnter РЅРµ СЃСЂР°Р±Р°С‚С‹РІР°Р»Рё РІ edit СЂРµР¶РёРјРµ
          const blockHoverEvents = (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return;
            if (drag || dragging) return;
            try {
              ev.preventDefault();
              ev.stopPropagation();
              ev.stopImmediatePropagation();
            } catch (e) {}
          };

          // Р‘Р»РѕРєРёСЂСѓРµРј РІСЃРµ СЃРѕР±С‹С‚РёСЏ РЅР° РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹С… СЌР»РµРјРµРЅС‚Р°С… (РєСЂРѕРјРµ mousedown, РєРѕС‚РѕСЂС‹Р№ РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ РѕС‚РґРµР»СЊРЅРѕ) С‚РѕР»СЊРєРѕ РІ СЂРµР¶РёРјРµ СЂРµРґР°РєС‚РѕСЂР°
          if (EDIT_MODE) {
            document.addEventListener('keydown', (ev) => {
              if (!isActiveInstance()) return;
              const key = String(ev.key || '').toLowerCase();
              if ((ev.ctrlKey || ev.metaKey) && key === 's') {
                try {
                  ev.preventDefault();
                  ev.stopPropagation();
                  ev.stopImmediatePropagation();
                } catch (e) {}
                post(MSG_SAVE, { source: 'iframe' });
              }
            }, true);

            document.addEventListener('mouseup', blockInteractiveEvents, true);
            document.addEventListener('dblclick', blockInteractiveEvents, true);
            document.addEventListener('change', blockInteractiveEvents, true);
            document.addEventListener('input', blockInteractiveEvents, true);
            document.addEventListener('beforeinput', blockInteractiveEvents, true);
            document.addEventListener('compositionstart', blockInteractiveEvents, true);
            document.addEventListener('compositionupdate', blockInteractiveEvents, true);
            document.addEventListener('compositionend', blockInteractiveEvents, true);
            document.addEventListener('paste', blockInteractiveEvents, true);
            document.addEventListener('cut', blockInteractiveEvents, true);
            document.addEventListener('copy', blockInteractiveEvents, true);
            document.addEventListener('focus', blockInteractiveEvents, true);
            document.addEventListener('blur', blockInteractiveEvents, true);
            document.addEventListener('focusin', blockInteractiveEvents, true);
            document.addEventListener('focusout', blockInteractiveEvents, true);
            document.addEventListener('keydown', (ev) => {
              if (!isActiveInstance()) return;
              if (drag || dragging) return;
              if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && selected) {
                try {
                  ev.preventDefault();
                  ev.stopPropagation();
                  ev.stopImmediatePropagation();
                } catch (e) {}
                const modes = ['margin', 'size', 'padding', 'content-lock'];
                const current = modes.indexOf(resizeTargetMode);
                const step = ev.key === 'ArrowRight' ? 1 : -1;
                const next = (current + step + modes.length) % modes.length;
                resizeTargetMode = modes[next];
                updateResizeOverlayStyles();
                updateBoxOverlay();
                return;
              }
              const t = ev.target;
              if (t && (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,[role=button],[role=link],[contenteditable]')))) {
                try {
                  ev.preventDefault();
                  ev.stopPropagation();
                  ev.stopImmediatePropagation();
                  // Р•СЃР»Рё Сѓ РёРЅС‚РµСЂР°РєС‚РёРІРЅРѕРіРѕ СЌР»РµРјРµРЅС‚Р° РµСЃС‚СЊ id-Р°С‚СЂРёР±СѓС‚, РІС‹Р±РёСЂР°РµРј РµРіРѕ РЅР°РїСЂСЏРјСѓСЋ
                  if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                    selectEl(t);
                    return;
                  }
                  // РРЅР°С‡Рµ РІС‹Р±РёСЂР°РµРј СЂРѕРґРёС‚РµР»СЊСЃРєРёР№ Р±Р»РѕРє
                  const block = t.closest(SEL_ALL);
                  if (block && block !== t) {
                    selectEl(block);
                  }
                } catch(e) {}
              }
            }, true);
            document.addEventListener('keyup', blockInteractiveEvents, true);
            document.addEventListener('keypress', blockInteractiveEvents, true);
            document.addEventListener('pointerenter', blockHoverEvents, true);
            document.addEventListener('pointerover', blockHoverEvents, true);
            document.addEventListener('pointerout', blockHoverEvents, true);
            document.addEventListener('pointermove', blockHoverEvents, true);
            document.addEventListener('mouseenter', blockHoverEvents, true);
            document.addEventListener('mouseover', blockHoverEvents, true);
            document.addEventListener('mouseout', blockHoverEvents, true);
            document.addEventListener('mousemove', blockHoverEvents, true);
          }
          
          // РћР±СЂР°Р±РѕС‚РєР° РєР»РёРєР° РґР»СЏ РІС‹Р±РѕСЂР° Р±Р»РѕРєРѕРІ (С‚РѕР»СЊРєРѕ РІ СЂРµР¶РёРјРµ СЂРµРґР°РєС‚РѕСЂР°)
          document.addEventListener('click', (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return; // Р’ preview СЂРµР¶РёРјРµ РЅРµ РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј РєР»РёРєРё РґР»СЏ РІС‹Р±РѕСЂР°
            if (externalDrag) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
              } catch (e) {}
              return;
            }
            if (shouldKeepCurrentSelectionForGesture(ev)) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
              } catch (e) {}
              return;
            }
            if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey) {
              const multiEl = ev.target && ev.target.closest ? getBoundaryBlock(ev.target.closest(SEL_ALL)) : null;
              if (!multiEl) return;
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
              } catch (e) {}
              toggleSiblingSelection(multiEl);
              return;
            }
            
            const t = ev.target;
            // Р•СЃР»Рё СЌС‚Рѕ РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Р№ СЌР»РµРјРµРЅС‚, РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј РµРіРѕ
            if (t && (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,label,form,[role=button],[role=link],[contenteditable]')))) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                // Р•СЃР»Рё Сѓ РёРЅС‚РµСЂР°РєС‚РёРІРЅРѕРіРѕ СЌР»РµРјРµРЅС‚Р° РµСЃС‚СЊ id-Р°С‚СЂРёР±СѓС‚, РІС‹Р±РёСЂР°РµРј РµРіРѕ РЅР°РїСЂСЏРјСѓСЋ
                if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                  selectEl(getBoundaryBlock(t));
                  return;
                }
                // РРЅР°С‡Рµ РІС‹Р±РёСЂР°РµРј СЂРѕРґРёС‚РµР»СЊСЃРєРёР№ Р±Р»РѕРє
                const block = t.closest(SEL_ALL);
                if (block && block !== t) {
                  selectEl(getBoundaryBlock(block));
                  return;
                }
              } catch(e) {}
            }
            // Р•СЃР»Рё СЌС‚Рѕ РЅРµ РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Р№ СЌР»РµРјРµРЅС‚, РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј РєР°Рє РѕР±С‹С‡РЅС‹Р№ РєР»РёРє РґР»СЏ РІС‹Р±РѕСЂР° Р±Р»РѕРєР°
            const el = ev.target && ev.target.closest ? getBoundaryBlock(ev.target.closest(SEL_ALL)) : null;
            if (!el) return;
            try {
              ev.preventDefault();
              ev.stopPropagation();
            } catch(e) {}
            selectEl(el);
          }, true);

          // Shift+Drag: РїРµСЂРµРЅРѕСЃ (MVP -> position:absolute + left/top/width/height)
          // Р­С‚РѕС‚ РѕР±СЂР°Р±РѕС‚С‡РёРє С‚Р°РєР¶Рµ Р±Р»РѕРєРёСЂСѓРµС‚ РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹ (С‚РѕР»СЊРєРѕ РІ СЂРµР¶РёРјРµ СЂРµРґР°РєС‚РѕСЂР°)
          document.addEventListener('wheel', (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return;
            if (externalDrag) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
              } catch (e) {}
              if (!externalHoverCandidates || externalHoverCandidates.length === 0) {
                updateExternalDropCandidate(ev.clientX, ev.clientY);
              }
              if (!externalHoverCandidates || externalHoverCandidates.length === 0) return;
              const step = ev.deltaY > 0 ? 1 : -1;
              const len = externalHoverCandidates.length;
              externalHoverIndex = ((externalHoverIndex + step) % len + len) % len;
              setExternalDropTarget(externalHoverCandidates[externalHoverIndex]);
              return;
            }
            if (!selected || drag || dragging) return;

            const x = ev.clientX;
            const y = ev.clientY;
            if (!isPointerInsideSelectedGroup(x, y)) return;

            let nextEl = null;
            if (ev.deltaY < 0) {
              nextEl = getLogicalParentBlock(selected);
            } else if (ev.deltaY > 0) {
              nextEl = getDirectChildBlockAtPoint(selected, x, y);
            }

            if (!nextEl || nextEl === selected) return;

            try {
              ev.preventDefault();
              ev.stopPropagation();
              ev.stopImmediatePropagation();
            } catch (e) {}
            selectEl(nextEl);
          }, { passive: false, capture: true });

          let drag = null;
          document.addEventListener('mousedown', (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return; // Р’ preview СЂРµР¶РёРјРµ РЅРµ РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј
            if (externalDrag) return;
            
            let t = ev.target;
            if (t && t.nodeType === 3) {
              t = t.parentElement;
            }
            // Р•СЃР»Рё СЌС‚Рѕ РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Р№ СЌР»РµРјРµРЅС‚, РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј РµРіРѕ
            if (t && (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,label,form,[role=button],[role=link],[contenteditable]')))) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                
                // Р•СЃР»Рё Сѓ РёРЅС‚РµСЂР°РєС‚РёРІРЅРѕРіРѕ СЌР»РµРјРµРЅС‚Р° РµСЃС‚СЊ id-Р°С‚СЂРёР±СѓС‚, РёСЃРїРѕР»СЊР·СѓРµРј РµРіРѕ
                let targetEl = t;
                let targetId = null;
                if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                    targetEl = getBoundaryBlock(t);
                    targetId = getId(targetEl);
                } else {
                  // РРЅР°С‡Рµ РёС‰РµРј СЂРѕРґРёС‚РµР»СЊСЃРєРёР№ Р±Р»РѕРє
                  const block = t.closest(SEL_ALL);
                  if (block && block !== t) {
                    targetEl = getBoundaryBlock(block);
                    targetId = getId(targetEl);
                  }
                }
                
                if (targetId) {
                  const isMoveResizeGesture = !!(ev.shiftKey || ev.altKey);
                  const dragAnchorEl = isMoveResizeGesture && selected ? selected : targetEl;
                  const dragAnchorId = ensureId(dragAnchorEl) || targetId;
                  if (!(isMoveResizeGesture && selected)) {
                    selectEl(targetEl);
                  }
                  if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey) {
                    return;
                  }
                  // Р•СЃР»Рё СЌС‚Рѕ Shift/Ctrl/Alt + РєР»РёРє, РѕР±СЂР°Р±Р°С‚С‹РІР°РµРј РєР°Рє drag
                  if (ev.ctrlKey || ev.metaKey) {
                    dragging = { sourceId: dragAnchorId, mode: 'reparent' };
                    post(MSG_DROP_TARGET, { sourceId: dragAnchorId, targetId: null });
                    return;
                  } else if (ev.shiftKey || ev.altKey) {
                    dragging = { sourceId: dragAnchorId, mode: ev.altKey ? 'resize' : 'move' };
                    const startRect = getElementVisualRect(dragAnchorEl) || dragAnchorEl.getBoundingClientRect();
                    const startCs = window.getComputedStyle(dragAnchorEl);
                    const startBt = toNum(startCs.borderTopWidth);
                    const startBr = toNum(startCs.borderRightWidth);
                    const startBb = toNum(startCs.borderBottomWidth);
                    const startBl = toNum(startCs.borderLeftWidth);
                    const startParentInfo = getParentContentRect(dragAnchorEl);
                    const startPadLeft = startParentInfo.padding.left;
                    const startPadTop = startParentInfo.padding.top;
                    const startTarget = resizeTargetMode || 'size';
                    const anchorRect = ev.altKey ? (getResizeAnchorRect(dragAnchorEl, startTarget) || startRect) : startRect;
                    const startHandle = ev.altKey ? getResizeHandleFromPoint(anchorRect, ev.clientX, ev.clientY) : 'se';
                    drag = {
                      mode: ev.altKey ? 'resize' : 'move',
                      sx: ev.clientX,
                      sy: ev.clientY,
                      rect: startRect,
                      moveMode: getElementMoveMode(dragAnchorEl),
                      resizeTarget: startTarget,
                      resizeHandle: startHandle,
                      startMarginRight: pxToNum(startCs.marginRight),
                      startMarginBottom: pxToNum(startCs.marginBottom),
                      startPaddingRight: pxToNum(startCs.paddingRight),
                      startPaddingBottom: pxToNum(startCs.paddingBottom),
                      startPaddingLeft: pxToNum(startCs.paddingLeft),
                      startPaddingTop: pxToNum(startCs.paddingTop),
                      startBorderTop: startBt,
                      startBorderRight: startBr,
                      startBorderBottom: startBb,
                      startBorderLeft: startBl,
                      startBoxSizing: String(startCs.boxSizing || ''),
                      startPaddingBoxWidth: snap(startRect.width - startBl - startBr),
                      startPaddingBoxHeight: snap(startRect.height - startBt - startBb),
                      startLeft: snap(startRect.left - startParentInfo.rect.left - startPadLeft),
                      startTop: snap(startRect.top - startParentInfo.rect.top - startPadTop),
                      startMarginLeft: pxToNum(startCs.marginLeft),
                      startMarginTop: pxToNum(startCs.marginTop),
                      startWidth: snap(startRect.width),
                      startHeight: snap(startRect.height),
                    };
                    return;
                  }
                }
                return;
              } catch(e) {}
            }
            
            const el = ev.target && ev.target.closest ? getBoundaryBlock(ev.target.closest(SEL_ALL)) : null;
            if (!el) return;
            if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey) {
              return;
            }
            
            // Ctrl/Cmd + drag => reparent drag
            if (ev.ctrlKey || ev.metaKey) {
              ev.preventDefault();
              ev.stopPropagation();
              const id = ensureId(el);
              dragging = { sourceId: id, mode: 'reparent' };
              selectEl(el);
              post(MSG_DROP_TARGET, { sourceId: id, targetId: null });
              return;
            }
            if (!selected) return;
            if (!ev.shiftKey && !ev.altKey) return;
            ev.preventDefault();
            ev.stopPropagation();
            const id = ensureId(selected);
            dragging = { sourceId: id, mode: ev.altKey ? 'resize' : 'move' };
            const startRect = getElementVisualRect(selected) || selected.getBoundingClientRect();
            const startCs = window.getComputedStyle(selected);
            const startBt = toNum(startCs.borderTopWidth);
            const startBr = toNum(startCs.borderRightWidth);
            const startBb = toNum(startCs.borderBottomWidth);
            const startBl = toNum(startCs.borderLeftWidth);
            const startParentInfo = getParentContentRect(selected);
            const startPadLeft = startParentInfo.padding.left;
            const startPadTop = startParentInfo.padding.top;
            const startTarget = resizeTargetMode || 'size';
            const anchorRect = ev.altKey ? (getResizeAnchorRect(selected, startTarget) || startRect) : startRect;
            const startHandle = ev.altKey ? getResizeHandleFromPoint(anchorRect, ev.clientX, ev.clientY) : 'se';
            const elementMoveMode = getElementMoveMode(selected);
            drag = {
              mode: ev.altKey ? 'resize' : 'move',
              sx: ev.clientX,
              sy: ev.clientY,
              rect: startRect,
              moveMode: elementMoveMode,
              resizeTarget: startTarget,
              resizeHandle: startHandle,
              startMarginRight: pxToNum(startCs.marginRight),
              startMarginBottom: pxToNum(startCs.marginBottom),
              startPaddingRight: pxToNum(startCs.paddingRight),
              startPaddingBottom: pxToNum(startCs.paddingBottom),
              startPaddingLeft: pxToNum(startCs.paddingLeft),
              startPaddingTop: pxToNum(startCs.paddingTop),
              startBorderTop: startBt,
              startBorderRight: startBr,
              startBorderBottom: startBb,
              startBorderLeft: startBl,
              startBoxSizing: String(startCs.boxSizing || ''),
              startPaddingBoxWidth: snap(startRect.width - startBl - startBr),
              startPaddingBoxHeight: snap(startRect.height - startBt - startBb),
              startLeft: snap(startRect.left - startParentInfo.rect.left - startPadLeft),
              startTop: snap(startRect.top - startParentInfo.rect.top - startPadTop),
              startMarginLeft: pxToNum(startCs.marginLeft),
              startMarginTop: pxToNum(startCs.marginTop),
              startWidth: snap(startRect.width),
              startHeight: snap(startRect.height),
            };
          }, true);

          document.addEventListener('mousemove', (ev) => {
            if (!isActiveInstance()) return;
            if (!drag || !selected) return;
            const dx = ev.clientX - drag.sx;
            const dy = ev.clientY - drag.sy;
            
            if (drag.mode === 'move') {
              const activeMoveMode = drag.moveMode || getElementMoveMode(selected);
              const parentInfo = getParentContentRect(selected);
              const parentRect = parentInfo.rect;
              const padLeft = parentInfo.padding.left;
              const padTop = parentInfo.padding.top;
              const padRight = parentInfo.padding.right;
              const padBottom = parentInfo.padding.bottom;
              const contentLeft = parentRect.left + padLeft;
              const contentTop = parentRect.top + padTop;
              const contentRight = parentRect.left + parentRect.width - padRight;
              const contentBottom = parentRect.top + parentRect.height - padBottom;
              const minDx = contentLeft - drag.rect.left;
              const maxDx = contentRight - drag.rect.right;
              const minDy = contentTop - drag.rect.top;
              const maxDy = contentBottom - drag.rect.bottom;
              const constrainedDx = activeMoveMode === 'relative' ? dx : Math.min(Math.max(dx, minDx), maxDx);
              const constrainedDy = activeMoveMode === 'relative' ? dy : Math.min(Math.max(dy, minDy), maxDy);
              
              applyToSelectedGroup((node) => {
                node.style.transform = 'translate(' + constrainedDx + 'px,' + constrainedDy + 'px)';
              });
              updateBoxOverlay();
              if (activeMoveMode === 'relative') {
                updateRelativeParentPreview(selected, constrainedDx, constrainedDy);
              }
            } else {
              const resizeTarget = drag.resizeTarget || resizeTargetMode;
              const handle = drag.resizeHandle || 'se';
              const delta = getResizeDeltaByHandle(handle, dx, dy);
              const w = snap(Math.max(0, drag.rect.width + delta.widthDelta));
              const h = snap(Math.max(0, drag.rect.height + delta.heightDelta));
              const shiftX = snap(delta.shiftX);
              const shiftY = snap(delta.shiftY);
              if (resizeTarget === 'margin') {
                const handleStr = String(handle || 'se');
                const nextMl = handleStr.indexOf('w') >= 0
                  ? snap((drag.startMarginLeft || 0) - dx)
                  : snap((drag.startMarginLeft || 0));
                const nextMr = handleStr.indexOf('e') >= 0
                  ? snap((drag.startMarginRight || 0) + dx)
                  : snap((drag.startMarginRight || 0));
                const nextMt = handleStr.indexOf('n') >= 0
                  ? snap((drag.startMarginTop || 0) - dy)
                  : snap((drag.startMarginTop || 0));
                const nextMb = handleStr.indexOf('s') >= 0
                  ? snap((drag.startMarginBottom || 0) + dy)
                  : snap((drag.startMarginBottom || 0));
                drag.finalMargins = {
                  left: nextMl,
                  top: nextMt,
                  right: nextMr,
                  bottom: nextMb,
                };
                updateBoxOverlay();
                const baseRect = getElementVisualRect(selected);
                if (baseRect) {
                  setRect(overlay.margin, {
                    left: baseRect.left - nextMl,
                    top: baseRect.top - nextMt,
                    width: baseRect.width + nextMl + nextMr,
                    height: baseRect.height + nextMt + nextMb,
                  });
                }
              } else if (resizeTarget === 'padding') {
                const handleStr = String(handle || 'se');
                const nextPl = handleStr.indexOf('w') >= 0
                  ? snap(Math.max(0, (drag.startPaddingLeft || 0) + dx))
                  : snap(Math.max(0, (drag.startPaddingLeft || 0)));
                const nextPr = handleStr.indexOf('e') >= 0
                  ? snap(Math.max(0, (drag.startPaddingRight || 0) - dx))
                  : snap(Math.max(0, (drag.startPaddingRight || 0)));
                const nextPt = handleStr.indexOf('n') >= 0
                  ? snap(Math.max(0, (drag.startPaddingTop || 0) + dy))
                  : snap(Math.max(0, (drag.startPaddingTop || 0)));
                const nextPb = handleStr.indexOf('s') >= 0
                  ? snap(Math.max(0, (drag.startPaddingBottom || 0) - dy))
                  : snap(Math.max(0, (drag.startPaddingBottom || 0)));
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = nextPl + 'px';
                  node.style.paddingTop = nextPt + 'px';
                  node.style.paddingRight = nextPr + 'px';
                  node.style.paddingBottom = nextPb + 'px';
                });
              } else if (resizeTarget === 'content-lock') {
                const handleStr = String(handle || 'se');
                let nextPl = drag.startPaddingLeft || 0;
                let nextPr = drag.startPaddingRight || 0;
                let nextPt = drag.startPaddingTop || 0;
                let nextPb = drag.startPaddingBottom || 0;
                const lockW = Math.max(0, drag.startPaddingBoxWidth || 0);
                const lockH = Math.max(0, drag.startPaddingBoxHeight || 0);
                if (handleStr.indexOf('w') >= 0) nextPl = clamp(nextPl + dx, 0, Math.max(0, lockW - nextPr));
                if (handleStr.indexOf('e') >= 0) nextPr = clamp(nextPr - dx, 0, Math.max(0, lockW - nextPl));
                if (handleStr.indexOf('n') >= 0) nextPt = clamp(nextPt + dy, 0, Math.max(0, lockH - nextPb));
                if (handleStr.indexOf('s') >= 0) nextPb = clamp(nextPb - dy, 0, Math.max(0, lockH - nextPt));
                const nextContentW = Math.max(0, lockW - nextPl - nextPr);
                const nextContentH = Math.max(0, lockH - nextPt - nextPb);
                const widthStyle = computeStyleSizeFromContent(
                  nextContentW,
                  nextPl,
                  nextPr,
                  drag.startBorderLeft || 0,
                  drag.startBorderRight || 0,
                  drag.startBoxSizing
                );
                const heightStyle = computeStyleSizeFromContent(
                  nextContentH,
                  nextPt,
                  nextPb,
                  drag.startBorderTop || 0,
                  drag.startBorderBottom || 0,
                  drag.startBoxSizing
                );
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = nextPl + 'px';
                  node.style.paddingTop = nextPt + 'px';
                  node.style.paddingRight = nextPr + 'px';
                  node.style.paddingBottom = nextPb + 'px';
                  node.style.width = widthStyle + 'px';
                  node.style.height = heightStyle + 'px';
                });
                drag.finalContentLock = {
                  paddingLeft: nextPl,
                  paddingTop: nextPt,
                  paddingRight: nextPr,
                  paddingBottom: nextPb,
                  width: widthStyle,
                  height: heightStyle,
                };
              } else {
                applyToSelectedGroup((node) => {
                  node.style.transform = '';
                  node.style.width = w + 'px';
                  node.style.height = h + 'px';
                  if ((drag.moveMode || getElementMoveMode(node)) === 'absolute' && (shiftX !== 0 || shiftY !== 0)) {
                    node.style.left = snap((drag.startLeft || 0) + shiftX) + 'px';
                    node.style.top = snap((drag.startTop || 0) + shiftY) + 'px';
                  } else if ((drag.moveMode || getElementMoveMode(node)) === 'relative' && (shiftX !== 0 || shiftY !== 0)) {
                    node.style.marginLeft = snap((drag.startMarginLeft || 0) + shiftX) + 'px';
                    node.style.marginTop = snap((drag.startMarginTop || 0) + shiftY) + 'px';
                  }
                });
              }
              if (resizeTarget !== 'margin') {
                updateBoxOverlay();
              }
            }
          }, true);

          // Touch СЃРѕР±С‹С‚РёСЏ РґР»СЏ РјРѕР±РёР»СЊРЅС‹С… СѓСЃС‚СЂРѕР№СЃС‚РІ
          document.addEventListener('touchmove', (ev) => {
            if (!isActiveInstance()) return;
            if (!drag || !selected) return;
            const touch = ev.touches[0];
            if (!touch) return;
            const dx = touch.clientX - drag.sx;
            const dy = touch.clientY - drag.sy;
            
            if (drag.mode === 'move') {
              const activeMoveMode = drag.moveMode || getElementMoveMode(selected);
              const parentInfo = getParentContentRect(selected);
              const parentRect = parentInfo.rect;
              const padLeft = parentInfo.padding.left;
              const padTop = parentInfo.padding.top;
              const padRight = parentInfo.padding.right;
              const padBottom = parentInfo.padding.bottom;
              const contentLeft = parentRect.left + padLeft;
              const contentTop = parentRect.top + padTop;
              const contentRight = parentRect.left + parentRect.width - padRight;
              const contentBottom = parentRect.top + parentRect.height - padBottom;
              const minDx = contentLeft - drag.rect.left;
              const maxDx = contentRight - drag.rect.right;
              const minDy = contentTop - drag.rect.top;
              const maxDy = contentBottom - drag.rect.bottom;
              const constrainedDx = activeMoveMode === 'relative' ? dx : Math.min(Math.max(dx, minDx), maxDx);
              const constrainedDy = activeMoveMode === 'relative' ? dy : Math.min(Math.max(dy, minDy), maxDy);

              applyToSelectedGroup((node) => {
                node.style.transform = 'translate(' + constrainedDx + 'px,' + constrainedDy + 'px)';
              });
              updateBoxOverlay();
              if (activeMoveMode === 'relative') {
                updateRelativeParentPreview(selected, constrainedDx, constrainedDy);
              }

              // РЎРѕС…СЂР°РЅСЏРµРј С„РёРЅР°Р»СЊРЅС‹Рµ РєРѕРѕСЂРґРёРЅР°С‚С‹ РІ drag РѕР±СЉРµРєС‚
              if (activeMoveMode === 'relative') {
                const cs = window.getComputedStyle(selected);
                const baseLeft = pxToNum(cs.marginLeft);
                const baseTop = pxToNum(cs.marginTop);
                const left = snap(baseLeft + constrainedDx);
                const top = snap(baseTop + constrainedDy);
                
                drag.finalLeft = left;
                drag.finalTop = top;
                drag.finalPosition = 'relative';
              } else {
                const startLeft = drag.rect.left - parentRect.left - padLeft;
                const startTop = drag.rect.top - parentRect.top - padTop;
                const left = snap(startLeft + constrainedDx);
                const top = snap(startTop + constrainedDy);
                
                drag.finalLeft = left;
                drag.finalTop = top;
                drag.finalPosition = 'absolute';
              }
            } else {
              const resizeTarget = drag.resizeTarget || resizeTargetMode;
              const handle = drag.resizeHandle || 'se';
              const delta = getResizeDeltaByHandle(handle, dx, dy);
              const w = snap(Math.max(0, drag.rect.width + delta.widthDelta));
              const h = snap(Math.max(0, drag.rect.height + delta.heightDelta));
              const shiftX = snap(delta.shiftX);
              const shiftY = snap(delta.shiftY);
              if (resizeTarget === 'margin') {
                const handleStr = String(handle || 'se');
                const nextMl = handleStr.indexOf('w') >= 0
                  ? snap((drag.startMarginLeft || 0) - dx)
                  : snap((drag.startMarginLeft || 0));
                const nextMr = handleStr.indexOf('e') >= 0
                  ? snap((drag.startMarginRight || 0) + dx)
                  : snap((drag.startMarginRight || 0));
                const nextMt = handleStr.indexOf('n') >= 0
                  ? snap((drag.startMarginTop || 0) - dy)
                  : snap((drag.startMarginTop || 0));
                const nextMb = handleStr.indexOf('s') >= 0
                  ? snap((drag.startMarginBottom || 0) + dy)
                  : snap((drag.startMarginBottom || 0));
                drag.finalMargins = {
                  left: nextMl,
                  top: nextMt,
                  right: nextMr,
                  bottom: nextMb,
                };
                updateBoxOverlay();
                const baseRect = getElementVisualRect(selected);
                if (baseRect) {
                  setRect(overlay.margin, {
                    left: baseRect.left - nextMl,
                    top: baseRect.top - nextMt,
                    width: baseRect.width + nextMl + nextMr,
                    height: baseRect.height + nextMt + nextMb,
                  });
                }
              } else if (resizeTarget === 'padding') {
                const handleStr = String(handle || 'se');
                const nextPl = handleStr.indexOf('w') >= 0
                  ? snap(Math.max(0, (drag.startPaddingLeft || 0) + dx))
                  : snap(Math.max(0, (drag.startPaddingLeft || 0)));
                const nextPr = handleStr.indexOf('e') >= 0
                  ? snap(Math.max(0, (drag.startPaddingRight || 0) - dx))
                  : snap(Math.max(0, (drag.startPaddingRight || 0)));
                const nextPt = handleStr.indexOf('n') >= 0
                  ? snap(Math.max(0, (drag.startPaddingTop || 0) + dy))
                  : snap(Math.max(0, (drag.startPaddingTop || 0)));
                const nextPb = handleStr.indexOf('s') >= 0
                  ? snap(Math.max(0, (drag.startPaddingBottom || 0) - dy))
                  : snap(Math.max(0, (drag.startPaddingBottom || 0)));
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = nextPl + 'px';
                  node.style.paddingTop = nextPt + 'px';
                  node.style.paddingRight = nextPr + 'px';
                  node.style.paddingBottom = nextPb + 'px';
                });
                drag.finalPaddings = {
                  left: nextPl,
                  top: nextPt,
                  right: nextPr,
                  bottom: nextPb,
                };
              } else if (resizeTarget === 'content-lock') {
                const handleStr = String(handle || 'se');
                let nextPl = drag.startPaddingLeft || 0;
                let nextPr = drag.startPaddingRight || 0;
                let nextPt = drag.startPaddingTop || 0;
                let nextPb = drag.startPaddingBottom || 0;
                const lockW = Math.max(0, drag.startPaddingBoxWidth || 0);
                const lockH = Math.max(0, drag.startPaddingBoxHeight || 0);
                if (handleStr.indexOf('w') >= 0) nextPl = clamp(nextPl + dx, 0, Math.max(0, lockW - nextPr));
                if (handleStr.indexOf('e') >= 0) nextPr = clamp(nextPr - dx, 0, Math.max(0, lockW - nextPl));
                if (handleStr.indexOf('n') >= 0) nextPt = clamp(nextPt + dy, 0, Math.max(0, lockH - nextPb));
                if (handleStr.indexOf('s') >= 0) nextPb = clamp(nextPb - dy, 0, Math.max(0, lockH - nextPt));
                const nextContentW = Math.max(0, lockW - nextPl - nextPr);
                const nextContentH = Math.max(0, lockH - nextPt - nextPb);
                const widthStyle = computeStyleSizeFromContent(
                  nextContentW,
                  nextPl,
                  nextPr,
                  drag.startBorderLeft || 0,
                  drag.startBorderRight || 0,
                  drag.startBoxSizing
                );
                const heightStyle = computeStyleSizeFromContent(
                  nextContentH,
                  nextPt,
                  nextPb,
                  drag.startBorderTop || 0,
                  drag.startBorderBottom || 0,
                  drag.startBoxSizing
                );
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = nextPl + 'px';
                  node.style.paddingTop = nextPt + 'px';
                  node.style.paddingRight = nextPr + 'px';
                  node.style.paddingBottom = nextPb + 'px';
                  node.style.width = widthStyle + 'px';
                  node.style.height = heightStyle + 'px';
                });
                drag.finalContentLock = {
                  paddingLeft: nextPl,
                  paddingTop: nextPt,
                  paddingRight: nextPr,
                  paddingBottom: nextPb,
                  width: widthStyle,
                  height: heightStyle,
                };
              } else {
                applyToSelectedGroup((node) => {
                  node.style.transform = '';
                  node.style.width = w + 'px';
                  node.style.height = h + 'px';
                  if ((drag.moveMode || getElementMoveMode(node)) === 'absolute' && (shiftX !== 0 || shiftY !== 0)) {
                    node.style.left = snap((drag.startLeft || 0) + shiftX) + 'px';
                    node.style.top = snap((drag.startTop || 0) + shiftY) + 'px';
                  } else if ((drag.moveMode || getElementMoveMode(node)) === 'relative' && (shiftX !== 0 || shiftY !== 0)) {
                    node.style.marginLeft = snap((drag.startMarginLeft || 0) + shiftX) + 'px';
                    node.style.marginTop = snap((drag.startMarginTop || 0) + shiftY) + 'px';
                  }
                });
                drag.finalWidth = w;
                drag.finalHeight = h;
                if ((drag.moveMode || getElementMoveMode(selected)) === 'absolute' && (shiftX !== 0 || shiftY !== 0)) {
                  drag.finalLeft = snap((drag.startLeft || 0) + shiftX);
                  drag.finalTop = snap((drag.startTop || 0) + shiftY);
                } else if ((drag.moveMode || getElementMoveMode(selected)) === 'relative' && (shiftX !== 0 || shiftY !== 0)) {
                  drag.finalMarginLeft = snap((drag.startMarginLeft || 0) + shiftX);
                  drag.finalMarginTop = snap((drag.startMarginTop || 0) + shiftY);
                }
              }
              if (resizeTarget !== 'margin') {
                updateBoxOverlay();
              }
            }
          }, { passive: false });

          document.addEventListener('touchend', (ev) => {
            if (!isActiveInstance()) return;
            // reparent drag (Ctrl/Cmd + drag) - РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ РґР»СЏ touch
            if (dragging && dragging.mode === 'reparent') {
              dragging = null;
              dropTarget = null;
              drag = null;
              return;
            }

            if (!drag || !selected) return;
            const id = ensureId(selected);
            const parentInfo = getParentContentRect(selected);
            const contentWidth = Math.max(1, parentInfo.rect.width - parentInfo.padding.left - parentInfo.padding.right);
            const contentHeight = Math.max(1, parentInfo.rect.height - parentInfo.padding.top - parentInfo.padding.bottom);

            if (drag.mode === 'move') {
              const activeMoveMode = drag.moveMode || getElementMoveMode(selected);
              applyToSelectedGroup((node) => {
                node.style.transform = '';
              });

              // РСЃРїРѕР»СЊР·СѓРµРј СЃРѕС…СЂР°РЅРµРЅРЅС‹Рµ С„РёРЅР°Р»СЊРЅС‹Рµ Р·РЅР°С‡РµРЅРёСЏ
              if (drag.finalLeft !== undefined && drag.finalTop !== undefined) {
                const finalLeftValue = formatMoveValue(
                  drag.finalLeft,
                  getMoveAxisReferenceSize(activeMoveMode, 'x', contentWidth, contentHeight),
                  activeMoveMode
                );
                const finalTopValue = formatMoveValue(
                  drag.finalTop,
                  getMoveAxisReferenceSize(activeMoveMode, 'y', contentWidth, contentHeight),
                  activeMoveMode
                );
                if (drag.finalPosition === 'relative' || activeMoveMode === 'relative') {
                  const moveKeys = getMovePatchKeys('relative');
                  applyToSelectedGroup((node) => {
                    node.style.position = 'relative';
                    node.style.left = '';
                    node.style.top = '';
                    node.style[moveKeys.x] = String(finalLeftValue);
                    node.style[moveKeys.y] = String(finalTopValue);
                  });
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      position: 'relative',
                      left: '',
                      top: '',
                      [moveKeys.x]: finalLeftValue,
                      [moveKeys.y]: finalTopValue,
                    },
                    isIntermediate: false
                  });
                } else {
                  applyToSelectedGroup((node) => {
                    node.style.position = 'absolute';
                    node.style.left = String(finalLeftValue);
                    node.style.top = String(finalTopValue);
                  });

                  const patch = { position: 'absolute' };
                  patch.left = finalLeftValue;
                  patch.top = finalTopValue;
                  
                  post(MSG_APPLY, { id, patch, isIntermediate: false });
                }
              }
            } else {
              const resizeTarget = drag.resizeTarget || resizeTargetMode;
              if (resizeTarget === 'margin' && drag.finalMargins) {
                applyToSelectedGroup((node) => {
                  if (drag.startWidth !== undefined && drag.startHeight !== undefined) {
                    node.style.width = drag.startWidth + 'px';
                    node.style.height = drag.startHeight + 'px';
                  }
                  node.style.marginLeft = drag.finalMargins.left + 'px';
                  node.style.marginTop = drag.finalMargins.top + 'px';
                  node.style.marginRight = drag.finalMargins.right + 'px';
                  node.style.marginBottom = drag.finalMargins.bottom + 'px';
                });
                updateBoxOverlay();
                if ('${type}' === 'html') {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      ...(drag.startWidth !== undefined && drag.startHeight !== undefined ? { width: drag.startWidth + 'px', height: drag.startHeight + 'px' } : {}),
                      marginLeft: drag.finalMargins.left + 'px',
                      marginTop: drag.finalMargins.top + 'px',
                      marginRight: drag.finalMargins.right + 'px',
                      marginBottom: drag.finalMargins.bottom + 'px',
                    },
                    isIntermediate: false
                  });
                } else {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      ...(drag.startWidth !== undefined && drag.startHeight !== undefined ? { width: drag.startWidth, height: drag.startHeight } : {}),
                      marginLeft: drag.finalMargins.left,
                      marginTop: drag.finalMargins.top,
                      marginRight: drag.finalMargins.right,
                      marginBottom: drag.finalMargins.bottom,
                    },
                    isIntermediate: false
                  });
                }
              } else if (resizeTarget === 'padding' && drag.finalPaddings) {
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = drag.finalPaddings.left + 'px';
                  node.style.paddingTop = drag.finalPaddings.top + 'px';
                  node.style.paddingRight = drag.finalPaddings.right + 'px';
                  node.style.paddingBottom = drag.finalPaddings.bottom + 'px';
                });
                updateBoxOverlay();
                if ('${type}' === 'html') {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: drag.finalPaddings.left + 'px',
                      paddingTop: drag.finalPaddings.top + 'px',
                      paddingRight: drag.finalPaddings.right + 'px',
                      paddingBottom: drag.finalPaddings.bottom + 'px'
                    },
                    isIntermediate: false
                  });
                } else {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: drag.finalPaddings.left,
                      paddingTop: drag.finalPaddings.top,
                      paddingRight: drag.finalPaddings.right,
                      paddingBottom: drag.finalPaddings.bottom
                    },
                    isIntermediate: false
                  });
                }
              } else if (resizeTarget === 'content-lock' && drag.finalContentLock) {
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = drag.finalContentLock.paddingLeft + 'px';
                  node.style.paddingTop = drag.finalContentLock.paddingTop + 'px';
                  node.style.paddingRight = drag.finalContentLock.paddingRight + 'px';
                  node.style.paddingBottom = drag.finalContentLock.paddingBottom + 'px';
                  node.style.width = drag.finalContentLock.width + 'px';
                  node.style.height = drag.finalContentLock.height + 'px';
                });
                updateBoxOverlay();
                if ('${type}' === 'html') {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: drag.finalContentLock.paddingLeft + 'px',
                      paddingTop: drag.finalContentLock.paddingTop + 'px',
                      paddingRight: drag.finalContentLock.paddingRight + 'px',
                      paddingBottom: drag.finalContentLock.paddingBottom + 'px',
                      width: drag.finalContentLock.width + 'px',
                      height: drag.finalContentLock.height + 'px',
                    },
                    isIntermediate: false
                  });
                } else {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: drag.finalContentLock.paddingLeft,
                      paddingTop: drag.finalContentLock.paddingTop,
                      paddingRight: drag.finalContentLock.paddingRight,
                      paddingBottom: drag.finalContentLock.paddingBottom,
                      width: drag.finalContentLock.width,
                      height: drag.finalContentLock.height,
                    },
                    isIntermediate: false
                  });
                }
              } else if (drag.finalWidth !== undefined && drag.finalHeight !== undefined) {
                applyToSelectedGroup((node) => {
                  node.style.transform = '';
                  node.style.width = drag.finalWidth + 'px';
                  node.style.height = drag.finalHeight + 'px';
                  if (drag.finalLeft !== undefined && drag.finalTop !== undefined) {
                    node.style.left = drag.finalLeft + 'px';
                    node.style.top = drag.finalTop + 'px';
                  }
                  if (drag.finalMarginLeft !== undefined && drag.finalMarginTop !== undefined) {
                    node.style.marginLeft = drag.finalMarginLeft + 'px';
                    node.style.marginTop = drag.finalMarginTop + 'px';
                  }
                });
                updateBoxOverlay();
                
                const patch = {};
                if ('${type}' === 'html') {
                  patch.width = drag.finalWidth + 'px';
                  patch.height = drag.finalHeight + 'px';
                  if (drag.finalLeft !== undefined && drag.finalTop !== undefined) {
                    patch.left = drag.finalLeft + 'px';
                    patch.top = drag.finalTop + 'px';
                  }
                  if (drag.finalMarginLeft !== undefined && drag.finalMarginTop !== undefined) {
                    patch.marginLeft = drag.finalMarginLeft + 'px';
                    patch.marginTop = drag.finalMarginTop + 'px';
                  }
                } else {
                  patch.width = drag.finalWidth;
                  patch.height = drag.finalHeight;
                  if (drag.finalLeft !== undefined && drag.finalTop !== undefined) {
                    patch.left = drag.finalLeft;
                    patch.top = drag.finalTop;
                  }
                  if (drag.finalMarginLeft !== undefined && drag.finalMarginTop !== undefined) {
                    patch.marginLeft = drag.finalMarginLeft;
                    patch.marginTop = drag.finalMarginTop;
                  }
                }
                post(MSG_APPLY, { id, patch, isIntermediate: false });
              }
            }

            drag = null;
            dragging = null;
            dropTarget = null;
          }, { passive: false });

          document.addEventListener('mouseup', (ev) => {
            if (!isActiveInstance()) return;
            // reparent drag (Ctrl/Cmd + drag)
            if (dragging && dragging.mode === 'reparent') {
              if (dropTarget && dragging.sourceId && dropTarget !== dragging.sourceId) {
                post(MSG_APPLY, { id: dragging.sourceId, patch: { __reparentTo: dropTarget } });
              }
              dragging = null;
              dropTarget = null;
              drag = null;
              return;
            }

            if (!drag || !selected) return;
            const dx = ev.clientX - drag.sx;
            const dy = ev.clientY - drag.sy;
            const id = ensureId(selected);

            const parentInfo = getParentContentRect(selected);
            const parentRect = parentInfo.rect;
            const padLeft = parentInfo.padding.left;
            const padTop = parentInfo.padding.top;
            const padRight = parentInfo.padding.right;
            const padBottom = parentInfo.padding.bottom;
            const contentWidth = Math.max(1, parentRect.width - padLeft - padRight);
            const contentHeight = Math.max(1, parentRect.height - padTop - padBottom);
            const contentLeft = parentRect.left + padLeft;
            const contentTop = parentRect.top + padTop;
            const contentRight = parentRect.left + parentRect.width - padRight;
            const contentBottom = parentRect.top + parentRect.height - padBottom;
            const minDx = contentLeft - drag.rect.left;
            const maxDx = contentRight - drag.rect.right;
            const minDy = contentTop - drag.rect.top;
            const maxDy = contentBottom - drag.rect.bottom;
            const activeMoveMode = drag.moveMode || getElementMoveMode(selected);
            const constrainedDx = activeMoveMode === 'relative' ? dx : Math.min(Math.max(dx, minDx), maxDx);
            const constrainedDy = activeMoveMode === 'relative' ? dy : Math.min(Math.max(dy, minDy), maxDy);

            if (drag.mode === 'move') {
              applyToSelectedGroup((node) => {
                node.style.transform = '';
              });
              updateBoxOverlay();

              if (activeMoveMode === 'relative') {
                const cs = window.getComputedStyle(selected);
                const baseLeft = pxToNum(cs.marginLeft);
                const baseTop = pxToNum(cs.marginTop);
                const left = snap(baseLeft + constrainedDx);
                const top = snap(baseTop + constrainedDy);
                const leftValue = formatMoveValue(
                  left,
                  getMoveAxisReferenceSize(activeMoveMode, 'x', contentWidth, contentHeight),
                  activeMoveMode
                );
                const topValue = formatMoveValue(
                  top,
                  getMoveAxisReferenceSize(activeMoveMode, 'y', contentWidth, contentHeight),
                  activeMoveMode
                );
                const moveKeys = getMovePatchKeys('relative');
                applyToSelectedGroup((node) => {
                  node.style.position = 'relative';
                  node.style.left = '';
                  node.style.top = '';
                  node.style[moveKeys.x] = String(leftValue);
                  node.style[moveKeys.y] = String(topValue);
                });
                post(MSG_APPLY, {
                  id,
                  patch: {
                    position: 'relative',
                    left: '',
                    top: '',
                    [moveKeys.x]: leftValue,
                    [moveKeys.y]: topValue,
                  },
                  isIntermediate: false
                });
              } else {
                // absolute СЃ РѕРіСЂР°РЅРёС‡РµРЅРёРµРј РїРѕ padding-box
                const startLeft = drag.rect.left - parentRect.left - padLeft;
                const startTop = drag.rect.top - parentRect.top - padTop;
                
                let left = snap(startLeft + constrainedDx);
                let top = snap(startTop + constrainedDy);

                // РћРіСЂР°РЅРёС‡РёРІР°РµРј РїРѕР·РёС†РёСЋ padding-box СЂРѕРґРёС‚РµР»СЏ
                const maxLeft = parentRect.width - padRight - snap(drag.rect.width);
                const maxTop = parentRect.height - padBottom - snap(drag.rect.height);
                const minLeft = padLeft;
                const minTop = padTop;
                left = Math.min(Math.max(left, minLeft), maxLeft);
                top = Math.min(Math.max(top, minTop), maxTop);

                const leftValue = formatMoveValue(
                  left,
                  getMoveAxisReferenceSize('absolute', 'x', contentWidth, contentHeight),
                  'absolute'
                );
                const topValue = formatMoveValue(
                  top,
                  getMoveAxisReferenceSize('absolute', 'y', contentWidth, contentHeight),
                  'absolute'
                );
                applyToSelectedGroup((node) => {
                  node.style.position = 'absolute';
                  node.style.left = String(leftValue);
                  node.style.top = String(topValue);
                });

                const patch= { position: 'absolute' };
                patch.left = leftValue;
                patch.top = topValue;
                
                post(MSG_APPLY, { id, patch, isIntermediate: false });
              }
            } else {
              const resizeTarget = drag.resizeTarget || resizeTargetMode;
              const handle = drag.resizeHandle || 'se';
              const delta = getResizeDeltaByHandle(handle, dx, dy);
              const w = snap(Math.max(0, drag.rect.width + delta.widthDelta));
              const h = snap(Math.max(0, drag.rect.height + delta.heightDelta));
              const shiftX = snap(delta.shiftX);
              const shiftY = snap(delta.shiftY);
              if (resizeTarget === 'margin') {
                const handleStr = String(handle || 'se');
                const nextMl = handleStr.indexOf('w') >= 0
                  ? snap((drag.startMarginLeft || 0) - dx)
                  : snap((drag.startMarginLeft || 0));
                const nextMr = handleStr.indexOf('e') >= 0
                  ? snap((drag.startMarginRight || 0) + dx)
                  : snap((drag.startMarginRight || 0));
                const nextMt = handleStr.indexOf('n') >= 0
                  ? snap((drag.startMarginTop || 0) - dy)
                  : snap((drag.startMarginTop || 0));
                const nextMb = handleStr.indexOf('s') >= 0
                  ? snap((drag.startMarginBottom || 0) + dy)
                  : snap((drag.startMarginBottom || 0));
                applyToSelectedGroup((node) => {
                  if (drag.startWidth !== undefined && drag.startHeight !== undefined) {
                    node.style.width = drag.startWidth + 'px';
                    node.style.height = drag.startHeight + 'px';
                  }
                  node.style.marginLeft = nextMl + 'px';
                  node.style.marginTop = nextMt + 'px';
                  node.style.marginRight = nextMr + 'px';
                  node.style.marginBottom = nextMb + 'px';
                });
                updateBoxOverlay();
                if ('${type}' === 'html') {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      ...(drag.startWidth !== undefined && drag.startHeight !== undefined ? { width: drag.startWidth + 'px', height: drag.startHeight + 'px' } : {}),
                      marginLeft: nextMl + 'px',
                      marginTop: nextMt + 'px',
                      marginRight: nextMr + 'px',
                      marginBottom: nextMb + 'px',
                    },
                    isIntermediate: false
                  });
                } else {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      ...(drag.startWidth !== undefined && drag.startHeight !== undefined ? { width: drag.startWidth, height: drag.startHeight } : {}),
                      marginLeft: nextMl,
                      marginTop: nextMt,
                      marginRight: nextMr,
                      marginBottom: nextMb,
                    },
                    isIntermediate: false
                  });
                }
              } else if (resizeTarget === 'padding') {
                const handleStr = String(handle || 'se');
                const nextPl = handleStr.indexOf('w') >= 0
                  ? snap(Math.max(0, (drag.startPaddingLeft || 0) + dx))
                  : snap(Math.max(0, (drag.startPaddingLeft || 0)));
                const nextPr = handleStr.indexOf('e') >= 0
                  ? snap(Math.max(0, (drag.startPaddingRight || 0) - dx))
                  : snap(Math.max(0, (drag.startPaddingRight || 0)));
                const nextPt = handleStr.indexOf('n') >= 0
                  ? snap(Math.max(0, (drag.startPaddingTop || 0) + dy))
                  : snap(Math.max(0, (drag.startPaddingTop || 0)));
                const nextPb = handleStr.indexOf('s') >= 0
                  ? snap(Math.max(0, (drag.startPaddingBottom || 0) - dy))
                  : snap(Math.max(0, (drag.startPaddingBottom || 0)));
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = nextPl + 'px';
                  node.style.paddingTop = nextPt + 'px';
                  node.style.paddingRight = nextPr + 'px';
                  node.style.paddingBottom = nextPb + 'px';
                });
                updateBoxOverlay();
                if ('${type}' === 'html') {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: nextPl + 'px',
                      paddingTop: nextPt + 'px',
                      paddingRight: nextPr + 'px',
                      paddingBottom: nextPb + 'px'
                    },
                    isIntermediate: false
                  });
                } else {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: nextPl,
                      paddingTop: nextPt,
                      paddingRight: nextPr,
                      paddingBottom: nextPb
                    },
                    isIntermediate: false
                  });
                }
              } else if (resizeTarget === 'content-lock') {
                const handleStr = String(handle || 'se');
                let nextPl = drag.startPaddingLeft || 0;
                let nextPr = drag.startPaddingRight || 0;
                let nextPt = drag.startPaddingTop || 0;
                let nextPb = drag.startPaddingBottom || 0;
                const lockW = Math.max(0, drag.startPaddingBoxWidth || 0);
                const lockH = Math.max(0, drag.startPaddingBoxHeight || 0);
                if (handleStr.indexOf('w') >= 0) nextPl = clamp(nextPl + dx, 0, Math.max(0, lockW - nextPr));
                if (handleStr.indexOf('e') >= 0) nextPr = clamp(nextPr - dx, 0, Math.max(0, lockW - nextPl));
                if (handleStr.indexOf('n') >= 0) nextPt = clamp(nextPt + dy, 0, Math.max(0, lockH - nextPb));
                if (handleStr.indexOf('s') >= 0) nextPb = clamp(nextPb - dy, 0, Math.max(0, lockH - nextPt));
                const nextContentW = Math.max(0, lockW - nextPl - nextPr);
                const nextContentH = Math.max(0, lockH - nextPt - nextPb);
                const widthStyle = computeStyleSizeFromContent(
                  nextContentW,
                  nextPl,
                  nextPr,
                  drag.startBorderLeft || 0,
                  drag.startBorderRight || 0,
                  drag.startBoxSizing
                );
                const heightStyle = computeStyleSizeFromContent(
                  nextContentH,
                  nextPt,
                  nextPb,
                  drag.startBorderTop || 0,
                  drag.startBorderBottom || 0,
                  drag.startBoxSizing
                );
                applyToSelectedGroup((node) => {
                  node.style.paddingLeft = nextPl + 'px';
                  node.style.paddingTop = nextPt + 'px';
                  node.style.paddingRight = nextPr + 'px';
                  node.style.paddingBottom = nextPb + 'px';
                  node.style.width = widthStyle + 'px';
                  node.style.height = heightStyle + 'px';
                });
                updateBoxOverlay();
                if ('${type}' === 'html') {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: nextPl + 'px',
                      paddingTop: nextPt + 'px',
                      paddingRight: nextPr + 'px',
                      paddingBottom: nextPb + 'px',
                      width: widthStyle + 'px',
                      height: heightStyle + 'px',
                    },
                    isIntermediate: false
                  });
                } else {
                  post(MSG_APPLY, {
                    id,
                    patch: {
                      paddingLeft: nextPl,
                      paddingTop: nextPt,
                      paddingRight: nextPr,
                      paddingBottom: nextPb,
                      width: widthStyle,
                      height: heightStyle,
                    },
                    isIntermediate: false
                  });
                }
              } else {
                // Р Р°Р·СЂРµС€Р°РµРј СЂРµСЃР°Р№Р· Р·Р° РїСЂРµРґРµР»С‹ СЂРѕРґРёС‚РµР»СЏ
                const cw = w;
                const ch = h;
                let nextLeft = undefined;
                let nextTop = undefined;
                let nextMarginLeft = undefined;
                let nextMarginTop = undefined;
                if (activeMoveMode === 'absolute' && (shiftX !== 0 || shiftY !== 0)) {
                  nextLeft = snap((drag.startLeft || 0) + shiftX);
                  nextTop = snap((drag.startTop || 0) + shiftY);
                } else if (activeMoveMode === 'relative' && (shiftX !== 0 || shiftY !== 0)) {
                  nextMarginLeft = snap((drag.startMarginLeft || 0) + shiftX);
                  nextMarginTop = snap((drag.startMarginTop || 0) + shiftY);
                }
                applyToSelectedGroup((node) => {
                  node.style.transform = '';
                  node.style.width = cw + 'px';
                  node.style.height = ch + 'px';
                  if (nextLeft !== undefined && nextTop !== undefined) {
                    node.style.left = nextLeft + 'px';
                    node.style.top = nextTop + 'px';
                  }
                  if (nextMarginLeft !== undefined && nextMarginTop !== undefined) {
                    node.style.marginLeft = nextMarginLeft + 'px';
                    node.style.marginTop = nextMarginTop + 'px';
                  }
                });
                updateBoxOverlay();
                const patch = {};
                if ('${type}' === 'html') {
                  patch.width = cw + 'px';
                  patch.height = ch + 'px';
                  if (nextLeft !== undefined && nextTop !== undefined) {
                    patch.left = nextLeft + 'px';
                    patch.top = nextTop + 'px';
                  }
                  if (nextMarginLeft !== undefined && nextMarginTop !== undefined) {
                    patch.marginLeft = nextMarginLeft + 'px';
                    patch.marginTop = nextMarginTop + 'px';
                  }
                } else {
                  patch.width = cw;
                  patch.height = ch;
                  if (nextLeft !== undefined && nextTop !== undefined) {
                    patch.left = nextLeft;
                    patch.top = nextTop;
                  }
                  if (nextMarginLeft !== undefined && nextMarginTop !== undefined) {
                    patch.marginLeft = nextMarginLeft;
                    patch.marginTop = nextMarginTop;
                  }
                }
                post(MSG_APPLY, { id, patch, isIntermediate: false });
              }
            }

            drag = null;
            dragging = null;
            dropTarget = null;
          }, true);

          // РџРѕРґСЃРєР°Р·РєР°
          try {
            const hint = document.createElement('div');
            hint.className = 'mrpak-hint';
            hint.textContent = 'MRPAK Editor: РєР»РёРє = РІС‹Р±СЂР°С‚СЊ, Ctrl+Shift+Click = multi sibling, Shift+Drag = move, Alt+Drag = resize, в†ђ/в†’ = resize mode (margin/size/padding/content-lock).';
            document.body.appendChild(hint);
          } catch(e) {}

          try {
            window.addEventListener('scroll', updateBoxOverlay, true);
            window.addEventListener('resize', updateBoxOverlay, true);
          } catch(e) {}

          // РљРѕРјР°РЅРґС‹ РёР· UI (Р»РѕРєР°Р»СЊРЅС‹Рµ РёР·РјРµРЅРµРЅРёСЏ)
          window.addEventListener('message', (event) => {
            if (!isActiveInstance()) return;
            const data = event && event.data;
            if (!data || typeof data !== 'object') return;
            try {
              if (data.type === CMD_SELECT && data.id) {
                const el = getElementsById(String(data.id))[0];
                if (el) selectEl(el);
                return;
              }
              if (data.type === CMD_SET_STYLE && data.id) {
                console.log('[iframe CMD_SET_STYLE] РџРѕР»СѓС‡РµРЅР° РєРѕРјР°РЅРґР°:', {
                  id: data.id,
                  patch: data.patch,
                  hasPatch: !!data.patch
                });
                const elements = getElementsById(String(data.id));
                const el = elements[0];
                if (!el) {
                  console.warn('[iframe CMD_SET_STYLE] Р­Р»РµРјРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ:', data.id);
                  return;
                }
                const patch = data.patch || {};
                console.log('[iframe CMD_SET_STYLE] РџСЂРёРјРµРЅСЏСЋ РїР°С‚С‡:', patch);
                elements.forEach((node) => {
                  for (const k in patch) {
                    const v = patch[k];
                    if (k.includes('-')) {
                      if (v === null || v === undefined || v === '') {
                        node.style.removeProperty(k);
                      } else {
                        node.style.setProperty(k, String(v));
                      }
                    } else {
                      try {
                        if (v === null || v === undefined || v === '') {
                          node.style[k] = '';
                        } else {
                          node.style[k] = String(v);
                        }
                      } catch(e) {}
                    }
                  }
                });
                console.log('[iframe CMD_SET_STYLE] РЎС‚РёР»Рё РїСЂРёРјРµРЅРµРЅС‹, С‚РµРєСѓС‰РёР№ style:', el.getAttribute('style'));
                
                // РџРµСЂРµСЃС‚СЂРѕРёРј РґРµСЂРµРІРѕ РїРѕСЃР»Рµ РёР·РјРµРЅРµРЅРёСЏ СЃС‚РёР»РµР№
                buildTree();
                
                // РѕР±РЅРѕРІРёРј СЃРЅР°РїС€РѕС‚
                try {
                  const cs = window.getComputedStyle(el);
                  post(MSG_STYLE_SNAPSHOT, {
                    id: data.id,
                    inlineStyle: el.getAttribute('style') || '',
                    computedStyle: {
                      position: cs.getPropertyValue('position'),
                      left: cs.getPropertyValue('left'),
                      top: cs.getPropertyValue('top'),
                      width: cs.getPropertyValue('width'),
                      height: cs.getPropertyValue('height'),
                      color: cs.getPropertyValue('color'),
                      backgroundColor: cs.getPropertyValue('background-color'),
                      fontSize: cs.getPropertyValue('font-size'),
                      display: cs.getPropertyValue('display'),
                    },
                  });
                } catch(e) {}
                return;
              }
              if (data.type === CMD_REQ_STYLE && data.id) {
                const el = getElementsById(String(data.id))[0];
                if (!el) return;
                const cs = window.getComputedStyle(el);
                post(MSG_STYLE_SNAPSHOT, {
                  id: data.id,
                  inlineStyle: el.getAttribute('style') || '',
                  computedStyle: {
                    position: cs.getPropertyValue('position'),
                    left: cs.getPropertyValue('left'),
                    top: cs.getPropertyValue('top'),
                    width: cs.getPropertyValue('width'),
                    height: cs.getPropertyValue('height'),
                    color: cs.getPropertyValue('color'),
                    backgroundColor: cs.getPropertyValue('background-color'),
                    fontSize: cs.getPropertyValue('font-size'),
                    display: cs.getPropertyValue('display'),
                  },
                });
                return;
              }
              if (data.type === CMD_SET_TEXT && data.id) {
                const elements = getElementsById(String(data.id));
                const el = elements[0];
                if (!el) return;
                elements.forEach((node) => {
                  node.innerText = data.text ?? '';
                });
                post(MSG_TEXT_SNAPSHOT, { id: data.id, text: el.innerText || '' });
                return;
              }
              if (data.type === CMD_REQ_TEXT && data.id) {
                const el = getElementsById(String(data.id))[0];
                if (!el) return;
                post(MSG_TEXT_SNAPSHOT, { id: data.id, text: el.innerText || '' });
                return;
              }
              if (data.type === CMD_DELETE && data.id) {
                const elements = getElementsById(String(data.id));
                if (elements.length) {
                  if (selectedIds.includes(String(data.id)) || elements.some((node) => selectedGroup.includes(node))) clearSelected();
                  elements.forEach((node) => node.remove());
                  buildTree();
                }
                return;
              }
              if (data.type === CMD_INSERT && data.targetId && data.mode && data.html) {
                console.log('[iframe CMD_INSERT] РџРѕР»СѓС‡РµРЅР° РєРѕРјР°РЅРґР° РІСЃС‚Р°РІРєРё', {
                  targetId: data.targetId,
                  mode: data.mode,
                  htmlPreview: String(data.html).substring(0, 100)
                });
                const target = document.querySelector(byIdSelector(String(data.targetId)));
                if (!target) {
                  console.warn('[iframe CMD_INSERT] Target РЅРµ РЅР°Р№РґРµРЅ!', data.targetId);
                  return;
                }
                const tmp = document.createElement('div');
                tmp.innerHTML = String(data.html);
                const newEl = tmp.firstElementChild;
                if (!newEl) {
                  console.warn('[iframe CMD_INSERT] РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СЌР»РµРјРµРЅС‚ РёР· HTML');
                  return;
                }
                // РІСЂРµРјРµРЅРЅС‹Р№ id РґР»СЏ РґРµСЂРµРІР° РґРѕ commit
                const newElId = ensureId(newEl);
                console.log('[iframe CMD_INSERT] вњ… Р’СЃС‚Р°РІР»СЏСЋ СЌР»РµРјРµРЅС‚ СЃ ID:', newElId);
                if (data.mode === 'child') {
                  target.appendChild(newEl);
                } else if (data.mode === 'sibling') {
                  target.insertAdjacentElement('afterend', newEl);
                }
                buildTree();
                selectEl(newEl);
                return;
              }
              if (data.type === CMD_REPARENT && data.sourceId && data.targetParentId) {
                const srcEl = document.querySelector(byIdSelector(String(data.sourceId)));
                const dstEl = document.querySelector(byIdSelector(String(data.targetParentId)));
                if (srcEl && dstEl && srcEl !== dstEl) {
                  dstEl.appendChild(srcEl);
                  buildTree();
                  selectEl(srcEl);
                }
                return;
              }
              if (data.type === CMD_SET_MOVE_MODE) {
                if (data.mode) moveMode = String(data.mode);
                if (data.unit === '%' || data.unit === 'px') moveUnit = String(data.unit);
                if (moveMode === 'grid8') moveUnit = 'px';
                if (typeof data.grid === 'number') gridStep = data.grid;
                return;
              }
              if (data.type === CMD_ALIGN && data.id) {
                const el = getElementsById(String(data.id))[0];
                if (!el) return;
                applyAlignmentPreset(
                  el,
                  String(data.horizontal || 'center'),
                  String(data.vertical || 'center')
                );
                return;
              }
              if (data.type === CMD_START_DRAG) {
                const source = String(data.source || 'library');
                if (source === 'component') {
                  const componentName = String(data.componentName || '').trim();
                  const importPath = String(data.importPath || '').trim();
                  if (!componentName || !importPath) return;
                  externalDrag = {
                    source: 'component',
                    componentName,
                    importPath,
                    importKind: String(data.importKind || 'default') === 'named' ? 'named' : 'default',
                    hasProps: Boolean(data.hasProps),
                    propsCount: Number(data.propsCount || 0),
                    supportsStyleOnlyArg: Boolean(data.supportsStyleOnlyArg),
                  };
                } else if (source === 'file') {
                  const filePath = String(data.filePath || '').trim();
                  const importPath = String(data.importPath || '').trim();
                  if (!filePath || !importPath) return;
                  externalDrag = {
                    source: 'file',
                    filePath,
                    importPath,
                    assetKind: String(data.assetKind || 'image'),
                  };
                } else {
                  const rawTag = String(data.tag || '').trim();
                  if (!rawTag) return;
                  externalDrag = { source: 'library', tag: rawTag };
                }
                externalHoverCandidates = [];
                externalHoverIndex = 0;
                dropTarget = null;
                updateExternalDropCandidate(externalPointer.x || 0, externalPointer.y || 0);
                return;
              }
              if (data.type === CMD_END_DRAG) {
                if (externalDrag && dropTarget) {
                  const insertPayload =
                    externalDrag.source === 'component'
                      ? {
                          source: 'component',
                          componentName: String(externalDrag.componentName || ''),
                          importPath: String(externalDrag.importPath || ''),
                          importKind: String(externalDrag.importKind || 'default'),
                          hasProps: Boolean(externalDrag.hasProps),
                          propsCount: Number(externalDrag.propsCount || 0),
                          supportsStyleOnlyArg: Boolean(externalDrag.supportsStyleOnlyArg),
                          mode: 'child',
                        }
                      : externalDrag.source === 'file'
                      ? {
                          source: 'file',
                          filePath: String(externalDrag.filePath || ''),
                          importPath: String(externalDrag.importPath || ''),
                          assetKind: String(externalDrag.assetKind || 'image'),
                          mode: 'child',
                        }
                      : {
                          source: 'library',
                          tag: String(externalDrag.tag || ''),
                          mode: 'child',
                        };

                  post(MSG_APPLY, {
                    id: dropTarget,
                    patch: {
                      __insertFromLibrary: insertPayload,
                    },
                    isIntermediate: false,
                  });
                }
                clearExternalDrag();
                return;
              }
              if (data.type === CMD_SET_RESIZE_TARGET) {
                const modes = ['margin', 'size', 'padding', 'content-lock'];
                const dir = data.direction === 'left' ? -1 : data.direction === 'right' ? 1 : 0;
                if (dir !== 0) {
                  const current = modes.indexOf(resizeTargetMode);
                  const next = (current + dir + modes.length) % modes.length;
                  resizeTargetMode = modes[next];
                  updateResizeOverlayStyles();
                  updateBoxOverlay();
                }
                return;
              }
            } catch(e) {}
          }, false);

          if (!isActiveInstance()) return;
          post(MSG_READY, { meta: { mode: 'edit' } });
          buildTree();
          updateBoxOverlay();
        })();
      </script>
     `;
 }

/**
 * РРЅР¶РµРєС‚РёСЂСѓРµС‚ СЃРєСЂРёРїС‚ Р±Р»РѕС‡РЅРѕРіРѕ СЂРµРґР°РєС‚РѕСЂР° РІ HTML
 * @param {string} html - HTML РєРѕРЅС‚РµРЅС‚
 * @param {string} type - С‚РёРї С„Р°Р№Р»Р° ('html', 'react', 'react-native')
 * @param {string} mode - СЂРµР¶РёРј СЂР°Р±РѕС‚С‹ ('preview' | 'edit')
 */
export function injectBlockEditorScript(html: string, type: string, mode: string = 'preview', rootFileBasename: string = '') {
  const source = String(html ?? '');
  const script = generateBlockEditorScript(type, mode, rootFileBasename);

  if (source.includes('</body>')) {
    return source.replace('</body>', script + '\n</body>');
  }
  return source + script;
}
