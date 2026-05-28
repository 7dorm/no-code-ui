import React from "react";

export default function SimpleBadge() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        padding: "8px 14px",
        background: "#10b981",
        color: "#ffffff",
        fontWeight: 700,
      }}
    >
      <span>OK</span>
      <span>simple component</span>
    </div>
  );
}
