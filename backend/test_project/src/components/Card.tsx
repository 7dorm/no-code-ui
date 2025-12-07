import React from 'react';
import '../styles/card.css';

type Props = {
  title: string;
};

export default function Card({ title }: Props) {
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <p className="card-text">Some description text</p>
      <button className="card-button">Click me</button>
    </div>
  );
}
