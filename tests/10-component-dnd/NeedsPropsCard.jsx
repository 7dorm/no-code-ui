import React from "react";

export function NeedsPropsCard({ title, count }) {
  return (
    <div
      style={{
        border: "1px solid #f59e0b",
        borderRadius: 10,
        padding: 12,
        background: "#fffbeb",
      }}
    >
      <h4 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h4>
      <div>Count: {count}</div>
    </div>
  );
}
