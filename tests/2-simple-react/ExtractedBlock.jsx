import React from "react";
function ExtractedBlock({
  count,
  handleClick,
  message
}) {
  return <div style={{
    maxWidth: '600px',
    background: 'white',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    position: "relative"
  }}>
        

        <div style={{
      background: '#f8f9fa',
      borderRadius: '8px',
      padding: '20px',
      margin: '16px 0',
      border: '2px solid #e9ecef',
      position: "relative",
      left: 0,
      top: 0
    }}>
          <h2 style={{
        color: '#764ba2',
        marginTop: 0,
        position: "relative",
        left: 3.5,
        top: -61.922
      }}>Счетчик</h2>
          <p style={{
        color: "#495057",
        fontSize: "18px",
        position: "relative",
        left: 166,
        width: 421.94998931884766,
        height: 115.89999389648438,
        marginLeft: 27,
        marginTop: 18,
        top: -7
      }}>
            Текущее значение: <strong>{count}</strong>
          </p>
          <button onClick={handleClick} style={{
        background: '#667eea',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '6px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s'
      }}>

            Увеличить счетчик
          </button>
          {message && <p style={{
        marginTop: '16px',
        color: '#28a745',
        fontWeight: '600'
      }}>
              {message}
            </p>}
        </div>

        <div style={{
      background: '#f8f9fa',
      borderRadius: '8px',
      padding: '20px',
      margin: '16px 0',
      border: '2px solid #e9ecef'
    }}>
          <h3 style={{
        color: '#495057',
        marginTop: 0
      }}>О тесте</h3>
          <p style={{
        color: '#6c757d',
        lineHeight: '1.6'
      }}>
            Этот компонент тестирует ReactFramework: инструментацию JSX,
            обработку зависимостей, применение стилей и операции с элементами.
          </p>
        </div>
      </div>;
}
export default ExtractedBlock;
