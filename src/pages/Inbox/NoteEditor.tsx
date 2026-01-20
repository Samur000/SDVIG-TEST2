import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Idea, Folder } from '../../types';
import { Navigation } from '../../components/Layout/Navigation';
import './NoteEditor.css';

interface NoteEditorProps {
  idea: Idea;
  folders: Folder[];
  onSave: (idea: Idea) => void;
  onDelete: (id: string) => void;
  onMoveToFolder: (ideaId: string, folderId: string | null) => void;
  onAddToTask: (idea: Idea) => void;
  onAddToSchedule: (idea: Idea) => void;
}

export function NoteEditor({ 
  idea, 
  folders, 
  onSave, 
  onDelete, 
  onMoveToFolder,
  onAddToTask,
  onAddToSchedule
}: NoteEditorProps) {
  const navigate = useNavigate();
  const [text, setText] = useState(idea.text || '');
  const [showMenu, setShowMenu] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Инициализация текста
  useEffect(() => {
    const content = idea.title ? `${idea.title}\n${idea.text || ''}` : (idea.text || '');
    setText(content);
  }, [idea]);

  // Автосохранение при изменении текста (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedText = text.trim();
      // Не сохраняем пустые заметки
      if (!trimmedText) {
        return;
      }
      
      // Сравниваем с исходным содержимым
      const currentContent = idea.title ? `${idea.title}\n${idea.text || ''}` : (idea.text || '');
      if (text !== currentContent) {
        // Разделяем на строки БЕЗ фильтрации, чтобы сохранить пустые строки
        const allLines = text.split('\n');
        // Находим первую непустую строку для заголовка
        const firstNonEmptyLineIndex = allLines.findIndex(l => l.trim());
        const title = firstNonEmptyLineIndex >= 0 && allLines[firstNonEmptyLineIndex].trim().length <= 50 
          ? allLines[firstNonEmptyLineIndex].trim() 
          : undefined;
        // Весь остальной текст (включая пустые строки)
        const content = firstNonEmptyLineIndex >= 0 && allLines.length > firstNonEmptyLineIndex + 1
          ? allLines.slice(firstNonEmptyLineIndex + 1).join('\n')
          : (firstNonEmptyLineIndex >= 0 ? allLines[firstNonEmptyLineIndex] : text);
        
        const updatedIdea: Idea = {
          ...idea,
          title,
          text: content,
          updatedAt: new Date().toISOString()
        };
        onSave(updatedIdea);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [text, idea, onSave]);

  // Обработка клика в любом месте для открытия клавиатуры
  const handleClick = (e: React.MouseEvent) => {
    if (e.target === editorRef.current) {
      textareaRef.current?.focus();
      // Перемещаем курсор в конец текста
      if (textareaRef.current) {
        const length = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }
  };

  // Обработка изменения текста
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  // Обработка возврата назад
  const handleBack = () => {
    const currentContent = idea.title ? `${idea.title}\n${idea.text || ''}` : (idea.text || '');
    const trimmedText = text.trim();
    const hasContent = trimmedText.length > 0;

    // Новая пустая заметка, которую пользователь вообще не редактировал
    const isBrandNewEmpty =
      !idea.title &&
      (!idea.text || idea.text.trim() === '') &&
      !hasContent &&
      text === currentContent;

    // Удаляем только совсем новую и неотредактированную пустую заметку
    if (isBrandNewEmpty) {
      onDelete(idea.id);
      navigate(-1);
      return;
    }
    
    // Финальное сохранение перед уходом (для существующих или уже заполненных заметок)
    if (text !== currentContent) {
      // Разделяем на строки БЕЗ фильтрации, чтобы сохранить пустые строки
      const allLines = text.split('\n');
      // Находим первую непустую строку для заголовка
      const firstNonEmptyLineIndex = allLines.findIndex(l => l.trim());
      const title = firstNonEmptyLineIndex >= 0 && allLines[firstNonEmptyLineIndex].trim().length <= 50 
        ? allLines[firstNonEmptyLineIndex].trim() 
        : undefined;
      // Весь остальной текст (включая пустые строки)
      const content = firstNonEmptyLineIndex >= 0 && allLines.length > firstNonEmptyLineIndex + 1
        ? allLines.slice(firstNonEmptyLineIndex + 1).join('\n')
        : (firstNonEmptyLineIndex >= 0 ? allLines[firstNonEmptyLineIndex] : text);
      
      const updatedIdea: Idea = {
        ...idea,
        title,
        text: content,
        updatedAt: new Date().toISOString()
      };
      onSave(updatedIdea);
    }
    navigate(-1);
  };


  return (
    <div className="note-editor">
      {/* Хедер */}
      <div className="note-editor-header">
        <button className="note-editor-back" onClick={handleBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        
        <div style={{ position: 'relative' }}>
          <button 
            className="note-editor-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(true);
              setShowFolderMenu(false);
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          
          {/* Dropdown меню - основное */}
          {showMenu && !showFolderMenu && (
            <>
              <div className="note-editor-menu-overlay" onClick={() => setShowMenu(false)} />
              <div className="note-editor-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="note-editor-menu-content">
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowMenu(false);
                      // Небольшая задержка для плавного перехода
                      setTimeout(() => {
                        setShowFolderMenu(true);
                      }, 100);
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </span>
                    <span>Переместить в папку</span>
                  </button>
                  
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onAddToTask(idea);
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4"/>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                      </svg>
                    </span>
                    <span>Добавить в Задачи</span>
                  </button>
                  
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onAddToSchedule(idea);
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    </span>
                    <span>Добавить в Расписание</span>
                  </button>
                  
                  <button 
                    className="note-editor-menu-item danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      if (window.confirm('Удалить заметку?')) {
                        onDelete(idea.id);
                        navigate(-1);
                      }
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </span>
                    <span>Удалить</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Dropdown меню - выбор папки */}
          {showFolderMenu && (
            <>
              <div className="note-editor-menu-overlay" onClick={() => {
                setShowFolderMenu(false);
                setShowMenu(false);
              }} />
              <div className="note-editor-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="note-editor-menu-content">
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowFolderMenu(false);
                      // Небольшая задержка для плавного перехода
                      setTimeout(() => {
                        setShowMenu(true);
                      }, 100);
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                    </span>
                    <span>Назад</span>
                  </button>
                  <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onMoveToFolder(idea.id, null);
                      setShowFolderMenu(false);
                      setShowMenu(false);
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                      </svg>
                    </span>
                    <span>Инбокс</span>
                  </button>
                  {folders.filter(f => f.id !== 'inbox').map(folder => (
                    <button 
                      key={folder.id}
                      className="note-editor-menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onMoveToFolder(idea.id, folder.id);
                        setShowFolderMenu(false);
                        setShowMenu(false);
                      }}
                    >
                      <span 
                        className="note-editor-menu-icon"
                        style={{ color: folder.color, fontSize: '20px' }}
                      >
                        {folder.icon}
                      </span>
                      <span>{folder.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Рабочая область */}
      <div 
        className="note-editor-canvas"
        ref={editorRef}
        onClick={handleClick}
      >
        <textarea
          ref={textareaRef}
          className="note-editor-textarea"
          value={text}
          onChange={handleTextChange}
          placeholder="Начните писать..."
          autoFocus
        />
      </div>

      {/* Нижняя навигация */}
      <Navigation />
    </div>
  );
}
