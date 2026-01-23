import { Routine, Event } from '../types';
import { formatDate, getDayOfWeek } from './date';
import { v4 as uuid } from 'uuid';

/**
 * Парсит время из строки "09:00" или "09:00-10:00"
 * Если указан интервал, длительность игнорируется
 */
function parseTime(timeStr: string, durationMinutes: number = 60): { startHour: number; startMinute: number; endHour: number; endMinute: number } {
  if (timeStr.includes('-')) {
    // Интервал "09:00-10:00" - используем указанный интервал
    const [start, end] = timeStr.split('-').map(t => t.trim());
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    return { startHour, startMinute, endHour, endMinute };
  } else {
    // Одно время "09:00" - используем длительность
    // Вычисляем время окончания математически (без зависимости от текущей даты)
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

/**
 * Генерирует события из рутины на указанный период
 */
export function generateEventsFromRoutine(
  routine: Routine,
  startDate: Date,
  endDate: Date,
  existingEvents: Event[] = []
): Event[] {
  const events: Event[] = [];
  
  // Используем длительность из рутины (минимум 10 минут, по умолчанию 60)
  const durationMinutes = routine.duration && routine.duration >= 10 ? routine.duration : 60;
  
  // Парсим время рутины
  let startHour = 9;
  let startMinute = 0;
  let endHour = 10;
  let endMinute = 0;
  
  if (routine.time) {
    const time = parseTime(routine.time, durationMinutes);
    startHour = time.startHour;
    startMinute = time.startMinute;
    endHour = time.endHour;
    endMinute = time.endMinute;
  } else {
    // Если время не указано, используем дефолтное время (9:00) и длительность
    // Вычисляем время окончания математически
    const totalEndMinutes = 9 * 60 + 0 + durationMinutes;
    endHour = Math.floor(totalEndMinutes / 60) % 24;
    endMinute = totalEndMinutes % 60;
  }
  
  // Создаем Set существующих дат событий для этой рутины, чтобы не дублировать
  const existingDates = new Set(
    existingEvents
      .filter(e => e.routineId === routine.id)
      .map(e => {
        const startTime = typeof e.startTime === 'string' ? new Date(e.startTime) : e.startTime;
        return formatDate(startTime);
      })
  );
  
  // Определяем минимальную дату для генерации событий
  // Если у рутины есть createdAt, не генерируем события раньше этой даты
  let minDate = new Date(startDate);
  minDate.setHours(0, 0, 0, 0);
  
  if (routine.createdAt) {
    const createdAtDate = new Date(routine.createdAt + 'T00:00:00');
    if (!isNaN(createdAtDate.getTime()) && createdAtDate > minDate) {
      minDate = createdAtDate;
    }
  }
  
  // Проходим по всем дням в диапазоне
  const current = new Date(minDate);
  current.setHours(0, 0, 0, 0);
  
  while (current <= endDate) {
    const dateStr = formatDate(current);
    const dayOfWeek = getDayOfWeek(current);
    
    // Проверяем, должен ли быть событие в этот день недели
    if (routine.days.includes(dayOfWeek) && !existingDates.has(dateStr)) {
      // Создаем событие - используем явное создание через конструктор Date
      const year = current.getFullYear();
      const month = current.getMonth();
      const day = current.getDate();
      
      const startTime = new Date(year, month, day, startHour, startMinute, 0, 0);
      const endTime = new Date(year, month, day, endHour, endMinute, 0, 0);
      
      // Если endTime меньше startTime (переход через полночь), добавляем день
      if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }
      
      const event: Event = {
        id: uuid(),
        title: routine.title,
        description: routine.description,
        startTime: startTime,
        endTime: endTime,
        color: '#9C27B0', // Фиолетовый цвет для рутин
        icon: routine.icon,
        completed: routine.completed[dateStr] || false,
        routineId: routine.id
      };
      
      events.push(event);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return events;
}

/**
 * Генерирует события из рутины на месяц вперед начиная с указанной даты
 */
export function generateRoutineEventsForMonth(
  routine: Routine, 
  fromDate: Date = new Date(),
  existingEvents: Event[] = []
): Event[] {
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0); // Последний день месяца
  
  return generateEventsFromRoutine(routine, start, end, existingEvents);
}

/**
 * Удаляет будущие события рутины (начиная с сегодня)
 */
export function deleteFutureRoutineEvents(events: Event[], routineId: string): Event[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return events.filter(event => {
    if (event.routineId !== routineId) return true;
    
    const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
    const eventDate = new Date(startTime);
    eventDate.setHours(0, 0, 0, 0);
    
    // Оставляем только прошедшие события
    return eventDate < today;
  });
}

/**
 * Обновляет события для всех рутин на следующий месяц (если нужно)
 */
export function updateRoutineEventsForNextMonth(
  routines: Routine[],
  existingEvents: Event[]
): Event[] {
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1); // Первый день следующего месяца
  
  const endOfNextMonth = new Date(nextMonth);
  endOfNextMonth.setMonth(endOfNextMonth.getMonth() + 1);
  endOfNextMonth.setDate(0); // Последний день следующего месяца
  
  const newEvents: Event[] = [];
  
  for (const routine of routines) {
    // Генерируем события для следующего месяца
    const routineEvents = generateEventsFromRoutine(routine, nextMonth, endOfNextMonth, existingEvents);
    newEvents.push(...routineEvents);
  }
  
  return newEvents;
}
