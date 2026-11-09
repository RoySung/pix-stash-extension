import { distinctiveText, normalizeLocatorText, type SourceAnchor } from './source-locator';
/** Only explicit presentation parameters vary. Identity/signature parameters stay intact. */
export function imageVariantKey(value: string) {
  try {
    const url = new URL(value);
    for (const key of ['w', 'width', 'h', 'height', 'format', 'fm', 'quality', 'q', 'dpr'])
      url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  }
  catch {
    return value;
  }
}
export function imageMatch(left: string[], right: string[]): 'exact' | 'variant' | undefined {
  if (left.some(url => right.includes(url)))
    return 'exact';
  if (left.some(url => right.some(candidate => imageVariantKey(url) === imageVariantKey(candidate))))
    return 'variant';
}
/** Match a documented signing envelope only; saved URLs and all resource parameters stay intact. */
function signedResourceKey(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!url.searchParams.has('OSSAccessKeyId') || !url.searchParams.has('Signature') || !/^\d+$/.test(url.searchParams.get('Expires') ?? ''))
      return;
    for (const key of ['OSSAccessKeyId', 'Signature', 'Expires'])
      url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  }
  catch {
    return;
  }
}
function sameSignedResource(left: string[], right: string[]) {
  return left.some(url => { const key = signedResourceKey(url); return !!key && right.some(candidate => signedResourceKey(candidate) === key); });
}
export interface AnchorEvidence {
  signed: boolean;
  alt: boolean;
  exact: boolean;
  variant: boolean;
  text: boolean;
  context: boolean;
  id: boolean;
  contradiction: boolean;
}
export function compareAnchor(saved: SourceAnchor, candidate: SourceAnchor): AnchorEvidence {
  const image = imageMatch(saved.urls, candidate.urls);
  const signed = !image && sameSignedResource(saved.urls, candidate.urls);
  const alt = !!saved.alt && distinctiveText(saved.alt) && normalizeLocatorText(saved.alt) === normalizeLocatorText(candidate.alt ?? '');
  const altConflict = signed && !!saved.alt && !!candidate.alt && distinctiveText(saved.alt) && distinctiveText(candidate.alt) && !alt;
  const text = !!saved.text && distinctiveText(saved.text) && normalizeLocatorText(saved.text) === normalizeLocatorText(candidate.text ?? '');
  const context = !!saved.context && distinctiveText(saved.context) && normalizeLocatorText(saved.context) === normalizeLocatorText(candidate.context ?? '');
  return {
    signed, alt, exact: image === 'exact', variant: image === 'variant', text, context,
    id: !!saved.hint.id && saved.hint.id === candidate.hint.id,
    contradiction: altConflict || (!!saved.context && !!candidate.context && !context && normalizeLocatorText(saved.context) !== normalizeLocatorText(candidate.context)) || (saved.urls.length > 0 && candidate.urls.length > 0 && !image && !signed),
  };
}
export function reliableAnchor(saved: SourceAnchor, candidate: SourceAnchor) {
  const evidence = compareAnchor(saved, candidate);
  return !saved.weak && !candidate.weak && !evidence.contradiction && (evidence.exact || (evidence.signed && (evidence.alt || evidence.context)) || (evidence.variant && evidence.context) || (evidence.text && (evidence.context || evidence.id)));
}
