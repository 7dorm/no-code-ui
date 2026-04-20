import { useCallback, useEffect, useRef, useState } from 'react';

export function useSplitLayout() {
  const [splitLeftWidth, setSplitLeftWidth] = useState<number>(0.5);
  const [splitSidebarWidth, setSplitSidebarWidth] = useState<number>(320);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [resizeTarget, setResizeTarget] = useState<'main' | 'sidebar' | null>(null);
  const splitContainerRef = useRef<HTMLElement | null>(null);
  const splitMainPanelsRef = useRef<HTMLElement | null>(null);

  const handleSplitResizeStart = useCallback((target: 'main' | 'sidebar') => (e: any) => {
    setResizeTarget(target);
    setIsResizing(true);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }, []);

  const handleSplitResize = useCallback((e: any) => {
    if (!isResizing || !resizeTarget) return;

    let container = (resizeTarget === 'sidebar' ? splitContainerRef.current : splitMainPanelsRef.current) as any;

    if (container) {
      if (typeof (container as HTMLElement).getBoundingClientRect === 'function') {
        // already DOM element
      } else if ((container as any)._nativeNode) {
        container = (container as any)._nativeNode;
      } else if ((container as any)._internalInstanceHandle?.stateNode) {
        container = (container as any)._internalInstanceHandle.stateNode;
      } else if ((container as any)._owner?.stateNode) {
        container = (container as any)._owner.stateNode;
      }
    }

    if (!container || typeof container.getBoundingClientRect !== 'function') {
      const splitContainers = document.querySelectorAll(resizeTarget === 'sidebar' ? '[data-split-container]' : '[data-split-main-panels]');
      if (splitContainers.length > 0) {
        container = splitContainers[0] as HTMLElement;
      }
    }

    if (!container || typeof container.getBoundingClientRect !== 'function') {
      return;
    }

    const rect = container.getBoundingClientRect();
    const x = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    if (resizeTarget === 'sidebar') {
      const newSidebarWidth = Math.max(240, Math.min(520, x - rect.left));
      setSplitSidebarWidth(newSidebarWidth);
      return;
    }
    const relativeX = x - rect.left;
    const newWidth = Math.max(0.2, Math.min(0.8, relativeX / rect.width));
    setSplitLeftWidth(newWidth);
  }, [isResizing, resizeTarget]);

  const handleSplitResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeTarget(null);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: any) => {
      handleSplitResize(e);
      if (e.preventDefault) e.preventDefault();
    };
    const handleMouseUp = () => {
      handleSplitResizeEnd();
    };
    const handleTouchMove = (e: any) => {
      handleSplitResize(e);
      if (e.preventDefault) e.preventDefault();
    };
    const handleTouchEnd = () => {
      handleSplitResizeEnd();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [isResizing, handleSplitResize, handleSplitResizeEnd]);

  const setSplitContainerNode = useCallback((ref: any) => {
    if (!ref) return;
    if (ref._nativeNode) {
      splitContainerRef.current = ref._nativeNode;
      return;
    }
    if (typeof ref.getBoundingClientRect === 'function') {
      splitContainerRef.current = ref;
      return;
    }
    splitContainerRef.current = ref;
    setTimeout(() => {
      const element = document.querySelector('[data-split-container]');
      if (element) {
        splitContainerRef.current = element as HTMLElement;
      }
    }, 0);
  }, []);

  const setSplitMainPanelsNode = useCallback((ref: any) => {
    if (!ref) return;
    if (ref._nativeNode) {
      splitMainPanelsRef.current = ref._nativeNode;
      return;
    }
    if (typeof ref.getBoundingClientRect === 'function') {
      splitMainPanelsRef.current = ref;
      return;
    }
    splitMainPanelsRef.current = ref;
    setTimeout(() => {
      const element = document.querySelector('[data-split-main-panels]');
      if (element) {
        splitMainPanelsRef.current = element as HTMLElement;
      }
    }, 0);
  }, []);

  return {
    splitLeftWidth,
    splitSidebarWidth,
    isResizing,
    resizeTarget,
    setSplitContainerNode,
    setSplitMainPanelsNode,
    handleSplitResizeStart,
    handleSplitResize,
    handleSplitResizeEnd,
  };
}
