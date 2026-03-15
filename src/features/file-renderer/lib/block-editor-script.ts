import { MRPAK_MSG, MRPAK_CMD } from '../../../blockEditor/EditorProtocol';

/**
 * Генерирует скрипт для блочного редактора, который инжектируется в HTML
 * @param {string} type - тип файла ('html', 'react', 'react-native')
 * @param {string} mode - режим работы ('preview' | 'edit')
 */
export function generateBlockEditorScript(type: string, mode: string = 'preview') {
  const isEditMode = mode === 'edit';
  
  return `
      <style>
        [data-no-code-ui-id].mrpak-selected, [data-mrpak-id].mrpak-selected { outline: 2px solid #667eea !important; outline-offset: 2px; }
        .mrpak-box-overlay { position: fixed; z-index: 9998; pointer-events: none; box-sizing: border-box; }
        .mrpak-box-overlay.mrpak-margin { border: 1px dashed rgba(245, 158, 11, 0.95); background: rgba(245, 158, 11, 0.06); }
        .mrpak-box-overlay.mrpak-padding { border: 1px dashed rgba(34, 197, 94, 0.95); background: rgba(34, 197, 94, 0.05); }
        .mrpak-box-overlay.mrpak-parent { border: 2px dashed rgba(246, 85, 49, 0.8); background: rgba(59, 131, 246, 0); pointer-events: none; }
        .mrpak-hint { position: fixed; z-index: 9999; bottom: 10px; right: 10px; background: rgba(15,23,42,0.85); color: #fff; padding: 8px 10px; border-radius: 8px; font: 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; }
        ${isEditMode ? `
        /* Блокируем интерактивные элементы только в режиме редактора */
        [data-no-code-ui-id] button,
        [data-no-code-ui-id] input,
        [data-no-code-ui-id] select,
        [data-no-code-ui-id] textarea,
        [data-no-code-ui-id] a,
        [data-no-code-ui-id] [role="button"],
        [data-no-code-ui-id] [role="link"],
        [data-no-code-ui-id] [contenteditable="true"],
        [data-no-code-ui-id] [contenteditable=""],
        [data-mrpak-id] button,
        [data-mrpak-id] input,
        [data-mrpak-id] select,
        [data-mrpak-id] textarea,
        [data-mrpak-id] a,
        [data-mrpak-id] [role="button"],
        [data-mrpak-id] [role="link"],
        [data-mrpak-id] [contenteditable="true"],
        [data-mrpak-id] [contenteditable=""] {
          pointer-events: none !important;
          user-select: none !important;
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
        }
        /* Разрешаем pointer-events только для выбора блоков */
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
            Array.from(document.querySelectorAll('.mrpak-selected')).forEach((el) => {
              try { el.classList.remove('mrpak-selected'); } catch (e) {}
            });
            Array.from(document.querySelectorAll('.mrpak-box-overlay, .mrpak-hint')).forEach((el) => {
              try { el.remove(); } catch (e) {}
            });
          } catch (e) {}

          const EDIT_MODE = ${isEditMode ? 'true' : 'false'};
          const ATTR_NEW = 'data-no-code-ui-id';
          const ATTR_OLD = 'data-mrpak-id';
          const SEL_ALL = '[data-no-code-ui-id],[data-mrpak-id]';
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
          const MSG_SELECT = '${MRPAK_MSG.SELECT}';
          const MSG_APPLY = '${MRPAK_MSG.APPLY}';
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
          const CMD_SET_TEXT = '${MRPAK_CMD.SET_TEXT}';
          const CMD_REQ_TEXT = '${MRPAK_CMD.REQUEST_TEXT_SNAPSHOT}';
          const CMD_START_DRAG = '${MRPAK_CMD.START_DRAG}';
          const CMD_END_DRAG = '${MRPAK_CMD.END_DRAG}';
          let selected = null;
          let selectedGroup = [];
          let lastSelectedId = null;
          let moveMode = 'absolute'; // absolute | relative | grid8
          let moveUnit = 'px'; // px | %
          let gridStep = 8;
          let dragging = null; // {sourceId}
          let dropTarget = null;

          const overlay = {
            margin: null,
            padding: null,
            parent: null,
          };

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

          const updateBoxOverlay = () => {
            if (!isActiveInstance()) return;
            try {
              ensureOverlay();
              if (!selected) {
                setRect(overlay.margin, null);
                setRect(overlay.padding, null);
                setRect(overlay.parent, null);
                return;
              }
              const rect = selected.getBoundingClientRect();
              const cs = window.getComputedStyle(selected);
              const mt = toNum(cs.marginTop);
              const mr = toNum(cs.marginRight);
              const mb = toNum(cs.marginBottom);
              const ml = toNum(cs.marginLeft);
              const pt = toNum(cs.paddingTop);
              const pr = toNum(cs.paddingRight);
              const pb = toNum(cs.paddingBottom);
              const pl = toNum(cs.paddingLeft);
              
              // Показываем родительскую рамку
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
                left: rect.left + pl,
                top: rect.top + pt,
                width: rect.width - pl - pr,
                height: rect.height - pt - pb,
              });
            } catch (e) {
              try {
                setRect(overlay.margin, null);
                setRect(overlay.padding, null);
                setRect(overlay.parent, null);
              } catch (e2) {}
            }
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

          const formatMoveValue = (value, axisSize) => {
            if (moveMode === 'grid8' || moveUnit !== '%') {
              return '${type}' === 'html' ? (value + 'px') : value;
            }
            const pct = pxToPercent(value, axisSize);
            return pct + '%';
          };

          const getOffsetParent = (el) => {
            if (!el) return document.body;
            
            // Ищем родителя с ограничениями (с position: relative/absolute или с overflow)
            let parent = el.parentElement;
            while (parent && parent !== document.body && parent !== document.documentElement) {
              const cs = window.getComputedStyle(parent);
              const position = cs.position;
              const overflow = cs.overflow;
              const overflowX = cs.overflowX;
              const overflowY = cs.overflowY;
              
              // Если родитель имеет позиционирование или overflow, это наш контейнер
              if (position !== 'static' || overflow !== 'visible' || overflowX !== 'visible' || overflowY !== 'visible') {
                return parent;
              }
              
              parent = parent.parentElement;
            }
            
            // Если не нашли подходящего родителя, используем offsetParent или body
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

          const getConstraintParent = (el) => {
            return getLogicalParentBlock(el) || getOffsetParent(el) || document.body;
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
            const all = Array.from(document.querySelectorAll(SEL_ALL));
            
            // Сначала создаем все узлы
            for (const el of all) {
              const id = ensureId(el);
              if (!id) continue;
              
              // Ищем родителя более точно: идем вверх по DOM дереву и ищем ближайший элемент с id-атрибутом
              let parentEl = null;
              let current = el.parentElement;
              while (current && current !== document.body && current !== document.documentElement) {
                if (current.hasAttribute && (current.hasAttribute(ATTR_NEW) || current.hasAttribute(ATTR_OLD))) {
                  parentEl = current;
                  break;
                }
                current = current.parentElement;
              }
              
              const parentId = parentEl ? getId(parentEl) : null;
              nodes[id] = { id, tagName: el.tagName, parentId, childIds: [] };
            }
            
            // Определяем детей и корневые элементы
            for (const id of Object.keys(nodes)) {
              const p = nodes[id].parentId;
              if (p && nodes[p]) {
                nodes[p].childIds.push(id);
              } else {
                rootIds.push(id);
              }
            }
            
            // Упорядочиваем children по порядку в DOM
            for (const id of Object.keys(nodes)) {
              const el = document.querySelector(byIdSelector(id));
              if (!el) continue;
              
              const parentEl = el.parentElement;
              if (parentEl) {
                // Ищем родителя с id-атрибутом
                let parentWithId = null;
                let current = parentEl;
                while (current && current !== document.body && current !== document.documentElement) {
                  if (current.hasAttribute && (current.hasAttribute(ATTR_NEW) || current.hasAttribute(ATTR_OLD))) {
                    parentWithId = current;
                    break;
                  }
                  current = current.parentElement;
                }
                
                if (parentWithId) {
                  const pid = ensureId(parentWithId);
                  if (pid && nodes[pid]) {
                    // Получаем прямых детей с id-атрибутом в порядке DOM
                    const directChildren = Array.from(parentWithId.children)
                      .filter(child => child && child.hasAttribute && (child.hasAttribute(ATTR_NEW) || child.hasAttribute(ATTR_OLD)))
                      .map(child => ensureId(child))
                      .filter(Boolean);
                    nodes[pid].childIds = directChildren;
                  }
                }
              }
            }
            
            post(MSG_TREE, { tree: { nodes, rootIds } });
          }
          
          // Делаем buildTree доступной глобально для вызова из скрипта React
          window.__MRPAK_BUILD_TREE__ = buildTree;

          function clearSelected() {
            if (!isActiveInstance()) return;
            try {
              const allSelected = Array.from(document.querySelectorAll('.mrpak-selected'));
              allSelected.forEach((el) => {
                try { el.classList.remove('mrpak-selected'); } catch(e) {}
              });
            } catch(e) {}
            selected = null;
            selectedGroup = [];
            updateBoxOverlay();
          }

          function selectEl(el) {
            if (!isActiveInstance()) return;
            if (!el) return;
            clearSelected();
            const id = ensureId(el);
            selectedGroup = id ? getElementsById(id) : [];
            selected = selectedGroup[0] || el;
            try { selectedGroup.forEach((node) => node.classList.add('mrpak-selected')); } catch(e) {}
            lastSelectedId = id;
            const rect = selected.getBoundingClientRect();
            post(MSG_SELECT, { id, meta: { tagName: selected.tagName, instances: selectedGroup.length, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } } });
            updateBoxOverlay();
            buildTree();
            // отправляем снапшот inline style, чтобы UI мог показать базовые стили
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

          // В режиме редактора делаем контент "неинтерактивным":
          // - гасим клики/submit/клавиатурные активации по интерактивным элементам
          // - при этом сохраняем возможность выбирать блоки кликом и двигать Shift/Alt+Drag
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

          // Hover для drop target при перетаскивании (режим reparent)
          document.addEventListener('mousemove', (ev) => {
            if (!isActiveInstance()) return;
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

          // Блокируем submit форм только в режиме редактора
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

          // Блокируем все события на интерактивных элементах только в режиме редактора
          const blockInteractiveEvents = (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return;
            if (drag || dragging) return;
            const t = ev.target;
            if (!t) return;
            // Проверяем, является ли элемент интерактивным
            if (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,label,form,[role=button],[role=link],[role=checkbox],[role=switch],[contenteditable]'))) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                // Если у интерактивного элемента есть id-атрибут, выбираем его напрямую
                if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                  selectEl(t);
                  return;
                }
                // Иначе выбираем родительский блок
                const block = t.closest(SEL_ALL);
                if (block && block !== t) {
                  selectEl(block);
                }
              } catch(e) {}
            }
          };

          // Блокируем все события на интерактивных элементах (кроме mousedown, который обрабатывается отдельно) только в режиме редактора
          if (EDIT_MODE) {
            document.addEventListener('mouseup', blockInteractiveEvents, true);
            document.addEventListener('dblclick', blockInteractiveEvents, true);
            document.addEventListener('change', blockInteractiveEvents, true);
            document.addEventListener('input', blockInteractiveEvents, true);
            document.addEventListener('focus', blockInteractiveEvents, true);
            document.addEventListener('blur', blockInteractiveEvents, true);
            document.addEventListener('keydown', (ev) => {
              if (!isActiveInstance()) return;
              if (drag || dragging) return;
              const t = ev.target;
              if (t && (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,[role=button],[role=link],[contenteditable]')))) {
                try {
                  ev.preventDefault();
                  ev.stopPropagation();
                  ev.stopImmediatePropagation();
                  // Если у интерактивного элемента есть id-атрибут, выбираем его напрямую
                  if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                    selectEl(t);
                    return;
                  }
                  // Иначе выбираем родительский блок
                  const block = t.closest(SEL_ALL);
                  if (block && block !== t) {
                    selectEl(block);
                  }
                } catch(e) {}
              }
            }, true);
            document.addEventListener('keyup', blockInteractiveEvents, true);
            document.addEventListener('keypress', blockInteractiveEvents, true);
          }
          
          // Обработка клика для выбора блоков (только в режиме редактора)
          document.addEventListener('click', (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return; // В preview режиме не обрабатываем клики для выбора
            
            const t = ev.target;
            // Если это интерактивный элемент, обрабатываем его
            if (t && (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,label,form,[role=button],[role=link],[contenteditable]')))) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                // Если у интерактивного элемента есть id-атрибут, выбираем его напрямую
                if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                  selectEl(t);
                  return;
                }
                // Иначе выбираем родительский блок
                const block = t.closest(SEL_ALL);
                if (block && block !== t) {
                  selectEl(block);
                  return;
                }
              } catch(e) {}
            }
            // Если это не интерактивный элемент, обрабатываем как обычный клик для выбора блока
            const el = ev.target && ev.target.closest ? ev.target.closest(SEL_ALL) : null;
            if (!el) return;
            try {
              ev.preventDefault();
              ev.stopPropagation();
            } catch(e) {}
            selectEl(el);
          }, true);

          // Shift+Drag: перенос (MVP -> position:absolute + left/top/width/height)
          // Этот обработчик также блокирует интерактивные элементы (только в режиме редактора)
          let drag = null;
          document.addEventListener('mousedown', (ev) => {
            if (!isActiveInstance()) return;
            if (!EDIT_MODE) return; // В preview режиме не обрабатываем
            
            const t = ev.target;
            // Если это интерактивный элемент, обрабатываем его
            if (t && (isInteractive(t) || (t.closest && t.closest('a,button,input,select,textarea,label,form,[role=button],[role=link],[contenteditable]')))) {
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                
                // Если у интерактивного элемента есть id-атрибут, используем его
                let targetEl = t;
                let targetId = null;
                if (t.hasAttribute && (t.hasAttribute(ATTR_NEW) || t.hasAttribute(ATTR_OLD))) {
                  targetId = getId(t);
                } else {
                  // Иначе ищем родительский блок
                  const block = t.closest(SEL_ALL);
                  if (block && block !== t) {
                    targetEl = block;
                    targetId = getId(block);
                  }
                }
                
                if (targetId) {
                  selectEl(targetEl);
                  // Если это Shift/Ctrl/Alt + клик, обрабатываем как drag
                  if (ev.ctrlKey || ev.metaKey) {
                    dragging = { sourceId: targetId, mode: 'reparent' };
                    post(MSG_DROP_TARGET, { sourceId: targetId, targetId: null });
                    return;
                  } else if (ev.shiftKey || ev.altKey) {
                    dragging = { sourceId: targetId, mode: ev.altKey ? 'resize' : 'move' };
                    const startRect = targetEl.getBoundingClientRect();
                    drag = {
                      mode: ev.altKey ? 'resize' : 'move',
                      sx: ev.clientX,
                      sy: ev.clientY,
                      rect: startRect,
                    };
                    return;
                  }
                }
                return;
              } catch(e) {}
            }
            
            const el = ev.target && ev.target.closest ? ev.target.closest(SEL_ALL) : null;
            if (!el) return;
            
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
            const startRect = selected.getBoundingClientRect();
            drag = {
              mode: ev.altKey ? 'resize' : 'move',
              sx: ev.clientX,
              sy: ev.clientY,
              rect: startRect,
            };
          }, true);

          document.addEventListener('mousemove', (ev) => {
            if (!isActiveInstance()) return;
            if (!drag || !selected) return;
            const dx = ev.clientX - drag.sx;
            const dy = ev.clientY - drag.sy;
            
            if (drag.mode === 'move') {
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
              const constrainedDx = Math.min(Math.max(dx, minDx), maxDx);
              const constrainedDy = Math.min(Math.max(dy, minDy), maxDy);
              
              selected.style.transform = 'translate(' + constrainedDx + 'px,' + constrainedDy + 'px)';
              updateBoxOverlay();
            } else {
              // Изменение размера с ограничениями
              const parent = getOffsetParent(selected);
              const parentRect = parent && parent.getBoundingClientRect ? parent.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
              const ps = parent ? window.getComputedStyle(parent) : null;
              const padLeft = ps ? parseFloat(ps.getPropertyValue('padding-left')) || 0 : 0;
              const padTop = ps ? parseFloat(ps.getPropertyValue('padding-top')) || 0 : 0;
              const padRight = ps ? parseFloat(ps.getPropertyValue('padding-right')) || 0 : 0;
              const padBottom = ps ? parseFloat(ps.getPropertyValue('padding-bottom')) || 0 : 0;
              
              const w = snap(Math.max(1, drag.rect.width + dx));
              const h = snap(Math.max(1, drag.rect.height + dy));
              
              // Ограничиваем размер чтобы не выходить за padding-box родителя
              const maxW = parentRect.width - padLeft - padRight;
              const maxH = parentRect.height - padTop - padBottom;
              const cw = Math.min(w, maxW);
              const ch = Math.min(h, maxH);
              
              selected.style.width = cw + 'px';
              selected.style.height = ch + 'px';
              updateBoxOverlay();
            }
          }, true);

          // Touch события для мобильных устройств
          document.addEventListener('touchmove', (ev) => {
            if (!isActiveInstance()) return;
            if (!drag || !selected) return;
            const touch = ev.touches[0];
            if (!touch) return;
            const dx = touch.clientX - drag.sx;
            const dy = touch.clientY - drag.sy;
            
            if (drag.mode === 'move') {
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
              const constrainedDx = Math.min(Math.max(dx, minDx), maxDx);
              const constrainedDy = Math.min(Math.max(dy, minDy), maxDy);

              selected.style.transform = 'translate(' + constrainedDx + 'px,' + constrainedDy + 'px)';
              updateBoxOverlay();

              // Сохраняем финальные координаты в drag объект
              if (moveMode === 'relative') {
                const cs = window.getComputedStyle(selected);
                const baseLeft = cs.left === 'auto' ? 0 : pxToNum(cs.left);
                const baseTop = cs.top === 'auto' ? 0 : pxToNum(cs.top);
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
              // Изменение размера с ограничениями
              const parent = getOffsetParent(selected);
              const parentRect = parent && parent.getBoundingClientRect ? parent.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
              const ps = parent ? window.getComputedStyle(parent) : null;
              const padLeft = ps ? parseFloat(ps.getPropertyValue('padding-left')) || 0 : 0;
              const padTop = ps ? parseFloat(ps.getPropertyValue('padding-top')) || 0 : 0;
              const padRight = ps ? parseFloat(ps.getPropertyValue('padding-right')) || 0 : 0;
              const padBottom = ps ? parseFloat(ps.getPropertyValue('padding-bottom')) || 0 : 0;
              
              const w = snap(Math.max(1, drag.rect.width + dx));
              const h = snap(Math.max(1, drag.rect.height + dy));
              
              // Ограничиваем размер чтобы не выходить за padding-box родителя
              const maxW = parentRect.width - padLeft - padRight;
              const maxH = parentRect.height - padTop - padBottom;
              const cw = Math.min(w, maxW);
              const ch = Math.min(h, maxH);
              
              selected.style.width = cw + 'px';
              selected.style.height = ch + 'px';
              updateBoxOverlay();
              
              // Сохраняем финальные размеры в drag объект
              drag.finalWidth = cw;
              drag.finalHeight = ch;
            }
          }, { passive: false });

          document.addEventListener('touchend', (ev) => {
            if (!isActiveInstance()) return;
            // reparent drag (Ctrl/Cmd + drag) - не поддерживается для touch
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
              selected.style.transform = '';

              // Используем сохраненные финальные значения
              if (drag.finalLeft !== undefined && drag.finalTop !== undefined) {
                const finalLeftValue = formatMoveValue(drag.finalLeft, contentWidth);
                const finalTopValue = formatMoveValue(drag.finalTop, contentHeight);
                if (drag.finalPosition === 'relative') {
                  selected.style.position = 'relative';
                  selected.style.left = String(finalLeftValue);
                  selected.style.top = String(finalTopValue);
                  post(MSG_APPLY, { id, patch: { position: 'relative', left: finalLeftValue, top: finalTopValue }, isIntermediate: false });
                } else {
                  selected.style.position = 'absolute';
                  selected.style.left = String(finalLeftValue);
                  selected.style.top = String(finalTopValue);

                  const patch = { position: 'absolute' };
                  patch.left = finalLeftValue;
                  patch.top = finalTopValue;
                  
                  post(MSG_APPLY, { id, patch, isIntermediate: false });
                }
              }
            } else {
              // Используем сохраненные финальные размеры
              if (drag.finalWidth !== undefined && drag.finalHeight !== undefined) {
                selected.style.width = drag.finalWidth + 'px';
                selected.style.height = drag.finalHeight + 'px';
                updateBoxOverlay();
                
                if ('${type}' === 'html') {
                  post(MSG_APPLY, { id, patch: { width: drag.finalWidth + 'px', height: drag.finalHeight + 'px' }, isIntermediate: false });
                } else {
                  post(MSG_APPLY, { id, patch: { width: drag.finalWidth, height: drag.finalHeight }, isIntermediate: false });
                }
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
            const constrainedDx = Math.min(Math.max(dx, minDx), maxDx);
            const constrainedDy = Math.min(Math.max(dy, minDy), maxDy);

            if (drag.mode === 'move') {
              selected.style.transform = '';
              
              //updateBoxOverlay();

              if (moveMode === 'relative') {
                const cs = window.getComputedStyle(selected);
                const baseLeft = cs.left === 'auto' ? 0 : pxToNum(cs.left);
                const baseTop = cs.top === 'auto' ? 0 : pxToNum(cs.top);
                const left = snap(baseLeft + constrainedDx);
                const top = snap(baseTop + constrainedDy);
                const leftValue = formatMoveValue(left, contentWidth);
                const topValue = formatMoveValue(top, contentHeight);
                selected.style.position = 'relative';
                selected.style.left = String(leftValue);
                selected.style.top = String(topValue);
                post(MSG_APPLY, { id, patch: { position: 'relative', left: leftValue, top: topValue }, isIntermediate: false });
              } else {
                // absolute с ограничением по padding-box
                const startLeft = drag.rect.left - parentRect.left - padLeft;
                const startTop = drag.rect.top - parentRect.top - padTop;
                
                let left = snap(startLeft + constrainedDx);
                let top = snap(startTop + constrainedDy);

                // Ограничиваем позицию padding-box родителя
                const maxLeft = parentRect.width - padRight - snap(drag.rect.width);
                const maxTop = parentRect.height - padBottom - snap(drag.rect.height);
                const minLeft = padLeft;
                const minTop = padTop;
                left = Math.min(Math.max(left, minLeft), maxLeft);
                top = Math.min(Math.max(top, minTop), maxTop);

                selected.style.position = 'absolute';
                const leftValue = formatMoveValue(left, contentWidth);
                const topValue = formatMoveValue(top, contentHeight);
                selected.style.left = String(leftValue);
                selected.style.top = String(topValue);

                const patch= { position: 'absolute' };
                patch.left = leftValue;
                patch.top = topValue;
                
                post(MSG_APPLY, { id, patch, isIntermediate: false });
              }
            } else {
              const w = snap(Math.max(1, drag.rect.width + dx));
              const h = snap(Math.max(1, drag.rect.height + dy));
              // constrain size чтобы не выходить за padding-box справа/снизу
              const maxW = parentRect.width - padLeft - padRight;
              const maxH = parentRect.height - padTop - padBottom;
              const cw = Math.min(w, maxW);
              const ch = Math.min(h, maxH);

              selected.style.width = cw + 'px';
              selected.style.height = ch + 'px';
              updateBoxOverlay();
              if ('${type}' === 'html') {
                post(MSG_APPLY, { id, patch: { width: cw + 'px', height: ch + 'px' }, isIntermediate: false });
              } else {
                post(MSG_APPLY, { id, patch: { width: cw, height: ch }, isIntermediate: false });
              }
            }

            drag = null;
            dragging = null;
            dropTarget = null;
          }, true);

          // Подсказка
          try {
            const hint = document.createElement('div');
            hint.className = 'mrpak-hint';
            hint.textContent = 'MRPAK Editor: клик = выбрать, Shift+Drag = переместить, Alt+Drag = изменить размер. Синяя рамка = границы родителя';
            document.body.appendChild(hint);
          } catch(e) {}

          try {
            window.addEventListener('scroll', updateBoxOverlay, true);
            window.addEventListener('resize', updateBoxOverlay, true);
          } catch(e) {}

          // Команды из UI (локальные изменения)
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
                console.log('[iframe CMD_SET_STYLE] Получена команда:', {
                  id: data.id,
                  patch: data.patch,
                  hasPatch: !!data.patch
                });
                const elements = getElementsById(String(data.id));
                const el = elements[0];
                if (!el) {
                  console.warn('[iframe CMD_SET_STYLE] Элемент не найден:', data.id);
                  return;
                }
                const patch = data.patch || {};
                console.log('[iframe CMD_SET_STYLE] Применяю патч:', patch);
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
                console.log('[iframe CMD_SET_STYLE] Стили применены, текущий style:', el.getAttribute('style'));
                
                // Перестроим дерево после изменения стилей
                buildTree();
                
                // обновим снапшот
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
                  if (elements.some((node) => selectedGroup.includes(node))) clearSelected();
                  elements.forEach((node) => node.remove());
                  buildTree();
                }
                return;
              }
              if (data.type === CMD_INSERT && data.targetId && data.mode && data.html) {
                console.log('[iframe CMD_INSERT] Получена команда вставки', {
                  targetId: data.targetId,
                  mode: data.mode,
                  htmlPreview: String(data.html).substring(0, 100)
                });
                const target = document.querySelector(byIdSelector(String(data.targetId)));
                if (!target) {
                  console.warn('[iframe CMD_INSERT] Target не найден!', data.targetId);
                  return;
                }
                const tmp = document.createElement('div');
                tmp.innerHTML = String(data.html);
                const newEl = tmp.firstElementChild;
                if (!newEl) {
                  console.warn('[iframe CMD_INSERT] Не удалось создать элемент из HTML');
                  return;
                }
                // временный id для дерева до commit
                const newElId = ensureId(newEl);
                console.log('[iframe CMD_INSERT] ✅ Вставляю элемент с ID:', newElId);
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
 * Инжектирует скрипт блочного редактора в HTML
 * @param {string} html - HTML контент
 * @param {string} type - тип файла ('html', 'react', 'react-native')
 * @param {string} mode - режим работы ('preview' | 'edit')
 */
export function injectBlockEditorScript(html: string, type: string, mode: string = 'preview') {
  const source = String(html ?? '');
  const script = generateBlockEditorScript(type, mode);

  if (source.includes('</body>')) {
    return source.replace('</body>', script + '\n</body>');
  }
  return source + script;
}
