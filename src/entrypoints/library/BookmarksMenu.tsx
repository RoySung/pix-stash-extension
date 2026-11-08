import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/Modal';
import { addBookmarkIfMissing, BookmarkValidationError, deleteBookmark, listBookmarks, moveBookmark, saveBookmark } from '../../lib/bookmarks';
import type { BookmarkRecord } from '../../lib/types';
import { RecommendedWebsites } from './RecommendedWebsites';
import { WebsiteFavicon } from './WebsiteFavicon';
import './BookmarksMenu.css';

type Dialog = 'add' | 'edit' | 'manage' | 'recommend' | null;

export function BookmarksMenu() {
  const { t } = useTranslation();
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const mutationRef = useRef(false);

  async function reload() {
    try {
      setBookmarks(await listBookmarks());
      setLoaded(true);
      setError(null);
    } catch {
      setError('load_failed');
    }
  }

  useEffect(() => {
    void reload();
    const channel = new BroadcastChannel('pixstash.website-bookmarks');
    channelRef.current = channel;
    channel.onmessage = () => { void reload(); };
    const onFocus = () => { void reload(); };
    window.addEventListener('focus', onFocus);
    return () => {
      channel.close();
      channelRef.current = null;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openDialog(next: Dialog, record?: BookmarkRecord) {
    closeMenu();
    setError(null);
    setPendingDelete(null);
    setEditing(record?.id);
    setName(record?.name ?? '');
    setUrl(record?.url ?? '');
    setDialog(next);
  }

  function closeDialog() {
    if (mutationRef.current) return;
    setDialog(null);
    setError(null);
    setPendingDelete(null);
    triggerRef.current?.focus();
  }

  async function mutate(action: () => Promise<unknown>, after?: () => void) {
    if (mutationRef.current) return;
    const focused = document.activeElement;
    mutationRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      channelRef.current?.postMessage('changed');
      setBookmarks(await listBookmarks());
      after?.();
    } catch (cause) {
      setError(cause instanceof BookmarkValidationError ? cause.code : 'save_failed');
    } finally {
      mutationRef.current = false;
      setBusy(false);
      requestAnimationFrame(() => {
        if (focused instanceof HTMLElement && focused.isConnected && !focused.matches(':disabled')) {
          focused.focus();
        } else {
          const fallback = document.getElementById('bookmarks-manager-add')
            ?? document.querySelector<HTMLElement>('.recommended-websites__panel:not([hidden]) [data-bookmark-add]:not(:disabled)')
            ?? document.querySelector<HTMLElement>('.ps-modal__close');
          fallback?.focus();
        }
      });
    }
  }

  function menuKeys(event: KeyboardEvent<HTMLDivElement>) {
    const entries = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const index = entries.indexOf(document.activeElement as HTMLElement);
    let target: HTMLElement | undefined;
    if (event.key === 'ArrowDown') target = entries[(index + 1) % entries.length];
    if (event.key === 'ArrowUp') target = entries[(index - 1 + entries.length) % entries.length];
    if (event.key === 'Home') target = entries[0];
    if (event.key === 'End') target = entries.at(-1);
    if (target) { event.preventDefault(); target.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); }
    if (event.key === 'Tab') setOpen(false);
  }

  return (
    <>
      <nav className="bookmarks-bar" aria-label={t('bookmarks.menu_bar')}>
        <div className="bookmarks-bar__root" ref={rootRef} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}>
          <button className="bookmarks-bar__trigger" type="button" ref={triggerRef}
            aria-haspopup="menu" aria-expanded={open} aria-controls="website-bookmarks-menu"
            onClick={() => setOpen(value => !value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
                const last = event.key === 'ArrowUp';
                requestAnimationFrame(() => {
                  const entries = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)');
                  (last ? entries?.[entries.length - 1] : entries?.[0])?.focus();
                });
              }
              if (event.key === 'Escape') closeMenu();
            }}>
            {t('bookmarks.favorites')}(<u>A</u>)
          </button>
          {open ? (
            <div className="bookmarks-menu" id="website-bookmarks-menu" role="menu" aria-label={t('bookmarks.favorites')} ref={menuRef} onKeyDown={menuKeys}>
              <button className="bookmarks-menu__entry" type="button" role="menuitem" disabled={!loaded} onClick={() => openDialog('add')}><BookmarkIcon kind="star" />{t('bookmarks.add')}</button>
              <button className="bookmarks-menu__entry" type="button" role="menuitem" disabled={!loaded} onClick={() => openDialog('manage')}><BookmarkIcon kind="folder" />{t('bookmarks.organize')}</button>
              <button className="bookmarks-menu__entry" type="button" role="menuitem" disabled={!loaded} onClick={() => openDialog('recommend')}><BookmarkIcon kind="compass" />{t('recommendations.menu')}</button>
              <div className="bookmarks-menu__separator" role="separator" />
              {!loaded ? <button className="bookmarks-menu__entry" type="button" role="menuitem" onClick={() => void reload()}>{t(error ? 'bookmarks.load_failed' : 'bookmarks.loading')}</button> : null}
              {loaded && bookmarks.length === 0 ? <p className="bookmarks-menu__empty">{t('bookmarks.empty')}</p> : null}
              {bookmarks.map(bookmark => (
                <a className="bookmarks-menu__entry" role="menuitem" key={bookmark.id} href={bookmark.url} target="_blank" rel="noopener noreferrer" title={bookmark.url} onClick={closeMenu}>
                  <WebsiteFavicon url={bookmark.url} /><span>{bookmark.name}</span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
      {dialog ? (
        <Modal key={dialog} title={dialog === 'recommend' ? t('recommendations.title') : t(`bookmarks.${dialog === 'manage' ? 'organize_title' : dialog === 'edit' ? 'edit_title' : 'add_title'}`)} onClose={closeDialog}>
          {dialog === 'recommend' ? (
            <RecommendedWebsites bookmarks={bookmarks} busy={busy} error={error}
              onAdd={(website, onSaved) => { void mutate(() => addBookmarkIfMissing(website.name, website.url), onSaved); }} />
          ) : dialog === 'manage' ? (
            <>
              {bookmarks.length === 0 ? <p className="bookmarks-empty">{t('bookmarks.empty')}</p> : null}
              <ul className="bookmarks-manager" aria-label={t('bookmarks.favorites')}>
                {bookmarks.map((bookmark, index) => (
                  <li className="bookmarks-manager__row" key={bookmark.id}>
                    <div className="bookmarks-manager__website"><span className="website-title"><WebsiteFavicon url={bookmark.url} /><span>{bookmark.name}</span></span><a href={bookmark.url} target="_blank" rel="noopener noreferrer">{bookmark.url}</a></div>
                    {pendingDelete === bookmark.id ? (
                      <div className="bookmarks-manager__tools">
                        <span>{t('bookmarks.delete_prompt')}</span>
                        <button className="ps-button" data-variant="danger" disabled={busy} onClick={() => void mutate(() => deleteBookmark(bookmark.id), () => setPendingDelete(null))}>{t('bookmarks.delete')}</button>
                        <button className="ps-button" disabled={busy} onClick={() => setPendingDelete(null)}>{t('bookmarks.cancel')}</button>
                      </div>
                    ) : (
                      <div className="bookmarks-manager__tools">
                        <button className="ps-button bookmarks-manager__move" disabled={busy || index === 0} aria-label={t('bookmarks.move_up', { name: bookmark.name })} onClick={() => void mutate(() => moveBookmark(bookmark.id, -1))}><BookmarkIcon kind="up" /></button>
                        <button className="ps-button bookmarks-manager__move" disabled={busy || index === bookmarks.length - 1} aria-label={t('bookmarks.move_down', { name: bookmark.name })} onClick={() => void mutate(() => moveBookmark(bookmark.id, 1))}><BookmarkIcon kind="down" /></button>
                        <button className="ps-button" disabled={busy} onClick={() => openDialog('edit', bookmark)}>{t('bookmarks.edit')}</button>
                        <button className="ps-button" disabled={busy} onClick={() => setPendingDelete(bookmark.id)}>{t('bookmarks.delete')}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {error ? <p className="bookmarks-error" role="alert">{t(`bookmarks.${error}`)}</p> : null}
              <div className="ps-modal__actions"><button id="bookmarks-manager-add" className="ps-button" disabled={busy} onClick={() => openDialog('add')}>{t('bookmarks.add')}</button><button className="ps-button" disabled={busy} onClick={closeDialog}>{t('bookmarks.close')}</button></div>
            </>
          ) : (
            <form onSubmit={(event) => {
              event.preventDefault();
              void mutate(() => saveBookmark(name, url, editing), () => { setError(null); setDialog('manage'); });
            }}>
              <label className="bookmarks-field" htmlFor="bookmark-name">{t('bookmarks.name')}<input id="bookmark-name" className="ps-input" value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoFocus disabled={busy} /></label>
              <label className="bookmarks-field" htmlFor="bookmark-url">{t('bookmarks.url')}<input id="bookmark-url" className="ps-input" type="url" placeholder="https://example.com" value={url} onChange={event => setUrl(event.target.value)} required disabled={busy} aria-describedby="bookmark-url-hint" /></label>
              <p id="bookmark-url-hint" className="bookmarks-hint">{t('bookmarks.url_hint')}</p>
              {error ? <p className="bookmarks-error" role="alert">{t(`bookmarks.${error}`)}</p> : null}
              <div className="ps-modal__actions"><button className="ps-button" data-variant="accent" type="submit" disabled={busy}>{t(busy ? 'bookmarks.saving' : 'bookmarks.save')}</button><button className="ps-button" type="button" disabled={busy} onClick={() => openDialog('manage')}>{t('bookmarks.cancel')}</button></div>
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}

function BookmarkIcon({ kind }: { kind: 'star' | 'folder' | 'globe' | 'up' | 'down' | 'compass' }) {
  return <svg className={`bookmarks-icon bookmarks-icon--${kind}`} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    {kind === 'star' ? <path d="m10 2 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8Z" /> : null}
    {kind === 'folder' ? <path d="M2 6V4h6l2 2h8v3M2 6v11h14l2-8H5l-3 8" /> : null}
    {kind === 'globe' ? <><circle cx="10" cy="10" r="7" /><ellipse cx="10" cy="10" rx="3" ry="7" /><path d="M3 10h14" /></> : null}
    {kind === 'up' ? <path d="m5 12 5-5 5 5" /> : null}
    {kind === 'down' ? <path d="m5 8 5 5 5-5" /> : null}
    {kind === 'compass' ? <><circle cx="10" cy="10" r="7" /><path d="m13 7-2 4-4 2 2-4Z" /></> : null}
  </svg>;
}
