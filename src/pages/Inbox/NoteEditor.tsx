import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from 'prosemirror-state';
import { Idea, Folder } from '../../types';
import { Navigation } from '../../components/Layout/Navigation';
import { Modal } from '../../components/Modal';
import { Checkbox } from './CheckboxExtension';
import { useKeyboard } from '../../hooks/useKeyboard';
import './NoteEditor.css';

interface NoteEditorProps {
  idea: Idea;
  folders: Folder[];
  onSave: (idea: Idea) => void;
  onDelete: (id: string) => void;
  onMoveToFolder: (ideaId: string, folderId: string | null) => void;
  onAddToTask: (idea: Idea) => void;
  onAddToSchedule: (idea: Idea) => void;
  onTogglePin: (id: string) => void;
}

export function NoteEditor({ 
  idea, 
  folders, 
  onSave, 
  onDelete, 
  onMoveToFolder,
  onAddToTask,
  onAddToSchedule,
  onTogglePin
}: NoteEditorProps) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'folders'>('main'); // Какой вид меню показывать
  const [menuClosing, setMenuClosing] = useState(false); // Для плавного закрытия
  const [menuSlideDirection, setMenuSlideDirection] = useState<'left' | 'right'>('left'); // Направление слайда
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showLinkConfirmModal, setShowLinkConfirmModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [clickedLinkUrl, setClickedLinkUrl] = useState('');
  const [pageVisible, setPageVisible] = useState(false); // Для анимации появления страницы
  const editorRef = useRef<HTMLDivElement>(null);
  const { isVisible: keyboardVisible, height: keyboardHeight } = useKeyboard();

  // Анимация появления страницы и блокировка скролла body
  useEffect(() => {
    // Блокируем скролл body при открытии редактора
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    const scrollY = window.scrollY;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    
    requestAnimationFrame(() => {
      setPageVisible(true);
    });
    
    // Восстанавливаем при размонтировании
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Плавное закрытие меню
  const closeMenu = useCallback(() => {
    setMenuClosing(true);
    setTimeout(() => {
      setShowMenu(false);
      setMenuView('main');
      setMenuClosing(false);
    }, 250);
  }, []);

  // Переход к списку папок (слайд влево)
  const goToFolders = useCallback(() => {
    setMenuSlideDirection('left');
    setMenuView('folders');
  }, []);

  // Возврат к основному меню (слайд вправо)
  const goToMainMenu = useCallback(() => {
    setMenuSlideDirection('right');
    setMenuView('main');
  }, []);

  // Форматирование даты для отображения в хедере
  const formatNoteDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const noteDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    if (noteDate.getTime() === today.getTime()) {
      return `Сегодня, ${time}`;
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (noteDate.getTime() === yesterday.getTime()) {
      return `Вчера, ${time}`;
    }
    
    return date.toLocaleDateString('ru-RU', { 
      day: 'numeric', 
      month: 'short',
      year: noteDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    }) + `, ${time}`;
  };

  // Получаем папку заметки
  const currentFolder = idea.folderId ? folders.find(f => f.id === idea.folderId) : null;

  // Конвертация старого формата (текст) в HTML для TipTap
  const convertToHtml = (idea: Idea): string => {
    if (!idea.title && !idea.text) {
      return '<p></p>'; // Пустой параграф для новой заметки
    }
    
    let html = '';
    if (idea.title) {
      html = `<h1>${escapeHtml(idea.title)}</h1>`;
    }
    
    if (idea.text) {
      // Проверяем, это уже HTML или обычный текст
      if (idea.text.startsWith('<') || idea.text.includes('<br>') || idea.text.includes('<div>') || idea.text.includes('<p>')) {
        html += idea.text;
      } else {
        // Конвертируем обычный текст в параграфы
        const paragraphs = idea.text.split('\n').filter(p => p.trim() || p === '');
        if (paragraphs.length > 0) {
          html += paragraphs.map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : '<p><br></p>').join('');
        }
      }
    }
    
    return html || '<p></p>';
  };

  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Извлечение заголовка и текста из HTML
  const extractTitleAndText = (html: string): { title: string | undefined; text: string } => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const firstHeading = tempDiv.querySelector('h1, h2, h3');
    let title: string | undefined = undefined;
    let contentHtml = html;

    if (firstHeading) {
      title = firstHeading.textContent?.trim();
      if (title && title.length <= 50) {
        firstHeading.remove();
        contentHtml = tempDiv.innerHTML.trim() || '';
      } else {
        title = undefined;
      }
    }

    // Если нет заголовка, берем первую строку как заголовок
    if (!title) {
      const firstParagraph = tempDiv.querySelector('p');
      const firstText = firstParagraph?.textContent?.trim();
      if (firstText && firstText.length <= 50) {
        title = firstText;
        firstParagraph?.remove();
        contentHtml = tempDiv.innerHTML.trim() || html;
      }
    }

    return { title, text: contentHtml || '' };
  };

  // Инициализация TipTap редактора
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        paragraph: {
          HTMLAttributes: { class: 'note-editor-paragraph' }
        },
        // ✅ ОТКЛЮЧАЕМ дубликаты из StarterKit
        link: false,        // StarterKit уже содержит
        underline: false    // StarterKit уже содержит
      }),
      // ✅ УДАЛИ эти строки:
      // Underline,
      // Link.configure({...}),
      Checkbox
    ],
    content: convertToHtml(idea),
    editorProps: {
      attributes: {
        'data-placeholder': ''
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const { title, text } = extractTitleAndText(html);
      const updatedIdea: Idea = {
        ...idea,
        title,
        text,
        updatedAt: new Date().toISOString()
      };
      onSave(updatedIdea);
    }
  });

  // Отслеживание времени последнего ввода для определения скорости печати
  const lastInputTime = useRef<number>(0);

  // 📍 АВТОСКРОЛЛ КУРСОРА (как в iPhone Notes)
  const scrollToCursor = useCallback((instant: boolean = false) => {
    if (!editorRef.current || !editor) return;
    
    try {
      const selection = editor.state.selection;
      const view = editor.view;
      const coords = view.coordsAtPos(selection.from);
      
      const container = editorRef.current;
      const containerRect = container.getBoundingClientRect();
      
      // Видимая область над клавиатурой
      const visibleHeight = keyboardVisible 
        ? window.innerHeight - keyboardHeight - containerRect.top - 60 // 60px отступ для панели форматирования
        : containerRect.height;
      
      // Позиция курсора относительно верха контейнера (в viewport координатах)
      const cursorY = coords.bottom - containerRect.top;
      
      // Безопасная зона - держим курсор в верхних 60% видимой области
      const safeZone = visibleHeight * 0.6;
      
      // Определяем поведение скролла: instant при быстром вводе, smooth иначе
      const now = Date.now();
      const timeSinceLastInput = now - lastInputTime.current;
      const behavior: ScrollBehavior = instant || timeSinceLastInput < 100 ? 'instant' : 'smooth';
      lastInputTime.current = now;
      
      // Если курсор ниже безопасной зоны - скроллим
      if (cursorY > safeZone) {
        const scrollAmount = cursorY - safeZone;
        container.scrollTo({
          top: container.scrollTop + scrollAmount,
          behavior
        });
      }
      
      // Если курсор выше видимой области (пользователь скроллит вверх)
      if (cursorY < 0) {
        container.scrollTo({
          top: container.scrollTop + cursorY - 20,
          behavior
        });
      }
    } catch (error) {
      // Игнорируем ошибки, если курсор еще не готов
      console.debug('Scroll to cursor error:', error);
    }
  }, [editor, keyboardHeight, keyboardVisible]);

  // Автоматический фокус на редактор при открытии заметки
  // Автофокус на заголовок для новых заметок
  useEffect(() => {
    if (editor) {
      const isNewNote = !idea.title && !idea.text;
      
      if (isNewNote) {
        // Если заметка новая и пустая, фокусируемся на редакторе
        // Множественные попытки для надежности на мобильных устройствах
        const focusAttempts = [100, 300, 500];
        const timeoutIds: ReturnType<typeof setTimeout>[] = [];
        
        focusAttempts.forEach((delay) => {
          const id = setTimeout(() => {
            editor.commands.focus('start'); // Фокус в начало (заголовок)
          }, delay);
          timeoutIds.push(id);
        });
        
        // Финальная попытка со скроллом
        const finalId = setTimeout(() => {
          editor.commands.focus('start');
          scrollToCursor();
        }, 600);
        timeoutIds.push(finalId);
        
        return () => timeoutIds.forEach(id => clearTimeout(id));
      }
    }
  }, [editor, idea.id, scrollToCursor]); // Используем idea.id чтобы срабатывало при открытии новой заметки

  // Автоскролл при появлении/изменении клавиатуры
  useEffect(() => {
    if (keyboardVisible && editor) {
      // Когда клавиатура появляется, скроллим к курсору с задержкой
      const timeoutId = setTimeout(() => {
        scrollToCursor();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [keyboardVisible, keyboardHeight, editor, scrollToCursor]);

  // Автоскролл при изменении позиции курсора
  useEffect(() => {
    if (!editor) return;
    
    const timeoutId = setTimeout(() => {
      scrollToCursor();
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, [editor?.state.selection?.from, keyboardHeight, scrollToCursor]);

  // Автоскролл при каждом нажатии клавиши (как в iPhone Notes)
  useEffect(() => {
    if (!editor || !editorRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Скроллим при любом вводе текста или Enter
      if (e.key === 'Enter' || e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
        // Небольшая задержка чтобы DOM обновился
        requestAnimationFrame(() => {
          setTimeout(() => {
            // Используем instant для мгновенного скролла при вводе
            scrollToCursor(true);
          }, 5);
        });
      }
    };

    // Также скроллим при изменении контента
    const handleInput = () => {
      requestAnimationFrame(() => {
        scrollToCursor(true);
      });
    };

    const proseMirror = editorRef.current.querySelector('.ProseMirror') as HTMLElement;
    if (proseMirror) {
      proseMirror.addEventListener('keydown', handleKeyDown);
      proseMirror.addEventListener('input', handleInput);
      return () => {
        proseMirror.removeEventListener('keydown', handleKeyDown);
        proseMirror.removeEventListener('input', handleInput);
      };
    }
  }, [editor, scrollToCursor]);

  // Обработка пробела для завершения ссылки
  useEffect(() => {
    if (!editor || !editorRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Проверяем, что нажат пробел
      if (e.key === ' ' || e.keyCode === 32) {
        const { state, view } = editor;
        const { selection } = state;
        const { $from } = selection;
        
        // Проверяем, активна ли ссылка в текущей позиции
        const linkMarkType = state.schema.marks.link;
        if (!linkMarkType) return;
        
        const linkMark = linkMarkType.isInSet($from.marks());
        
        if (linkMark) {
          // Если курсор находится внутри ссылки, вставляем пробел
          // и снимаем формат ссылки только для следующего текста
          e.preventDefault();
          
          // Вставляем пробел через transaction
          const { tr } = state;
          const insertPos = $from.pos;
          tr.insertText(' ', insertPos);
          
          // Перемещаем курсор после пробела
          const newPos = insertPos + 1;
          const newSelection = TextSelection.create(tr.doc, newPos);
          tr.setSelection(newSelection);
          
          // Удаляем stored mark (активный формат) для следующего ввода
          tr.removeStoredMark(linkMarkType);
          
          view.dispatch(tr);
        }
      }
    };

    const editorElement = editorRef.current.querySelector('.ProseMirror') as HTMLElement;
    if (editorElement) {
      editorElement.addEventListener('keydown', handleKeyDown);
      return () => {
        editorElement.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [editor]);

  // Обработка кликов на чекбоксы (только по иконке)
  // Используем mousedown чтобы предотвратить фокус на редактор
  useEffect(() => {
    if (!editor || !editorRef.current) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Переключаем только если клик именно на иконке чекбокса
      const checkboxIcon = target.closest('.note-checkbox-icon');
      if (!checkboxIcon) return;
      
      // Блокируем событие полностью чтобы не было фокуса
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Находим чекбокс-контейнер
      const checkbox = checkboxIcon.closest('[data-type="checkbox"]') as HTMLElement;
      if (!checkbox) return;
      
      // Находим позицию чекбокса через состояние редактора
      const { state, view } = editor;
      let checkboxPos = -1;
      
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'checkbox') {
          const domNode = view.nodeDOM(pos) as HTMLElement;
          if (domNode && (domNode === checkbox || checkbox.contains(domNode))) {
            checkboxPos = pos;
            return false; // Останавливаем поиск
          }
        }
      });
      
      if (checkboxPos >= 0) {
        const tr = state.tr;
        const node = tr.doc.nodeAt(checkboxPos);
        if (node && node.type.name === 'checkbox') {
          const checked = !node.attrs.checked;
          tr.setNodeMarkup(checkboxPos, undefined, { checked });
          // Dispatch без фокуса - просто обновляем состояние
          view.dispatch(tr);
        }
      }
    };

    // Блокируем click чтобы не было перехода фокуса после mousedown
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const checkboxIcon = target.closest('.note-checkbox-icon');
      if (checkboxIcon) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const editorElement = editorRef.current.querySelector('.ProseMirror');
    if (editorElement) {
      // Используем capture phase для раннего перехвата
      editorElement.addEventListener('mousedown', handleMouseDown as EventListener, true);
      editorElement.addEventListener('click', handleClick as EventListener, true);
      return () => {
        editorElement.removeEventListener('mousedown', handleMouseDown as EventListener, true);
        editorElement.removeEventListener('click', handleClick as EventListener, true);
      };
    }
  }, [editor]);

  // Обработка возврата назад
  const handleBack = () => {
    if (!editor) {
      navigate(-1);
      return;
    }

    const plainText = editor.getText().trim();
    const html = editor.getHTML();

    // Если заметка пустая - удаляем
    if (!plainText) {
      onDelete(idea.id);
      navigate(-1);
      return;
    }

    // Финальное сохранение перед уходом
    const { title, text } = extractTitleAndText(html);
    
    // Если название пустое, но есть текст, устанавливаем "Заметка"
    const finalTitle = (!title || title.trim() === '') && text.trim() ? 'Заметка' : title;
    
    const updatedIdea: Idea = {
      ...idea,
      title: finalTitle,
      text,
      updatedAt: new Date().toISOString()
    };
    onSave(updatedIdea);
    navigate(-1);
  };

  // Форматирование текста с сохранением marks для продолжения набора
  const formatText = (command: string) => {
    if (!editor) return;
    
    // Для inline форматирования (bold, italic и т.д.) используем storedMarks
    // чтобы форматирование сохранялось при продолжении набора текста
    const toggleMarkWithStore = (markName: string, toggleFn: () => void) => {
      const { state } = editor;
      const { from, to } = state.selection;
      
      // Выполняем toggle
      toggleFn();
      
      // Если нет выделения (курсор), управляем storedMarks
      if (from === to) {
        const markType = state.schema.marks[markName];
        if (markType) {
          // После toggle проверяем новое состояние
          setTimeout(() => {
            const newIsActive = editor.isActive(markName);
            if (newIsActive) {
              // Если mark активен, добавляем его в storedMarks
              const currentMarks = editor.state.storedMarks || editor.state.selection.$from.marks();
              const hasThisMark = currentMarks.some(m => m.type.name === markName);
              if (!hasThisMark) {
                const newMark = markType.create();
                const newMarks = [...currentMarks, newMark];
                editor.view.dispatch(editor.state.tr.setStoredMarks(newMarks));
              }
            }
          }, 0);
        }
      }
    };
    
    const commands: Record<string, () => void> = {
      toggleBold: () => toggleMarkWithStore('bold', () => editor.chain().focus().toggleBold().run()),
      toggleItalic: () => toggleMarkWithStore('italic', () => editor.chain().focus().toggleItalic().run()),
      toggleUnderline: () => toggleMarkWithStore('underline', () => editor.chain().focus().toggleUnderline().run()),
      toggleStrike: () => toggleMarkWithStore('strike', () => editor.chain().focus().toggleStrike().run()),
      toggleBulletList: () => editor.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
      toggleHeading1: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      toggleHeading2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      toggleHeading3: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    };

    const cmd = commands[command];
    if (cmd) cmd();
  };

  const setLink = () => {
    if (!editor) return;
    
    // Проверяем, есть ли выделенный текст
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    
    // Сохраняем выделенный текст
    setLinkText(selectedText || '');
    setLinkUrl('');
    setShowLinkModal(true);
  };

  const handleLinkSubmit = () => {
    if (!editor || !linkUrl.trim()) return;
    
    // Проверяем, есть ли выделенный текст
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    
    if (selectedText.trim()) {
      // Если текст выделен, создаем ссылку на выделенном тексте
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run();
    } else {
      // Если текст не выделен, используем введенный текст или URL
      const text = linkText.trim() || linkUrl.trim() || 'Ссылка';
      editor.chain().focus().insertContent(`<a href="${linkUrl.trim()}">${text}</a>`).run();
    }
    
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkText('');
    editor.commands.focus();
  };

  // Обработка кликов на ссылки
  useEffect(() => {
    if (!editor || !editorRef.current) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      // Проверяем, что клик был именно на ссылке
      if (link && link.href) {
        // Останавливаем все обработчики события
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Открываем модалку подтверждения
        setClickedLinkUrl(link.href);
        setShowLinkConfirmModal(true);
        
        return false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      // Перехватываем mousedown на ссылках, чтобы предотвратить стандартное поведение
      if (link && link.href && e.button === 0) { // 0 = левая кнопка мыши
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const editorElement = editorRef.current.querySelector('.ProseMirror');
    if (editorElement) {
      // Используем capture phase для раннего перехвата
      editorElement.addEventListener('mousedown', handleMouseDown as EventListener, true);
      editorElement.addEventListener('click', handleClick as EventListener, true);
      return () => {
        editorElement.removeEventListener('mousedown', handleMouseDown as EventListener, true);
        editorElement.removeEventListener('click', handleClick as EventListener, true);
      };
    }
  }, [editor]);

  const handleLinkNavigate = () => {
    if (clickedLinkUrl) {
      window.open(clickedLinkUrl, '_blank', 'noopener,noreferrer');
    }
    setShowLinkConfirmModal(false);
    setClickedLinkUrl('');
  };

  const insertCheckbox = () => {
    if (!editor) return;
    editor.chain().focus().insertCheckbox().run();
  };

  if (!editor) {
    return <div className="note-editor-loading">Загрузка...</div>;
  }

  // Плавный переход назад
  const handleBackWithAnimation = () => {
    setPageVisible(false);
    setTimeout(() => {
      handleBack();
    }, 200);
  };

  // Фокус в конец текста при клике на пустое место
  const handleCanvasClick = (e: React.MouseEvent) => {
    // Закрываем меню если открыто
    if (showMenu) {
      closeMenu();
      return;
    }
    
    // Если клик был не на редакторе (ProseMirror), переносим фокус в конец
    const target = e.target as HTMLElement;
    if (!target.closest('.ProseMirror')) {
      e.preventDefault();
      editor.commands.focus('end');
    }
  };

  return (
    <div className={`note-editor ${pageVisible ? 'visible' : ''}`}>
      {/* Overlay для меню - вынесен за пределы хедера */}
      {(showMenu || menuClosing) && (
        <div 
          className={`note-editor-menu-overlay ${menuClosing ? 'closing' : ''}`} 
          onClick={closeMenu} 
        />
      )}

      {/* Хедер */}
      <div className="note-editor-header">
        <button className="note-editor-back" onClick={handleBackWithAnimation}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        {/* Информация о заметке */}
        <div className="note-editor-info">
          <span className="note-editor-date">
            {formatNoteDate(idea.createdAt)}
          </span>
          {currentFolder && (
            <span 
              className="note-editor-folder-badge"
              style={{ backgroundColor: currentFolder.color + '20', color: currentFolder.color }}
            >
              {currentFolder.icon} {currentFolder.name}
            </span>
          )}
        </div>
        
        <div style={{ position: 'relative' }}>
          <button 
            className="note-editor-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (showMenu) {
                closeMenu();
              } else {
                setShowMenu(true);
                setMenuView('main');
              }
            }}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          
          {/* Dropdown меню с анимацией слайда */}
          {(showMenu || menuClosing) && (
              <div 
                className={`note-editor-menu-dropdown ${menuClosing ? 'closing' : ''}`} 
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`note-editor-menu-slider ${menuView === 'folders' ? 'show-folders' : ''} slide-${menuSlideDirection}`}>
                  {/* Основное меню */}
                  <div className="note-editor-menu-panel main-panel">
                    <div className="note-editor-menu-content">
                      <button 
                        className="note-editor-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          goToFolders();
                        }}
                      >
                        <span className="note-editor-menu-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          </svg>
                        </span>
                        <span>Переместить в папку</span>
                        <svg className="note-editor-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                      
                      <button 
                        className="note-editor-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeMenu();
                          onTogglePin(idea.id);
                        }}
                      >
                        <span className="note-editor-menu-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 17v5M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                          </svg>
                        </span>
                        <span>{idea.isPinned ? 'Открепить' : 'Закрепить'}</span>
                      </button>
                      
                      <button 
                        className="note-editor-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeMenu();
                          onAddToTask(idea);
                        }}
                      >
                        <span className="note-editor-menu-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                          </svg>
                        </span>
                        <span>Добавить в Задачи</span>
                      </button>
                      
                      <button 
                        className="note-editor-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeMenu();
                          onAddToSchedule(idea);
                        }}
                      >
                        <span className="note-editor-menu-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        </span>
                        <span>Добавить в Расписание</span>
                      </button>
                      
                      <button 
                        className="note-editor-menu-item danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeMenu();
                          if (window.confirm('Удалить заметку?')) {
                            onDelete(idea.id);
                            navigate(-1);
                          }
                        }}
                      >
                        <span className="note-editor-menu-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </span>
                        <span>Удалить</span>
                      </button>
                    </div>
                  </div>

                  {/* Меню выбора папки */}
                  <div className="note-editor-menu-panel folders-panel">
                    <div className="note-editor-menu-content">
                      <button 
                        className="note-editor-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          goToMainMenu();
                        }}
                      >
                        <span className="note-editor-menu-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                          </svg>
                        </span>
                        <span>Назад</span>
                      </button>
                      <div className="note-editor-menu-divider" />
                      <button 
                        className="note-editor-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onMoveToFolder(idea.id, null);
                          closeMenu();
                        }}
                      >
                        <span className="note-editor-menu-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                          </svg>
                        </span>
                        <span>Инбокс</span>
                      </button>
                      {folders.filter(f => f.id !== 'inbox').map(folder => (
                        <button 
                          key={folder.id}
                          className="note-editor-menu-item"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onMoveToFolder(idea.id, folder.id);
                            closeMenu();
                          }}
                        >
                          <span 
                            className="note-editor-menu-icon"
                            style={{ color: folder.color, fontSize: '20px' }}
                          >
                            {folder.icon}
                          </span>
                          <span>{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
          )}
        </div>
      </div>

      {/* Контейнер контента - ключевое для правильного скролла */}
      <div 
        className="note-editor-content-wrapper"
        style={{
          // Уменьшаем высоту wrapper когда клавиатура открыта
          paddingBottom: keyboardVisible ? `${keyboardHeight + 60}px` : '0px'
        }}
      >
        {/* Рабочая область - скролл ТОЛЬКО здесь */}
        <div 
          className={`note-editor-canvas ${keyboardVisible ? 'keyboard-open' : ''}`}
          ref={editorRef}
          onClick={handleCanvasClick}
        >
          <EditorContent editor={editor} />
          {/* Дополнительный отступ внизу - клик на него переносит фокус в конец */}
          <div 
            className="note-editor-scroll-padding"
            style={{ 
              height: keyboardVisible ? `${Math.max(keyboardHeight, 300)}px` : '200px'
            }}
            onClick={(e) => {
              e.stopPropagation();
              editor.commands.focus('end');
            }}
          />
        </div>
      </div>

      {/* Панель форматирования - показывается только при открытой клавиатуре */}
      {keyboardVisible && (
        <div 
          className={`note-editor-format-bar ${keyboardVisible ? 'show' : ''}`}
          style={{
            bottom: `${keyboardHeight}px`
          }}
        >
        <div className="note-editor-format-scroll">
          <div className="note-editor-format-buttons">
            <button
              className={`note-editor-format-btn ${editor.isActive('bold') ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formatText('toggleBold');
              }}
              title="Жирный"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
                <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
              </svg>
            </button>
            <button
              className={`note-editor-format-btn ${editor.isActive('italic') ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formatText('toggleItalic');
              }}
              title="Курсив"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="4" x2="10" y2="4"/>
                <line x1="14" y1="20" x2="5" y2="20"/>
                <line x1="15" y1="4" x2="9" y2="20"/>
              </svg>
            </button>
            <button
              className={`note-editor-format-btn ${editor.isActive('underline') ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formatText('toggleUnderline');
              }}
              title="Подчеркнутый"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/>
                <line x1="4" y1="21" x2="20" y2="21"/>
              </svg>
            </button>
            <button
              className={`note-editor-format-btn ${editor.isActive('strike') ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formatText('toggleStrike');
              }}
              title="Зачеркнутый"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 17.5L6.5 6.5"/>
                <path d="M6.5 17.5L17.5 6.5"/>
                <path d="M4 12h16"/>
              </svg>
            </button>
            <button
              className={`note-editor-format-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formatText('toggleBulletList');
              }}
              title="Маркированный список"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4"/>
              </svg>
            </button>
            <button
              className={`note-editor-format-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                formatText('toggleOrderedList');
              }}
              title="Нумерованный список"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
            <button
              className="note-editor-format-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLink();
              }}
              title="Ссылка"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>
            <button
              className="note-editor-format-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                insertCheckbox();
              }}
              title="Чекбокс"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="note-editor-format-gradient"></div>
        </div>
      )}

      {/* Модалка для ввода ссылки */}
      <Modal
        isOpen={showLinkModal}
        onClose={() => {
          setShowLinkModal(false);
          setLinkUrl('');
          setLinkText('');
        }}
        title="Вставьте ссылку"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
              URL ссылки:
            </label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ width: '100%', padding: '12px', fontSize: '16px' }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleLinkSubmit();
                }
              }}
            />
          </div>
          {!editor?.state.selection.empty && (
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Выделенный текст будет превращен в ссылку
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowLinkModal(false);
                setLinkUrl('');
                setLinkText('');
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary filled"
              onClick={handleLinkSubmit}
              disabled={!linkUrl.trim()}
            >
              Вставить
            </button>
          </div>
        </div>
      </Modal>

      {/* Модалка подтверждения перехода по ссылке */}
      <Modal
        isOpen={showLinkConfirmModal}
        onClose={() => {
          setShowLinkConfirmModal(false);
          setClickedLinkUrl('');
        }}
        title="Перейти по ссылке"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>
            Вы собираетесь перейти по ссылке:
          </p>
          <div style={{ 
            padding: '12px', 
            background: 'var(--bg-secondary)', 
            borderRadius: 'var(--radius-md)',
            wordBreak: 'break-all',
            fontSize: '14px',
            color: 'var(--accent)'
          }}>
            {clickedLinkUrl}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowLinkConfirmModal(false);
                setClickedLinkUrl('');
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary filled"
              onClick={handleLinkNavigate}
            >
              Перейти
            </button>
          </div>
        </div>
      </Modal>

      {/* Нижняя навигация */}
      <Navigation />
    </div>
  );
}
