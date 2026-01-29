/**
 * Главный контекст приложения СДВиГ
 * 
 * ВАЖНО: С версии 2.0 данные хранятся в IndexedDB
 * При первом запуске выполняется автоматическая миграция из localStorage
 */

import React, { createContext, useContext, useReducer, useEffect, useRef, useState, ReactNode } from 'react';
import { 
  AppState, 
  initialState, 
  Routine, 
  Event, 
  DayTask,
  Wallet, 
  Transaction, 
  Task, 
  Habit, 
  Idea, 
  IdeaStatus,
  Folder,
  Profile, 
  Document,
  FocusSession,
  TimerState,
  Theme,
  StartPageMode,
  AppPage,
  Settings,
  migrateWallets
  } from '../types';
  import { initStorage, saveStateAsync } from './storage';
  import { v4 as uuid } from 'uuid';

// Флаг для показа модалки установки PWA (показывается один раз)
const INSTALL_PROMPT_SHOWN_FLAG = 'sdvig_install_prompt_shown';

// Текущая версия приложения и флаг для показа модалки "Что нового"
const APP_VERSION = '2.1.2';
const WHATS_NEW_SHOWN_FLAG = 'sdvig_whats_new_shown_version';

// Проверка, запущено ли приложение как PWA (standalone)
function isRunningAsPWA(): boolean {
  // Проверка для большинства браузеров
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  // Проверка для iOS Safari
  const isIOSStandalone = (navigator as { standalone?: boolean }).standalone === true;
  return isStandalone || isIOSStandalone;
}

