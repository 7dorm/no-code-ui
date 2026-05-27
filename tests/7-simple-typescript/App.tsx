import React, { useMemo, useState } from 'react';
import { accentColor, panelStyle } from './theme';
import { formatPercentage, getStatusLabel } from './utils/task-helpers';
import type { TaskItem, TaskPriority } from './utils/task-helpers';
type FilterMode = 'all' | 'open' | 'done';
const initialTasks: TaskItem[] = [{
  id: 1,
  title: 'Check TSX rendering',
  done: true,
  priority: 'high'
}, {
  id: 2,
  title: 'Check .ts helper imports',
  done: false,
  priority: 'medium'
}, {
  id: 3,
  title: 'Check typed state updates',
  done: false,
  priority: 'low'
}];
const priorityOptions: TaskPriority[] = ['low', 'medium', 'high'];
const inputStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(15, 23, 42, 0.9)',
  color: '#fff',
  padding: '0 14px'
};
export default function App() {
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const visibleTasks = useMemo(() => {
    if (filter === 'open') return tasks.filter(task => !task.done);
    if (filter === 'done') return tasks.filter(task => task.done);
    return tasks;
  }, [filter, tasks]);
  const completion = useMemo(() => {
    if (tasks.length === 0) return '0%';
    const doneCount = tasks.filter(task => task.done).length;
    return formatPercentage(doneCount / tasks.length);
  }, [tasks]);
  const addTask = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
    setTasks(prev => [...prev, {
      id: Date.now(),
      title: normalizedTitle,
      done: false,
      priority
    }]);
    setTitle('');
    setPriority('medium');
  };
  const toggleTask = (id: number) => {
    setTasks(prev => prev.map(task => task.id === id ? {
      ...task,
      done: !task.done
    } : task));
  };
  return <div style={{
    minHeight: '100vh',
    padding: 24,
    background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
    color: '#e5e7eb',
    fontFamily: '"Segoe UI", sans-serif'
  }}>

      <div style={{
      maxWidth: 840,
      margin: '0 auto',
      display: 'grid',
      gap: 16
    }}>
        <section style={panelStyle}>
          <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>

            <div>
              <div style={{
              color: accentColor,
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: 'uppercase'
            }}>

                TypeScript Demo
              </div>
              <h1 style={{
              margin: '8px 0 4px',
              fontSize: 32
            }}>Typed Task Board</h1>
              <p style={{
              margin: 0,
              color: '#94a3b8'
            }}>
                Simple TS/TSX sample for preview, imports, and typed state checks.
              </p>
            </div>

            <div style={{
            minWidth: 160,
            padding: 16,
            borderRadius: 16,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            position: "relative",
            left: -132,
            width: 160,
            height: 53,
            marginLeft: "57.31166912850812%",
            marginTop: "4.726735598227474%",
            top: -11
          }}>

              <div style={{
              color: '#94a3b8',
              fontSize: 12
            }}>Completion</div>
              <div style={{
              fontSize: 28,
              fontWeight: 700,
              position: "absolute",
              left: 37.4765625,
              top: 24.23046875
            }}>{completion}</div>
            </div>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap'
        }}>
            <input type="text" value={title} onChange={event => setTitle(event.target.value)} placeholder="New task" style={{
            ...inputStyle,
            flex: 1,
            minWidth: 220
          }} />


            <select value={priority} onChange={event => setPriority(event.target.value as TaskPriority)} style={{
            ...inputStyle,
            padding: '0 12px'
          }}>

              {priorityOptions.map(option => <option key={option} value={option}>
                  {option}
                </option>)}
            </select>

            <select value={filter} onChange={event => setFilter(event.target.value as FilterMode)} style={{
            ...inputStyle,
            padding: '0 12px'
          }}>

              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>

            <button onClick={addTask} style={{
            height: 40,
            borderRadius: 10,
            border: 'none',
            background: accentColor,
            color: '#08111f',
            fontWeight: 700,
            padding: '0 16px',
            cursor: 'pointer'
          }}>

              Add task
            </button>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={{
          display: 'grid',
          gap: 12
        }}>
            {visibleTasks.map(task => <label key={task.id} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: 14,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            position: "relative",
            left: "",
            top: "",
            marginLeft: 3,
            marginTop: 3,
            width: 651,
            height: 20
          }}>

                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
                  <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} />


                  <div>
                    <div style={{
                  fontWeight: 600
                }}>{task.title}</div>
                    <div style={{
                  color: '#94a3b8',
                  fontSize: 12
                }}>
                      {getStatusLabel(task)}
                    </div>
                  </div>
                </div>

                <div style={{
              padding: '6px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: '#dbeafe',
              background: 'rgba(59, 130, 246, 0.18)',
              width: 26,
              height: 23
            }}>

                  {task.priority}
                </div>
              </label>)}
          </div>
        </section>
      </div>
    </div>;
}
