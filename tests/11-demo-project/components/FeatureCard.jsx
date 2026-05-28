import React from 'react';

function FeatureCard({
  title = 'Новая возможность',
  text = 'Описание карточки доступно в панели переменных и может редактироваться в превью.',
}) {
  return (
    <article className="feature-card">
      <div className="feature-icon" />
      <h2 className="feature-title">{title}</h2>
      <p className="feature-text">{text}</p>
    </article>
  );
}

export default FeatureCard;
