import React, { useState } from 'react';

/**
 * Простой однофайловый React компонент для тестирования ReactFramework
 */import ExtractedBlock from "./ExtractedBlock";
export default function App() {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('');

  const handleClick = () => {
    setCount(count + 1);
    setMessage(`Кнопка нажата ${count + 1} раз`);

  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      padding: '20px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <ExtractedBlock count={count} handleClick={handleClick} message={message} />

    </div>);

}