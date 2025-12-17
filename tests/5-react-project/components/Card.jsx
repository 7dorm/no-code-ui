import React from 'react';

/**
 * Компонент карточки с inline стилями
 */
export default function Card({ children, className = '' }) {
  return (
    <div 
      className={`card ${className}`}
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #e9ecef'
      }}
    >
      {children}
    </div>
  );
}

