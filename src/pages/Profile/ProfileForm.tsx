import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Profile } from '../../types';
import { useFormChanges } from '../../hooks/useFormChanges';
import './Forms.css';

interface ProfileFormProps {
  profile: Profile;
  onSave: (profile: Profile) => void;
  onCancel: () => void;
  onChangesChange?: (hasChanges: boolean) => void;
}

export interface ProfileFormHandle {
  hasChanges: boolean;
  save: () => void;
}

const GOAL_SUGGESTIONS = ['Здоровье', 'Финансы', 'Развитие', 'Отношения', 'Карьера', 'Хобби'];

export const ProfileForm = forwardRef<ProfileFormHandle, ProfileFormProps>(({ profile, onSave, onCancel, onChangesChange }, ref) => {
  const [name, setName] = useState(profile.name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [goals, setGoals] = useState<string[]>(profile.goals || []);
  const [newGoal, setNewGoal] = useState('');
  
  // Отслеживание изменений
  const initialValue = useMemo(() => {
    return {
      name: profile.name || '',
      bio: profile.bio || '',
      goals: profile.goals || []
    };
  }, [profile]);
  
  const { hasChanges } = useFormChanges(
    initialValue,
    () => ({
      name,
      bio,
      goals: [...goals].sort()
    }),
    (a, b) => {
      return a.name === b.name &&
        a.bio === b.bio &&
        JSON.stringify([...a.goals].sort()) === JSON.stringify([...b.goals].sort());
    }
  );
  
  // Уведомление родителя об изменениях
  useEffect(() => {
    if (onChangesChange) {
      onChangesChange(hasChanges);
    }
  }, [hasChanges, onChangesChange]);
  
  const handleToggleGoal = (goal: string) => {
    if (goals.includes(goal)) {
      setGoals(goals.filter(g => g !== goal));
    } else if (goals.length < 3) {
      setGoals([...goals, goal]);
    }
  };
  
  const handleAddCustomGoal = () => {
    if (newGoal.trim() && goals.length < 3) {
      setGoals([...goals, newGoal.trim()]);
      setNewGoal('');
    }
  };
  
  const handleSave = () => {
    onSave({
      name: name.trim(),
      bio: bio.trim() || undefined,
      goals
    });
  };
  
  // Экспорт hasChanges и save через ref
  useImperativeHandle(ref, () => ({
    hasChanges,
    save: handleSave
  }), [hasChanges, name, bio, goals]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };
  
  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Имя</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Как тебя зовут?"
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">О себе (опционально)</label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="Пара слов о себе..."
          rows={2}
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">Цели (до 3)</label>
        <div className="goals-selector">
          {GOAL_SUGGESTIONS.map(goal => (
            <button
              key={goal}
              type="button"
              className={`goal-btn ${goals.includes(goal) ? 'active' : ''}`}
              onClick={() => handleToggleGoal(goal)}
              disabled={!goals.includes(goal) && goals.length >= 3}
            >
              {goal}
            </button>
          ))}
        </div>
        
        <div className="custom-goal">
          <input
            type="text"
            value={newGoal}
            onChange={e => setNewGoal(e.target.value)}
            placeholder="Своя цель..."
            disabled={goals.length >= 3}
          />
          <button 
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleAddCustomGoal}
            disabled={!newGoal.trim() || goals.length >= 3}
          >
            Добавить
          </button>
        </div>
        
        {goals.length > 0 && (
          <div className="selected-goals">
            {goals.map((goal, idx) => (
              <span key={idx} className="chip">
                {goal}
                <button 
                  type="button"
                  onClick={() => setGoals(goals.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      
      <div className="form-actions">
        <button type="button" className="btn text-danger" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
});

