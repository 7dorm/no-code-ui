import React, { useState } from 'react';
import Header from './components/Header';
import Button from './components/Button';
import Card from './components/Card';
import './styles/App.css';

/**
 * Полноценный React проект для тестирования
 * Включает компоненты, CSS стили, состояние
 */
export default function App() {
  const [tasks, setTasks] = useState([
  { id: 1, title: 'Протестировать HtmlFramework', completed: true },
  { id: 2, title: 'Протестировать ReactFramework', completed: false },
  { id: 3, title: 'Протестировать ReactNativeFramework', completed: false }]
  );
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

  const addTask = () => {
    if (newTaskTitle.trim()) {
      setTasks([
      ...tasks,
      { id: Date.now(), title: newTaskTitle, completed: false }]
      );
      setNewTaskTitle('');
    }
  };

  const toggleTask = (id) => {
    setTasks(tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  const filteredTasks = showCompleted ?
  tasks :
  tasks.filter((task) => !task.completed);

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  return (
    <div className="app">
      <Header
        title="React Проект тест"
        subtitle="Полноценное приложение с компонентами и стилями" />


      <div className="container">
        <div className="stats">
          <Card>
            <h3>Статистика</h3>
            <p className="stats-text">
              Выполнено: <strong>{completedCount}</strong> из <strong>{totalCount}</strong>
            </p>
            <p className="stats-text">
              Прогресс: <strong>{totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0}%</strong>
            </p>
          </Card>
        



        </div>

        <Card>
          <h3>Добавить задачу</h3>
          <div className="add-task-form" style={{ fontSize: "1em", backgroundColor: "black", backgroungColor: "white" }}>
            <input
              type="text"
              className="task-input"
              placeholder="Название задачи..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTask()} />

            <Button onClick={addTask} variant="primary">
              Добавить
            </Button>
          </div>
        </Card>

        <Card>
          <div className="tasks-header">
            <h3>Задачи</h3>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)} />

              <span>Показывать выполненные</span>
            </label>
          </div>

          <div className="tasks-list">
            {filteredTasks.length === 0 ?
            <p className="empty-message">Нет задач для отображения</p> :

            filteredTasks.map((task) =>
            <div
              key={task.id}
              className={`task-item ${task.completed ? 'completed' : ''}`}>

                  <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleTask(task.id)}
                className="task-checkbox" />

                  <span className="task-title">{task.title}</span>
                  <Button
                onClick={() => deleteTask(task.id)}
                variant="danger"
                size="small">

                    Удалить
                  </Button>
                </div>
            )
            }
          </div>
        </Card>

        <Card>
          <h3 style={{ position: "relative", left: 10, top: -4 }}>О проекте</h3>
          <p className="info-text">
            Этот проект тестирует ReactFramework с несколькими компонентами,
            внешними CSS файлами и управлением состоянием.
          </p>
          <div className="features-list">
            <div className="feature-item">✓ Компоненты Header, Button, Card</div>
            <div className="feature-item">✓ Внешние CSS стили</div>
            <div className="feature-item">✓ Управление состоянием через useState</div>
            <div className="feature-item">✓ Обработка зависимостей</div>
          </div>
        </Card>
      </div>
    

    </div>);

}