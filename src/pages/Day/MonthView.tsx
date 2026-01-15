import { useMemo } from 'react';
import { Event } from '../../types';
import { 
  getMonthCalendarDates, 
  formatDate, 
  isToday, 
  isSameMonth 
} from '../../utils/date';
import { getEventsForDay } from './CalendarUtils';
import './MonthView.css';

interface MonthViewProps {
  viewDate: Date;
  selectedDate: Date;
  events: Event[];
  onSelectDate: (date: Date) => void;
}

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export function MonthView({ viewDate, selectedDate, events, onSelectDate }: MonthViewProps) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  const calendarDates = useMemo(() => 
    getMonthCalendarDates(year, month), 
    [year, month]
  );
  
  // Группировка событий по датам
  const eventsByDate = useMemo(() => {
    const groups: Record<string, Event[]> = {};
    calendarDates.forEach(date => {
      const dateStr = formatDate(date);
      const dayEvents = getEventsForDay(events, date);
      if (dayEvents.length > 0) {
        groups[dateStr] = dayEvents;
      }
    });
    return groups;
  }, [events, calendarDates]);
  
  return (
    <div className="month-view">
      {/* Шапка с названиями дней недели */}
      <div className="month-view-weekdays">
        {DAY_LABELS.map(day => (
          <div key={day} className="month-view-weekday">{day}</div>
        ))}
      </div>
      
      {/* Сетка дней */}
      <div className="month-view-grid">
        {calendarDates.map((date, idx) => {
          const dateStr = formatDate(date);
          const isCurrentMonth = isSameMonth(date, month, year);
          const isSelected = formatDate(selectedDate) === dateStr;
          const isTodayDate = isToday(date);
          const dayEvents = eventsByDate[dateStr] || [];
          const eventsCount = dayEvents.length;
          const maxVisibleEvents = 3; // Максимум видимых событий
          
          return (
            <button
              key={idx}
              className={`month-view-day ${!isCurrentMonth ? 'other-month' : ''} ${isSelected ? 'selected' : ''} ${isTodayDate ? 'today' : ''}`}
              onClick={() => onSelectDate(date)}
            >
              <span className="month-view-day-num">{date.getDate()}</span>
              <div className="month-view-day-events">
                {dayEvents.slice(0, maxVisibleEvents).map(event => {
                  const color = event.color || '#4285F4';
                  const isRoutine = !!event.routineId;
                  // Форматируем время для старых событий
                  let timeLabel = '';
                  if (event.startTime) {
                    const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
                    if (!isNaN(startTime.getTime())) {
                      const hours = startTime.getHours().toString().padStart(2, '0');
                      const minutes = startTime.getMinutes().toString().padStart(2, '0');
                      timeLabel = `${hours}:${minutes} `;
                    }
                  } else if (event.time) {
                    timeLabel = `${event.time} `;
                  }
                  
                  return (
                    <div
                      key={event.id}
                      className={`month-view-event-bar ${isRoutine ? 'month-view-event-routine' : ''}`}
                      style={{ 
                        backgroundColor: color + '20',
                        borderLeftColor: color
                      }}
                      title={event.title}
                    >
                      <span className="month-view-event-title">
                        {isRoutine && (
                          <span className="month-view-event-routine-icon">🔄 </span>
                        )}
                        {timeLabel && <span className="month-view-event-time">{timeLabel}</span>}
                        {event.title}
                      </span>
                    </div>
                  );
                })}
                {eventsCount > maxVisibleEvents && (
                  <div className="month-view-event-more">
                    +{eventsCount - maxVisibleEvents}
                  </div>
                )}
                {eventsCount === 0 && isCurrentMonth && (
                  <div className="month-view-event-empty" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

