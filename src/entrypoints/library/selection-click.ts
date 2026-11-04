import type { MouseEvent } from 'react';

/** Let embedded controls handle their own clicks without toggling selection. */
export function isSelectionClick(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element) || event.defaultPrevented || event.button !== 0) return false;
  if (target.closest('button, a, input, label, select, textarea, details, [role="button"], [role="option"], [contenteditable]')) return false;
  // Dragging across notes or metadata to copy text should not select a card.
  if (window.getSelection()?.toString()) return false;
  return true;
}
