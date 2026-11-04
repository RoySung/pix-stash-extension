import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './Modal.css';

export interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
}

export function Modal({ children, onClose, title }: ModalProps) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const surface = surfaceRef.current;
    const focusable = () => Array.from(surface?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]') ?? []);
    (surface?.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0] ?? surface)?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const nodes = focusable();
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKey, true);
    return () => { document.removeEventListener('keydown', handleKey, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  return (
    <div
      className="ps-modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div ref={surfaceRef} tabIndex={-1} className="ps-modal__surface ps-card" role="dialog" aria-modal="true" aria-label={title}>
        <header className="ps-modal__titlebar">
          <p className="ps-modal__title">{title}</p>
          <button type="button" className="ps-modal__close" aria-label={t('modal.close')} title={t('modal.close')} onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="ps-modal__content">{children}</div>
      </div>
    </div>
  );
}