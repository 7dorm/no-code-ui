import React from 'react';
import '../styles/Header.css';

/**
 * Компонент шапки приложения
 */
export default function Header({ title, subtitle }) {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="header-title">{title}</h1>
        {subtitle && <p className="header-subtitle">{subtitle}</p>}
      </div>
    </header>
  );
}

