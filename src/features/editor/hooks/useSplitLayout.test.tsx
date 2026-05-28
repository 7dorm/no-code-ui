import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSplitLayout } from './useSplitLayout';

function setRect(element: HTMLElement, rect: Partial<DOMRect>) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
});

describe('useSplitLayout', () => {
  it('updates the main split width from window move events', async () => {
    const { result } = renderHook(() => useSplitLayout());
    const panels = document.createElement('div');
    panels.setAttribute('data-split-main-panels', '1');
    setRect(panels, { left: 0, width: 1000 });
    document.body.appendChild(panels);

    act(() => {
      result.current.setSplitMainPanelsNode(panels);
      result.current.handleSplitResizeStart('main')({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
    });

    expect(result.current.splitLeftWidth).toBeCloseTo(0.3);
    expect(document.body.style.cursor).toBe('col-resize');

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.isResizing).toBe(false);
    expect(document.body.style.cursor).toBe('');
  });

  it('clamps sidebar width within allowed bounds', () => {
    const { result } = renderHook(() => useSplitLayout());
    const container = document.createElement('div');
    container.setAttribute('data-split-container', '1');
    setRect(container, { left: 0, width: 1200 });
    document.body.appendChild(container);

    act(() => {
      result.current.setSplitContainerNode(container);
      result.current.handleSplitResizeStart('sidebar')({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
    });

    act(() => {
      result.current.handleSplitResize({ clientX: 100 });
    });
    expect(result.current.splitSidebarWidth).toBe(240);

    act(() => {
      result.current.handleSplitResize({ clientX: 900 });
    });
    expect(result.current.splitSidebarWidth).toBe(520);

    act(() => {
      result.current.handleSplitResizeEnd();
    });
    expect(result.current.resizeTarget).toBeNull();
  });
});
