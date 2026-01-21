import { useState, useEffect } from 'react';

export const useKeyboard = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const keyboardHeight = Math.max(0, windowHeight - viewportHeight);
        
        setHeight(keyboardHeight);
        
        // Клавиатура считается открытой, если высота больше 150px
        const keyboardOpen = keyboardHeight > 150;
        setIsVisible(keyboardOpen);
      } else {
        // Fallback для браузеров без visualViewport
        const currentHeight = window.innerHeight;
        const screenHeight = window.screen.height;
        const calculatedHeight = Math.max(0, screenHeight - currentHeight);
        
        setHeight(calculatedHeight);
        setIsVisible(calculatedHeight > 150);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      // Проверяем, что фокус в редакторе
      if (target.closest('.ProseMirror')) {
        setIsVisible(true);
        // Даем время клавиатуре появиться
        setTimeout(handleViewportResize, 300);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.relatedTarget as HTMLElement;
      // Не скрываем, если фокус переходит на панель форматирования
      if (!target || !target.closest('.note-editor-format-bar, .note-editor-format-btn')) {
        // Небольшая задержка для проверки
        setTimeout(() => {
          if (!document.activeElement?.closest('.ProseMirror')) {
            setIsVisible(false);
            setHeight(0);
          }
        }, 200);
      }
    };

    // Отслеживание через visualViewport (более надежно)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    // Отслеживание изменения размера окна
    window.addEventListener('resize', handleViewportResize);
    
    // Отслеживание фокуса
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    // Инициализация
    handleViewportResize();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
      window.removeEventListener('resize', handleViewportResize);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return { isVisible, height };
};
