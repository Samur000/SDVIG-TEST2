import React, { useState } from 'react';
import { Routine, DayOfWeek } from '../../types';
import { v4 as uuid } from 'uuid';
import './Forms.css';

interface RoutineFormProps {
  routine: Routine | null;
  onSave: (routine: Routine) => void;
  onCancel: () => void;
}

const ALL_DAYS: DayOfWeek[] = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export function RoutineForm({ routine, onSave, onCancel }: RoutineFormProps) {
  const [title, setTitle] = useState(routine?.title || '');
  const [description, setDescription] = useState(routine?.description || '');
  const [time, setTime] = useState(routine?.time || '');
  const [duration, setDuration] = useState<number>(routine?.duration || 30);
  const [days, setDays] = useState<DayOfWeek[]>(routine?.days || ALL_DAYS);
  
  const handleToggleDay = (day: DayOfWeek) => {
    if (days.includes(day)) {
      setDays(days.filter(d => d !== day));
    } else {
      setDays([...days, day]);
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || days.length === 0) return;
    if (duration < 10) return; // Минимум 10 минут
    
    onSave({
      id: routine?.id || uuid(),
      title: title.trim(),
      description: description.trim() || undefined,
      time: time || undefined,
      duration: duration >= 10 ? duration : 30,
      days,
      completed: routine?.completed || {}
    });
  };
  
  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Название</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Например: Утренняя зарядка"
          required
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">Описание (опционально)</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Добавьте описание рутины..."
          rows={3}
        />
      </div>
      
      <div className="form-group">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">Время (опционально)</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">Продолжительность (минуты)</label>
            <input
              type="number"
              min="10"
              step="5"
              value={duration}
              onChange={e => {
                const value = parseInt(e.target.value) || 10;
                setDuration(Math.max(10, value));
              }}
              placeholder="30"
            />
          </div>
        </div>
        <small style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
          Минимум 10 минут
        </small>
      </div>
      
      <div className="form-group">
        <label className="form-label">Дни недели</label>
        <div className="days-selector">
          {ALL_DAYS.map(day => (
            <button
              key={day}
              type="button"
              className={`day-btn ${days.includes(day) ? 'active' : ''}`}
              onClick={() => handleToggleDay(day)}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
      
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Отмена
        </button>
        <button 
          type="submit" 
          className="btn btn-primary filled"
          disabled={!title.trim() || days.length === 0}
        >
          Сохранить
        </button>
      </div>
    </form>
  );
}

