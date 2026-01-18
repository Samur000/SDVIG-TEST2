import React, { useState, useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Document } from '../../types';
import { v4 as uuid } from 'uuid';
import { useFormChanges } from '../../hooks/useFormChanges';
import './Forms.css';

interface DocumentFormProps {
  onSave: (doc: Document) => void;
  onCancel: () => void;
  onChangesChange?: (hasChanges: boolean) => void;
}

export interface DocumentFormHandle {
  hasChanges: boolean;
  save: () => void;
}

export const DocumentForm = forwardRef<DocumentFormHandle, DocumentFormProps>(({ onSave, onCancel, onChangesChange }, ref) => {
  const [name, setName] = useState('');
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Отслеживание изменений
  const initialValue = useMemo(() => ({
    name: '',
    imageBase64: undefined as string | undefined
  }), []);
  
  const { hasChanges } = useFormChanges(
    initialValue,
    () => ({
      name,
      imageBase64
    })
  );
  
  // Уведомление родителя об изменениях
  useEffect(() => {
    if (onChangesChange) {
      onChangesChange(hasChanges);
    }
  }, [hasChanges, onChangesChange]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Проверяем размер (макс 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл слишком большой. Максимум 5MB.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      setImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  const handleSave = () => {
    if (!name.trim()) return;
    
    onSave({
      id: uuid(),
      name: name.trim(),
      imageBase64
    });
  };
  
  // Экспорт hasChanges и save через ref
  useImperativeHandle(ref, () => ({
    hasChanges,
    save: handleSave
  }), [hasChanges, name, imageBase64]);
  
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
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Например: Паспорт"
          required
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">Изображение (опционально)</label>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }}
        />
        
        {imageBase64 ? (
          <div className="image-preview">
            <img src={imageBase64} alt="Preview" />
            <button 
              type="button" 
              className="remove-image"
              onClick={() => setImageBase64(undefined)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ) : (
          <button 
            type="button"
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Загрузить изображение
          </button>
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

