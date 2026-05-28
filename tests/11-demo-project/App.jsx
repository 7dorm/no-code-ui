import React from 'react';
import Header from './components/Header';
import FeatureCard from './components/FeatureCard';
import './styles/App.css';
import ExtractedBlock from "./ExtractedBlock";
import Test from "./Test";
const cards = [{
  title: 'Быстрый старт',
  text: 'Один файл приложения, отдельные компоненты и подключенный CSS для проверки превью.'
}, {
  title: 'Проверка блоков',
  text: 'Карточки, кнопки и секции удобно использовать для теста выбора, dnd и редактирования стилей.'
}, {
  title: 'Минимум шума',
  text: 'Проект без внешних пакетов, чтобы ошибки было проще локализовать.'
}];
function App() {
  return <div className="demo-page">
      <Header />

      <main className="demo-content" style={{
      width: 471.2,
      height: 21.6,
      color: "#ffffffff"
    }}>
        <section className="hero-block">
          <span className="hero-badge">Demo Project</span>
          <h1 className="hero-title">Небольшой тестовый React-проект</h1>
          <p className="hero-text">
            Используйте этот пример для проверки редактора, импорта компонентов и изменения CSS.
          </p>

          <div className="hero-actions">
            <button className="primary-button">Primary Action</button>
            <button className="secondary-button">Secondary Action</button>
          </div>
        
        
      <Test style={{
          width: 120.7249984741211,
          height: 88.4000015258789,
          marginLeft: 3,
          marginTop: 34,
          marginRight: 0,
          marginBottom: 0
        }} />
        <Test style={{}} />
      </section>

        <section className="features-grid">
          {cards.map(card => <FeatureCard key={card.title} title={card.title} text={card.text} />)}
        </section>
      </main>
    </div>;
}
export default App;
