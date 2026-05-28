import React from 'react';

export default function ExtractedBlock() {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 16,
        background: 'rgba(15, 23, 42, 0.72)',
        border: '1px solid rgba(148, 163, 184, 0.14)',
        color: '#e5e7eb',
      }}
    >
      <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#38bdf8' }}>
        Extracted Block
      </div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>
        Standalone TSX component
      </div>
      <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>
        This file is kept self-contained so preview works even when opened directly.
      </p>
    </div>
  );
}
