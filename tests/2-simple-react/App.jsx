import React, { useState } from 'react';

/**
 * Простой однофайловый React компонент для тестирования ReactFramework
 */
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
    }} data-no-code-ui-id="mrpak:App.jsx:369:671:div">
      <div style={{
        maxWidth: '600px',
        background: 'white',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }} data-no-code-ui-id="mrpak:App.jsx:678:861:div">
        

        <div style={{
          background: '#f8f9fa',
          borderRadius: '8px',
          padding: '20px',
          margin: '16px 0',
          border: '2px solid #e9ecef'
        }} data-no-code-ui-id="mrpak:App.jsx:880:1062:div">
          <h2 style={{ color: '#764ba2', marginTop: 0, position: "relative", left: 3.5, top: -61.922 }} data-no-code-ui-id="mrpak:App.jsx:1073:1167:h2">Счетчик</h2>
          <p style={{ color: '#495057', fontSize: '18px', position: "relative", left: 45, top: -34.078, width: 125, height: 80 }} data-no-code-ui-id="mrpak:App.jsx:1190:1310:p">
            Текущее значение: <strong data-no-code-ui-id="mrpak:App.jsx:1341:1349:strong">{count}</strong>
          </p>
          <button
            onClick={handleClick}
            style={{
              background: '#667eea',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '6px',
              fontSize: '16px',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }} data-no-code-ui-id="mrpak:App.jsx:1391:1739:button">

            Увеличить счетчик
          </button>
          {message &&
          <p style={{
            marginTop: '16px',
            color: '#28a745',
            fontWeight: '600'
          }} data-no-code-ui-id="mrpak:App.jsx:1823:1939:p">
              {message}
            </p>
          }
        </div>

        <div style={{
          background: '#f8f9fa',
          borderRadius: '8px',
          padding: '20px',
          margin: '16px 0',
          border: '2px solid #e9ecef'
        }} data-no-code-ui-id="mrpak:App.jsx:2017:2199:div">
          <h3 style={{ color: '#495057', marginTop: 0 }} data-no-code-ui-id="mrpak:App.jsx:2210:2257:h3">О тесте</h3>
          <p style={{ color: '#6c757d', lineHeight: '1.6' }} data-no-code-ui-id="mrpak:App.jsx:2280:2331:p">
            Этот компонент тестирует ReactFramework: инструментацию JSX,
            обработку зависимостей, применение стилей и операции с элементами.
          </p>
        </div>
      </div>
    </div>);

}