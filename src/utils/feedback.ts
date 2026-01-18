// Утилиты для обратной связи

// Проверка, является ли устройство iOS
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Вибрация (если поддерживается)
// Поддерживает Android и iOS (iOS 13+)
export function vibrate(pattern: number | number[] = 50) {
  // Для паттерна [10, 30, 10] - вибро 10мс, пауза 30мс, вибро 10мс
  const vibratePattern = Array.isArray(pattern) ? pattern : [pattern];
  
  // На iOS navigator.vibrate работает только с простыми паттернами
  // и может требовать прямого вызова при пользовательском взаимодействии
  if ('vibrate' in navigator) {
    try {
      if (isIOS()) {
        // Для iOS используем более простой подход
        // iOS может не поддерживать сложные паттерны, поэтому используем последовательные вызовы
        if (vibratePattern.length >= 3) {
          const [v1, pause, v2] = vibratePattern;
          // Первая вибрация
          navigator.vibrate(v1);
          // Вторая вибрация после паузы
          setTimeout(() => {
            navigator.vibrate(v2);
          }, (v1 || 0) + (pause || 30));
        } else if (vibratePattern.length === 1) {
          // Простая вибрация
          navigator.vibrate(vibratePattern[0]);
        } else {
          // Используем стандартный паттерн
          navigator.vibrate(vibratePattern);
        }
      } else {
        // Android - полная поддержка паттернов
        navigator.vibrate(vibratePattern);
      }
    } catch (e) {
      // Если произошла ошибка, пробуем самый простой метод
      console.warn('Vibration failed:', e);
      try {
        const simplePattern = vibratePattern.length > 0 ? vibratePattern[0] : 50;
        navigator.vibrate(simplePattern);
      } catch (e2) {
        console.warn('Simple vibration also failed:', e2);
      }
    }
  }
}

// Сообщения мотивации при выполнении задач
const motivationalMessages = [
  'Отлично! Вы молодец! 🎉',
  'Задача выполнена! Так держать! 💪',
  'Супер! Еще одна задача позади! ⭐',
  'Вы справились! Продолжайте! 🚀',
  'Молодец! Каждый шаг важен! 🏆',
  'Великолепно! Вперёд к целям! 🎯',
];

export function getRandomMotivation(): string {
  return motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
}

