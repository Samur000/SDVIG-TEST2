import { ReactNode, useEffect, useState } from 'react';
import './Modal.css';

export interface ModalRequestCloseContext {
  requestClose: () => void; // То же поведение, что крестик/оверлей (при hasChanges покажет подтверждение)
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode | ((ctx: ModalRequestCloseContext) => ReactNode);
  size?: 'sm' | 'md' | 'lg' | 'full';
  variant?: 'bottom' | 'center';
  hasChanges?: boolean;
  onSave?: () => void;
  onRequestClose?: () => void;
  confirmMessage?: string; // Кастомное сообщение для модалки подтверждения (например, "настроек стартовой страницы")
  onDiscard?: () => void; // Вызывается при выборе "Не сохранять" (например, для тоста)
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  variant = 'bottom',
  hasChanges = false,
  onSave,
  onRequestClose,
  confirmMessage,
  onDiscard
}: ModalProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  // Используем onRequestClose если есть, иначе onClose
  const handleClose = onRequestClose || onClose;
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setShowDiscardConfirm(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseClick();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
    }
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  const handleCloseClick = () => {
    if (hasChanges) {
      setShowDiscardConfirm(true);
    } else {
      handleClose();
    }
  };
  
  const handleDiscard = () => {
    setShowDiscardConfirm(false);
    onDiscard?.();
    onClose();
  };
  
  const handleSaveAndClose = () => {
    if (onSave) {
      onSave();
      // onSave должен закрыть модалку сам через handleClose
    }
    setShowDiscardConfirm(false);
  };
  
  // Закрытие модалки подтверждения при клике вне её или на крестик
  const handleConfirmModalClose = () => {
    setShowDiscardConfirm(false);
    // Не закрываем основную модалку, только подтверждение
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={`modal-overlay ${variant === 'center' ? 'modal-overlay--center' : ''}`} onClick={handleCloseClick}>
        <div 
          className={`modal-content modal-${size} ${variant === 'center' ? 'modal-content--center' : ''}`}
          onClick={e => e.stopPropagation()}
        >
          {title && (
            <div className="modal-header">
              <h2 className="modal-title">{title}</h2>
              <div className="modal-header-actions">
                {hasChanges && onSave && (
                  <button 
                    className="modal-save-btn" 
                    onClick={handleSaveAndClose}
                    aria-label="Сохранить"
                  >
                    Сохранить
                  </button>
                )}
                <button className="modal-close" onClick={handleCloseClick} aria-label="Закрыть">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
          <div className="modal-body">
            {typeof children === 'function' ? children({ requestClose: handleCloseClick }) : children}
          </div>
        </div>
      </div>
      
      {/* Модалка подтверждения закрытия */}
      {showDiscardConfirm && (
        <div className="modal-overlay" onClick={handleConfirmModalClose}>
          <div 
            className="modal-content modal-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Сохранить изменения?</h2>
              <button className="modal-close" onClick={handleConfirmModalClose} aria-label="Закрыть">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 8px 0', color: 'var(--muted)' }}>
                У вас есть несохранённые изменения{confirmMessage ? ` ${confirmMessage}` : ''}.
              </p>
              <div className="form-actions" style={{ justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                <button 
                  type="button" 
                  className="btn text-danger"
                  onClick={handleDiscard}
                >
                  Не сохранять
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary filled"
                  onClick={handleSaveAndClose}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

