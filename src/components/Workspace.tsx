import { h } from 'preact';
import { useEffect, useState, useRef, useCallback } from 'preact/hooks';
import { ProjectHandler } from '../project/ProjectHandler';
import { ElementData, BlockInteractionResult } from '../types';
import { ELEMENT_REGISTRY } from '../elements/registry';
import { blockInteractionHandler } from '../utils/BlockInteractionHandler';

export function Workspace(){
  const [elements, setElements] = useState<ElementData[]>([]);
  const [visualStates, setVisualStates] = useState<Record<string, Partial<ElementData>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement|null>(null);

  // Инициализация элементов с защитой от отсутствия данных в localStorage
  useEffect(()=> {
    const initial = ProjectHandler.load() || ProjectHandler.createEmpty();
    setElements(initial.elements);
  }, []);

  useEffect(()=> ProjectHandler.subscribe(p=> setElements(p.elements)), []);

  // Фокус на workspace для ловли горячих клавиш
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Настройка callback для обновления визуального состояния
  useEffect(() => {
    blockInteractionHandler.setVisualUpdateCallback((elementId, changes) => {
      setVisualStates((prev: Record<string, Partial<ElementData>>) => ({
        ...prev,
        [elementId]: changes
      }));
    });

    // Callback для завершения взаимодействия
    blockInteractionHandler.setInteractionEndCallback((result: BlockInteractionResult | null) => {
      if (result) {
        // Очищаем визуальное состояние
        setVisualStates((prev: Record<string, Partial<ElementData>>) => {
          const next = { ...prev };
          delete next[result.elementId];
          return next;
        });

        // Применяем изменения к элементу
        const patch: Partial<ElementData> = {};
        if (result.changes.position) {
          patch.x = result.changes.position.x;
          patch.y = result.changes.position.y;
        }
        if (result.changes.dimensions) {
          patch.w = result.changes.dimensions.w;
          patch.h = result.changes.dimensions.h;
        }
        if (result.changes.props) {
          patch.props = result.changes.props;
        }
        if (result.changes.style) {
          patch.props = {...(patch.props||{}), style: result.changes.style};
        }
        ProjectHandler.updateElement(result.elementId, patch);

        // Выводим JSON с изменениями в консоль (можно заменить на отправку на сервер)
        console.log('Block Interaction Result:', JSON.stringify(result, null, 2));
      } else {
        // Отмена взаимодействия - очищаем визуальное состояние
        setVisualStates({});
      }
    });

    return () => {
      blockInteractionHandler.setVisualUpdateCallback(() => {});
      blockInteractionHandler.setInteractionEndCallback(() => {});
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      ProjectHandler.deleteElement(selectedId);
      console.log('Block Interaction Result:', JSON.stringify({
        elementId: selectedId,
        action: 'delete',
        changes: { deleted: true }
      }, null, 2));
      setSelectedId(null);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{position:'relative',flex:1,height:'100%'}}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={(e: any)=>{}}
    >
      {elements.map((el: ElementData) => {
        const visualState = visualStates[el.id];
        const displayData: ElementData = visualState ? { ...el, ...visualState } as ElementData : el;
        return <RenderElement key={el.id} data={el} displayData={displayData} onSelect={setSelectedId} isSelected={selectedId===el.id} />;
      })}
    </div>
  )
}

function RenderElement({data, displayData, onSelect, isSelected}:{data:ElementData, displayData:ElementData, onSelect:(id:string)=>void, isSelected:boolean}){
  const cls = ELEMENT_REGISTRY[data.kind];
  if(!cls) return null;
  const Comp = (cls as any).render;
  // Создаем данные без позиции для рендера элемента (позиция устанавливается в Draggable)
  const renderData = { ...displayData, x: 0, y: 0 };
  // wrap with draggable handlers
  return <Draggable data={data} displayData={displayData} onSelect={onSelect} isSelected={isSelected}>{Comp(renderData)}</Draggable>;
}

function Draggable({children, data, displayData, onSelect, isSelected}:{children:any, data:ElementData, displayData:ElementData, onSelect:(id:string)=>void, isSelected:boolean}){
  const ref = useRef<HTMLDivElement|null>(null);
  const resizeHandles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as const;
  const handleSize = 8;

  const handleMouseDown = useCallback((e: MouseEvent, interactionType: 'move' | 'resize', handle?: typeof resizeHandles[number]) => {
    e.preventDefault();
    e.stopPropagation();
    
    blockInteractionHandler.startInteraction(
      data.id,
      data,
      e.clientX,
      e.clientY,
      interactionType,
      handle
    );
  }, [data]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mainElement = el.querySelector('.element-main') as HTMLElement;
    if (!mainElement) return;

    // Обработчик для перемещения (клик по основному элементу)
    mainElement.onmousedown = (ev: MouseEvent) => {
      // Проверяем, не кликнули ли по ручке изменения размера
      const target = ev.target as HTMLElement;
      if (target.classList.contains('resize-handle')) {
        return;
      }
      onSelect(data.id);
      handleMouseDown(ev, 'move');
    };

    // Обработчики для изменения размера
    resizeHandles.forEach(handle => {
      const handleEl = el.querySelector(`.resize-handle-${handle}`) as HTMLElement;
      if (handleEl) {
        handleEl.onmousedown = (ev: MouseEvent) => {
          onSelect(data.id);
          handleMouseDown(ev, 'resize', handle);
        };
      }
    });

    return () => {
      if (mainElement) mainElement.onmousedown = null;
      resizeHandles.forEach(handle => {
        const handleEl = el.querySelector(`.resize-handle-${handle}`) as HTMLElement;
        if (handleEl) handleEl.onmousedown = null;
      });
    };
  }, [data.id, handleMouseDown]);

  const style: any = {
    position: 'absolute',
    left: displayData.x,
    top: displayData.y,
    width: displayData.w,
    height: displayData.h,
    cursor: blockInteractionHandler.isActive() && blockInteractionHandler.getActiveElementId() === data.id 
      ? (blockInteractionHandler.getActiveElementId() === data.id ? 'grabbing' : 'default')
      : 'grab'
  };

  return (
    <div ref={ref} style={style} className="draggable-element">
      <div className="element-main" style={{width:'100%', height:'100%', position:'relative'}}>
        {children}
      </div>
      {/* Ручки для изменения размера */}
      {resizeHandles.map(handle => (
        <div
          key={handle}
          className={`resize-handle resize-handle-${handle}`}
          style={{
            position: 'absolute',
            width: handleSize,
            height: handleSize,
            backgroundColor: 'rgba(100, 150, 255, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            cursor: getResizeCursor(handle),
            ...getResizeHandlePosition(handle, displayData.w, displayData.h, handleSize)
          }}
        />
      ))}
    </div>
  );
}

function getResizeCursor(handle: string): string {
  const cursors: Record<string, string> = {
    'nw': 'nw-resize',
    'ne': 'ne-resize',
    'sw': 'sw-resize',
    'se': 'se-resize',
    'n': 'n-resize',
    's': 's-resize',
    'e': 'e-resize',
    'w': 'w-resize'
  };
  return cursors[handle] || 'default';
}

function getResizeHandlePosition(handle: string, w: number, h: number, size: number): Record<string, any> {
  const halfSize = size / 2;
  const positions: Record<string, Record<string, any>> = {
    'nw': { top: -halfSize, left: -halfSize },
    'ne': { top: -halfSize, right: -halfSize },
    'sw': { bottom: -halfSize, left: -halfSize },
    'se': { bottom: -halfSize, right: -halfSize },
    'n': { top: -halfSize, left: '50%', marginLeft: -halfSize },
    's': { bottom: -halfSize, left: '50%', marginLeft: -halfSize },
    'e': { right: -halfSize, top: '50%', marginTop: -halfSize },
    'w': { left: -halfSize, top: '50%', marginTop: -halfSize }
  };
  return positions[handle] || {};
}
