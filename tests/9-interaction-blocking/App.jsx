import React, { useMemo, useRef, useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [lastEvent, setLastEvent] = useState("none");
  const inputRef = useRef(null);

  const log = (name) => {
    setLastEvent(name);
    console.log("[InteractionTest]", name);
  };

  const boxStyle = useMemo(
    () => ({
      padding: 16,
      borderRadius: 12,
      border: "2px solid #1f2937",
      background: hovered ? "#e0f2fe" : "#f8fafc",
      transition: "background 0.2s",
      userSelect: "none",
    }),
    [hovered]
  );

  return (
    <div
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial',
        padding: 24,
        display: "grid",
        gap: 16,
        maxWidth: 720,
      }}
    >
      <h2>Interaction Blocking Test</h2>

      <div style={boxStyle}>
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #94a3b8",
            background: "#ffffff",
          }}
          onMouseEnter={() => {
            setHovered(true);
            log("mouse-enter");
          }}
          onMouseLeave={() => {
            setHovered(false);
            log("mouse-leave");
          }}
          onPointerEnter={() => log("pointer-enter")}
          onPointerLeave={() => log("pointer-leave")}
          onPointerMove={() => log("pointer-move")}
          onMouseMove={() => log("mouse-move")}
          onClick={() => {
            setCount((c) => c + 1);
            log("click");
          }}
          onDoubleClick={() => log("double-click")}
          onContextMenu={(e) => {
            e.preventDefault();
            log("context-menu");
          }}
          onWheel={() => log("wheel")}
        >
          <strong>Interactive box</strong>
          <div>Clicks: {count}</div>
          <div>Hover: {hovered ? "yes" : "no"}</div>
          <div>Last event: {lastEvent}</div>
        </div>
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px dashed #64748b",
          display: "grid",
          gap: 10,
        }}
      >
        <label>
          Input
          <input
            ref={inputRef}
            style={{ display: "block", marginTop: 6, padding: 6 }}
            placeholder="type here"
            onFocus={() => {
              setFocused(true);
              log("input-focus");
            }}
            onBlur={() => {
              setFocused(false);
              log("input-blur");
            }}
            onChange={() => log("input-change")}
            onInput={() => log("input-input")}
            onKeyDown={() => log("input-keydown")}
            onKeyUp={() => log("input-keyup")}
          />
        </label>

        <button
          type="button"
          onClick={() => log("button-click")}
          onMouseDown={() => log("button-mousedown")}
          onMouseUp={() => log("button-mouseup")}
        >
          Button
        </button>

        <a href="https://example.com" onClick={(e) => e.preventDefault()}>
          Link
        </a>
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #cbd5f5",
        }}
        contentEditable
        suppressContentEditableWarning
        onInput={() => log("contenteditable-input")}
        onFocus={() => log("contenteditable-focus")}
        onBlur={() => log("contenteditable-blur")}
      >
        Editable text (try typing)
      </div>

      <div
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e2e8f0",
        }}
        onTouchStart={() => log("touch-start")}
        onTouchMove={() => log("touch-move")}
        onTouchEnd={() => log("touch-end")}
      >
        Touch area
      </div>

      <div style={{ fontSize: 12, color: "#64748b" }}>
        Focused: {focused ? "yes" : "no"}
      </div>
    </div>
  );
}
