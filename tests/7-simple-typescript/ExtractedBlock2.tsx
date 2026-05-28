import React from 'react';
import { accentColor, panelStyle } from './theme';
import ExtractedBlock from './ExtractedBlock';

export default function ExtractedBlock2() {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
        color: '#e5e7eb',
        fontFamily: '"Segoe UI", sans-serif',
      }}
    >
      <div style={{ maxWidth: 840, margin: '0 auto', display: 'grid', gap: 16 }}>
        <section style={panelStyle}>
          <div style={{ color: accentColor, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Extracted Block Demo
          </div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 32 }}>Nested TSX Component</h1>
          <p style={{ margin: 0, color: '#94a3b8' }}>
            This file imports local theme values and another TSX component.
          </p>
        </section>

        <section style={panelStyle}>
          <ExtractedBlock />
        </section>
      </div>
    </div>
  );
}
