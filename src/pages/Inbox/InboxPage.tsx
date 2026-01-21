import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/UI';
import { useApp } from '../../store/AppContext';
import { Idea, Folder } from '../../types';
import { v4 as uuid } from 'uuid';
import { NoteEditor } from './NoteEditor';
import './InboxPage.css';
import './NoteEditor.css';

// Форматирование времени из Date
const formatTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export function InboxPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { id: noteId } = useParams<{ id?: string }>();
  
  // Находим текущую заметку для редактирования
  const currentNote = noteId ? state.ideas.find(i => i.id === noteId) : null;
  
  // Состояние поиска
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  // Состояние поля ввода
  const [inputText, setInputText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderSelect, setShowFolderSelect] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const folderSelectRef = useRef<HTMLDivElement>(null);
  
  // Выбранная папка для фильтрации
  const [activeFolderId, setActiveFolderId] = useState<string | null>('inbox');
  
  // Состояние свернутости группы "Закреплено"
  const [isPinnedCollapsed, setIsPinnedCollapsed] = useState(false);
  
  // Модалки
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [showFullNoteModal, setShowFullNoteModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Idea | null>(null);
  const [showDeleteFolderConfirm, setShowDeleteFolderConfirm] = useState<Folder | null>(null);
  
  // Состояние для свайпов
  const swipeStartX = useRef<number>(0);
  const swipeStartY = useRef<number>(0);
  const swipeCurrentX = useRef<number>(0);
  const swipingIdeaId = useRef<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({});
  const isHorizontalSwipe = useRef<boolean>(false);

  // Получаем папки, сортируем по order
  const folders = useMemo(() => {
    return [...state.folders].sort((a, b) => a.order - b.order);
  }, [state.folders]);


  // Фильтрация заметок
  const filteredIdeas = useMemo(() => {
    let filtered = state.ideas.filter(idea => idea.status !== 'archived');

    // Фильтр по папке
    if (activeFolderId === 'inbox' || activeFolderId === null) {
      filtered = filtered.filter(idea => !idea.folderId || idea.folderId === 'inbox');
    } else {
      filtered = filtered.filter(idea => idea.folderId === activeFolderId);
    }

    // Фильтр по поиску
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(idea => {
        const title = (idea.title || '').toLowerCase();
        const text = idea.text.toLowerCase();
        const tags = idea.tags.join(' ').toLowerCase();
        return title.includes(query) || text.includes(query) || tags.includes(query);
      });
    }

    // Сортировка: закрепленные сверху, потом по дате (новые выше)
    return filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [state.ideas, activeFolderId, searchQuery]);

  // Закрытие выбора папки при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (folderSelectRef.current && !folderSelectRef.current.contains(e.target as Node)) {
        setShowFolderSelect(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Закрытие поиска при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        showSearch &&
        !target.closest('.inbox-search-container')
      ) {
        if (!searchQuery.trim()) {
          setShowSearch(false);
        }
      }
    };
    if (showSearch) {
      // Небольшая задержка, чтобы не закрывалось сразу при открытии
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSearch, searchQuery]);

  // Парсинг тегов из текста (теги через #)
  const parseTags = (text: string): string[] => {
    const tagRegex = /#(\w+)/g;
    const matches = text.matchAll(tagRegex);
    return Array.from(matches, m => m[1]);
  };

  // Обработка отправки заметки
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const tags = parseTags(inputText);
    // Оставляем теги в тексте, не удаляем их
    const text = inputText.trim();

    // Разделяем на заголовок и текст
    const lines = text.split('\n').filter(l => l.trim());
    const title = lines[0] && lines[0].length > 50 ? undefined : lines[0];
    const textContent = lines.length > 1 ? lines.slice(1).join('\n') : (lines[0] || '');

    const newIdea: Idea = {
      id: uuid(),
      title: title || undefined,
      text: textContent || '',
      tags,
      folderId: selectedFolderId || null,
      isPinned: false,
      status: 'inbox',
      createdAt: new Date().toISOString()
    };

    dispatch({ type: 'ADD_IDEA', payload: newIdea });
    setInputText('');
    setSelectedFolderId(null);
    setInputFocused(false);
    setShowFolderSelect(false);
  };

  // Обработка свайпов
  const handleTouchStart = (ideaId: string, e: React.TouchEvent) => {
    // Если начинаем свайп другой заметки, сбрасываем все предыдущие
    const currentSwiped = Object.keys(swipeOffset).find(id => swipeOffset[id] !== 0);
    if (currentSwiped && currentSwiped !== ideaId) {
      const updatedOffsets = { ...swipeOffset };
      updatedOffsets[currentSwiped] = 0;
      setSwipeOffset(updatedOffsets);
    }
    
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    swipeCurrentX.current = e.touches[0].clientX;
    swipingIdeaId.current = ideaId;
    isHorizontalSwipe.current = false; // Сбрасываем флаг
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (swipingIdeaId.current === null) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - swipeStartX.current;
    const diffY = Math.abs(currentY - swipeStartY.current);
    const absDiffX = Math.abs(diffX);
    
    // Если горизонтальное движение больше вертикального и больше порога - это горизонтальный свайп
    if (absDiffX > diffY && absDiffX > 10) {
      // Определяем что это горизонтальный свайп и блокируем вертикальный скролл
      if (!isHorizontalSwipe.current) {
        isHorizontalSwipe.current = true;
      }
      
      swipeCurrentX.current = currentX;
      
      // Ограничиваем свайп (влево = отрицательное, вправо = положительное)
      const maxSwipe = 80;
      setSwipeOffset({
        ...swipeOffset,
        [swipingIdeaId.current]: Math.max(-maxSwipe, Math.min(maxSwipe, diffX))
      });
    } else if (isHorizontalSwipe.current) {
      isHorizontalSwipe.current = false;
    }
    // Если это вертикальный жест - ничего не делаем, позволяем скроллить
  };

  const handleTouchEnd = (ideaId: string, e?: React.TouchEvent) => {
    if (swipingIdeaId.current !== ideaId) return;
    
    // Если был горизонтальный свайп и есть событие, блокируем всплытие
    if (isHorizontalSwipe.current && e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const offset = swipeOffset[ideaId] || 0;
    
    // Сбрасываем все другие свайпнутые элементы
    const updatedOffsets: Record<string, number> = {};
    Object.keys(swipeOffset).forEach(id => {
      if (id !== ideaId) {
        updatedOffsets[id] = 0;
      }
    });
    
    // Если свайпнули влево больше 50px - показываем кнопку удаления
    // Если свайпнули вправо больше 50px - показываем кнопку закрепления
    // Оставляем карточку в позиции если свайп был достаточно сильным
    if (Math.abs(offset) < 50) {
      // Сброс позиции если свайп был слишком слабым
      updatedOffsets[ideaId] = 0;
    } else {
      // Фиксируем позицию
      const targetOffset = offset < 0 ? -80 : 80;
      updatedOffsets[ideaId] = targetOffset;
    }
    
    setSwipeOffset(updatedOffsets);
    swipingIdeaId.current = null;
    isHorizontalSwipe.current = false; // Сбрасываем флаг
  };

  // Обработка клика на кнопку удаления (при свайпе влево)
  const handleDeleteClick = (ideaId: string) => {
    if (window.confirm('Удалить заметку?')) {
      dispatch({ type: 'DELETE_IDEA', payload: ideaId });
      setSwipeOffset({
        ...swipeOffset,
        [ideaId]: 0
      });
    }
  };

  // Обработка клика на кнопку закрепления (при свайпе вправо)
  const handlePinClick = (ideaId: string) => {
    dispatch({ type: 'TOGGLE_IDEA_PIN', payload: ideaId });
    setSwipeOffset({
      ...swipeOffset,
      [ideaId]: 0
    });
  };

  // Сброс свайпа при клике вне карточки
  const handleItemClick = (ideaId: string, e: React.MouseEvent) => {
    const offset = swipeOffset[ideaId] || 0;
    if (Math.abs(offset) > 0) {
      e.preventDefault();
      e.stopPropagation();
      // Сбрасываем все свайпнутые элементы
      const updatedOffsets: Record<string, number> = {};
      Object.keys(swipeOffset).forEach(id => {
        updatedOffsets[id] = 0;
      });
      setSwipeOffset(updatedOffsets);
    }
  };

  // Форматирование времени создания (показываем только время)
  const formatIdeaTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return formatTime(date);
  };

  // Получение названия группы для заметки
  const getNoteGroup = (dateStr: string): { key: string; label: string } => {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ideaDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    // Сегодня
    if (ideaDate.getTime() === today.getTime()) {
      return { key: 'today', label: 'Сегодня' };
    }
    
    // Предыдущие 7 дней
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (ideaDate >= sevenDaysAgo && ideaDate < today) {
      return { key: 'last7days', label: 'Предыдущие 7 дней' };
    }
    
    // Предыдущие 30 дней
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (ideaDate >= thirtyDaysAgo && ideaDate < sevenDaysAgo) {
      return { key: 'last30days', label: 'Предыдущие 30 дней' };
    }
    
    // Старше 30 дней - месяц и год
    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    const monthName = monthNames[date.getMonth()];
    const year = date.getFullYear();
    const key = `${year}-${date.getMonth()}`;
    return { key, label: `${monthName} ${year}` };
  };

  // Группировка заметок
  const groupedIdeas = useMemo(() => {
    // Разделяем закрепленные и незакрепленные заметки
    const pinnedIdeas = filteredIdeas.filter(idea => idea.isPinned);
    const unpinnedIdeas = filteredIdeas.filter(idea => !idea.isPinned);
    
    const groups: Record<string, Idea[]> = {};
    
    // Группируем незакрепленные заметки
    unpinnedIdeas.forEach(idea => {
      const group = getNoteGroup(idea.createdAt);
      if (!groups[group.key]) {
        groups[group.key] = [];
      }
      groups[group.key].push(idea);
    });
    
    // Определяем порядок групп
    const groupOrder = ['today', 'last7days', 'last30days'];
    
    // Сортируем ключи групп для незакрепленных
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const aIndex = groupOrder.indexOf(a);
      const bIndex = groupOrder.indexOf(b);
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      // Для групп с месяцами сортируем по убыванию (новые выше)
      return b.localeCompare(a);
    });
    
    const unpinnedGroups = sortedKeys.map(key => ({
      key,
      label: getNoteGroup(groups[key][0].createdAt).label,
      ideas: groups[key],
      isPinned: false
    }));
    
    // Если есть закрепленные заметки, добавляем их группу первой
    const result = [];
    if (pinnedIdeas.length > 0) {
      result.push({
        key: 'pinned',
        label: 'Закреплено',
        ideas: pinnedIdeas,
        isPinned: true
      });
    }
    
    return [...result, ...unpinnedGroups];
  }, [filteredIdeas]);

  // Обработчики для NoteEditor
  const handleNoteSave = (idea: Idea) => {
    dispatch({ type: 'UPDATE_IDEA', payload: idea });
  };

  const handleNoteDelete = (id: string) => {
    dispatch({ type: 'DELETE_IDEA', payload: id });
  };

  const handleNoteMoveToFolder = (ideaId: string, folderId: string | null) => {
    dispatch({ type: 'MOVE_IDEA_TO_FOLDER', payload: { id: ideaId, folderId } });
  };

  const handleNoteAddToTask = (idea: Idea) => {
    dispatch({
      type: 'ADD_TASK',
      payload: {
        id: uuid(),
        title: idea.title || idea.text || 'Новая задача',
        completed: false,
        priority: 'normal',
        createdAt: new Date().toISOString()
      }
    });
  };

  const handleNoteAddToSchedule = (idea: Idea) => {
    const today = new Date();
    const startTime = new Date(today);
    startTime.setHours(9, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);
    
    dispatch({
      type: 'ADD_EVENT',
      payload: {
        id: uuid(),
        title: idea.title || idea.text || 'Новое событие',
        startTime,
        endTime,
        color: '#4285F4',
        completed: false
      }
    });
  };

  // Если открыт редактор заметки
  if (currentNote) {
    return (
      <NoteEditor
        idea={currentNote}
        folders={folders}
        onSave={handleNoteSave}
        onDelete={handleNoteDelete}
        onMoveToFolder={handleNoteMoveToFolder}
        onAddToTask={handleNoteAddToTask}
        onAddToSchedule={handleNoteAddToSchedule}
        onTogglePin={(id) => dispatch({ type: 'TOGGLE_IDEA_PIN', payload: id })}
      />
    );
  }

  return (
    <Layout 
      title="Заметки"
      headerRight={
        <button 
          className="header-add-btn"
          onClick={() => {
            // Создаем новую заметку и сразу открываем редактор
            const newIdea: Idea = {
              id: uuid(),
              title: undefined,
              text: '',
              tags: [],
              folderId: activeFolderId === 'inbox' ? null : activeFolderId,
              isPinned: false,
              status: 'inbox',
              createdAt: new Date().toISOString()
            };
            dispatch({ type: 'ADD_IDEA', payload: newIdea });
            navigate(`/inbox/note/${newIdea.id}`);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      }
    >
      {/* Зона 1: Хедер и Поиск */}
      <div className="inbox-header">
        <div className="inbox-header-top">
          <div className="inbox-search-container">
            {showSearch && (
              <div className="inbox-search-input-wrapper">
                <input
                  type="text"
                  className="inbox-search-input"
                  placeholder="Поиск заметок..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  onBlur={(e) => {
                    // Не скрываем если кликнули на кнопку очистки или поиска
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    if (!relatedTarget || (!relatedTarget.closest('.inbox-search-clear') && !relatedTarget.closest('.inbox-search-btn'))) {
                      // Задержка для обработки клика по кнопке поиска
                      setTimeout(() => {
                        const activeElement = document.activeElement as HTMLElement;
                        if (!activeElement || (activeElement !== e.target && !activeElement.closest('.inbox-search-container'))) {
                          if (!searchQuery.trim()) {
                            setShowSearch(false);
                          }
                        }
                      }, 150);
                    }
                  }}
                />
                {searchQuery && (
                  <button 
                    type="button"
                    className="inbox-search-clear"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSearchQuery('');
                      const input = document.querySelector('.inbox-search-input') as HTMLInputElement;
                      input?.focus();
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            <button 
              className="inbox-search-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!showSearch) {
                  setShowSearch(true);
                  // Фокус на инпут после анимации
                  setTimeout(() => {
                    const input = document.querySelector('.inbox-search-input') as HTMLInputElement;
                    input?.focus();
                  }, 100);
                } else {
                  if (searchQuery.trim()) {
                    setSearchQuery('');
                    const input = document.querySelector('.inbox-search-input') as HTMLInputElement;
                    input?.focus();
                  } else {
                    setShowSearch(false);
                  }
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Горизонтальный скролл папок */}
        <div className="inbox-folders-scroll">
          <div className="inbox-folders">
            {/* Инбокс */}
            <button
              className={`inbox-folder-chip ${activeFolderId === 'inbox' || activeFolderId === null ? 'active' : ''}`}
              onClick={() => setActiveFolderId('inbox')}
            >
              <span className="inbox-folder-icon">📥</span>
              <span className="inbox-folder-name">Инбокс</span>
            </button>
            
            {/* Остальные папки */}
            {folders
              .filter(f => f.id !== 'inbox')
              .map(folder => (
                <div key={folder.id} className="inbox-folder-chip-wrapper">
                  <button
                    className={`inbox-folder-chip ${activeFolderId === folder.id ? 'active' : ''}`}
                    onClick={() => setActiveFolderId(folder.id)}
                  >
                    <span 
                      className="inbox-folder-dot" 
                      style={{ backgroundColor: folder.color }}
                    />
                    <span className="inbox-folder-icon">{folder.icon}</span>
                    <span className="inbox-folder-name">{folder.name}</span>
                  </button>
                  <button
                    className="inbox-folder-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFolder(folder);
                    }}
                    title="Редактировать папку"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
              ))}
            
            {/* Кнопка добавления папки */}
            <button
              className="inbox-folder-chip inbox-folder-add"
              onClick={() => setShowFolderModal(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Зона 2: Поле ввода (Smart Input) */}
      <div className={`inbox-input-wrapper ${inputFocused ? 'focused' : ''}`}>
        <form onSubmit={handleSubmit} className="inbox-smart-input">
          <textarea
            ref={inputRef}
            className="inbox-smart-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={(e) => {
              // Проверяем, не кликнули ли мы на контролы внутри формы
              const relatedTarget = e.relatedTarget as HTMLElement;
              const clickedInsideControls = relatedTarget?.closest('.inbox-input-controls') ||
                                          relatedTarget?.closest('.inbox-folder-select-wrapper') ||
                                          relatedTarget?.closest('label[for]') ||
                                          relatedTarget?.tagName === 'INPUT' && relatedTarget.getAttribute('type') === 'file';
              
              // Задержка для обработки кликов по кнопкам
              setTimeout(() => {
                const activeElement = document.activeElement as HTMLElement;
                // Если активный элемент внутри контролов или это input file, не скрываем
                if (!activeElement || 
                    !activeElement.closest('.inbox-input-controls') && 
                    !activeElement.closest('.inbox-folder-select-wrapper') &&
                    !clickedInsideControls) {
                  setInputFocused(false);
                }
              }, 200);
            }}
            placeholder="Быстрая мысль... (#тег для добавления тега)"
            rows={inputFocused ? 4 : 2}
          />
          
          {inputFocused && (
            <div className="inbox-input-controls">
              <div className="inbox-input-buttons">
                {/* Выбор папки */}
                <div className="inbox-folder-select-wrapper" ref={folderSelectRef}>
                  <button
                    type="button"
                    className="inbox-input-btn"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowFolderSelect(!showFolderSelect);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>{folders.find(f => f.id === (selectedFolderId || 'inbox'))?.name || 'Инбокс'}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px', marginLeft: '4px' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  
                  {showFolderSelect && (
                    <div className="inbox-folder-select-dropdown" onMouseDown={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`inbox-folder-select-item ${selectedFolderId === null ? 'active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedFolderId(null);
                          setShowFolderSelect(false);
                        }}
                      >
                        <span className="inbox-folder-select-icon">📥</span>
                        <span>Инбокс</span>
                      </button>
                      {folders.filter(f => f.id !== 'inbox').map(folder => (
                        <button
                          key={folder.id}
                          type="button"
                          className={`inbox-folder-select-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedFolderId(folder.id);
                            setShowFolderSelect(false);
                          }}
                        >
                          <span 
                            className="inbox-folder-select-dot" 
                            style={{ backgroundColor: folder.color }}
                          />
                          <span className="inbox-folder-select-icon">{folder.icon}</span>
                          <span>{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              <button
                type="submit"
                className="btn btn-primary filled inbox-save-btn"
                disabled={!inputText.trim()}
              >
                Сохранить
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Зона 3: Список заметок */}
      <div className="inbox-notes-list">
        {filteredIdeas.length === 0 ? (
          <EmptyState
            title={searchQuery ? "Ничего не найдено" : "Пусто"}
            text={searchQuery ? "Попробуйте другой запрос" : "Запиши первую мысль"}
            icon="📝"
          />
        ) : (
          <div className="inbox-notes-list-simple">
            {groupedIdeas.map(group => {
              const isPinnedGroup = group.isPinned;
              const isCollapsed = isPinnedGroup && isPinnedCollapsed;
              
              return (
                <div key={group.key} className="inbox-notes-group">
                  <div 
                    className={`inbox-notes-group-header ${isPinnedGroup ? 'clickable' : ''}`}
                    onClick={isPinnedGroup ? () => setIsPinnedCollapsed(!isPinnedCollapsed) : undefined}
                  >
                    <span>{group.label}</span>
                    {isPinnedGroup && (
                      <svg 
                        className="inbox-notes-group-chevron"
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        style={{
                          transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.3s ease'
                        }}
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    )}
                  </div>
                  <div 
                    className="inbox-notes-group-content"
                    style={{
                      maxHeight: isCollapsed ? '0' : '1000px',
                      overflow: 'hidden',
                      transition: 'max-height 0.3s ease'
                    }}
                  >
                    {group.ideas.map(idea => {
                      const offset = swipeOffset[idea.id] || 0;
                      const folder = idea.folderId ? folders.find(f => f.id === idea.folderId) : null;
                      const title = idea.title || idea.text || 'Без названия';
                      const titleDisplay = title.length > 60 ? title.substring(0, 60) + '...' : title;

                      return (
                        <div key={idea.id} className="inbox-note-item-wrapper">
                          {/* Кнопка удаления (справа, показывается при свайпе влево) */}
                          {offset < -40 && (
                            <div className="inbox-swipe-action-btn delete" onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(idea.id);
                            }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              </svg>
                            </div>
                          )}

                          {/* Кнопка закрепления (слева, показывается при свайпе вправо) */}
                          {offset > 40 && (
                            <div className="inbox-swipe-action-btn pin" onClick={(e) => {
                              e.stopPropagation();
                              handlePinClick(idea.id);
                            }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 17v5M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                              </svg>
                            </div>
                          )}

                          <div
                            className={`inbox-note-item ${idea.isPinned ? 'pinned' : ''}`}
                            onTouchStart={(e) => handleTouchStart(idea.id, e)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={(e) => handleTouchEnd(idea.id, e)}
                            onClick={(e) => handleItemClick(idea.id, e)}
                            style={{
                              transform: `translateX(${offset}px)`,
                              transition: swipingIdeaId.current === idea.id ? 'none' : 'transform 0.2s ease'
                            }}
                          >
                            <div
                              className="inbox-note-item-content"
                              onClick={() => {
                                if (Math.abs(offset) < 10) {
                                  navigate(`/inbox/note/${idea.id}`);
                                }
                              }}
                            >
                            <div className="inbox-note-item-main">
                              <span className="inbox-note-item-title">
                                {titleDisplay === 'Без названия' ? (
                                  <span style={{ color: 'var(--text-tertiary)' }}>Без названия</span>
                                ) : (
                                  titleDisplay
                                )}
                              </span>
                              <div className="inbox-note-item-meta">
                                <span className="inbox-note-item-date">
                                  {isPinnedGroup ? 'Закреплено' : formatIdeaTime(idea.createdAt)}
                                </span>
                                {folder && folder.id !== 'inbox' && (
                                  <span 
                                    className="inbox-note-item-folder"
                                    style={{ 
                                      backgroundColor: folder.color + '20',
                                      color: folder.color 
                                    }}
                                    title={folder.name}
                                  >
                                    {folder.icon}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <svg className="inbox-note-item-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </div>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Модалка полноценной заметки */}
      <Modal
        isOpen={showFullNoteModal}
        onClose={() => setShowFullNoteModal(false)}
        title="Новая заметка"
        size="lg"
      >
        <FullNoteForm
          onSave={(idea) => {
            dispatch({ type: 'ADD_IDEA', payload: idea });
            setShowFullNoteModal(false);
          }}
          onCancel={() => setShowFullNoteModal(false)}
          folders={folders}
        />
      </Modal>

      {/* Модалка действий с заметкой */}
      <Modal
        isOpen={!!selectedIdea}
        onClose={() => setSelectedIdea(null)}
        title="Действия с заметкой"
      >
        {selectedIdea && (
          <IdeaActionsModal
            idea={selectedIdea}
            folders={folders}
            onEdit={(idea) => {
              setEditingIdea(idea);
              setSelectedIdea(null);
            }}
            onDelete={(idea) => {
              setShowDeleteConfirm(idea);
              setSelectedIdea(null);
            }}
            onTogglePin={(id) => {
              dispatch({ type: 'TOGGLE_IDEA_PIN', payload: id });
            }}
            onMoveToFolder={(id, folderId) => {
              dispatch({ type: 'MOVE_IDEA_TO_FOLDER', payload: { id, folderId } });
              setSelectedIdea(null);
            }}
            onAddToTodo={(idea) => {
              dispatch({
                type: 'ADD_TASK',
                payload: {
                  id: uuid(),
                  title: idea.title || idea.text,
                  completed: false,
                  priority: 'normal'
                }
              });
              dispatch({
                type: 'UPDATE_IDEA',
                payload: { ...idea, status: 'archived' }
              });
              setSelectedIdea(null);
            }}
            onAddToSchedule={(idea) => {
              const today = new Date();
              const startTime = new Date(today);
              startTime.setHours(9, 0, 0, 0);
              const endTime = new Date(startTime);
              endTime.setHours(startTime.getHours() + 1);
              
              dispatch({
                type: 'ADD_EVENT',
                payload: {
                  id: uuid(),
                  title: idea.title || idea.text,
                  startTime,
                  endTime,
                  color: '#4285F4',
                  completed: false
                }
              });
              dispatch({
                type: 'UPDATE_IDEA',
                payload: { ...idea, status: 'archived' }
              });
              setSelectedIdea(null);
            }}
          />
        )}
      </Modal>

      {/* Модалка редактирования заметки */}
      <Modal
        isOpen={!!editingIdea}
        onClose={() => setEditingIdea(null)}
        title="Редактировать заметку"
        size="lg"
      >
        {editingIdea && (
          <EditNoteForm
            idea={editingIdea}
            onSave={(idea) => {
              dispatch({ type: 'UPDATE_IDEA', payload: idea });
              setEditingIdea(null);
            }}
            onCancel={() => setEditingIdea(null)}
            folders={folders}
          />
        )}
      </Modal>

      {/* Модалка подтверждения удаления */}
      <Modal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title="Удалить заметку?"
      >
        {showDeleteConfirm && (
          <div className="delete-confirm-modal">
            <p>Вы уверены, что хотите удалить эту заметку? Это действие нельзя отменить.</p>
            {showDeleteConfirm.title && <p className="delete-confirm-preview"><strong>{showDeleteConfirm.title}</strong></p>}
            {showDeleteConfirm.text && <p className="delete-confirm-preview">{showDeleteConfirm.text}</p>}
            <div className="delete-confirm-actions">
              <button
                className="btn text-danger"
                onClick={() => setShowDeleteConfirm(null)}
              >
                Отмена
              </button>
              <button
                className="btn btn-danger filled"
                onClick={() => {
                  dispatch({ type: 'DELETE_IDEA', payload: showDeleteConfirm.id });
                  setShowDeleteConfirm(null);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Модалка создания папки */}
      <Modal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        title="Новая папка"
      >
        <FolderForm
          folder={null}
          onSave={(folder) => {
            dispatch({ type: 'ADD_FOLDER', payload: folder });
            setShowFolderModal(false);
          }}
          onCancel={() => setShowFolderModal(false)}
          onDelete={null}
        />
      </Modal>

      {/* Модалка редактирования папки */}
      <Modal
        isOpen={!!editingFolder}
        onClose={() => setEditingFolder(null)}
        title="Редактировать папку"
      >
        {editingFolder && (
          <FolderForm
            folder={editingFolder}
            onSave={(folder) => {
              dispatch({ type: 'UPDATE_FOLDER', payload: folder });
              setEditingFolder(null);
            }}
            onCancel={() => setEditingFolder(null)}
            onDelete={(folder) => {
              setShowDeleteFolderConfirm(folder);
              setEditingFolder(null);
            }}
          />
        )}
      </Modal>

      {/* Модалка подтверждения удаления папки */}
      <Modal
        isOpen={!!showDeleteFolderConfirm}
        onClose={() => setShowDeleteFolderConfirm(null)}
        title="Удалить папку?"
      >
        {showDeleteFolderConfirm && (
          <div className="delete-confirm-modal">
            <p>Вы уверены, что хотите удалить папку "{showDeleteFolderConfirm.name}"? Все заметки из этой папки будут перемещены в Инбокс.</p>
            <div className="delete-confirm-actions">
              <button
                className="btn text-danger"
                onClick={() => setShowDeleteFolderConfirm(null)}
              >
                Отмена
              </button>
              <button
                className="btn btn-danger filled"
                onClick={() => {
                  dispatch({ type: 'DELETE_FOLDER', payload: showDeleteFolderConfirm.id });
                  setShowDeleteFolderConfirm(null);
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

// Компонент формы редактирования заметки
interface EditNoteFormProps {
  idea: Idea;
  onSave: (idea: Idea) => void;
  onCancel: () => void;
  folders: Folder[];
}

function EditNoteForm({ idea, onSave, onCancel, folders }: EditNoteFormProps) {
  const [title, setTitle] = useState(idea.title || '');
  const [text, setText] = useState(idea.text || '');
  const [folderId, setFolderId] = useState<string | null>(idea.folderId || null);

  const parseTags = (text: string): string[] => {
    const tagRegex = /#(\w+)/g;
    const matches = text.matchAll(tagRegex);
    return Array.from(matches, m => m[1]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const newTags = parseTags(text);
    // Оставляем теги в тексте
    const textContent = text.trim();

    // Разделяем на заголовок и текст
    const lines = textContent.split('\n').filter(l => l.trim());
    const titleValue = title.trim() || undefined;
    const textValue = lines.length > 1 ? lines.slice(1).join('\n') : (lines[0] || '');

    const updatedIdea: Idea = {
      ...idea,
      title: titleValue,
      text: textValue || '',
      tags: newTags,
      folderId: folderId || null,
      updatedAt: new Date().toISOString()
    };

    onSave(updatedIdea);
  };

  return (
    <form onSubmit={handleSubmit} className="full-note-form">
      <div className="form-group">
        <label className="form-label">Заголовок (необязательно)</label>
        <input
          type="text"
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Краткое название..."
        />
      </div>

      <div className="form-group">
        <label className="form-label">Текст</label>
        <textarea
          className="form-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст заметки... (#тег для добавления тега)"
          rows={6}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Папка</label>
        <select
          className="form-select"
          value={folderId || 'inbox'}
          onChange={(e) => setFolderId(e.target.value === 'inbox' ? null : e.target.value)}
        >
          {folders.map(folder => (
            <option key={folder.id} value={folder.id}>
              {folder.icon} {folder.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-actions">
        <button type="button" className="btn text-danger" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="btn btn-primary filled">
          Сохранить
        </button>
      </div>
    </form>
  );
}

// Компонент формы полноценной заметки
interface FullNoteFormProps {
  onSave: (idea: Idea) => void;
  onCancel: () => void;
  folders: Folder[];
}

function FullNoteForm({ onSave, onCancel, folders }: FullNoteFormProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [folderId, setFolderId] = useState<string | null>(null);

  const parseTags = (text: string): string[] => {
    const tagRegex = /#(\w+)/g;
    const matches = text.matchAll(tagRegex);
    return Array.from(matches, m => m[1]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const newTags = parseTags(text);
    // Оставляем теги в тексте
    const textContent = text.trim();

    // Разделяем на заголовок и текст
    const lines = textContent.split('\n').filter(l => l.trim());
    const titleValue = title.trim() || undefined;
    const textValue = lines.length > 1 ? lines.slice(1).join('\n') : (lines[0] || '');

    const newIdea: Idea = {
      id: uuid(),
      title: titleValue,
      text: textValue || '',
      tags: newTags,
      folderId: folderId || null,
      isPinned: false,
      status: 'inbox',
      createdAt: new Date().toISOString()
    };

    onSave(newIdea);
  };

  return (
    <form onSubmit={handleSubmit} className="full-note-form">
      <div className="form-group">
        <label className="form-label">Заголовок (необязательно)</label>
        <input
          type="text"
          className="form-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Краткое название..."
        />
      </div>

      <div className="form-group">
        <label className="form-label">Текст</label>
        <textarea
          className="form-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст заметки... (#тег для добавления тега)"
          rows={6}
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Папка</label>
        <select
          className="form-select"
          value={folderId || 'inbox'}
          onChange={(e) => setFolderId(e.target.value === 'inbox' ? null : e.target.value)}
        >
          {folders.map(folder => (
            <option key={folder.id} value={folder.id}>
              {folder.icon} {folder.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-actions">
        <button type="button" className="btn text-danger" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="btn btn-primary filled">
          Сохранить
        </button>
      </div>
    </form>
  );
}

// Компонент кнопки перемещения в папку
interface MoveToFolderButtonProps {
  idea: Idea;
  folders: Folder[];
  onMove: (folderId: string | null) => void;
}

function MoveToFolderButton({ idea, folders, onMove }: MoveToFolderButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <div className="move-folder-wrapper" ref={menuRef}>
      <button
        className="idea-action-btn"
        onClick={() => setShowMenu(!showMenu)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Переместить в папку</span>
      </button>
      
      {showMenu && (
        <div className="move-folder-menu">
          <button
            type="button"
            className={`move-folder-menu-item ${!idea.folderId || idea.folderId === 'inbox' ? 'active' : ''}`}
            onClick={() => {
              onMove(null);
              setShowMenu(false);
            }}
          >
            <span>📥</span>
            <span>Инбокс</span>
          </button>
          {folders.filter(f => f.id !== 'inbox').map(folder => (
            <button
              key={folder.id}
              type="button"
              className={`move-folder-menu-item ${idea.folderId === folder.id ? 'active' : ''}`}
              onClick={() => {
                onMove(folder.id);
                setShowMenu(false);
              }}
            >
              <span 
                className="move-folder-dot" 
                style={{ backgroundColor: folder.color }}
              />
              <span>{folder.icon}</span>
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Компонент модалки действий с заметкой
interface IdeaActionsModalProps {
  idea: Idea;
  folders: Folder[];
  onEdit: (idea: Idea) => void;
  onDelete: (idea: Idea) => void;
  onTogglePin: (id: string) => void;
  onMoveToFolder: (id: string, folderId: string | null) => void;
  onAddToTodo: (idea: Idea) => void;
  onAddToSchedule: (idea: Idea) => void;
}

function IdeaActionsModal({
  idea,
  folders,
  onEdit,
  onDelete,
  onTogglePin,
  onMoveToFolder,
  onAddToTodo,
  onAddToSchedule
}: IdeaActionsModalProps) {
  return (
    <div className="idea-actions-modal">
      <div className="idea-preview">
        {idea.title && <h3>{idea.title}</h3>}
        {idea.text && <p>{idea.text}</p>}
        {idea.imageBase64 && (
          <img src={idea.imageBase64} alt="Прикреплено" style={{ maxWidth: '100%', marginTop: '10px' }} />
        )}
        {idea.tags.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            {idea.tags.map(tag => (
              <span key={tag} style={{ color: '#3B82F6', marginRight: '8px' }}>#{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className="idea-action-buttons">
        <button
          className="idea-action-btn"
          onClick={() => onEdit(idea)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <span>Редактировать</span>
        </button>

        <button
          className="idea-action-btn"
          onClick={() => onTogglePin(idea.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 17v5M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
          </svg>
          <span>{idea.isPinned ? 'Открепить' : 'Закрепить'}</span>
        </button>

        <MoveToFolderButton
          idea={idea}
          folders={folders}
          onMove={(folderId) => onMoveToFolder(idea.id, folderId)}
        />

        <button
          className="idea-action-btn"
          onClick={() => onAddToTodo(idea)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span>Добавить в To-Do</span>
        </button>

        <button
          className="idea-action-btn"
          onClick={() => onAddToSchedule(idea)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>Добавить в расписание</span>
        </button>

        <button
          className="idea-action-btn danger"
          onClick={() => onDelete(idea)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <span>Удалить</span>
        </button>
      </div>
    </div>
  );
}

// Компонент формы создания/редактирования папки
interface FolderFormProps {
  folder: Folder | null;
  onSave: (folder: Folder) => void;
  onCancel: () => void;
  onDelete: ((folder: Folder) => void) | null;
}

function FolderForm({ folder, onSave, onCancel, onDelete }: FolderFormProps) {
  const [name, setName] = useState(folder?.name || '');
  const [color, setColor] = useState(folder?.color || '#3B82F6');
  const [icon, setIcon] = useState(folder?.icon || '📁');
  const [customIcon, setCustomIcon] = useState('');

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#14B8A6', '#6366F1', '#F97316', '#06B6D4'
  ];

  const icons = ['📁', '💼', '🏠', '💡', '🚀', '📚', '🎯', '⭐', '🔥', '💎'];
  
  const finalIcon = customIcon.trim() || icon;
  
  // Если редактируем, проверяем есть ли кастомная иконка
  useEffect(() => {
    if (folder && !icons.includes(folder.icon)) {
      setCustomIcon(folder.icon);
      setIcon('');
    }
  }, [folder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const updatedFolder: Folder = folder ? {
      ...folder,
      name: name.trim(),
      color,
      icon: finalIcon
    } : {
      id: uuid(),
      name: name.trim(),
      color,
      icon: finalIcon,
      order: 100 // Новые папки в конец
    };

    onSave(updatedFolder);
  };

  return (
    <form onSubmit={handleSubmit} className="folder-form">
      <div className="form-group">
        <label className="form-label">Название</label>
        <input
          type="text"
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Работа"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">Цвет</label>
        <div className="folder-color-grid">
          {colors.map(c => (
            <button
              key={c}
              type="button"
              className={`folder-color-btn ${color === c ? 'active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Иконка</label>
        <div className="folder-icon-grid">
          {icons.map(i => (
            <button
              key={i}
              type="button"
              className={`folder-icon-btn ${icon === i && !customIcon.trim() ? 'active' : ''}`}
              onClick={() => {
                setIcon(i);
                setCustomIcon('');
              }}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="form-group" style={{ marginTop: '12px' }}>
          <label className="form-label" style={{ fontSize: '13px', marginBottom: '6px' }}>
            Или введите свою иконку (эмодзи или текст):
          </label>
          <input
            type="text"
            className="form-input"
            value={customIcon}
            onChange={(e) => {
              setCustomIcon(e.target.value);
              if (e.target.value.trim()) {
                setIcon('');
              }
            }}
            placeholder="Например: 🎨 или !"
            maxLength={2}
          />
          {customIcon.trim() && (
            <div className="folder-custom-icon-preview" style={{ marginTop: '8px', fontSize: '24px' }}>
              Предпросмотр: {customIcon}
            </div>
          )}
        </div>
      </div>

      <div className="form-actions">
        {onDelete && folder && (
          <button 
            type="button" 
            className="btn btn-danger filled"
            onClick={() => onDelete(folder)}
          >
            Удалить
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
          <button type="button" className="btn text-danger" onClick={onCancel}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary filled">
            {folder ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </form>
  );
}
