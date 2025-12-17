import { MRPAK_MSG, MRPAK_CMD } from '../../../blockEditor/EditorProtocol';

/**
 * Генерирует скрипт для блочного редактора, который инжектируется в HTML
 * @param {string} type - тип файла ('html', 'react', 'react-native')
 * @param {string} mode - режим работы ('preview' | 'edit')
 */
export function generateBlockEditorScript(type, mode = 'preview') {
  const isEditMode = mode === 'edit';
  
  return `
      <style>
        [data-no-code-ui-id].mrpak-selected, [data-mrpak-id].mrpak-selected { outline: 2px solid #667eea !important; outline-offset: 2px; }
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
          let lastSelectedId = null;
          let moveMode = 'absolute'; // absolute | relative | grid8
          let gridStep = 8;
          let dragging = null; // {sourceId}
          let dropTarget = null;

          const snap = (v) => {
            if (moveMode !== 'grid8') return v;
            const step = gridStep || 8;
            return Math.round(v / step) * step;
          };

          const getOffsetParent = (el) => el && (el.offsetParent || el.parentElement || document.body);

          const pxToNum = (s) => {
            const m = String(s || '').match(/(-?\\d+(?:\\.\\d+)?)px/);
            return m ? Number(m[1]) : 0;
          };

          function post(type, payload) {
            try {
              window.parent && window.parent.postMessage({ type, ...payload }, '*');
            } catch (e) {}
          }

          function buildTree() {
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
            try {
              if (selected) selected.classList.remove('mrpak-selected');
            } catch(e) {}
            selected = null;
          }

          function selectEl(el) {
            if (!el) return;
            clearSelected();
            selected = el;
            try { selected.classList.add('mrpak-selected'); } catch(e) {}
            const id = ensureId(selected);
            lastSelectedId = id;
            const rect = selected.getBoundingClientRect();
            post(MSG_SELECT, { id, meta: { tagName: selected.tagName, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } } });
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
              try {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
              } catch(e) {}
            }, true);
          }

          // Блокируем все события на интерактивных элементах только в режиме редактора
          const blockInteractiveEvents = (ev) => {
            if (!EDIT_MODE) return;
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
            if (!drag || !selected) return;
            const dx = ev.clientX - drag.sx;
            const dy = ev.clientY - drag.sy;
            if (drag.mode === 'move') {
              selected.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            } else {
              selected.style.width = Math.max(1, drag.rect.width + dx) + 'px';
              selected.style.height = Math.max(1, drag.rect.height + dy) + 'px';
            }
          }, true);

          document.addEventListener('mouseup', (ev) => {
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

            // координаты родителя и padding для ограничения
            const parent = getOffsetParent(selected);
            const parentRect = parent && parent.getBoundingClientRect ? parent.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            const ps = parent ? window.getComputedStyle(parent) : null;
            const padLeft = ps ? parseFloat(ps.getPropertyValue('padding-left')) || 0 : 0;
            const padTop = ps ? parseFloat(ps.getPropertyValue('padding-top')) || 0 : 0;
            const padRight = ps ? parseFloat(ps.getPropertyValue('padding-right')) || 0 : 0;
            const padBottom = ps ? parseFloat(ps.getPropertyValue('padding-bottom')) || 0 : 0;
            const scrollLeft = parent ? (parent.scrollLeft || 0) : 0;
            const scrollTop = parent ? (parent.scrollTop || 0) : 0;

            if (drag.mode === 'move') {
              selected.style.transform = '';

              if (moveMode === 'relative') {
                const cs = window.getComputedStyle(selected);
                const baseLeft = cs.left === 'auto' ? 0 : pxToNum(cs.left);
                const baseTop = cs.top === 'auto' ? 0 : pxToNum(cs.top);
                const left = snap(baseLeft + dx);
                const top = snap(baseTop + dy);
                selected.style.position = 'relative';
                selected.style.left = left + 'px';
                selected.style.top = top + 'px';

                if ('${type}' === 'html') {
                  post(MSG_APPLY, { id, patch: { position: 'relative', left: left + 'px', top: top + 'px' } });
                } else {
                  post(MSG_APPLY, { id, patch: { position: 'relative', left: left, top: top } });
                }
              } else {
                // absolute с ограничением по padding-box
                const startLeft = drag.rect.left - parentRect.left - padLeft;
                const startTop = drag.rect.top - parentRect.top - padTop;
                
                let left = snap(startLeft + dx);
                let top = snap(startTop + dy);

                // Ограничиваем позицию padding-box родителя
                const maxLeft = parentRect.width - padRight - snap(drag.rect.width);
                const maxTop = parentRect.height - padBottom - snap(drag.rect.height);
                const minLeft = padLeft;
                const minTop = padTop;
                left = Math.min(Math.max(left, minLeft), maxLeft);
                top = Math.min(Math.max(top, minTop), maxTop);

                selected.style.position = 'absolute';
                selected.style.left = left + 'px';
                selected.style.top = top + 'px';

                if ('${type}' === 'html') {
                  post(MSG_APPLY, { id, patch: { position: 'absolute', left: left + 'px', top: top + 'px' } });
                } else {
                  post(MSG_APPLY, { id, patch: { position: 'absolute', left: left, top: top } });
                }
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
              if ('${type}' === 'html') {
                post(MSG_APPLY, { id, patch: { width: cw + 'px', height: ch + 'px' } });
              } else {
                post(MSG_APPLY, { id, patch: { width: cw, height: ch } });
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
            hint.textContent = 'MRPAK Editor: клик = выбрать, Shift+Drag = переместить, Alt+Drag = изменить размер';
            document.body.appendChild(hint);
          } catch(e) {}

          // Команды из UI (локальные изменения)
          window.addEventListener('message', (event) => {
            const data = event && event.data;
            if (!data || typeof data !== 'object') return;
            try {
              if (data.type === CMD_SELECT && data.id) {
                const el = document.querySelector(byIdSelector(String(data.id)));
                if (el) selectEl(el);
                return;
              }
              if (data.type === CMD_SET_STYLE && data.id && data.patch) {
                const el = document.querySelector(byIdSelector(String(data.id)));
                if (!el) return;
                const patch = data.patch || {};
                for (const k in patch) {
                  const v = patch[k];
                  if (k.includes('-')) {
                    el.style.setProperty(k, String(v));
                  } else {
                    // DOM style: camelCase
                    try { el.style[k] = String(v); } catch(e) {}
                  }
                }
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
                const el = document.querySelector(byIdSelector(String(data.id)));
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
                const el = document.querySelector(byIdSelector(String(data.id)));
                if (!el) return;
                el.innerText = data.text ?? '';
                post(MSG_TEXT_SNAPSHOT, { id: data.id, text: el.innerText || '' });
                return;
              }
              if (data.type === CMD_REQ_TEXT && data.id) {
                const el = document.querySelector(byIdSelector(String(data.id)));
                if (!el) return;
                post(MSG_TEXT_SNAPSHOT, { id: data.id, text: el.innerText || '' });
                return;
              }
              if (data.type === CMD_DELETE && data.id) {
                const el = document.querySelector(byIdSelector(String(data.id)));
                if (el) {
                  if (selected === el) clearSelected();
                  el.remove();
                  buildTree();
                }
                return;
              }
              if (data.type === CMD_INSERT && data.targetId && data.mode && data.html) {
                const target = document.querySelector(byIdSelector(String(data.targetId)));
                if (!target) return;
                const tmp = document.createElement('div');
                tmp.innerHTML = String(data.html);
                const newEl = tmp.firstElementChild;
                if (!newEl) return;
                // временный id для дерева до commit
                ensureId(newEl);
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
                if (typeof data.grid === 'number') gridStep = data.grid;
                return;
              }
            } catch(e) {}
          }, false);

          post(MSG_READY, { meta: { mode: 'edit' } });
          buildTree();
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
export function injectBlockEditorScript(html, type, mode = 'preview') {
  const source = String(html ?? '');
  const script = generateBlockEditorScript(type, mode);

  if (source.includes('</body>')) {
    return source.replace('</body>', script + '\n</body>');
  }
  return source + script;
}

