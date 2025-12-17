import React from 'react';
import '../styles/Button.css';

/**
 * Универсальный компонент кнопки
 */
export default function Button({ 
  children, 
  onClick, 
  variant = 'default', 
  size = 'medium',
  disabled = false 
}) {
  const className = `button button-${variant} button-${size} ${disabled ? 'button-disabled' : ''}`;
  
  return (
    <button
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

