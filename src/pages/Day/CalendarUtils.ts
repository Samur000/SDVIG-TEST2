import { Event } from '../../types';
import { formatDate, isSameDay } from '../../utils/date';

// Получить события для определенного дня
export function getEventsForDay(events: Event[], date: Date): Event[] {
  const dateStr = formatDate(date);
  return events.filter(event => {
    // Новый формат с startTime
    if (event.startTime) {
      const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
      return isSameDay(startTime, date);
    }
    // Старый формат с date (для совместимости)
    if (event.date) {
      return event.date === dateStr;
    }
    return false;
  }).sort((a, b) => {
    // Сортировка по времени начала
    if (a.startTime && b.startTime) {
      const aStart = typeof a.startTime === 'string' ? new Date(a.startTime) : a.startTime;
      const bStart = typeof b.startTime === 'string' ? new Date(b.startTime) : b.startTime;
      return aStart.getTime() - bStart.getTime();
    }
    // Для старых событий без времени
    return 0;
  });
}

// Получить события для недели
export function getEventsForWeek(events: Event[], weekDates: Date[]): Event[] {
  const startDate = new Date(weekDates[0]);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(weekDates[weekDates.length - 1]);
  endDate.setHours(23, 59, 59, 999);
  
  return events.filter(event => {
    // Новый формат с startTime
    if (event.startTime) {
      const startTime = typeof event.startTime === 'string' ? new Date(event.startTime) : event.startTime;
      if (isNaN(startTime.getTime())) return false;
      return startTime >= startDate && startTime <= endDate;
    }
    // Старый формат с date
    if (event.date) {
      const eventDate = new Date(event.date + 'T00:00:00');
      if (isNaN(eventDate.getTime())) return false;
      return eventDate >= startDate && eventDate <= endDate;
    }
    return false;
  });
}

// Получить позицию события в пикселях (top)
export function getEventTop(startTime: Date | string | undefined): number {
  if (!startTime) return 0;
  const time = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const hours = time.getHours();
  const minutes = time.getMinutes();
  return hours * 60 + minutes; // 1 час = 60px
}

// Получить высоту события в пикселях
export function getEventHeight(startTime: Date | string | undefined, endTime: Date | string | undefined): number {
  if (!startTime || !endTime) return 60; // По умолчанию 1 час
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 60;
  const diffMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
  return Math.max(30, diffMinutes); // Минимальная высота 30px (30 минут)
}

// Проверка пересечения двух событий
// События пересекаются только если они имеют общие моменты времени (не только касаются границ)
export function eventsOverlap(event1: Event, event2: Event): boolean {
  // Если у события нет startTime/endTime (старый формат), не считаем их пересекающимися
  if (!event1.startTime || !event1.endTime || !event2.startTime || !event2.endTime) {
    return false;
  }
  
  const start1 = typeof event1.startTime === 'string' ? new Date(event1.startTime) : event1.startTime;
  const end1 = typeof event1.endTime === 'string' ? new Date(event1.endTime) : event1.endTime;
  const start2 = typeof event2.startTime === 'string' ? new Date(event2.startTime) : event2.startTime;
  const end2 = typeof event2.endTime === 'string' ? new Date(event2.endTime) : event2.endTime;
  
  // Проверяем, что даты валидные
  if (isNaN(start1.getTime()) || isNaN(end1.getTime()) || isNaN(start2.getTime()) || isNaN(end2.getTime())) {
    return false;
  }
  
  // События пересекаются, если одно начинается до того, как другое заканчивается,
  // И одно заканчивается после того, как другое начинается
  // Это означает, что у них есть общее время (не только граничная точка)
  return start1 < end2 && start2 < end1;
}

// Группировка событий по конфликтам (для отображения рядом друг с другом)
// Используем алгоритм Union-Find для правильной группировки всех связанных событий
export function groupConflictingEvents(events: Event[]): Event[][] {
  if (events.length === 0) return [];
  
  // Создаем карту родителей для Union-Find
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  
  // Инициализация
  for (const event of events) {
    parent.set(event.id, event.id);
    rank.set(event.id, 0);
  }
  
  // Функция поиска корня
  const find = (id: string): string => {
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!));
    }
    return parent.get(id)!;
  };
  
  // Функция объединения
  const union = (id1: string, id2: string) => {
    const root1 = find(id1);
    const root2 = find(id2);
    
    if (root1 === root2) return;
    
    const rank1 = rank.get(root1) || 0;
    const rank2 = rank.get(root2) || 0;
    
    if (rank1 < rank2) {
      parent.set(root1, root2);
    } else if (rank1 > rank2) {
      parent.set(root2, root1);
    } else {
      parent.set(root2, root1);
      rank.set(root1, rank1 + 1);
    }
  };
  
  // Объединяем все пересекающиеся события
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      if (eventsOverlap(events[i], events[j])) {
        union(events[i].id, events[j].id);
      }
    }
  }
  
  // Группируем события по их корням
  const groupsMap = new Map<string, Event[]>();
  for (const event of events) {
    const root = find(event.id);
    if (!groupsMap.has(root)) {
      groupsMap.set(root, []);
    }
    groupsMap.get(root)!.push(event);
  }
  
  // Сортируем события внутри каждой группы по времени начала
  const groups: Event[][] = [];
  for (const group of groupsMap.values()) {
    group.sort((a, b) => {
      const aStart = typeof a.startTime === 'string' ? new Date(a.startTime) : a.startTime;
      const bStart = typeof b.startTime === 'string' ? new Date(b.startTime) : b.startTime;
      if (!aStart || !bStart) return 0;
      return aStart.getTime() - bStart.getTime();
    });
    groups.push(group);
  }
  
  // Сортируем группы по времени начала первого события в группе
  groups.sort((a, b) => {
    const aStart = typeof a[0].startTime === 'string' ? new Date(a[0].startTime) : a[0].startTime;
    const bStart = typeof b[0].startTime === 'string' ? new Date(b[0].startTime) : b[0].startTime;
    if (!aStart || !bStart) return 0;
    return aStart.getTime() - bStart.getTime();
  });
  
  return groups;
}

// Форматирование времени для отображения
export function formatTime(date: Date | string | undefined): string {
  if (!date) return '00:00';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '00:00';
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Получить текущую позицию времени в пикселях
export function getCurrentTimePosition(): number | null {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return hours * 60 + minutes;
}

// Проверка, видимо ли текущее время на экране (для показа красной линии)
export function isCurrentTimeVisible(date: Date): boolean {
  const now = new Date();
  return isSameDay(now, date);
}

