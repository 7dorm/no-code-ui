export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskItem {
  id: number;
  title: string;
  done: boolean;
  priority: TaskPriority;
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function getStatusLabel(task: TaskItem): string {
  const base = task.done ? 'Выполнено' : 'В работе';
  return `${base} · приоритет ${task.priority}`;
}
