import { useMemo, useRef, useState, useEffect, Fragment } from 'react';
import { Event } from '../../types';
import { formatDate, getWeekDates, isSameDay } from '../../utils/date';
import { 
  getEventsForWeek, 
  getEventTop, 
  getEventHeight,
  groupConflictingEvents,
  formatTime,
  getCurrentTimePosition
} from './CalendarUtils';
import './WeekView.css';

interface WeekViewProps {
  date: Date;
  events: Event[];
  onEventClick?: (event: Event) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({ date, events, onEventClick }: WeekViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTimePos, setCurrentTimePos] = useState<number | null>(null);
  
  const weekDates = useMemo(() => getWeekDates(date), [date]);
  
  // Обновление позиции текущего времени
  useEffect(() => {
    const updateTime = () => {
      setCurrentTimePos(getCurrentTimePosition());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  const weekEvents = useMemo(() => getEventsForWeek(events, weekDates), [events, weekDates]);
  
  // Группировка событий по дням
  const eventsByDay = useMemo(() => {
    const groups: Record<string, Event[]> = {};
    weekDates.forEach(date => {
      const dateStr = formatDate(date);
      groups[dateStr] = weekEvents.filter(event => {
        // Новый формат с startTime
        if (event.startTime) {
          const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
          if (isNaN(startTime.getTime())) return false;
          return isSameDay(startTime, date);
        }
        // Старый формат с date (для совместимости)
        if (event.date) {
          return event.date === dateStr;
        }
        return false;
      }).filter(event => {
        // Фильтруем только события с валидными startTime/endTime для отображения на временной шкале
        if (event.startTime && event.endTime) {
          const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
          const endTime = typeof event.endTime === 'string' ? new Date(event.endTime) : event.endTime;
          return !isNaN(startTime.getTime()) && !isNaN(endTime.getTime());
        }
        return false; // Старые события без времени не показываем на временной шкале
      });
    });
    return groups;
  }, [weekEvents, weekDates]);
  
  const today = new Date();
  const isCurrentWeek = weekDates.some(day => isSameDay(day, today));
  
  // Скролл к текущему времени при загрузке (центрируем красную линию)
  useEffect(() => {
    if (isCurrentWeek && containerRef.current && currentTimePos !== null) {
      // Высота видимой области контейнера
      const containerHeight = containerRef.current.clientHeight;
      // Прокручиваем так, чтобы красная линия была по середине
      const scrollPosition = currentTimePos - (containerHeight / 2);
      containerRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, [isCurrentWeek]);
  
  // Обновление скролла при изменении позиции текущего времени (для центрирования)
  useEffect(() => {
    if (isCurrentWeek && containerRef.current && currentTimePos !== null) {
      const containerHeight = containerRef.current.clientHeight;
      const currentScrollTop = containerRef.current.scrollTop;
      const visibleTop = currentScrollTop;
      const visibleBottom = currentScrollTop + containerHeight;
      
      // Если текущее время не в видимой области, центрируем его
      if (currentTimePos < visibleTop || currentTimePos > visibleBottom) {
        const scrollPosition = currentTimePos - (containerHeight / 2);
        containerRef.current.scrollTop = Math.max(0, scrollPosition);
      }
    }
  }, [currentTimePos, isCurrentWeek]);
  
  return (
    <div className="week-view">
      <div className="week-view-body">
        {/* Колонка с часами */}
        <div className="week-view-hours">
          {HOURS.map(hour => (
            <div key={hour} className="week-view-hour">
              <span className="week-view-hour-label">{hour.toString().padStart(2, '0')}:00</span>
            </div>
          ))}
          {/* Метка на 24:00 */}
          <div className="week-view-hour">
            <span className="week-view-hour-label">00:00</span>
          </div>
        </div>
        
        {/* Область контента */}
        <div className="week-view-content" ref={containerRef}>
          {/* Линия текущего времени */}
          {currentTimePos !== null && isCurrentWeek && (
            <div 
              className="week-view-current-time"
              style={{ top: `${currentTimePos}px` }}
            >
              <div className="week-view-current-time-line" />
              <div className="week-view-current-time-dot" />
            </div>
          )}
          
          {/* Вертикальные линии-разделители дней */}
          {weekDates.slice(1).map((day, index) => {
            const left = ((index + 1) / 7) * 100;
            return (
              <div
                key={`divider-${formatDate(day)}`}
                className="week-view-day-divider"
                style={{ left: `${left}%` }}
              />
            );
          })}
          
          {/* Сетка */}
          <div className="week-view-grid">
            {HOURS.map(hour => (
              <Fragment key={hour}>
                {/* Основная линия часа */}
                <div 
                  className="week-view-grid-row-hour" 
                  style={{ top: `${hour * 60}px` }}
                >
                  {weekDates.map((day) => (
                    <div key={formatDate(day)} className="week-view-grid-cell" />
                  ))}
                </div>
                {/* Прерывистая линия на половине часа (30 минут) */}
                {hour < 23 && (
                  <div 
                    className="week-view-grid-row-half" 
                    style={{ top: `${hour * 60 + 30}px` }}
                  >
                    {weekDates.map((day) => (
                      <div key={formatDate(day)} className="week-view-grid-cell-half" />
                    ))}
                  </div>
                )}
              </Fragment>
            ))}
            {/* Линия на 24:00 */}
            <div 
              className="week-view-grid-row-hour" 
              style={{ top: '1440px' }}
            >
              {weekDates.map((day) => (
                <div key={formatDate(day)} className="week-view-grid-cell" />
              ))}
            </div>
          </div>
          
          {/* События */}
          <div className="week-view-events">
            {weekDates.map((day, dayIndex) => {
              const dateStr = formatDate(day);
              const dayEvents = eventsByDay[dateStr] || [];
              const eventGroups = groupConflictingEvents(dayEvents);
              const left = (100 / 7) * dayIndex;
              
              return (
                <div 
                  key={dateStr} 
                  className="week-view-day-column"
                  style={{ left: `${left}%`, width: `${100 / 7}%` }}
                >
                  {eventGroups.map((group) => {
                    const groupWidth = 100 / group.length;
                    return group.map((event, eventIndex) => {
                      // Пропускаем события без startTime/endTime (старый формат)
                      if (!event.startTime || !event.endTime) {
                        return null;
                      }
                      
                      const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
                      const endTime = typeof event.endTime === 'string' ? new Date(event.endTime) : event.endTime;
                      
                      // Проверяем валидность дат
                      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
                        return null;
                      }
                      
                      const top = getEventTop(startTime);
                      const height = getEventHeight(startTime, endTime);
                      const eventLeft = (groupWidth * eventIndex);
                      const eventWidth = groupWidth;
                      const color = event.color || '#4285F4';
                      const isRoutine = !!event.routineId;
                      
                      return (
                        <div
                          key={event.id}
                          className={`week-view-event ${isRoutine ? 'week-view-event-routine' : ''}`}
                          style={{
                            top: `${top}px`,
                            left: `${eventLeft}%`,
                            width: `${eventWidth}%`,
                            height: `${height}px`,
                            borderLeftColor: color,
                            backgroundColor: color + '20'
                          }}
                          onClick={() => onEventClick?.(event)}
                        >
                          <div className="week-view-event-content">
                            <div className="week-view-event-title">
                              {isRoutine && (
                                <span className="week-view-event-routine-icon">🔄 </span>
                              )}
                              {event.title}
                            </div>
                            <div className="week-view-event-time">
                              {formatTime(startTime)}
                            </div>
                          </div>
                        </div>
                      );
                    }).filter(Boolean);
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