// Action Types
type Action =
  // Рутины
  | { type: 'ADD_ROUTINE'; payload: Routine }
  | { type: 'UPDATE_ROUTINE'; payload: Routine }
  | { type: 'DELETE_ROUTINE'; payload: string }
  | { type: 'TOGGLE_ROUTINE'; payload: { id: string; date: string } }
  // События
  | { type: 'ADD_EVENT'; payload: Event }
  | { type: 'UPDATE_EVENT'; payload: Event }
  | { type: 'DELETE_EVENT'; payload: string }
  | { type: 'TOGGLE_EVENT'; payload: string }
  | { type: 'MOVE_EVENT_TO_TOMORROW'; payload: string }
  // Задачи дня
  | { type: 'SET_DAY_TASKS'; payload: { date: string; tasks: DayTask[] } }
  | { type: 'TOGGLE_DAY_TASK'; payload: { date: string; taskId: string } }
  | { type: 'UPDATE_DAY_TASK'; payload: { date: string; task: DayTask } }
  | { type: 'DELETE_DAY_TASK'; payload: { date: string; taskId: string } }
  // Финансы
  | { type: 'ADD_WALLET'; payload: Wallet }
  | { type: 'UPDATE_WALLET'; payload: Wallet }
  | { type: 'DELETE_WALLET'; payload: string }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'ADD_CATEGORY'; payload: string }
  // Задачи To-Do
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'TOGGLE_TASK'; payload: string }
  // Привычки (HabitKit style)
  | { type: 'ADD_HABIT'; payload: Habit }
  | { type: 'UPDATE_HABIT'; payload: Habit }
  | { type: 'DELETE_HABIT'; payload: string }
  | { type: 'TOGGLE_HABIT'; payload: { id: string; date: string } }
  | { type: 'RECALCULATE_STREAKS' }
  // Инбокс
  | { type: 'ADD_IDEA'; payload: Idea }
  | { type: 'UPDATE_IDEA'; payload: Idea }
  | { type: 'DELETE_IDEA'; payload: string }
  | { type: 'TOGGLE_IDEA_PIN'; payload: string }
  | { type: 'MOVE_IDEA_TO_FOLDER'; payload: { id: string; folderId: string | null } }
  // Папки заметок
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'UPDATE_FOLDER'; payload: Folder }
  | { type: 'DELETE_FOLDER'; payload: string }
  // Профиль
  | { type: 'UPDATE_PROFILE'; payload: Profile }
  // Документы
  | { type: 'ADD_DOCUMENT'; payload: Document }
  | { type: 'DELETE_DOCUMENT'; payload: string }
  // Фокус
  | { type: 'ADD_FOCUS_SESSION'; payload: FocusSession }
  | { type: 'UPDATE_TIMER_STATE'; payload: TimerState | undefined }
  // Настройки
  | { type: 'SET_THEME'; payload: Theme }
  | { type: 'SET_START_PAGE_MODE'; payload: StartPageMode }
  | { type: 'SET_CUSTOM_START_PAGE'; payload: AppPage }
  | { type: 'SET_LAST_VISITED_PAGE'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
  // Общее
  | { type: 'LOAD_STATE'; payload: AppState };

// Вспомогательная функция для форматирования даты в локальном часовом поясе
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Парсинг времени из строки рутины
// Вычисляем время окончания математически (без зависимости от текущей даты)
function parseRoutineTime(timeStr: string, durationMinutes: number = 60): { startHour: number; startMinute: number; endHour: number; endMinute: number } {
  if (timeStr.includes('-')) {
    const [start, end] = timeStr.split('-').map(t => t.trim());
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    return { startHour, startMinute, endHour, endMinute };
  } else {
    const [startHour, startMinute] = timeStr.split(':').map(Number);
    const totalEndMinutes = startHour * 60 + startMinute + durationMinutes;
    const endHour = Math.floor(totalEndMinutes / 60) % 24;
    const endMinute = totalEndMinutes % 60;
    return { 
      startHour, 
      startMinute, 
      endHour, 
      endMinute 
    };
  }
}

// Генерация прошедших событий из рутины (до сегодня)
function generatePastEventsFromRoutine(routine: Routine): Event[] {
  const events: Event[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Получаем все даты, когда рутина была выполнена
  const completedDates = Object.keys(routine.completed).filter(dateStr => routine.completed[dateStr]);
  
  if (completedDates.length === 0) return events;
  
  // Парсим время рутины
  const durationMinutes = routine.duration && routine.duration >= 10 ? routine.duration : 60;
  let startHour = 9, startMinute = 0, endHour: number, endMinute: number;
  
  if (routine.time) {
    const time = parseRoutineTime(routine.time, durationMinutes);
    startHour = time.startHour;
    startMinute = time.startMinute;
    endHour = time.endHour;
    endMinute = time.endMinute;
  } else {
    // Вычисляем дефолтное время окончания на основе длительности
    const totalEndMinutes = 9 * 60 + 0 + durationMinutes;
    endHour = Math.floor(totalEndMinutes / 60) % 24;
    endMinute = totalEndMinutes % 60;
  }
  
  // Создаем события для всех прошедших выполненных дат
  for (const dateStr of completedDates) {
    const eventDate = new Date(dateStr + 'T00:00:00');
    if (isNaN(eventDate.getTime())) continue;
    
    // Пропускаем будущие даты
    if (eventDate >= today) continue;
    
    // Используем явное создание через конструктор Date
    const year = eventDate.getFullYear();
    const month = eventDate.getMonth();
    const day = eventDate.getDate();
    
    const startTime = new Date(year, month, day, startHour, startMinute, 0, 0);
    const endTime = new Date(year, month, day, endHour, endMinute, 0, 0);
    
    if (endTime < startTime) {
      endTime.setDate(endTime.getDate() + 1);
    }
    
    events.push({
      id: uuid(),
      title: routine.title,
      description: routine.description,
      startTime: startTime,
      endTime: endTime,
      color: '#9C27B0',
      icon: routine.icon,
      completed: true // Раз было выполнено
      // Без routineId - теперь это обычное событие
    });
  }
  
  return events;
}

// Вспомогательная функция для расчёта streak
function calculateHabitStreak(records: string[]): number {
  if (!Array.isArray(records) || records.length === 0) return 0;
  
  const sortedDates = [...records].sort().reverse();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayStr = formatLocalDate(today);
  
  // Если сегодня выполнено, начинаем считать с сегодня
  if (sortedDates.includes(todayStr)) {
    // Считаем последовательные дни, включая сегодня
    let streak = 0;
    const currentDate = new Date(today);
    
    for (let i = 0; i < 365; i++) {
      const dateStr = formatLocalDate(currentDate);
      if (sortedDates.includes(dateStr)) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    return streak > 0 ? streak : 1; // Минимум 1 если сегодня выполнено
  }
  
  // Если сегодня не выполнено, проверяем вчера
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterday);
  
  if (!sortedDates.includes(yesterdayStr)) {
    return 0; // Нет streak
  }
  
  // Считаем последовательные дни назад от вчера
  let streak = 0;
  const currentDate = new Date(yesterday);
  
  for (let i = 0; i < 365; i++) {
    const dateStr = formatLocalDate(currentDate);
    if (sortedDates.includes(dateStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    // Рутины
    case 'ADD_ROUTINE':
      return { ...state, routines: [...state.routines, action.payload] };
    case 'UPDATE_ROUTINE':
      return {
        ...state,
        routines: state.routines.map(r => r.id === action.payload.id ? action.payload : r)
      };
    case 'DELETE_ROUTINE': {
      // Находим рутину для сохранения прошедших событий
      const routineToDelete = state.routines.find(r => r.id === action.payload);
      
      if (routineToDelete) {
        // Генерируем прошедшие события из рутины (до сегодня)
        const pastEvents = generatePastEventsFromRoutine(routineToDelete);
        
        return { 
          ...state, 
          routines: state.routines.filter(r => r.id !== action.payload),
          events: [...state.events, ...pastEvents]
        };
      }
      
      return { ...state, routines: state.routines.filter(r => r.id !== action.payload) };
    }
    case 'TOGGLE_ROUTINE':
      return {
        ...state,
        routines: state.routines.map(r => {
          if (r.id === action.payload.id) {
            const newCompleted = { ...r.completed };
            newCompleted[action.payload.date] = !newCompleted[action.payload.date];
            return { ...r, completed: newCompleted };
          }
          return r;
        })
      };

    // События
    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'UPDATE_EVENT':
      return {
        ...state,
        events: state.events.map(e => e.id === action.payload.id ? action.payload : e)
      };
    case 'DELETE_EVENT':
      return { ...state, events: state.events.filter(e => e.id !== action.payload) };
    case 'TOGGLE_EVENT':
      return {
        ...state,
        events: state.events.map(e => 
          e.id === action.payload ? { ...e, completed: !e.completed } : e
        )
      };
    case 'MOVE_EVENT_TO_TOMORROW': {
      const event = state.events.find(e => e.id === action.payload);
      if (!event) return state;
      
      // Поддержка нового формата (startTime/endTime)
      if (event.startTime && event.endTime) {
        const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
        const endTime = typeof event.endTime === 'string' ? new Date(event.endTime) : event.endTime;
        const duration = endTime.getTime() - startTime.getTime();
        
        const newStartTime = new Date(startTime);
        newStartTime.setDate(newStartTime.getDate() + 1);
        const newEndTime = new Date(newStartTime.getTime() + duration);
        
        return {
          ...state,
          events: state.events.map(e => 
            e.id === action.payload ? { ...e, startTime: newStartTime, endTime: newEndTime } : e
          )
        };
      }
      
      // Поддержка старого формата (date) для совместимости
      if (event.date) {
      const currentDate = new Date(event.date + 'T00:00:00');
      currentDate.setDate(currentDate.getDate() + 1);
      const newDate = formatLocalDate(currentDate);
      return {
        ...state,
        events: state.events.map(e => 
          e.id === action.payload ? { ...e, date: newDate } : e
        )
      };
      }
      
      return state;
    }

    // Задачи дня
    case 'SET_DAY_TASKS':
      return {
        ...state,
        dayTasks: { ...state.dayTasks, [action.payload.date]: action.payload.tasks }
      };
    case 'TOGGLE_DAY_TASK':
      return {
        ...state,
        dayTasks: {
          ...state.dayTasks,
          [action.payload.date]: (state.dayTasks[action.payload.date] || []).map(t =>
            t.id === action.payload.taskId ? { ...t, completed: !t.completed } : t
          )
        }
      };
    case 'UPDATE_DAY_TASK':
      return {
        ...state,
        dayTasks: {
          ...state.dayTasks,
          [action.payload.date]: (state.dayTasks[action.payload.date] || []).map(t =>
            t.id === action.payload.task.id ? action.payload.task : t
          )
        }
      };
    case 'DELETE_DAY_TASK':
      return {
        ...state,
        dayTasks: {
          ...state.dayTasks,
          [action.payload.date]: (state.dayTasks[action.payload.date] || []).filter(t =>
            t.id !== action.payload.taskId
          )
        }
      };

    // Финансы
    case 'ADD_WALLET':
      return { ...state, wallets: [...state.wallets, action.payload] };
    case 'UPDATE_WALLET':
      return {
        ...state,
        wallets: state.wallets.map(w => w.id === action.payload.id ? action.payload : w)
      };
    case 'DELETE_WALLET':
      return { 
        ...state, 
        wallets: state.wallets.filter(w => w.id !== action.payload),
        transactions: state.transactions.filter(t => t.walletId !== action.payload)
      };
    case 'ADD_TRANSACTION': {
      const tx = action.payload;
      
      // Обработка перевода между кошельками
      if (tx.type === 'transfer') {
        const fromWallet = state.wallets.find(w => w.id === tx.walletId);
        const toWallet = state.wallets.find(w => w.id === tx.toWalletId);
        if (!fromWallet || !toWallet) return state;
        
        const toAmount = tx.toAmount || tx.amount; // Если валюты одинаковые
        
        return {
          ...state,
          transactions: [...state.transactions, tx],
          wallets: state.wallets.map(w => {
            if (w.id === tx.walletId) {
              return { ...w, balance: w.balance - tx.amount };
            }
            if (w.id === tx.toWalletId) {
              return { ...w, balance: w.balance + toAmount };
            }
            return w;
          })
        };
      }
      
      // Обычная операция (доход/расход)
      const wallet = state.wallets.find(w => w.id === tx.walletId);
      if (!wallet) return state;
      
      const balanceChange = tx.type === 'income' 
        ? tx.amount 
        : -tx.amount;
        
      return {
        ...state,
        transactions: [...state.transactions, tx],
        wallets: state.wallets.map(w => 
          w.id === tx.walletId 
            ? { ...w, balance: w.balance + balanceChange }
            : w
        )
      };
    }
    case 'DELETE_TRANSACTION': {
      const tx = state.transactions.find(t => t.id === action.payload);
      if (!tx) return state;
      
      // Обработка удаления перевода
      if (tx.type === 'transfer') {
        const toAmount = tx.toAmount || tx.amount;
        return {
          ...state,
          transactions: state.transactions.filter(t => t.id !== action.payload),
          wallets: state.wallets.map(w => {
            if (w.id === tx.walletId) {
              return { ...w, balance: w.balance + tx.amount }; // Возвращаем списанное
            }
            if (w.id === tx.toWalletId) {
              return { ...w, balance: w.balance - toAmount }; // Убираем зачисленное
            }
            return w;
          })
        };
      }
      
      // Обычная операция
      const balanceRevert = tx.type === 'income' ? -tx.amount : tx.amount;
      return {
        ...state,
        transactions: state.transactions.filter(t => t.id !== action.payload),
        wallets: state.wallets.map(w =>
          w.id === tx.walletId
            ? { ...w, balance: w.balance + balanceRevert }
            : w
        )
      };
    }
    case 'ADD_CATEGORY':
      if (state.categories.includes(action.payload)) return state;
      return { ...state, categories: [...state.categories, action.payload] };

    // Задачи To-Do
    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, action.payload] };
    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(t => t.id === action.payload.id ? action.payload : t)
      };
    case 'DELETE_TASK':
      return { 
        ...state, 
        tasks: state.tasks.filter(t => t.id !== action.payload && t.parentId !== action.payload) 
      };
    case 'TOGGLE_TASK': {
      const now = new Date().toISOString();
      
      // Сначала переключаем задачу с записью времени выполнения
      let newTasks = state.tasks.map(t => {
        if (t.id === action.payload) {
          const willBeCompleted = !t.completed;
          return { 
            ...t, 
            completed: willBeCompleted,
            completedAt: willBeCompleted ? now : undefined
          };
        }
        return t;
      });
      
      // Находим задачу которую переключили
      const toggledTask = newTasks.find(t => t.id === action.payload);
      
      // Если это подзадача, проверяем не выполнены ли все подзадачи родителя
      if (toggledTask?.parentId) {
        const siblingSubtasks = newTasks.filter(t => t.parentId === toggledTask.parentId);
        const allSubtasksCompleted = siblingSubtasks.every(t => t.completed);
        
        // Если все подзадачи выполнены - отмечаем родительскую задачу выполненной
        if (allSubtasksCompleted) {
          newTasks = newTasks.map(t =>
            t.id === toggledTask.parentId ? { ...t, completed: true, completedAt: now } : t
          );
        }
      }
      
      return { ...state, tasks: newTasks };
    }

    // Привычки (HabitKit style)
    case 'ADD_HABIT':
      return { ...state, habits: [...state.habits, action.payload] };
    case 'UPDATE_HABIT':
      return {
        ...state,
        habits: state.habits.map(h => h.id === action.payload.id ? action.payload : h)
      };
    case 'DELETE_HABIT':
      return { ...state, habits: state.habits.filter(h => h.id !== action.payload) };
    case 'TOGGLE_HABIT': {
      const { id, date } = action.payload;
      return {
        ...state,
        habits: (state.habits || []).map(h => {
          if (h.id !== id) return h;
          
          // Защита от неполных данных
          const currentRecords = Array.isArray(h.records) ? h.records : [];
          const currentBestStreak = typeof h.bestStreak === 'number' ? h.bestStreak : 0;
          
          // Toggle the date in records
          const isCompleted = currentRecords.includes(date);
          const newRecords = isCompleted
            ? currentRecords.filter(d => d !== date)
            : [...currentRecords, date].sort();
          
          // Calculate new streak
          const newStreak = calculateHabitStreak(newRecords);
          const newBestStreak = Math.max(currentBestStreak, newStreak);
          
          return { 
            ...h, 
            records: newRecords,
            streak: newStreak,
            bestStreak: newBestStreak
          };
        })
      };
    }
    case 'RECALCULATE_STREAKS':
      return {
        ...state,
        habits: (state.habits || []).map(h => {
          const records = Array.isArray(h.records) ? h.records : [];
          const streak = calculateHabitStreak(records);
          const bestStreak = typeof h.bestStreak === 'number' ? h.bestStreak : 0;
          return { ...h, streak, bestStreak: Math.max(bestStreak, streak) };
        })
      };

    // Инбокс
    case 'ADD_IDEA':
      return { ...state, ideas: [...state.ideas, action.payload] };
    case 'UPDATE_IDEA':
      return {
        ...state,
        ideas: state.ideas.map(i => {
          if (i.id === action.payload.id) {
            // Миграция старых заметок: добавляем недостающие поля
            return {
              ...i,
              title: action.payload.title,
              text: action.payload.text || i.text,
              tags: action.payload.tags || [],
              folderId: action.payload.folderId !== undefined ? action.payload.folderId : (i.folderId || null),
              isPinned: action.payload.isPinned !== undefined ? action.payload.isPinned : (i.isPinned || false),
              status: action.payload.status || (i.status || 'inbox'),
              imageBase64: action.payload.imageBase64,
              updatedAt: new Date().toISOString()
            };
          }
          return i;
        })
      };
    case 'DELETE_IDEA':
      return { ...state, ideas: state.ideas.filter(i => i.id !== action.payload) };
    case 'TOGGLE_IDEA_PIN':
      return {
        ...state,
        ideas: state.ideas.map(i => 
          i.id === action.payload ? { ...i, isPinned: !i.isPinned } : i
        )
      };
    case 'MOVE_IDEA_TO_FOLDER':
      return {
        ...state,
        ideas: state.ideas.map(i => 
          i.id === action.payload.id ? { ...i, folderId: action.payload.folderId } : i
        )
      };
    // Папки заметок
    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, action.payload] };
    case 'UPDATE_FOLDER':
      return {
        ...state,
        folders: state.folders.map(f => f.id === action.payload.id ? action.payload : f)
      };
    case 'DELETE_FOLDER':
      // При удалении папки, перемещаем все заметки в Инбокс
      return {
        ...state,
        folders: state.folders.filter(f => f.id !== action.payload),
        ideas: state.ideas.map(i => 
          i.folderId === action.payload ? { ...i, folderId: null } : i
        )
      };

    // Профиль
    case 'UPDATE_PROFILE':
      return { ...state, profile: action.payload };

    // Документы
    case 'ADD_DOCUMENT':
      return { ...state, documents: [...state.documents, action.payload] };
    case 'DELETE_DOCUMENT':
      return { ...state, documents: state.documents.filter(d => d.id !== action.payload) };

    // Фокус
    case 'ADD_FOCUS_SESSION':
      return { ...state, focusSessions: [...state.focusSessions, action.payload] };
    case 'UPDATE_TIMER_STATE':
      return { ...state, timerState: action.payload };

    // Настройки
    case 'SET_THEME':
      return { ...state, settings: { ...state.settings, theme: action.payload } };
    case 'SET_START_PAGE_MODE':
      return { ...state, settings: { ...state.settings, startPageMode: action.payload } };
    case 'SET_CUSTOM_START_PAGE':
      return { ...state, settings: { ...state.settings, customStartPage: action.payload } };
    case 'SET_LAST_VISITED_PAGE':
      return { ...state, settings: { ...state.settings, lastVisitedPage: action.payload } };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    // Общее
    case 'LOAD_STATE':
      return action.payload;

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * Модалка "Что нового" - показывается при первом запуске новой версии
 */
function WhatsNewModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      animation: 'whatsNewFadeIn 0.4s ease'
    }}>
      <div style={{
        background: 'var(--bg, #fff)',
        borderRadius: '24px',
        maxWidth: '380px',
        width: '100%',
        overflow: 'hidden',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        animation: 'whatsNewSlideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        {/* Заголовок с анимированным градиентом */}
        <div style={{
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
          padding: '32px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Анимированные круги на фоне */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            left: '-20%',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            animation: 'whatsNewFloat 6s ease-in-out infinite'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-30%',
            right: '-10%',
            width: '150px',
            height: '150px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            animation: 'whatsNewFloat 8s ease-in-out infinite reverse'
          }} />
          
          {/* Иконка с анимацией */}
          <div style={{
            fontSize: '56px',
            marginBottom: '16px',
            animation: 'whatsNewBounce 0.6s ease 0.3s both',
            position: 'relative',
            zIndex: 1
          }}>🚀</div>
          
          {/* Версия с badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)',
            padding: '6px 16px',
            borderRadius: '20px',
            marginBottom: '12px',
            animation: 'whatsNewFadeIn 0.5s ease 0.4s both',
            position: 'relative',
            zIndex: 1
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#4ADE80',
              animation: 'whatsNewPulse 2s ease infinite'
            }} />
            <span style={{
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.5px'
            }}>Версия {APP_VERSION}</span>
          </div>
          
          <h2 style={{
            color: 'white',
            fontSize: '24px',
            fontWeight: 700,
            margin: 0,
            animation: 'whatsNewFadeIn 0.5s ease 0.5s both',
            position: 'relative',
            zIndex: 1
          }}>Добро пожаловать!</h2>
        </div>
        
        {/* Контент */}
        <div style={{ padding: '24px' }}>
          {/* Основной текст */}
          <div style={{
            textAlign: 'center',
            marginBottom: '24px',
            animation: 'whatsNewFadeIn 0.5s ease 0.6s both'
          }}>
            <p style={{
              fontSize: '15px',
              color: 'var(--text, #1F2937)',
              margin: '0 0 16px 0',
              lineHeight: 1.6
            }}>
              Спасибо, что используете <strong>СДВиГ</strong>! 
            </p>
            <p style={{
              fontSize: '14px',
              color: 'var(--muted, #6B7280)',
              margin: 0,
              lineHeight: 1.6
            }}>
              Узнайте о новых функциях, обновлениях и планах развития в нашем Telegram-канале
            </p>
          </div>
          
          {/* Ссылка на Telegram */}
          <a
            href="https://t.me/SDViGapp"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(135deg, #0088cc 0%, #00a8e8 100%)',
              borderRadius: '14px',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
              marginBottom: '12px',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(0, 136, 204, 0.3)',
              animation: 'whatsNewFadeIn 0.5s ease 0.7s both'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 136, 204, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 136, 204, 0.3)';
            }}
          >
            {/* Telegram иконка */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span>Telegram-канал</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M7 17L17 7M17 7H7M17 7V17"/>
            </svg>
          </a>
          
          {/* Кнопка "Понял" */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '16px',
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              border: 'none',
              borderRadius: '14px',
              color: 'white',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
              animation: 'whatsNewFadeIn 0.5s ease 0.8s both'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(99, 102, 241, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.3)';
            }}
          >
            Понял 👍
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes whatsNewFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes whatsNewSlideUp {
          from { 
            opacity: 0;
            transform: translateY(40px) scale(0.9);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes whatsNewBounce {
          0% { 
            opacity: 0;
            transform: scale(0) rotate(-10deg);
          }
          50% { 
            transform: scale(1.2) rotate(5deg);
          }
          100% { 
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }
        @keyframes whatsNewFloat {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, -20px); }
        }
        @keyframes whatsNewPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

/**
 * Модалка предложения установить приложение как PWA
 * Показывается только в браузере (не в standalone режиме)
 */
function InstallPromptModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{
        background: 'var(--bg, #fff)',
        borderRadius: '16px',
        maxWidth: '400px',
        width: '100%',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'slideUp 0.3s ease'
      }}>
        {/* Заголовок с градиентом */}
        <div style={{
          background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '8px'
          }}>📲</div>
          <h2 style={{
            color: 'white',
            fontSize: '22px',
            fontWeight: 700,
            margin: 0
          }}>Установите приложение</h2>
          <p style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: '14px',
            margin: '8px 0 0 0'
          }}>Это займёт всего пару секунд</p>
        </div>
        
        {/* Контент */}
        <div style={{
          padding: '24px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'var(--accent-soft, #D1FAE5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <span style={{ fontSize: '16px' }}>⚡</span>
            </div>
            <div>
              <h3 style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text, #1F2937)',
                margin: '0 0 4px 0'
              }}>Быстрый доступ</h3>
              <p style={{
                fontSize: '13px',
                color: 'var(--muted, #6B7280)',
                margin: 0,
                lineHeight: 1.5
              }}>
                Запускайте СДВиГ прямо с главного экрана — как обычное приложение.
              </p>
            </div>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            marginBottom: '20px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'var(--accent-soft, #D1FAE5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <span style={{ fontSize: '16px' }}>📴</span>
            </div>
            <div>
              <h3 style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--text, #1F2937)',
                margin: '0 0 4px 0'
              }}>Работает офлайн</h3>
              <p style={{
                fontSize: '13px',
                color: 'var(--muted, #6B7280)',
                margin: 0,
                lineHeight: 1.5
              }}>
                Все данные хранятся локально. Интернет не нужен после установки.
              </p>
            </div>
          </div>
          
          {/* Ссылка на инструкцию */}
          <a
            href="https://samur000.github.io/SDVIG-INFO/#install"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '14px',
              background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
              borderRadius: '10px',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
              marginBottom: '12px',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(15, 118, 110, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <span>Как установить?</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          
          {/* Кнопка "Позже" */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              background: 'var(--bg-secondary, #F3F4F6)',
              border: 'none',
              borderRadius: '10px',
              color: 'var(--muted, #6B7280)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--border, #E5E7EB)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-secondary, #F3F4F6)';
            }}
          >
            Позже
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  // Флаг, нужно ли показать модалку установки после закрытия "Что нового"
  const shouldShowInstallAfterWhatsNew = useRef(false);
  
  // Ref для отслеживания, нужно ли сохранять
  const isInitialMount = useRef(true);
  // Ref для debounce сохранения
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============ Загрузка данных при старте (из IndexedDB) ============
  useEffect(() => {
    async function loadData() {
      try {
        console.log('AppContext: инициализация хранилища...');
        
        // initStorage выполняет:
        // 1. Открытие IndexedDB
        // 2. Миграцию из localStorage (если нужно)
        // 3. Загрузку данных
        const loadedState = await initStorage();
        
        // Обеспечиваем совместимость со старыми данными
        let withDefaults: AppState = {
          ...loadedState,
          settings: loadedState.settings || initialState.settings
        };
        
        // Миграция кошельков к новому формату (v3.0)
        const migrated = migrateWallets(withDefaults.wallets, withDefaults.transactions);
        withDefaults = {
          ...withDefaults,
          wallets: migrated.wallets,
          transactions: migrated.transactions
        };
        
        // Миграция заметок к новому формату (с папками, тегами, статусами)
        if (withDefaults.ideas && withDefaults.ideas.length > 0) {
          withDefaults.ideas = withDefaults.ideas.map((idea: any): Idea => {
            // Если заметка уже в новом формате, оставляем как есть
            if ('tags' in idea && 'folderId' in idea && 'isPinned' in idea) {
              return idea as Idea;
            }
            // Миграция старого формата
            return {
              ...idea,
              title: undefined,
              text: (idea.text as string) || '',
              tags: [],
              folderId: null,
              isPinned: false,
              status: (idea.status === 'processed' ? 'archived' : 'inbox') as IdeaStatus,
              imageBase64: undefined
            };
          });
        }
        
        // Добавляем папки по умолчанию, если их нет
        if (!withDefaults.folders || withDefaults.folders.length === 0) {
          withDefaults.folders = [
            { id: 'inbox', name: 'Инбокс', color: '#6B7280', icon: '📥', order: 0 },
            { id: 'work', name: 'Работа', color: '#3B82F6', icon: '💼', order: 1 },
            { id: 'home', name: 'Дом', color: '#10B981', icon: '🏠', order: 2 },
            { id: 'ideas', name: 'Идеи', color: '#F59E0B', icon: '💡', order: 3 },
            { id: 'projects', name: 'Проекты', color: '#8B5CF6', icon: '🚀', order: 4 }
          ];
        }
        
        dispatch({ type: 'LOAD_STATE', payload: withDefaults });
        
        // Пересчитываем streak привычек при каждом запуске
        // (streak мог устареть если пользователь пропустил день)
        dispatch({ type: 'RECALCULATE_STREAKS' });
        
        setIsLoaded(true);
        
        // Проверяем, нужно ли показать модалку "Что нового"
        const lastShownVersion = localStorage.getItem(WHATS_NEW_SHOWN_FLAG);
        const shouldShowWhatsNew = lastShownVersion !== APP_VERSION;
        
        // Проверяем, нужно ли показать модалку установки
        const installPromptShown = localStorage.getItem(INSTALL_PROMPT_SHOWN_FLAG);
        const shouldShowInstall = !installPromptShown && !isRunningAsPWA();
        
        if (shouldShowWhatsNew) {
          // Сначала показываем "Что нового"
          setShowWhatsNew(true);
          // Запоминаем, нужно ли после этого показать модалку установки
          shouldShowInstallAfterWhatsNew.current = shouldShowInstall;
        } else if (shouldShowInstall) {
          // Если "Что нового" уже показывали для этой версии, показываем только установку
          setShowInstallPrompt(true);
        }
        
        console.log('AppContext: данные успешно загружены');
      } catch (error) {
        console.error('AppContext: ошибка загрузки данных:', error);
        setLoadError('Ошибка загрузки данных. Попробуйте обновить страницу.');
        // Даже при ошибке показываем приложение с начальным состоянием
        setIsLoaded(true);
      }
    }
    
    loadData();
  }, []);

  // ============ Сохранение данных при изменениях (в IndexedDB) ============
  useEffect(() => {
    // Пропускаем первый рендер и рендер до загрузки
    if (isInitialMount.current || !isLoaded) {
      isInitialMount.current = false;
      return;
    }

    // Debounce сохранения для избежания частых записей
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveStateAsync(state);
        // Сохранение успешно - не логируем каждый раз
      } catch (error) {
        console.error('AppContext: ошибка сохранения:', error);
      }
    }, 300); // 300ms debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, isLoaded]);

  // ============ Применение темы ============
  useEffect(() => {
    const theme = state.settings?.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  }, [state.settings?.theme]);

  // ============ Закрытие модалки "Что нового" ============
  const handleCloseWhatsNew = () => {
    localStorage.setItem(WHATS_NEW_SHOWN_FLAG, APP_VERSION);
    setShowWhatsNew(false);
    
    // После закрытия "Что нового" показываем модалку установки, если нужно
    if (shouldShowInstallAfterWhatsNew.current) {
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 300); // Небольшая задержка для плавности
    }
  };

  // ============ Закрытие модалки установки ============
  const handleCloseInstallPrompt = () => {
    localStorage.setItem(INSTALL_PROMPT_SHOWN_FLAG, 'true');
    setShowInstallPrompt(false);
  };

  // ============ Экран загрузки ============
  if (!isLoaded) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontFamily: 'system-ui',
        gap: '12px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #E5E7EB',
          borderTopColor: '#0F766E',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span style={{ color: '#6B7280' }}>Загрузка...</span>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // ============ Экран ошибки ============
  if (loadError) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontFamily: 'system-ui',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{ 
          fontSize: '48px',
          marginBottom: '16px'
        }}>⚠️</div>
        <p style={{ 
          color: '#DC2626',
          marginBottom: '16px'
        }}>{loadError}</p>
        <button 
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px',
            background: '#0F766E',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >
          Обновить страницу
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
      {showWhatsNew && <WhatsNewModal onClose={handleCloseWhatsNew} />}
      {showInstallPrompt && <InstallPromptModal onClose={handleCloseInstallPrompt} />}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
