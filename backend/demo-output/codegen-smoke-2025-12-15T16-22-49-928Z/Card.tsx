import React from 'react';
import '../styles/card.css';
import Header from './Header';

type Props = {
  title: string;
};

export default function Card({ title }: Props) {
  console.log("hello");
  return (
    <div className="card" data-codex-smoke="codex2">
      <h2 className="card-title">{title}</h2>
      <p className="card-text">Some description text</p>
      <button className="card-button">Click me</button>
    </div>);

}