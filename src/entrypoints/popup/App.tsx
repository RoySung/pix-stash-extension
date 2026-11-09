import { captureErrorCode, withCaptureDeadline, type CaptureErrorCode } from '../../lib/capture-errors';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ItemOrganizer } from '../../components';
import { MESSAGE } from '../../lib/messages';
import type {
  ActiveContext,
  CaptureResponse,
  ItemRecord,
  OrganizerData,
  SaveItemOrganizationInput,
  SaveItemOrganizationResponse,
} from '../../lib/types';

interface ToastState {
  title: string;
  eyebrow?: string;
  message?: string;
  item?: ItemRecord;
  canUndo?: boolean;
  organizer?: OrganizerData;
  organizerStatus?: string | null;
  organizerSaving?: boolean;
  tone?: 'default' | 'error' | 'success';
}

export function App() {
  const { t } = useTranslation();
  const [context, setContext] = useState<ActiveContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const pageCandidate = context?.pageCandidate ?? null;
  const hasPageCandidate = Boolean(pageCandidate);
  const instantPending = busyAction === MESSAGE.captureInstant;
  const pageImagePending = busyAction === MESSAGE.capturePageImage;
  const regionPending = busyAction === MESSAGE.startRegionCapture;

  useEffect(() => {
    void refreshContext();
  }, []);

  useEffect(() => {
    if (!toast || toast.item || toast.tone === 'error') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  function showCaptureError(code: CaptureErrorCode) {
    setToast({title:t(code === 'saved_notice_failed' ? 'toast.just_stashed_title' : 'toast.unable_to_stash'), message:t(`capture_error.${code}`), tone:code === 'saved_notice_failed' ? 'default' : 'error'});
  }
  async function refreshContext() {
    setLoading(true);
    try {
      const next = await withCaptureDeadline(browser.runtime.sendMessage({type:MESSAGE.getActiveContext})) as ActiveContext;
      setContext(next);
      if (next.captureError) showCaptureError(next.captureError);
    } catch (error) { showCaptureError(captureErrorCode(error)); }
    finally { setLoading(false); }
  }

  async function loadOrganizerData() {
    return await withCaptureDeadline(browser.runtime.sendMessage({type:MESSAGE.getOrganizerData})) as OrganizerData;
  }

  function openLibrary(itemId?: string) {
    void browser.runtime.sendMessage({ type: MESSAGE.openLibrary, itemId });
  }

  function buildCaptureToast(item: ItemRecord, duplicate: boolean, organizer: OrganizerData): ToastState {

    if (duplicate) {
      return {
        eyebrow: t('toast.already_saved_eyebrow'),
        title: t('toast.already_saved_title'),
        item,
        organizer,
        tone: 'success',
      };
    }

    return {
      eyebrow: t('toast.just_stashed_eyebrow'),
      title: t('toast.just_stashed_title'),
      item,
      canUndo: true,
      organizer,
      tone: 'success',
    };
  }

  async function capture(type: typeof MESSAGE.captureInstant | typeof MESSAGE.capturePageImage) {
    setBusyAction(type);
    setToast(null);
    try {
      const response = await withCaptureDeadline(browser.runtime.sendMessage({type})) as CaptureResponse;
      if (!response?.ok || !response.item) {
        showCaptureError(response?.errorCode ?? 'capture_failed');
        return;
      }
      // Persistence succeeded even if the optional organizer data cannot be loaded.
      setToast(buildCaptureToast(response.item, Boolean(response.duplicate), {collections:[], knownTags:[]}));
      try {
        const organizer = await loadOrganizerData();
        setToast(current => current?.item?.id === response.item!.id ? {...current, organizer} : current);
      } catch { /* Keep the confirmed saved state visible. */ }
    } catch (error) { showCaptureError(captureErrorCode(error)); }
    finally { setBusyAction(null); }
  }

  async function startRegionCapture() {
    setBusyAction(MESSAGE.startRegionCapture);
    try {
      const response = await withCaptureDeadline(browser.runtime.sendMessage({type:MESSAGE.startRegionCapture})) as CaptureResponse;
      if (!response?.ok) { showCaptureError(response?.errorCode ?? 'capture_failed'); return; }
      window.close();
    } catch (error) { showCaptureError(captureErrorCode(error)); }
    finally { setBusyAction(null); }
  }

  async function undoCapture() {
    if (!toast?.item) {
      return;
    }

    await browser.runtime.sendMessage({
      type: MESSAGE.deleteItem,
      itemId: toast.item.id,
    });
    setToast({
      eyebrow: t('toast.removed_eyebrow'),
      title: t('toast.removed_title'),
      message: t('toast.removed_message'),
    });
  }

  async function saveToastOrganization(input: SaveItemOrganizationInput) {
    setToast((current) => (current ? { ...current, organizerSaving: true, organizerStatus: null } : current));
    const response = (await browser.runtime.sendMessage({
      type: MESSAGE.saveItemOrganization,
      ...input,
    })) as SaveItemOrganizationResponse;

    setToast((current) => {
      if (!current?.item || current.item.id !== input.itemId) {
        return current;
      }

      return {
        ...current,
        item: response.item ?? current.item,
        organizer: {
          collections: response.collections,
          knownTags: response.knownTags,
        },
        organizerSaving: false,
        organizerStatus: response.ok ? t('toast.saved_to_stash') : response.error ?? t('toast.unable_to_save'),
      };
    });

    return response.ok;
  }

  return (
    <div className="popup ps-shell">
      <header className="popup__topbar">
        <h1>Pix Stash</h1>

        <button className="popup__window-close" type="button" aria-label={t('modal.close')} title={t('modal.close')} onClick={() => window.close()}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>
      </header>
      <nav className="popup__toolbar" aria-label={t('popup.library')}>
        <button className="ps-button popup__library-button" type="button" onClick={() => openLibrary()}>
          <span aria-hidden="true" className="popup__library-icon">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M2 6h7l2 3h11v12H2z" fill="#e6b63c" stroke="#896b27" strokeWidth="1.3" />
              <path d="M3 10h20l-3 11H1z" fill="#ffdb76" stroke="#896b27" strokeWidth="1.3" />
            </svg>
          </span>
          {t('popup.library')}
        </button>
      </nav>

      {toast ? (
        <div
          className={`popup__toast popup__toast--${toast.tone ?? 'default'}`}
        >
          <div className="popup__toast-head">
            <div className="popup__toast-copy" aria-atomic="true" role={toast.tone === 'error' ? 'alert' : 'status'}>
              <strong className="popup__toast-title">
                {toast.tone === 'success' ? (
                  <svg className="popup__toast-success-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m7.5 12 3 3 6-6" />
                  </svg>
                ) : null}
                {toast.title}
              </strong>
              {toast.message ? <p>{toast.message}</p> : null}
            </div>

            <button aria-label={t('popup.dismiss')} className="popup__toast-close" type="button" onClick={() => setToast(null)}>
              ×
            </button>
          </div>

          {toast.tone === 'error' ? (
            <button className="ps-button" type="button" onClick={() => void startRegionCapture()} disabled={busyAction !== null}>{t('capture_error.use_screenshot')}</button>
          ) : null}
          {toast.item ? (
            <div className="popup__toast-item">
              <div className="popup__toast-thumb">
                <img src={toast.item.previewUrl} alt={toast.item.pageTitle || t('toast.saved_reference')} />
              </div>

              <div className="popup__toast-meta">
                <strong>{toast.item.pageTitle || t('toast.saved_reference')}</strong>
                <p>{toast.item.siteName}</p>
              </div>
            </div>
          ) : null}

          {toast.item ? (
            <div className="popup__toast-actions">
              <button className="ps-button" data-variant="accent" type="button" onClick={() => openLibrary(toast.item?.id)}>{t('popup.open_library')}</button>
              {toast.canUndo ? (
                <button className="ps-button" data-variant="quiet" type="button" onClick={() => void undoCapture()}>{t('popup.undo')}</button>
              ) : null}
            </div>
          ) : null}
          {toast.item && toast.organizer ? (
            <details className="popup__toast-organizer" key={toast.item.id}>
              <summary>{t('library.organize')}</summary>
              <ItemOrganizer
                collections={toast.organizer.collections}
                item={toast.item}
                knownTags={toast.organizer.knownTags}
                onSave={saveToastOrganization}
                saving={toast.organizerSaving}
              />
              {toast.organizerStatus ? <p className="popup__toast-status" role="status">{toast.organizerStatus}</p> : null}
            </details>
          ) : null}
        </div>
      ) : null}

      <section className="popup__hero">
        <div className={`popup__hero-main ${hasPageCandidate ? "has-preview" : ""}`}>
          <div className="popup__context">
            <strong className="popup__page-title">{loading ? t('popup.scanning') : context?.pageTitle ?? t('popup.no_active_page')}</strong>
            <span className="popup__site">{context?.siteName ?? t('popup.offline')}</span>
          </div>

          {hasPageCandidate ? (
            <div className="popup__preview">
              {context?.pagePreviewUrl ? <img className="popup__preview-image" src={context.pagePreviewUrl} alt={context?.pageTitle ?? t('toast.saved_reference')} /> : <p role="status">{t(`capture_error.${context?.previewError ?? 'decode_failed'}`)}</p>}
            </div>
          ) : (
            <div className="popup__preview popup__preview--empty">
              <strong>{t('popup.no_candidate_found')}</strong>
              <p>{t('popup.use_screenshot')}</p>
            </div>
          )}
        </div>

        <div className="popup__capture-band">
          <div className="popup__actions popup__actions--priority">
            {hasPageCandidate ? (
              <button
                className="ps-button popup__page-image-action"
                data-variant="accent"
                type="button"
                onClick={() => void capture(MESSAGE.capturePageImage)}
                disabled={busyAction !== null}
              >
                {pageImagePending ? t('popup.stashing') : t('popup.use_page_image')}
              </button>
            ) : null}

            <button
              className="ps-button"
              data-variant={hasPageCandidate ? undefined : 'accent'}
              type="button"
              onClick={() => void capture(MESSAGE.captureInstant)}
              disabled={busyAction !== null}
            >
              {instantPending ? t('popup.stashing') : t('popup.instant_screenshot')}
            </button>

            <button className="ps-button" type="button" onClick={() => void startRegionCapture()} disabled={busyAction !== null}>
              {regionPending ? t('popup.preparing') : t('popup.region_screenshot')}
            </button>
          </div>
        </div>

        <p className="popup__footnote">{t('popup.footnote')}</p>
      </section>


    </div>
  );
}
