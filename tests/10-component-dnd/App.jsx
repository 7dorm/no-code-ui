import React from "react";
import SimpleBadge from "./SimpleBadge";
export default function App() {
  return <div style={{
    minHeight: "100vh",
    padding: 24,
    background: "#f3f4f6",
    boxSizing: "border-box"
  }}>
      <div style={{
      maxWidth: 880,
      margin: "0 auto",
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 20
    }}>
        <h1 style={{
        marginTop: 0,
        marginBottom: 10
      }}>Component DnD Test</h1>
        <p style={{
        marginTop: 0,
        color: "#4b5563"
      }}>
          Перетащи компонент из дерева файлов на этот контейнер.
        </p>
        <div style={{
        marginTop: 16,
        border: "2px dashed #c7d2fe",
        borderRadius: 10,
        minHeight: 220,
        padding: 14,
        background: "#eef2ff",
        width: 581,
        height: 220
      }}>
          <h3 style={{
          marginTop: 0
        }}>Drop Zone</h3>
          <p style={{
          marginBottom: 0,
          color: "#334155"
        }}>
            Разрешено: компоненты без props. Компоненты с props должны показать предупреждение.
          </p>
        
        
      
        
      
        
      
        <SimpleBadge style={{}} />
      </div>
      </div>
    </div>;
}
