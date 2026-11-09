import type { PageCandidate } from './types';
import { loadedImageUrl } from './image-source';

interface CandidateSource {
  selector: string;
  attribute: 'content' | 'href';
  sourceType: string;
}

export interface PageCandidateElement {
  getAttribute(name: string): string | null;
}

export interface PageCandidateRect {
  width?: number;
  height?: number;
}

export interface PageCandidateImage extends PageCandidateElement {
  alt?: string | null;
  className?: string | { baseVal?: string };
  currentSrc?: string;
  complete?: boolean;
  height?: number;
  id?: string;
  naturalHeight?: number;
  naturalWidth?: number;
  src?: string;
  width?: number;
  getBoundingClientRect?: () => PageCandidateRect;
}

export interface PageCandidateDocument {
  title: string;
  images: ArrayLike<PageCandidateImage>;
  foregroundImages?: ArrayLike<PageCandidateImage>;
  querySelector(selector: string): PageCandidateElement | null;
}

interface CandidateImageResult {
  imageUrl: string;
  sourceType: string;
}

const META_IMAGE_SOURCES: CandidateSource[] = [
  { selector: 'meta[property="og:image"]', attribute: 'content', sourceType: 'social-meta' },
  { selector: 'meta[property="og:image:secure_url"]', attribute: 'content', sourceType: 'social-meta' },
  { selector: 'meta[name="twitter:image"]', attribute: 'content', sourceType: 'social-meta' },
  { selector: 'link[rel="image_src"]', attribute: 'href', sourceType: 'social-meta' },
];

const CONTENT_IMAGE_PATTERN = /(hero|main|product|photo|image|gallery|full[-_ ]?screen|lightbox|cover)/i;
const UI_ASSET_PATTERN = /(logo|icon|sprite|avatar|badge|button|social|facebook|instagram|twitter|line|wechat|cart|search|menu|close|brand)/i;
const MIN_RENDERED_AREA = 40_000;
const MIN_RENDERED_EDGE = 120;

export function detectPageCandidate(
  candidateDocument: PageCandidateDocument,
  locationHref: string,
  hostname: string,
): PageCandidate | null {
  const foreground = candidateDocument.foregroundImages;
  const candidate = foreground !== undefined
    ? readBestDocumentImage({...candidateDocument, images:foreground}, locationHref, 'foreground-image')
    : readMetaImage(candidateDocument, locationHref) ??
    readBestDocumentImage(candidateDocument, locationHref);

  if (!candidate) {
    return null;
  }

  return {
    imageUrl: candidate.imageUrl,
    sourceUrl: locationHref,
    pageTitle: candidateDocument.title || 'Untitled page',
    siteName: inferSiteName(hostname),
    metadata: {
      source_type: candidate.sourceType,
    },
  };
}

function readMetaImage(candidateDocument: PageCandidateDocument, locationHref: string): CandidateImageResult | null {
  for (const source of META_IMAGE_SOURCES) {
    const value = readAttribute(candidateDocument.querySelector(source.selector), source.attribute);

    if (!value) {
      continue;
    }

    return {
      imageUrl: toAbsoluteUrl(value, locationHref),
      sourceType: source.sourceType,
    };
  }

  return null;
}

function readBestDocumentImage(candidateDocument: PageCandidateDocument, locationHref: string, sourceType = 'largest-image'): CandidateImageResult | null {
  const images = Array.from(candidateDocument.images)
    .map((image) => scoreImageCandidate(image))
    .filter((image): image is { src: string; score: number } => image !== null)
    .sort((left, right) => right.score - left.score);

  if (!images[0]) {
    return null;
  }

  return {
    imageUrl: toAbsoluteUrl(images[0].src, locationHref),
    sourceType,
  };
}

function scoreImageCandidate(image: PageCandidateImage) {
  const src = readImageUrl(image);

  if (!src) {
    return null;
  }

  const { width, height } = readRenderedBox(image);
  const renderedArea = width * height;

  if (renderedArea < MIN_RENDERED_AREA) {
    return null;
  }

  const descriptor = [src, image.alt, image.id, normalizeClassName(image.className)]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ');

  let score = renderedArea;

  if (CONTENT_IMAGE_PATTERN.test(descriptor)) {
    score += 150_000;
  }

  if (UI_ASSET_PATTERN.test(descriptor)) {
    score -= 200_000;
  }

  if (Math.min(width, height) < MIN_RENDERED_EDGE) {
    score -= 75_000;
  }

  if (score <= 0) {
    return null;
  }

  return {
    src,
    score,
  };
}

function readRenderedBox(image: PageCandidateImage) {
  const rect = image.getBoundingClientRect?.();
  const width = rect?.width ?? image.width ?? image.naturalWidth ?? 0;
  const height = rect?.height ?? image.height ?? image.naturalHeight ?? 0;

  return {
    width,
    height,
  };
}

function readImageUrl(image: PageCandidateImage | null | undefined) {
  if (!image) {
    return null;
  }

  const current = loadedImageUrl(image);
  if (current) return current;
  const raw = image.getAttribute('src');
  if (raw !== null && !raw.trim() && !readAttribute(image, 'srcset')) return null;
  return image.src || readAttribute(image,'src');
}

function readAttribute(element: PageCandidateElement | null | undefined, attribute: string) {
  const value = element?.getAttribute(attribute);

  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeClassName(className: PageCandidateImage['className']) {
  if (typeof className === 'string') {
    return className;
  }

  if (className && typeof className.baseVal === 'string') {
    return className.baseVal;
  }

  return '';
}

function inferSiteName(hostname: string) {
  return hostname.replace(/^www\./, '') || 'unknown';
}

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}
