import { ElementData, BlockInteractionResult, BlockChangeAction } from '../types';

/**
 * Обработчик взаимодействий с блоками на странице.
 * Отслеживает события курсора и возвращает JSON с изменениями при завершении взаимодействия.
 */
export class BlockInteractionHandler {
  private activeElementId: string | null = null;
  private startX: number = 0;
  private startY: number = 0;
  private originalData: ElementData | null = null;
  private currentChanges: Partial<ElementData> = {};
  private interactionType: 'move' | 'resize' | null = null;
  private resizeHandle: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null = null;
  private onInteractionEndCallback: ((result: BlockInteractionResult | null) => void) | null = null;

  /**
   * Начинает отслеживание взаимодействия с блоком
   */
  startInteraction(
    elementId: string,
    elementData: ElementData,
    mouseX: number,
    mouseY: number,
    interactionType: 'move' | 'resize',
    resizeHandle?: 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
  ): void {
    this.activeElementId = elementId;
    this.startX = mouseX;
    this.startY = mouseY;
    this.originalData = { ...elementData };
    this.currentChanges = {};
    this.interactionType = interactionType;
    this.resizeHandle = resizeHandle || null;

    // Устанавливаем обработчики событий
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  /**
   * Обработчик движения мыши
   */
  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.activeElementId || !this.originalData) return;

    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    if (this.interactionType === 'move') {
      this.currentChanges.x = this.originalData.x + dx;
      this.currentChanges.y = this.originalData.y + dy;
    } else if (this.interactionType === 'resize' && this.resizeHandle) {
      this.handleResize(dx, dy);
    }

    // Вызываем callback для обновления визуального отображения
    this.updateVisualState();
  };

  /**
   * Обработка изменения размеров
   */
  private handleResize(dx: number, dy: number): void {
    if (!this.originalData) return;

    const { x, y, w, h } = this.originalData;
    let newX = x;
    let newY = y;
    let newW = w;
    let newH = h;

    switch (this.resizeHandle) {
      case 'nw':
        newX = x + dx;
        newY = y + dy;
        newW = w - dx;
        newH = h - dy;
        break;
      case 'ne':
        newY = y + dy;
        newW = w + dx;
        newH = h - dy;
        break;
      case 'sw':
        newX = x + dx;
        newW = w - dx;
        newH = h + dy;
        break;
      case 'se':
        newW = w + dx;
        newH = h + dy;
        break;
      case 'n':
        newY = y + dy;
        newH = h - dy;
        break;
      case 's':
        newH = h + dy;
        break;
      case 'e':
        newW = w + dx;
        break;
      case 'w':
        newX = x + dx;
        newW = w - dx;
        break;
    }

    // Ограничиваем минимальные размеры
    if (newW < 20) {
      if (this.resizeHandle?.includes('w')) newX = x + w - 20;
      newW = 20;
    }
    if (newH < 20) {
      if (this.resizeHandle?.includes('n')) newY = y + h - 20;
      newH = 20;
    }

    this.currentChanges.x = newX;
    this.currentChanges.y = newY;
    this.currentChanges.w = newW;
    this.currentChanges.h = newH;
  }

  /**
   * Обработчик отпускания мыши
   */
  private handleMouseUp = (): void => {
    if (!this.activeElementId || !this.originalData) {
      this.cleanup();
      return;
    }

    // Формируем результат взаимодействия
    const result = this.buildInteractionResult();

    // Вызываем callback с результатом
    if (this.onInteractionEndCallback) {
      this.onInteractionEndCallback(result);
    }

    this.cleanup();
  };

  /**
   * Формирует JSON с результатом взаимодействия
   */
  private buildInteractionResult(): BlockInteractionResult | null {
    if (!this.activeElementId || !this.originalData) return null;

    const hasPositionChange = 
      this.currentChanges.x !== undefined || 
      this.currentChanges.y !== undefined;
    const hasDimensionChange = 
      this.currentChanges.w !== undefined || 
      this.currentChanges.h !== undefined;
    const hasStyleChange = 
      this.currentChanges.style !== undefined;
    const hasPropsChange = 
      this.currentChanges.props !== undefined;

    // Определяем действие
    let action: BlockChangeAction = 'update';
    if (hasPositionChange && !hasDimensionChange && !hasStyleChange && !hasPropsChange) {
      action = 'move';
    } else if (hasDimensionChange && !hasPositionChange && !hasStyleChange && !hasPropsChange) {
      action = 'resize';
    } else if (hasStyleChange || hasPropsChange) {
      action = 'update';
    }

    // Формируем изменения по категориям
    const changes: any = {};
    
    if (hasPositionChange) {
      changes.position = {
        x: this.currentChanges.x ?? this.originalData.x,
        y: this.currentChanges.y ?? this.originalData.y
      };
    }

    if (hasDimensionChange) {
      changes.dimensions = {
        w: this.currentChanges.w ?? this.originalData.w,
        h: this.currentChanges.h ?? this.originalData.h
      };
    }

    if (hasStyleChange) {
      changes.style = this.currentChanges.style;
    }

    if (hasPropsChange) {
      changes.props = this.currentChanges.props;
    }

    return {
      elementId: this.activeElementId,
      action,
      changes
    };
  }

  /**
   * Получить текущие промежуточные изменения для визуального отображения
   */
  getCurrentChanges(): Partial<ElementData> | null {
    if (!this.activeElementId) return null;
    return { ...this.currentChanges };
  }

  /**
   * Получить ID активного элемента
   */
  getActiveElementId(): string | null {
    return this.activeElementId;
  }

  /**
   * Установить callback для обновления визуального состояния
   */
  setVisualUpdateCallback(callback: (elementId: string, changes: Partial<ElementData>) => void): void {
    this.visualUpdateCallback = callback;
  }

  private visualUpdateCallback: ((elementId: string, changes: Partial<ElementData>) => void) | null = null;

  /**
   * Обновляет визуальное состояние элемента
   */
  private updateVisualState(): void {
    if (!this.activeElementId || !this.visualUpdateCallback) return;
    this.visualUpdateCallback(this.activeElementId, this.currentChanges);
  }

  /**
   * Установить callback для завершения взаимодействия
   */
  setInteractionEndCallback(callback: (result: BlockInteractionResult | null) => void): void {
    this.onInteractionEndCallback = callback;
  }

  /**
   * Обновить изменения вручную (например, при изменении параметров через UI)
   */
  updateChanges(changes: Partial<ElementData>): void {
    if (!this.activeElementId) return;
    this.currentChanges = { ...this.currentChanges, ...changes };
    this.updateVisualState();
  }

  /**
   * Очистка обработчиков
   */
  private cleanup(): void {
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    this.activeElementId = null;
    this.originalData = null;
    this.currentChanges = {};
    this.interactionType = null;
    this.resizeHandle = null;
  }

  /**
   * Отменить текущее взаимодействие
   */
  cancel(): void {
    this.cleanup();
    if (this.onInteractionEndCallback) {
      this.onInteractionEndCallback(null);
    }
  }

  /**
   * Проверка, активно ли взаимодействие
   */
  isActive(): boolean {
    return this.activeElementId !== null;
  }
}

// Экспортируем singleton экземпляр
export const blockInteractionHandler = new BlockInteractionHandler();

