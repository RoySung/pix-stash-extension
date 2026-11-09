import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MESSAGE } from '../lib/messages';
import { httpUrl, parseSourceLocator } from '../lib/source-locator';
import type { ItemRecord } from '../lib/types';
export function sourceActionKey(item: ItemRecord) { return parseSourceLocator(item.sourceLocator)?.page.verified ? 'relocation.verified_source' : item.sourceLocator ? 'relocation.open_position' : 'relocation.open_source'; }
export function SourceLink({ item, children, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & {
  item: ItemRecord;
}) {
  const { t } = useTranslation();
  const href = httpUrl(parseSourceLocator(item.sourceLocator)?.page.verified?.url) ?? httpUrl(item.sourceUrl);
  const label = t(sourceActionKey(item));
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !href)
      return;
    event.preventDefault();
    void browser.runtime.sendMessage({ type: MESSAGE.openSource, itemId: item.id }).then(result => {
      if (!result?.ok)
        window.open(href, '_blank', 'noopener,noreferrer');
    }).catch(() => window.open(href, '_blank', 'noopener,noreferrer'));
  }
  if (!href)
    return <span>{children ?? label}</span>;
  return <a {...props} href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} onClick={open}>{children ?? label}</a>;
}
export function OriginalImageLink({ item }: {
  item: ItemRecord;
}) {
  const { t } = useTranslation();
  const href = item.captureMode === 'page_image' ? httpUrl(item.originalImageUrl) : undefined;
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{t('relocation.original')}</a> : null;
}
export function OriginalSourceLink({ item }: {
  item: ItemRecord;
}) {
  const { t } = useTranslation();
  const href = httpUrl(item.sourceUrl);
  return href && item.sourceLocator?.page?.links?.length ? <a href={href} target="_blank" rel="noopener noreferrer">{t('relocation.original_source')}</a> : null;
}
