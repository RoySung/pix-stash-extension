function rendered(element: Element) {
  if (!element.getClientRects().length)
    return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true')
      return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false;
  }
  return true;
}
/** Visible semantic dialogs or fixed image viewers; never site names, classes or event handlers. */
export function foregroundImageScope(): Element | undefined {
  const dialogs = Array.from(document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]'));
  // Custom image viewers may omit dialog semantics. Detect their visible fixed viewport layer.
  for (const image of Array.from(document.images)) {
    if (!rendered(image))
      continue;
    const rect = image.getBoundingClientRect();
    if (rect.width * rect.height < 40000)
      continue;
    for (let parent = image.parentElement, depth = 0; parent && depth < 6; parent = parent.parentElement, depth++) {
      const box = parent.getBoundingClientRect();
      if (getComputedStyle(parent).position === 'fixed' && box.width * box.height >= innerWidth * innerHeight * .5 && !parent.closest('header,nav,footer')) {
        if (!dialogs.includes(parent))
          dialogs.push(parent);
        break;
      }
    }
  }
  return dialogs.filter(element => {
    if (!rendered(element))
      return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth)
      return false;
    return true;
  }).sort((a, b) => (Number.parseInt(getComputedStyle(a).zIndex) || 0) - (Number.parseInt(getComputedStyle(b).zIndex) || 0)).at(-1);
}
export function foregroundImages(): HTMLImageElement[] | undefined {
  const scope = foregroundImageScope();
  if (!scope)
    return;
  return Array.from(scope.querySelectorAll('img')).filter(image => {
    const rect = image.getBoundingClientRect();
    return rendered(image) && rect.width > 0 && rect.height > 0;
  });
}
