import { useState, useMemo, useRef, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { Checkbox, EmptyState, useToast } from '../../components/UI';
import { useApp } from '../../store/AppContext';
import { Task, Habit } from '../../types';
import { getToday } from '../../utils/date';
import { vibrate, getRandomMotivation } from '../../utils/feedback';
import { v4 as uuid } from 'uuid';
import { TaskForm, TaskFormHandle } from './TaskForm';
import { BreakdownModal } from './BreakdownModal';
import { HabitCard, CreateHabitModal } from './habits';
import './TasksPage.css';

type TabType = 'todo' | 'habits';

export type TaskSortType =
  | 'time-asc'   // по времени (возрастание)
  | 'time-desc'  // по времени (убывание)
  | 'priority'   // по важности (сначала важные)
  | 'name-asc'   // по названию (А–Я)
  | 'name-desc'; // по названию (Я–А)

const TASK_SORT_OPTIONS: { value: TaskSortType; label: string }[] = [
  { value: 'time-asc', label: 'По времени (сначала старые)' },
  { value: 'time-desc', label: 'По времени (сначала новые)' },
  { value: 'priority', label: 'По важности (сначала важные)' },
  { value: 'name-asc', label: 'По названию (А–Я)' },
  { value: 'name-desc', label: 'По названию (Я–А)' },
];

const TASKS_SORT_STORAGE_KEY = 'sdvig_tasks_sort';
const TASKS_EXPANDED_SUBTASKS_STORAGE_KEY = 'sdvig_tasks_expanded_subtasks';

const VALID_SORT_VALUES: TaskSortType[] = ['time-asc', 'time-desc', 'priority', 'name-asc', 'name-desc'];

function loadTaskSort(): TaskSortType {
  try {
    const saved = localStorage.getItem(TASKS_SORT_STORAGE_KEY);
    if (saved && VALID_SORT_VALUES.includes(saved as TaskSortType)) return saved as TaskSortType;
  } catch (_) {}
  return 'time-desc';
}

function loadExpandedSubtasks(): Set<string> {
  try {
    const saved = localStorage.getItem(TASKS_EXPANDED_SUBTASKS_STORAGE_KEY);
    if (saved) {
      const arr = JSON.parse(saved) as unknown;
      if (Array.isArray(arr) && arr.every((x): x is string => typeof x === 'string')) {
        return new Set(arr);
      }
    }
  } catch (_) {}
  return new Set();
}

function sortTasks(tasks: Task[], sortType: TaskSortType): Task[] {
  const arr = [...tasks];
  switch (sortType) {
    case 'time-asc':
      return arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    case 'time-desc':
      return arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    case 'priority':
      return arr.sort((a, b) => {
        if (a.priority === 'important' && b.priority !== 'important') return -1;
        if (a.priority !== 'important' && b.priority === 'important') return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
    case 'name-asc':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    case 'name-desc':
      return arr.sort((a, b) => b.title.localeCompare(a.title, 'ru'));
    default:
      return arr;
  }
}

export function TasksPage() {
  const { state, dispatch } = useApp();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('todo');
  const [taskSort, setTaskSort] = useState<TaskSortType>(loadTaskSort);
  const [showTaskSortDropdown, setShowTaskSortDropdown] = useState(false);
  const taskSortDropdownRef = useRef<HTMLDivElement>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [breakdownTask, setBreakdownTask] = useState<Task | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(loadExpandedSubtasks);
  const taskFormRef = useRef<TaskFormHandle>(null);
  const [taskFormHasChanges, setTaskFormHasChanges] = useState(false);
  
  // Состояния для свайпа
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const isInitialMount = useRef(true);
  
  const today = getToday();

  // Закрытие выпадающего списка сортировки при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (taskSortDropdownRef.current && !taskSortDropdownRef.current.contains(e.target as Node)) {
        setShowTaskSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Сохранение сортировки в localStorage
  useEffect(() => {
    try {
      localStorage.setItem(TASKS_SORT_STORAGE_KEY, taskSort);
    } catch (_) {}
  }, [taskSort]);

  // Сохранение раскрытых подзадач в localStorage
  useEffect(() => {
    try {
      const arr = Array.from(expandedSubtasks);
      localStorage.setItem(TASKS_EXPANDED_SUBTASKS_STORAGE_KEY, JSON.stringify(arr));
    } catch (_) {}
  }, [expandedSubtasks]);
  
  const toggleSubtasks = (taskId: string) => {
    setExpandedSubtasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  // Функция переключения вкладки с анимацией
  const switchTab = (newTab: TabType, direction: 'left' | 'right') => {
    if (newTab === activeTab) return;
    
    // Пропускаем анимацию при первом монтировании
    if (isInitialMount.current) {
      isInitialMount.current = false;
      setActiveTab(newTab);
      return;
    }
    
    setSlideDirection(direction);
    setActiveTab(newTab);
    // Сбрасываем направление после анимации
    setTimeout(() => setSlideDirection(null), 350);
  };

  // Обработчики свайпа для переключения между todo и habits
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX.current;
    const diffY = touchEndY - touchStartY.current;
    
    // Проверяем, что это горизонтальный свайп (не вертикальный скролл)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      // Свайп влево - переключаем на habits (если сейчас todo)
      if (diffX < 0 && activeTab === 'todo') {
        switchTab('habits', 'left');
      }
      // Свайп вправо - переключаем на todo (если сейчас habits)
      else if (diffX > 0 && activeTab === 'habits') {
        switchTab('todo', 'right');
      }
    }
  };

  // Обработчик клика по вкладкам с анимацией
  const handleTabClick = (tab: TabType) => {
    if (tab === activeTab) return;
    const direction = tab === 'habits' ? 'left' : 'right';
    switchTab(tab, direction);
  };
  
  // Форматирование даты создания задачи
  const formatCreatedAt = (isoString: string): string => {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
  };
  
  // Расчёт количества прошедших дней
  const getDaysAgo = (isoString: string): number => {
    const created = new Date(isoString);
    const now = new Date();
    const diffTime = now.getTime() - created.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };
  
  // Форматирование "X дней"
  const formatDaysAgo = (days: number): string => {
    if (days === 0) return '0 дней';
    if (days === 1) return '1 день';
    if (days >= 2 && days <= 4) return `${days} дня`;
    return `${days} дней`;
  };
  
  // Группировка задач (только невыполненные) с учётом выбранной сортировки
  const groupedTasks = useMemo(() => {
    const todayTasks: Task[] = [];
    const weekTasks: Task[] = [];
    const somedayTasks: Task[] = [];
    
    state.tasks.forEach(task => {
      if (task.parentId) return;
      if (task.completed) return;
      
      if (!task.date) {
        somedayTasks.push(task);
      } else if (task.date === today) {
        todayTasks.push(task);
      } else if (task.date > today) {
        weekTasks.push(task);
      }
    });
    
    return { 
      todayTasks: sortTasks(todayTasks, taskSort), 
      weekTasks: sortTasks(weekTasks, taskSort), 
      somedayTasks: sortTasks(somedayTasks, taskSort) 
    };
  }, [state.tasks, today, taskSort]);
  
  // Архив выполненных задач с учётом сортировки
  const archivedTasks = useMemo(() => {
    return sortTasks(
      state.tasks.filter(task => !task.parentId && task.completed),
      taskSort
    );
  }, [state.tasks, taskSort]);
  
  // Подзадачи для задачи
  const getSubtasks = (taskId: string) => 
    state.tasks.filter(t => t.parentId === taskId);
  
  // Проверка выполнения привычки сегодня (с защитой от неполных данных)
  const isHabitCompletedToday = (habit: Habit) => {
    const records = Array.isArray(habit.records) ? habit.records : [];
    return records.includes(today);
  };
  
  // Обработчики задач
  const handleToggleTask = (id: string) => {
    const task = state.tasks.find(t => t.id === id);
    const willBeCompleted = task && !task.completed;
    
    dispatch({ type: 'TOGGLE_TASK', payload: id });
    
    if (willBeCompleted) {
      vibrate(50);
      showToast(getRandomMotivation());
    }
  };
  
  const handleDeleteTask = (id: string) => {
    if (confirm('Удалить задачу?')) {
      dispatch({ type: 'DELETE_TASK', payload: id });
    }
  };
  
  const handleSaveTask = (task: Task) => {
    if (editingTask) {
      dispatch({ type: 'UPDATE_TASK', payload: task });
    } else {
      dispatch({ type: 'ADD_TASK', payload: task });
    }
    setShowTaskForm(false);
    setEditingTask(null);
  };
  
  // Обработчики привычек
  const handleToggleHabit = (id: string) => {
    const habit = state.habits.find(h => h.id === id);
    const habitRecords = habit && Array.isArray(habit.records) ? habit.records : [];
    const willBeCompleted = habit && !habitRecords.includes(today);
    
    dispatch({ type: 'TOGGLE_HABIT', payload: { id, date: today } });
    
    if (willBeCompleted) {
      vibrate(50);
      showToast(getRandomMotivation());
    }
  };
  
  const handleDeleteHabit = (id: string) => {
    if (confirm('Удалить привычку?')) {
      dispatch({ type: 'DELETE_HABIT', payload: id });
    }
  };
  
  const handleSaveHabit = (habit: Habit) => {
    if (editingHabit) {
      dispatch({ type: 'UPDATE_HABIT', payload: habit });
    } else {
      dispatch({ type: 'ADD_HABIT', payload: habit });
    }
    setShowHabitModal(false);
    setEditingHabit(null);
  };
  
  const handleBreakdown = (task: Task, subtasks: string[]) => {
    const existingSubtasks = getSubtasks(task.id);
    const validSubtasks = subtasks.filter(s => s.trim());
    
    // Создаём карту существующих подзадач по названию для сохранения статуса выполнения
    const existingMap = new Map<string, Task>();
    existingSubtasks.forEach(st => {
      existingMap.set(st.title, st);
    });
    
    // Удаляем все существующие подзадачи
    existingSubtasks.forEach(subtask => {
      dispatch({ type: 'DELETE_TASK', payload: subtask.id });
    });
    
    // Создаём новые подзадачи, сохраняя статус выполнения если название совпадает
    validSubtasks.forEach(title => {
      const trimmedTitle = title.trim();
      const existing = existingMap.get(trimmedTitle);
      
      dispatch({
        type: 'ADD_TASK',
        payload: {
          id: uuid(),
          title: trimmedTitle,
          completed: existing?.completed || false,
          date: task.date,
          priority: 'normal',
          parentId: task.id,
          createdAt: existing?.createdAt || new Date().toISOString(),
          completedAt: existing?.completedAt
        }
      });
    });
    
    setBreakdownTask(null);
  };
  
  const renderTaskItem = (task: Task, isArchived: boolean = false) => {
    const subtasks = getSubtasks(task.id);
    const isExpanded = expandedSubtasks.has(task.id);
    const shouldCollapse = subtasks.length > 3;
    
    return (
      <div key={task.id} className="task-item-wrapper">
        <div className={`task-item ${task.priority === 'important' ? 'important' : ''} ${isArchived ? 'archived' : ''}`}>
          <Checkbox 
            checked={task.completed} 
            onChange={() => handleToggleTask(task.id)}
          />
          <div className="task-content">
            <span className={task.completed ? 'line-through' : ''}>{task.title}</span>
            {task.timeEstimate && (
              <span className="task-estimate">{task.timeEstimate} мин</span>
            )}
            {task.createdAt && (
              <span className="task-created">
                Добавлено: {formatCreatedAt(task.createdAt)} · {formatDaysAgo(getDaysAgo(task.createdAt))} назад
              </span>
            )}
            {task.completedAt && (
              <span className="task-completed-at">
                Выполнено: {formatCreatedAt(task.completedAt)}
              </span>
            )}
          </div>
          {!isArchived && (
            <div className="task-actions">
              <button 
                className="btn-icon" 
                title="Подзадачи"
                onClick={() => setBreakdownTask(task)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="8" y1="9" x2="16" y2="9"/>
                  <line x1="8" y1="12" x2="16" y2="12"/>
                  <line x1="8" y1="15" x2="16" y2="15"/>
                </svg>
              </button>
              <button 
                className="btn-icon"
                onClick={() => { setEditingTask(task); setShowTaskForm(true); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button 
                className="btn-icon text-danger"
                onClick={() => handleDeleteTask(task.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          )}
          {isArchived && (
            <button 
              className="btn-icon text-danger"
              onClick={() => handleDeleteTask(task.id)}
              title="Удалить"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          )}
        </div>
        {subtasks.length > 0 && !isArchived && (
          <div className="subtasks">
            <div className={`subtasks-content ${shouldCollapse && !isExpanded ? 'subtasks-collapsed' : ''}`}>
            {subtasks.map(sub => (
              <div key={sub.id} className="subtask-item">
                <Checkbox 
                  checked={sub.completed} 
                  onChange={() => handleToggleTask(sub.id)}
                  size="sm"
                />
                <span className={sub.completed ? 'line-through' : ''}>{sub.title}</span>
              </div>
            ))}
            </div>
            {shouldCollapse && (
              <button 
                className="subtasks-toggle"
                onClick={() => toggleSubtasks(task.id)}
              >
                {isExpanded ? (
                  <>
                    <span>Свернуть</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="18 15 12 9 6 15"/>
                    </svg>
                  </>
                ) : (
                  <>
                    <span>Показать подзадачи</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };
  
  const hasActiveTasks = groupedTasks.todayTasks.length > 0 || 
                         groupedTasks.weekTasks.length > 0 || 
                         groupedTasks.somedayTasks.length > 0;
  
  return (
    <Layout title="Дела">
      {/* Табы */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'todo' ? 'active' : ''}`}
          onClick={() => handleTabClick('todo')}
        >
          To-Do
        </button>
        <button 
          className={`tab ${activeTab === 'habits' ? 'active' : ''}`}
          onClick={() => handleTabClick('habits')}
        >
          Привычки
        </button>
      </div>
      
      {/* Контейнер с поддержкой свайпа */}
      <div 
        className="tasks-content-wrapper"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activeTab === 'todo' ? (
          <div className={`todo-content ${slideDirection === 'right' ? 'tasks-content-slide slide-right' : slideDirection === 'left' ? 'tasks-content-slide slide-left' : ''}`}>
          <button 
            className="add-item-btn"
            onClick={() => setShowTaskForm(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Добавить задачу
          </button>
          
          {(hasActiveTasks || archivedTasks.length > 0) && (
            <div className="task-sort-wrapper" ref={taskSortDropdownRef}>
              <button
                type="button"
                className="task-sort-trigger"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowTaskSortDropdown(!showTaskSortDropdown);
                }}
              >
                <span className="task-sort-label">Сортировка:</span>
                <span className="task-sort-value">
                  {TASK_SORT_OPTIONS.find(o => o.value === taskSort)?.label ?? taskSort}
                </span>
                <svg className="task-sort-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {showTaskSortDropdown && (
                <div className="task-sort-dropdown" onMouseDown={(e) => e.stopPropagation()}>
                  {TASK_SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`task-sort-item ${taskSort === opt.value ? 'active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTaskSort(opt.value);
                        setShowTaskSortDropdown(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {!hasActiveTasks && archivedTasks.length === 0 ? (
            <EmptyState
              title="Нет задач"
              text="Добавьте первую задачу"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
              }
            />
          ) : (
            <>
              {groupedTasks.todayTasks.length > 0 && (
                <div className="task-group">
                  <h3>Сегодня</h3>
                  <div className="task-list">
                    {groupedTasks.todayTasks.map(task => renderTaskItem(task))}
                  </div>
                </div>
              )}
              
              {groupedTasks.weekTasks.length > 0 && (
                <div className="task-group">
                  <h3>Запланировано</h3>
                  <div className="task-list">
                    {groupedTasks.weekTasks.map(task => renderTaskItem(task))}
                  </div>
                </div>
              )}
              
              {groupedTasks.somedayTasks.length > 0 && (
                <div className="task-group">
                  <h3>Когда-нибудь</h3>
                  <div className="task-list">
                    {groupedTasks.somedayTasks.map(task => renderTaskItem(task))}
                  </div>
                </div>
              )}
              
              {/* Архив задач */}
              {archivedTasks.length > 0 && (
                <div className="archive-section">
                  <button 
                    className="archive-toggle"
                    onClick={() => setShowArchive(!showArchive)}
                  >
                    <svg 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2"
                      className={`archive-icon ${showArchive ? 'open' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                    <span>Архив задач</span>
                    <span className="archive-count">{archivedTasks.length}</span>
                  </button>
                  
                  {showArchive && (
                    <div className="archive-list">
                      {archivedTasks.map(task => renderTaskItem(task, true))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </div>
        ) : (
          <div className={`habits-content ${slideDirection === 'left' ? 'tasks-content-slide slide-left' : slideDirection === 'right' ? 'tasks-content-slide slide-right' : ''}`}>
          <button 
            className="add-item-btn"
            onClick={() => { setEditingHabit(null); setShowHabitModal(true); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Добавить привычку
          </button>
          
          {state.habits.length === 0 ? (
            <EmptyState
              title="Нет привычек"
              text="Создайте первую привычку и начните её отслеживать"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              }
            />
          ) : (
            <div className="habits-list">
              {state.habits.map(habit => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  isCompletedToday={isHabitCompletedToday(habit)}
                  onToggle={() => handleToggleHabit(habit.id)}
                  onEdit={() => { setEditingHabit(habit); setShowHabitModal(true); }}
                  onDelete={() => handleDeleteHabit(habit.id)}
                />
              ))}
            </div>
          )}
          </div>
        )}
      </div>
      
      {/* Модалки */}
      <Modal 
        isOpen={showTaskForm} 
        onClose={() => { 
          setShowTaskForm(false); 
          setEditingTask(null);
          setTaskFormHasChanges(false);
        }}
        onRequestClose={() => {
          if (taskFormRef.current?.hasChanges) {
            setTaskFormHasChanges(true);
            return;
          }
          setShowTaskForm(false);
          setEditingTask(null);
        }}
        hasChanges={taskFormHasChanges}
        onSave={() => {
          if (taskFormRef.current) {
            taskFormRef.current.save();
          }
        }}
        confirmMessage="задачи"
        title={editingTask ? 'Редактировать задачу' : 'Новая задача'}
      >
        <TaskForm
          ref={taskFormRef}
          task={editingTask}
          onChangesChange={setTaskFormHasChanges}
          onSave={(task) => {
            handleSaveTask(task);
            setShowTaskForm(false);
            setEditingTask(null);
            setTaskFormHasChanges(false);
          }}
          onCancel={() => { setShowTaskForm(false); setEditingTask(null); setTaskFormHasChanges(false); }}
        />
      </Modal>
      
      <CreateHabitModal
        isOpen={showHabitModal}
        onClose={() => { setShowHabitModal(false); setEditingHabit(null); }}
        onSave={handleSaveHabit}
        editingHabit={editingHabit}
      />
      
      {breakdownTask && (
        <BreakdownModal
          task={breakdownTask}
          existingSubtasks={getSubtasks(breakdownTask.id)}
          onSave={handleBreakdown}
          onClose={() => setBreakdownTask(null)}
          onDiscard={() => showToast('Данные не сохранены')}
        />
      )}
    </Layout>
  );
}
