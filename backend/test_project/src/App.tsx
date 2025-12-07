import React from 'react';
import './styles/global.css';
import Header from './components/Header';
import Card from './components/Card';

export default function App() {
  return (
    <div className="app-container">
      <Header />
      <div className="cards-wrapper">
        <Card title="First card" />
        <Card title="Second card" />
      </div>
    </div>
  );
}
