import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
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
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showLinkConfirmModal, setShowLinkConfirmModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [clickedLinkUrl, setClickedLinkUrl] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const { isVisible: keyboardVisible, height: keyboardHeight } = useKeyboard();

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
        }
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'note-editor-link' }
      }),
      Checkbox
    ],
    content: convertToHtml(idea),
    editorProps: {
      attributes: {
        'data-placeholder': '' // Убираем placeholder текст
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();

      // Сохраняем заметку, даже если она пустая (удаление происходит только при нажатии "Назад")
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

  // Автоматический фокус на редактор при открытии заметки
  useEffect(() => {
    if (editor && !idea.title && !idea.text) {
      // Если заметка новая и пустая, фокусируемся на редакторе
      setTimeout(() => {
        editor.commands.focus('start'); // Фокус в начало (заголовок)
      }, 100);
    }
  }, [editor, idea.title, idea.text]);

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
  useEffect(() => {
    if (!editor || !editorRef.current) return;

    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      
      // Переключаем только если клик именно на иконке чекбокса
      const checkboxIcon = target.closest('.note-checkbox-icon');
      if (!checkboxIcon) return;
      
      // Проверяем, что клик был именно на самой иконке, а не на родительском элементе
      if (target !== checkboxIcon && !checkboxIcon.contains(target)) return;
      
      e.preventDefault();
      e.stopPropagation();
      
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
          editor.view.dispatch(tr);
        }
      }
    };

    const editorElement = editorRef.current.querySelector('.ProseMirror');
    if (editorElement) {
      editorElement.addEventListener('click', handleClick as EventListener);
      return () => {
        editorElement.removeEventListener('click', handleClick as EventListener);
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

  // Форматирование текста
  const formatText = (command: string) => {
    if (!editor) return;
    
    const commands: Record<string, () => void> = {
      toggleBold: () => editor.chain().focus().toggleBold().run(),
      toggleItalic: () => editor.chain().focus().toggleItalic().run(),
      toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),
      toggleStrike: () => editor.chain().focus().toggleStrike().run(),
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

  return (
    <div className="note-editor">
      {/* Хедер */}
      <div className="note-editor-header">
        <button className="note-editor-back" onClick={handleBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        
        
        <div style={{ position: 'relative' }}>
          <button 
            className="note-editor-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
              setShowFolderMenu(false);
            }}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          
          {/* Dropdown меню - основное */}
          {showMenu && !showFolderMenu && (
            <>
              <div className="note-editor-menu-overlay" onClick={() => setShowMenu(false)} />
              <div className="note-editor-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="note-editor-menu-content">
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowMenu(false);
                      setTimeout(() => {
                        setShowFolderMenu(true);
                      }, 100);
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    </span>
                    <span>Переместить в папку</span>
                  </button>
                  
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
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
                      setShowMenu(false);
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
                      setShowMenu(false);
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
                      setShowMenu(false);
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
            </>
          )}

          {/* Dropdown меню - выбор папки */}
          {showFolderMenu && (
            <>
              <div className="note-editor-menu-overlay" onClick={() => {
                setShowFolderMenu(false);
                setShowMenu(false);
              }} />
              <div className="note-editor-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="note-editor-menu-content">
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowFolderMenu(false);
                      setTimeout(() => {
                        setShowMenu(true);
                      }, 100);
                    }}
                  >
                    <span className="note-editor-menu-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                    </span>
                    <span>Назад</span>
                  </button>
                  <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
                  <button 
                    className="note-editor-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onMoveToFolder(idea.id, null);
                      setShowFolderMenu(false);
                      setShowMenu(false);
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
                        setShowFolderMenu(false);
                        setShowMenu(false);
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
            </>
          )}
        </div>
      </div>
      <hr />

      {/* Рабочая область */}
      <div 
        className="note-editor-canvas"
        ref={editorRef}
      >
        <EditorContent editor={editor} />
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
