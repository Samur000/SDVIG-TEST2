import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Task, TaskPriority, TaskTimeEstimate } from '../../types';
import { getToday } from '../../utils/date';
import { v4 as uuid } from 'uuid';
import { useFormChanges } from '../../hooks/useFormChanges';
import './Forms.css';

interface TaskFormProps {
  task: Task | null;
  onSave: (task: Task) => void;
  onCancel: () => void;
  onChangesChange?: (hasChanges: boolean) => void;
}

export interface TaskFormHandle {
  hasChanges: boolean;
  save: () => void;
}

const TIME_ESTIMATES: { value: TaskTimeEstimate; label: string }[] = [
  { value: null, label: 'Не указано' },
  { value: 5, label: '5 мин' },
  { value: 15, label: '15 мин' },
  { value: 30, label: '30 мин' },
  { value: 60, label: '1 час' },
];

export const TaskForm = forwardRef<TaskFormHandle, TaskFormProps>(({ task, onSave, onCancel, onChangesChange }, ref) => {
  const [title, setTitle] = useState(task?.title || '');
  const [date, setDate] = useState(task?.date || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'normal');
  const [timeEstimate, setTimeEstimate] = useState<TaskTimeEstimate>(task?.timeEstimate || null);
  
  // Отслеживание изменений
  const initialValue = useMemo(() => {
    if (task) {
      return {
        title: task.title,
        date: task.date || '',
        priority: task.priority || 'normal',
        timeEstimate: task.timeEstimate || null
      };
    } else {
      return {
        title: '',
        date: '',
        priority: 'normal' as TaskPriority,
        timeEstimate: null as TaskTimeEstimate
      };
    }
  }, [task]);
  
  const { hasChanges } = useFormChanges(
    initialValue,
    () => ({
      title,
      date,
      priority,
      timeEstimate
    })
  );
  
  // Уведомление родителя об изменениях
  useEffect(() => {
    if (onChangesChange) {
      onChangesChange(hasChanges);
    }
  }, [hasChanges, onChangesChange]);
  
  const handleSave = () => {
    if (!title.trim()) return;
    
    onSave({
      id: task?.id || uuid(),
      title: title.trim(),
      completed: task?.completed || false,
      date: date || undefined,
      priority,
      timeEstimate: timeEstimate || undefined,
      parentId: task?.parentId,
      createdAt: task?.createdAt || new Date().toISOString()
    });
  };
  
  // Экспорт hasChanges и save через ref
  useImperativeHandle(ref, () => ({
    hasChanges,
    save: handleSave
  }), [hasChanges, title, date, priority, timeEstimate]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };
  
  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Название</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Что нужно сделать?"
          required
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">Дата (опционально)</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          min={getToday()}
        />
        <p className="form-hint">Оставьте пустым для "Когда-нибудь"</p>
      </div>
      
      <div className="form-group">
        <label className="form-label">Приоритет</label>
        <div className="priority-toggle">
          <button
            type="button"
            className={`priority-btn ${priority === 'normal' ? 'active' : ''}`}
            onClick={() => setPriority('normal')}
          >
            Обычный
          </button>
          <button
            type="button"
            className={`priority-btn important ${priority === 'important' ? 'active' : ''}`}
            onClick={() => setPriority('important')}
          >
            Важный
          </button>
        </div>
      </div>
      
      <div className="form-group">
        <label className="form-label">Оценка времени</label>
        <div className="time-estimates">
          {TIME_ESTIMATES.map(opt => (
            <button
              key={opt.value || 'none'}
              type="button"
              className={`time-btn ${timeEstimate === opt.value ? 'active' : ''}`}
              onClick={() => setTimeEstimate(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="form-actions">
        <button type="button" className="btn text-danger" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
});

