import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Modal } from '../../components/Modal';
import { useApp } from '../../store/AppContext';
import { formatDate, getDayOfWeek } from '../../utils/date';
import { Routine, DayOfWeek } from '../../types';
import './RoutineAnalytics.css';

type PeriodFilter = '7days' | '30days' | 'all';

const DAY_NAMES: Record<DayOfWeek, string> = {
  'пн': 'Понедельник',
  'вт': 'Вторник',
  'ср': 'Среда',
  'чт': 'Четверг',
  'пт': 'Пятница',
  'сб': 'Суббота',
  'вс': 'Воскресенье'
};

const DAY_SHORT: DayOfWeek[] = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

// Функция для склонения дня недели в дательный падеж множественного числа (по [день]ам)
function getDayNameDativePlural(day: DayOfWeek): string {
  // Правила склонения для дательного падежа множественного числа
  // Каждый день имеет своё правильное окончание
  switch (day) {
    case 'пн':
      return 'понедельникам';
    case 'вт':
      return 'вторникам';
    case 'ср':
      return 'средам';
    case 'чт':
      return 'четвергам';
    case 'пт':
      return 'пятницам';
    case 'сб':
      return 'субботам';
    case 'вс':
      return 'воскресеньям';
    default:
      // Fallback на случай изменения структуры
      const dayName = DAY_NAMES[day as DayOfWeek];
      return dayName.toLowerCase() + 'ам';
  }
}

// Получаем статус рутины по проценту
function getRoutineStatus(percent: number): 'good' | 'warning' | 'danger' {
  if (percent >= 70) return 'good';
  if (percent >= 40) return 'warning';
  return 'danger';
}

