import React, { useState } from 'react';
export default function VariablesTest() {
  const [count, setCount] = useState(0);
  const title = 'Test Project';
  let message = 'Hello, World!вцвцвц';
  const [isActive, setIsActive] = useState(false);

  // Derived variable (should not be editable as primitive, or it depends on count)
  const doubledCount = count * 2;

  // Complex structure
  const userProfile = {
    name: 'Ivan Ivanov',
    role: isActive ? 'Admin' : 'User',
    stats: {
      logins: count,
      score: doubledCount * 10
    }
  };
  return <div style={{
    padding: '20px',
    fontFamily: 'sans-serif'
  }}>
      <h1 style={{
      color: isActive ? 'green' : 'black'
    }}>{title}</h1>
      <p>{message}</p>
      
      <div style={{
      margin: '20px 0',
      padding: '15px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px'
    }}>
        <h2>User Profile (Complex Structure)</h2>
        <pre style={{
        background: '#e0e0e0',
        padding: '10px',
        borderRadius: '4px'
      }}>
          {JSON.stringify(userProfile, null, 2)}
        </pre>
      </div>
      
      <div style={{
      margin: '20px 0',
      padding: '10px',
      border: '1px solid #ccc',
      borderRadius: '8px'
    }}>
        <h2>Counter</h2>
        <p>Current count: {count}</p>
        <p>Doubled count: {doubledCount}</p>
        
        <button onClick={() => setCount(count + 1)} style={{
        padding: '8px 16px',
        marginRight: '10px',
        cursor: 'pointer'
      }}>
          Increment
        </button>
        
        <button onClick={() => setIsActive(!isActive)} style={{
        padding: '8px 16px',
        cursor: 'pointer'
      }}>
          Toggle Color
        </button>
      </div>
      
      <div style={{
      marginTop: '20px',
      color: '#666',
      fontSize: '12px'
    }}>
        Open this file in the editor, switch to Preview, click "Make Snapshot", then check the Variables panel in Split mode.
      </div>
    </div>;
}
