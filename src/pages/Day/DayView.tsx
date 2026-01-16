import { useMemo, useRef, useState, useEffect, Fragment } from 'react';
import { Event } from '../../types';
import { isSameDay } from '../../utils/date';
import { 
  getEventsForDay, 
  getEventTop, 
  getEventHeight,
  groupConflictingEvents,
  eventsOverlap,
  formatTime,
  getCurrentTimePosition
} from './CalendarUtils';
import './DayView.css';

interface DayViewProps {
  date: Date;
  events: Event[];
  onEventClick?: (event: Event) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({ date, events, onEventClick }: DayViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTimePos, setCurrentTimePos] = useState<number | null>(null);
  const isCurrentDay = isSameDay(date, new Date());
  
  // Обновление позиции текущего времени каждую минуту
  useEffect(() => {
    if (!isCurrentDay) {
      setCurrentTimePos(null);
      return;
    }
    
    const updateTime = () => {
      setCurrentTimePos(getCurrentTimePosition());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000); // Каждую минуту
    
    return () => clearInterval(interval);
  }, [isCurrentDay]);
  
  const dayEvents = useMemo(() => getEventsForDay(events, date), [events, date]);
  const eventGroups = useMemo(() => groupConflictingEvents(dayEvents), [dayEvents]);
  
  // Скролл к текущему времени при загрузке (центрируем красную линию)
  useEffect(() => {
    if (isCurrentDay && containerRef.current && currentTimePos !== null) {
      // Высота видимой области контейнера
      const containerHeight = containerRef.current.clientHeight;
      // Прокручиваем так, чтобы красная линия была по середине
      const scrollPosition = currentTimePos - (containerHeight / 2);
      containerRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, [isCurrentDay]);
  
  // Обновление скролла при изменении позиции текущего времени (для центрирования)
  useEffect(() => {
    if (isCurrentDay && containerRef.current && currentTimePos !== null) {
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
  }, [currentTimePos, isCurrentDay]);
  
  return (
    <div className="day-view">
      <div className="day-view-hours">
        {HOURS.map(hour => (
          <div key={hour} className="day-view-hour">
            <span className="day-view-hour-label">{hour.toString().padStart(2, '0')}:00</span>
          </div>
        ))}
        {/* Метка на 24:00 */}
        <div className="day-view-hour">
          <span className="day-view-hour-label">00:00</span>
        </div>
      </div>
      
      <div className="day-view-content" ref={containerRef}>
        {/* Линия текущего времени */}
        {isCurrentDay && currentTimePos !== null && (
          <div 
            className="day-view-current-time"
            style={{ top: `${currentTimePos}px` }}
          >
            <div className="day-view-current-time-line" />
            <div className="day-view-current-time-dot" />
          </div>
        )}
        
        {/* Сетка часов */}
        <div className="day-view-grid">
          {HOURS.map(hour => (
            <Fragment key={hour}>
              {/* Основная линия часа */}
              <div className="day-view-grid-line-hour" style={{ top: `${hour * 60}px` }} />
              {/* Прерывистая линия на половине часа (30 минут) */}
              {hour < 23 && (
                <div 
                  className="day-view-grid-line-half" 
                  style={{ top: `${hour * 60 + 30}px` }} 
                />
              )}
            </Fragment>
          ))}
          {/* Линия на 24:00 (00:00 следующего дня) */}
          <div className="day-view-grid-line-hour" style={{ top: '1440px' }} />
        </div>
        
        {/* События */}
        <div className="day-view-events">
          {(() => {
            // Вычисляем смещения для групп, которые не должны накладываться
            const groupTopOffsets = new Map<number, number>();
            eventGroups.forEach((group, groupIndex) => {
              if (group.length === 0) return;
              const firstEvent = group[0];
              if (!firstEvent.startTime) return;
              const firstStartTime = typeof firstEvent.startTime === 'string' ? new Date(firstEvent.startTime) : firstEvent.startTime;
              const firstTop = getEventTop(firstStartTime);
              
              // Проверяем, не накладывается ли эта группа с предыдущими
              let offset = 0;
              for (let i = 0; i < groupIndex; i++) {
                const prevGroup = eventGroups[i];
                if (prevGroup.length === 0) continue;
                const prevFirstEvent = prevGroup[0];
                if (!prevFirstEvent.startTime || !prevFirstEvent.endTime) continue;
                const prevStartTime = typeof prevFirstEvent.startTime === 'string' ? new Date(prevFirstEvent.startTime) : prevFirstEvent.startTime;
                const prevEndTime = typeof prevFirstEvent.endTime === 'string' ? new Date(prevFirstEvent.endTime) : prevFirstEvent.endTime;
                const prevTop = getEventTop(prevStartTime);
                const prevHeight = getEventHeight(prevStartTime, prevEndTime);
                
                // Если группы начинаются в одно время, но не пересекаются, смещаем текущую группу
                if (firstTop === prevTop && !eventsOverlap(firstEvent, prevFirstEvent)) {
                  const prevOffset = groupTopOffsets.get(i) || 0;
                  offset = Math.max(offset, prevHeight + prevOffset);
                }
              }
              if (offset > 0) {
                groupTopOffsets.set(groupIndex, offset);
              }
            });
            
            return eventGroups.map((group, groupIndex) => {
              // Рассчитываем позиционирование событий в группе с учетом отступов
              const groupPadding = 0.5; // Отступ между событиями в группе (в %)
              const totalPadding = groupPadding * (group.length - 1);
              const availableWidth = 100 - totalPadding;
              const eventWidth = availableWidth / group.length;
              const groupTopOffset = groupTopOffsets.get(groupIndex) || 0;
              
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
                
                const top = getEventTop(startTime) + groupTopOffset;
                const height = getEventHeight(startTime, endTime);
                // Рассчитываем left с учетом отступов между событиями
                const left = eventIndex * (eventWidth + groupPadding);
                const width = eventWidth;
                const color = event.color || '#4285F4';
                const isRoutine = !!event.routineId;
              
              return (
                <div
                  key={event.id}
                  className={`day-view-event ${isRoutine ? 'day-view-event-routine' : ''}`}
                  style={{
                    top: `${top}px`,
                    left: `${left}%`,
                    width: `${width}%`,
                    height: `${height}px`,
                    borderLeftColor: color,
                    backgroundColor: color + '20'
                  }}
                  onClick={() => onEventClick?.(event)}
                >
                  <div className="day-view-event-content">
                    <div className="day-view-event-title">
                      {isRoutine && (
                        <span className="day-view-event-routine-icon">🔄 </span>
                      )}
                      {event.title}
                    </div>
                    <div className="day-view-event-time">
                      {formatTime(startTime)} – {formatTime(endTime)}
                    </div>
                    {event.description && (
                      <div className="day-view-event-description">{event.description}</div>
                    )}
                  </div>
                </div>
              );
              }).filter(Boolean);
            });
          })()}
        </div>
      </div>
    </div>
  );
}

