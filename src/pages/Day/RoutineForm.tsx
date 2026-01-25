import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Routine, DayOfWeek } from '../../types';
import { v4 as uuid } from 'uuid';
import { formatDate } from '../../utils/date';
import { vibrate } from '../../utils/feedback';
import { useFormChanges } from '../../hooks/useFormChanges';
import './Forms.css';

interface RoutineFormProps {
  routine: Routine | null;
  onSave: (routine: Routine) => void;
  onCancel: () => void;
  onChangesChange?: (hasChanges: boolean) => void;
}

export interface RoutineFormHandle {
  hasChanges: boolean;
  save: () => void;
}

const ALL_DAYS: DayOfWeek[] = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export const RoutineForm = forwardRef<RoutineFormHandle, RoutineFormProps>(({ routine, onSave, onCancel, onChangesChange }, ref) => {
  const [title, setTitle] = useState(routine?.title || '');
  const [description, setDescription] = useState(routine?.description || '');
  const [time, setTime] = useState(routine?.time || '');
  const [durationStr, setDurationStr] = useState<string>(routine?.duration ? String(routine.duration) : '');
  const [days, setDays] = useState<DayOfWeek[]>(routine?.days || ALL_DAYS);
  const [durationError, setDurationError] = useState<string | null>(null);
  
  // Отслеживание изменений
  const initialValue = useMemo(() => {
    if (routine) {
      return {
        title: routine.title,
        description: routine.description || '',
        time: routine.time || '',
        durationStr: routine.duration ? String(routine.duration) : '',
        days: routine.days
      };
    } else {
      return {
        title: '',
        description: '',
        time: '',
        durationStr: '',
        days: ALL_DAYS
      };
    }
  }, [routine]);
  
  const { hasChanges } = useFormChanges(
    initialValue,
    () => ({
      title,
      description,
      time,
      durationStr,
      days: [...days].sort()
    }),
    (a, b) => {
      return a.title === b.title &&
        a.description === b.description &&
        a.time === b.time &&
        a.durationStr === b.durationStr &&
        JSON.stringify([...a.days].sort()) === JSON.stringify([...b.days].sort());
    }
  );
  
  // Уведомление родителя об изменениях
  useEffect(() => {
    if (onChangesChange) {
      onChangesChange(hasChanges);
    }
  }, [hasChanges, onChangesChange]);
  
  const handleToggleDay = (day: DayOfWeek) => {
    if (days.includes(day)) {
      setDays(days.filter(d => d !== day));
    } else {
      setDays([...days, day]);
    }
  };
  
  const handleSave = () => {
    if (!title.trim() || days.length === 0) return;
    
    // Проверка продолжительности
    const durationNum = durationStr ? parseInt(durationStr, 10) : undefined;
    if (durationStr && (!durationNum || durationNum < 10)) {
      setDurationError('Продолжительность должна быть минимум 10 минут');
      return;
    }
    setDurationError(null);
    
    // Вибрация при создании новой рутины
    if (!routine) {
      vibrate([10, 30, 10]);
    }
    
    onSave({
      id: routine?.id || uuid(),
      title: title.trim(),
      description: description.trim() || undefined,
      time: time || undefined,
      duration: durationNum && durationNum >= 10 ? durationNum : undefined,
      days,
      completed: routine?.completed || {},
      // При создании новой рутины устанавливаем дату создания
      createdAt: routine?.createdAt || formatDate(new Date())
    });
  };
  
  // Экспорт hasChanges и save через ref
  useImperativeHandle(ref, () => ({
    hasChanges,
    save: handleSave
  }), [hasChanges, title, description, time, durationStr, days]);
  
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
              value={durationStr}
              onChange={e => {
                setDurationStr(e.target.value);
                setDurationError(null);
              }}
              placeholder="60"
              style={durationError ? { borderColor: '#EF4444' } : undefined}
            />
          </div>
        </div>
        {durationError ? (
          <small style={{ color: '#EF4444', fontSize: '12px', marginTop: '4px', display: 'block' }}>
            {durationError}
          </small>
        ) : (
          <small style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
            Минимум 10 минут
          </small>
        )}
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
        <button type="button" className="btn text-danger" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
});

