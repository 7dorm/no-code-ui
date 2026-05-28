import React, { useMemo, useState } from 'react';
function StatusBadge({
  active
}) {
  return <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 999,
    background: active ? 'rgba(34, 197, 94, 0.16)' : 'rgba(148, 163, 184, 0.16)',
    color: active ? '#166534' : '#475569',
    fontSize: 13,
    fontWeight: 700,
    position: "absolute",
    left: 188,
    top: 19.999998092651367
  }}>

      <span style={{
      width: 8,
      height: 8,
      borderRadius: 999,
      background: active ? '#22c55e' : '#94a3b8'
    }} />

      {active ? 'Система активна' : 'Система на паузе'}
    </span>;
}
export default function App() {
  const [active, setActive] = useState(true);
  const [visits, setVisits] = useState(128);
  const summary = useMemo(() => {
    return active ? 'Компонент App использует StatusBadge.' : 'Показан тот же файл, но другой state.';
  }, [active]);
  return <div style={{
    minHeight: '100vh',
    margin: 0,
    padding: 32,
    background: 'linear-gradient(135deg, #dbeafe 0%, #f8fafc 45%, #e2e8f0 100%)',
    fontFamily: '"Segoe UI", sans-serif',
    color: '#0f172a'
  }}>

      <div style={{
      maxWidth: 720,
      margin: '0 auto',
      background: 'rgba(255,255,255,0.92)',
      borderRadius: 24,
      padding: 28,
      boxShadow: '0 18px 60px rgba(15, 23, 42, 0.12)'
    }}>

        <StatusBadge active={active} />
        <h1 style={{
        marginTop: 20,
        marginBottom: 12,
        fontSize: 34
      }}>Файл с двумя компонентами</h1>
        <p style={{
        marginTop: 0,
        color: '#475569',
        lineHeight: 1.6
      }}>
          {summary}
        </p>

        <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 16,
        marginTop: 24
      }}>

          <div style={{
          borderRadius: 18,
          padding: 18,
          background: '#eff6ff',
          border: '1px solid #bfdbfe'
        }}>

            <div style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            color: '#64748b'
          }}>
              Визиты
            </div>
            <div style={{
            marginTop: 10,
            fontSize: 28,
            fontWeight: 800
          }}>{visits}</div>
          </div>
          <div style={{
          borderRadius: 18,
          padding: 18,
          background: '#f8fafc',
          border: '1px solid #cbd5e1'
        }}>

            <div style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            color: '#64748b'
          }}>
              Действия
            </div>
            <div style={{
            display: 'flex',
            gap: 10,
            marginTop: 12
          }}>
              <button onClick={() => setActive(value => !value)} style={{
              border: 'none',
              borderRadius: 12,
              padding: '10px 14px',
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer'
            }}>

                Переключить статус
              </button>
              <button onClick={() => setVisits(value => value + 8)} style={{
              border: '1px solid #cbd5e1',
              borderRadius: 12,
              padding: '10px 14px',
              background: '#fff',
              color: '#0f172a',
              cursor: 'pointer'
            }}>

                +8 визитов
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>;
}