// Компонент мини-календаря
const MiniCalendar: React.FC<{ 
  completedDates: string[]; 
  scheduledDates: string[];
  days: number;
  startDate?: Date; // Начальная дата для периода (если не указана, используется days от сегодня)
}> = ({ completedDates, scheduledDates, days, startDate }) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const squares = [];
  
  let currentDate: Date;
  if (startDate) {
    // Если указана начальная дата, начинаем с неё
    currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
  } else {
    // Иначе используем days от сегодня
    currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() - (days - 1));
    currentDate.setHours(0, 0, 0, 0);
  }
  
  const endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);
  
  // Если используем startDate, показываем все дни от startDate до today
  // Если нет, показываем последние days дней
  const actualDays = startDate 
    ? Math.ceil((endDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    : days;
  
  for (let i = 0; i < actualDays; i++) {
    const date = new Date(currentDate);
    date.setDate(currentDate.getDate() + i);
    const dateStr = formatDate(date);
    
    // Пропускаем будущие даты
    if (date > today) break;
    
    const isScheduled = scheduledDates.includes(dateStr);
    const isCompleted = completedDates.includes(dateStr);
    
    let className = 'calendar-square';
    if (isScheduled) {
      className += isCompleted ? ' completed' : ' missed';
    } else {
      className += ' inactive';
    }
    
    squares.push(
      <div key={dateStr} className={className} title={dateStr} />
    );
  }
  
  return <div className="mini-calendar">{squares}</div>;
};

// Компонент прогресс-бара
const ProgressBar: React.FC<{ 
  percent: number; 
  status: 'good' | 'warning' | 'danger';
}> = ({ percent, status }) => {
  return (
    <div className="routine-progress-bar">
      <div 
        className={`routine-progress-fill ${status}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
};

export function RoutineAnalyticsPage() {
  const navigate = useNavigate();
  const { state } = useApp();
  const [period, setPeriod] = useState<PeriodFilter>('7days');
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  
  // Вычисляем диапазон дат
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    let startDate = new Date();
    
    if (period === '7days') {
      startDate.setDate(today.getDate() - 6);
    } else if (period === '30days') {
      startDate.setDate(today.getDate() - 29);
    } else {
      // Все время - для каждой рутины учитываем её собственную дату создания
      // но для общего диапазона берем самую раннюю дату создания среди всех рутин
      let earliestDate: Date | null = null;
      
      // Ищем самую раннюю дату создания среди текущих рутин
      state.routines.forEach(routine => {
        if (routine.createdAt) {
          const createdAt = new Date(routine.createdAt + 'T00:00:00');
          if (!earliestDate || createdAt < earliestDate) {
            earliestDate = createdAt;
          }
        }
      });
      
      // Если нет даты создания, ищем самую раннюю дату выполнения
      // среди текущих рутин (только те, что соответствуют запланированным дням недели)
      if (!earliestDate) {
        // Находим все выполненные даты, которые могли быть запланированы
        const allCompletedDates: string[] = [];
        state.routines.forEach(routine => {
          Object.keys(routine.completed).forEach(dateStr => {
            if (routine.completed[dateStr]) {
              const date = new Date(dateStr + 'T00:00:00');
              const dayOfWeek = getDayOfWeek(date);
              // Проверяем, что эта дата могла быть запланирована (соответствует дням недели рутины)
              if (routine.days.includes(dayOfWeek)) {
                // Проверяем createdAt если есть
                if (!routine.createdAt || date >= new Date(routine.createdAt + 'T00:00:00')) {
                  allCompletedDates.push(dateStr);
                }
              }
            }
          });
        });
        
        if (allCompletedDates.length > 0) {
          const sorted = allCompletedDates.sort();
          earliestDate = new Date(sorted[0] + 'T00:00:00');
        }
      }
      
      // Если всё равно нет даты, используем 30 дней назад как дефолт
      if (earliestDate) {
        startDate = earliestDate;
      } else {
        startDate.setDate(today.getDate() - 29);
      }
    }
    
    startDate.setHours(0, 0, 0, 0);
    
    return { start: startDate, end: today };
  }, [period, state.routines]);
  
  // Статистика по каждой рутине
  const routineStats = useMemo(() => {
    // Функция получения запланированных дат для рутины
    const getScheduledDates = (routine: Routine): string[] => {
      const dates: string[] = [];
      
      // Определяем начальную дату для этой рутины
      let startDate: Date;
      if (routine.createdAt) {
        const createdAt = new Date(routine.createdAt + 'T00:00:00');
        createdAt.setHours(0, 0, 0, 0);
        // Для периода "all" всегда используем дату создания рутины, если она есть
        // Для других периодов используем более позднюю дату из двух: начало диапазона или дата создания
        if (period === 'all') {
          // Для периода "all" всегда используем дату создания рутины
          startDate = createdAt;
        } else {
          // Для других периодов используем максимальную дату (дата создания или начало диапазона)
          startDate = createdAt > dateRange.start ? createdAt : new Date(dateRange.start);
        }
      } else {
        // Если нет даты создания, используем начало диапазона
        startDate = new Date(dateRange.start);
      }
      
      const current = new Date(startDate);
      
      while (current <= dateRange.end) {
        const dayOfWeek = getDayOfWeek(current);
        if (routine.days.includes(dayOfWeek)) {
          dates.push(formatDate(current));
        }
        current.setDate(current.getDate() + 1);
      }
      
      return dates;
    };
    
    return state.routines.map(routine => {
      const scheduledDates = getScheduledDates(routine);
      
      // Фильтруем выполненные даты: учитываем только те, что:
      // 1. Входят в запланированные даты для периода
      // 2. Действительно помечены как выполненные
      const completedDates = scheduledDates.filter(date => {
        // Проверяем, что дата действительно запланирована и выполнена
        return routine.completed[date] === true;
      });
      
      const total = scheduledDates.length;
      const completed = completedDates.length;
      const missed = total - completed;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      const status = getRoutineStatus(percent);
      
      return {
        routine,
        scheduledDates,
        completedDates,
        total,
        completed,
        missed,
        percent,
        status
      };
    }).sort((a, b) => a.percent - b.percent); // Сортируем по проценту (худшие первые)
  }, [state.routines, dateRange]);
  
  // Общая статистика
  const overallStats = useMemo(() => {
    const totalRoutines = state.routines.length;
    
    if (totalRoutines === 0) {
      return {
        averagePercent: 0,
        totalRoutines: 0,
        avgMissedPerWeek: 0
      };
    }
    
    const totalScheduled = routineStats.reduce((sum, r) => sum + r.total, 0);
    const totalCompleted = routineStats.reduce((sum, r) => sum + r.completed, 0);
    const totalMissed = routineStats.reduce((sum, r) => sum + r.missed, 0);
    
    const averagePercent = totalScheduled > 0 
      ? Math.round((totalCompleted / totalScheduled) * 100) 
      : 0;
    
    const days = period === '7days' ? 7 : period === '30days' ? 30 : 
      Math.max(1, Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)));
    const weeks = days / 7;
    const avgMissedPerWeek = weeks > 0 ? Math.round(totalMissed / weeks * 10) / 10 : 0;
    
    return {
      averagePercent,
      totalRoutines,
      avgMissedPerWeek
    };
  }, [routineStats, period, dateRange, state.routines.length]);
  
  // Детальная статистика для выбранной рутины
  const routineDetails = useMemo(() => {
    if (!selectedRoutine) return null;
    
    const stats = routineStats.find(r => r.routine.id === selectedRoutine.id);
    if (!stats) return null;
    
    // Подсчет пропусков по дням недели
    const missedByDay: Record<DayOfWeek, number> = {
      'пн': 0, 'вт': 0, 'ср': 0, 'чт': 0, 'пт': 0, 'сб': 0, 'вс': 0
    };
    
    stats.scheduledDates.forEach(dateStr => {
      if (!stats.completedDates.includes(dateStr)) {
        const date = new Date(dateStr + 'T00:00:00');
        const day = getDayOfWeek(date);
        missedByDay[day]++;
      }
    });
    
    // Находим день с максимальным количеством пропусков
    let worstDay: DayOfWeek = 'пн';
    let maxMisses = 0;
    (Object.entries(missedByDay) as [DayOfWeek, number][]).forEach(([day, count]) => {
      if (count > maxMisses) {
        maxMisses = count;
        worstDay = day;
      }
    });
    
    // Лучший стрик
    let bestStreak = 0;
    let currentStreak = 0;
    const sortedDates = [...stats.scheduledDates].sort();
    
    sortedDates.forEach(date => {
      if (stats.completedDates.includes(date)) {
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    });
    
    // Время рутины (утро/день/вечер)
    let timeOfDay = 'день';
    if (selectedRoutine.time) {
      const hour = parseInt(selectedRoutine.time.split(':')[0], 10);
      if (hour < 12) timeOfDay = 'утро';
      else if (hour >= 18) timeOfDay = 'вечер';
    }
    
    return {
      ...stats,
      missedByDay,
      worstDay,
      bestStreak,
      timeOfDay
    };
  }, [selectedRoutine, routineStats]);
  
  // Генерация инсайта
  const insight = useMemo(() => {
    if (routineStats.length === 0) return null;
    
    // Находим рутину с наибольшим количеством пропусков
    const worstRoutine = routineStats[0];
    if (!worstRoutine || worstRoutine.missed === 0) {
      return {
        icon: '🎉',
        text: 'Отлично! Все рутины выполняются стабильно',
        variant: 'good' as const
      };
    }
    
    // Анализируем пропуски по дням недели
    const missedByDay: Record<DayOfWeek, number> = {
      'пн': 0, 'вт': 0, 'ср': 0, 'чт': 0, 'пт': 0, 'сб': 0, 'вс': 0
    };
    
    routineStats.forEach(stats => {
      stats.scheduledDates.forEach(dateStr => {
        if (!stats.completedDates.includes(dateStr)) {
          const date = new Date(dateStr + 'T00:00:00');
          const day = getDayOfWeek(date);
          missedByDay[day]++;
        }
      });
    });
    
    let worstDay: DayOfWeek = 'пн';
    let maxMisses = 0;
    (Object.entries(missedByDay) as [DayOfWeek, number][]).forEach(([day, count]) => {
      if (count > maxMisses) {
        maxMisses = count;
        worstDay = day;
      }
    });
    
    // Определяем количество пропусков для insight о пропусках
    const totalMisses = routineStats.reduce((sum, r) => sum + r.missed, 0);
    
    // Если есть значительные пропуски по дням недели
    if (maxMisses > 2) {
      // Определяем цвет и иконку на основе общего количества пропусков
      if (totalMisses > 10) {
        return {
          icon: '⚠️',
          text: `Критично! ${totalMisses} пропусков. Больше всего по ${getDayNameDativePlural(worstDay)}`,
          variant: 'danger' as const,
          skipCount: totalMisses
        };
      } else if (totalMisses > 5) {
        return {
          icon: '😓',
          text: `${totalMisses} пропусков. Больше всего по ${getDayNameDativePlural(worstDay)}`,
          variant: 'warning' as const,
          skipCount: totalMisses
        };
      } else {
        return {
          icon: '📊',
          text: `Больше всего пропусков по ${getDayNameDativePlural(worstDay)}`,
          variant: 'good' as const,
          skipCount: totalMisses
        };
      }
    }
    
    // Если худшая рутина имеет много пропусков
    if (worstRoutine.missed > 10) {
      return {
        icon: '⚠️',
        text: `«${worstRoutine.routine.title}» критично — ${worstRoutine.missed} пропусков, выполнено только ${worstRoutine.percent}%`,
        variant: 'danger' as const,
        skipCount: worstRoutine.missed
      };
    } else if (worstRoutine.missed > 5) {
      return {
        icon: '🔶',
        text: `«${worstRoutine.routine.title}» требует внимания — ${worstRoutine.missed} пропусков, выполнено только ${worstRoutine.percent}%`,
        variant: 'warning' as const,
        skipCount: worstRoutine.missed
      };
    } else if (worstRoutine.percent < 50) {
      return {
        icon: '📊',
        text: `«${worstRoutine.routine.title}» требует внимания — выполнено только ${worstRoutine.percent}%`,
        variant: 'good' as const,
        skipCount: worstRoutine.missed
      };
    }
    
    // Анализ по времени
    const morningRoutines = routineStats.filter(r => {
      if (!r.routine.time) return false;
      const hour = parseInt(r.routine.time.split(':')[0], 10);
      return hour < 10;
    });
    
    if (morningRoutines.length > 0) {
      const avgMorning = morningRoutines.reduce((sum, r) => sum + r.percent, 0) / morningRoutines.length;
      if (avgMorning < 60) {
        return {
          icon: '📊',
          text: 'Утренние рутины (до 10:00) выполняются хуже остальных',
          variant: 'good' as const
        };
      }
    }
    
    return {
      icon: '✨',
      text: 'Продолжайте в том же духе! Стабильность — ключ к успеху',
      variant: 'good' as const
    };
  }, [routineStats]);
  
  return (
    <Layout
      title="Аналитика рутины"
      headerRight={
        <button 
          className="header-back-btn"
          onClick={() => navigate(-1)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
      }
    >
      <div className="routine-analytics">
        {/* Фильтр периода */}
        <div className="period-filter">
          <button 
            className={`period-chip ${period === '7days' ? 'active' : ''}`}
            onClick={() => setPeriod('7days')}
          >
            7 дней
          </button>
          <button 
            className={`period-chip ${period === '30days' ? 'active' : ''}`}
            onClick={() => setPeriod('30days')}
          >
            30 дней
          </button>
          <button 
            className={`period-chip ${period === 'all' ? 'active' : ''}`}
            onClick={() => setPeriod('all')}
          >
            Всё время
          </button>
        </div>
        
        {/* Общая статистика */}
        <div className="overview-card">
          <div className="overview-stat">
            <span className="overview-value">{overallStats.averagePercent}%</span>
            <span className="overview-label">Средний %</span>
          </div>
          <div className="overview-divider" />
          <div className="overview-stat">
            <span className="overview-value">{overallStats.totalRoutines}</span>
            <span className="overview-label">Всего рутин</span>
          </div>
          <div className="overview-divider" />
          <div className="overview-stat">
            <span className="overview-value">{overallStats.avgMissedPerWeek}</span>
            <span className="overview-label">Пропусков/нед</span>
          </div>
        </div>
        
        {/* Список рутин */}
        <div className="routines-section">
          <h3 className="section-title">Пропуски</h3>
          
          {routineStats.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <p>Нет рутин для анализа</p>
            </div>
          ) : (
            <div className="routines-list">
              {routineStats.map(({ routine, percent, status, missed }) => (
                <div 
                  key={routine.id}
                  className="routine-item"
                  onClick={() => setSelectedRoutine(routine)}
                >
                  <div className="routine-info">
                    <span className="routine-title">{routine.title}</span>
                    <span className="routine-missed">{missed} пропусков</span>
                  </div>
                  <div className="routine-stats">
                    <span className={`routine-percent ${status}`}>{percent}%</span>
                    <ProgressBar percent={percent} status={status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Инсайт */}
        {insight && (
          <div className={`insight-card insight-${insight.variant || 'good'}`}>
            <span className="insight-icon">{insight.icon}</span>
            <span className="insight-text">{insight.text}</span>
          </div>
        )}
      </div>
      
      {/* Модалка детализации */}
      <Modal
        isOpen={!!selectedRoutine}
        onClose={() => setSelectedRoutine(null)}
        title={selectedRoutine?.title || 'Детали рутины'}
      >
        {routineDetails && (
          <div className="routine-details">
            {/* Мини-календарь */}
            <div className="details-section">
              <h4>Выполнение за период</h4>
              <MiniCalendar 
                completedDates={routineDetails.completedDates}
                scheduledDates={routineDetails.scheduledDates}
                days={period === '7days' ? 7 : period === '30days' ? 30 : 60}
                startDate={period === 'all' ? dateRange.start : undefined}
              />
              <div className="calendar-legend">
                <span className="legend-item"><span className="dot completed" /> выполнено</span>
                <span className="legend-item"><span className="dot missed" /> пропущено</span>
              </div>
            </div>
            
            {/* Статистика */}
            <div className="details-stats">
              <div className="detail-stat">
                <span className="detail-value good">{routineDetails.completed}</span>
                <span className="detail-label">выполнено</span>
              </div>
              <div className="detail-stat">
                <span className="detail-value danger">{routineDetails.missed}</span>
                <span className="detail-label">пропущено</span>
              </div>
              <div className="detail-stat">
                <span className="detail-value">{routineDetails.bestStreak}</span>
                <span className="detail-label">лучший стрик</span>
              </div>
            </div>
            
            {/* Пропуски по дням недели */}
            <div className="details-section">
              <h4>Пропуски по дням недели</h4>
              <div className="weekday-chart">
                {DAY_SHORT.map(day => {
                  const count = routineDetails.missedByDay[day];
                  const maxCount = Math.max(...Object.values(routineDetails.missedByDay), 1);
                  const height = (count / maxCount) * 100;
                  const isWorst = day === routineDetails.worstDay && count > 0;
                  
                  return (
                    <div key={day} className="weekday-bar-container">
                      <div 
                        className={`weekday-bar ${isWorst ? 'worst' : ''}`}
                        style={{ height: `${height}%` }}
                      />
                      <span className="weekday-label">{day}</span>
                      <span className="weekday-count">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Инсайт по рутине */}
            {routineDetails.missed > 0 && (
              <div className={`routine-insight ${routineDetails.missed > 10 ? 'danger' : routineDetails.missed > 5 ? 'warning' : 'good'}`}>
                <span className="insight-icon">
                  {routineDetails.missed > 10 ? '⚠️' : routineDetails.missed > 5 ? '🔶' : '📊'}
                </span>
                <span className="insight-text">
                  {routineDetails.missed > 10 
                    ? `Критично! ${routineDetails.missed} пропусков. Чаще всего пропускается по ${getDayNameDativePlural(routineDetails.worstDay)}`
                    : routineDetails.missed > 5
                    ? `${routineDetails.missed} пропусков. Чаще всего пропускается по ${getDayNameDativePlural(routineDetails.worstDay)}`
                    : `Чаще всего пропускается по ${getDayNameDativePlural(routineDetails.worstDay)}`
                  }
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
}
