import { describe, expect, it } from 'vitest';

import { detectPageCandidate, type PageCandidateDocument, type PageCandidateImage } from './detect-page-candidate';

function createElement(attributes: Record<string, string>) {
  return {
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
  };
}

function createImage(input: {
  alt?: string | null;
  className?: string;
  currentSrc?: string;
  height?: number;
  id?: string;
  naturalHeight?: number;
  naturalWidth?: number;
  src: string;
  width?: number;
}): PageCandidateImage {
  return {
    ...input,
    getAttribute(name: string) {
      return name === 'src' ? input.src : null;
    },
    getBoundingClientRect() {
      return {
        width: input.width,
        height: input.height,
      };
    },
  };
}

function createDocument(input: {
  images?: PageCandidateImage[];
  foregroundImages?: PageCandidateImage[];
  selectors?: Record<string, ReturnType<typeof createElement> | PageCandidateImage>;
  title?: string;
}): PageCandidateDocument {
  const selectors = input.selectors ?? {};

  return {
    title: input.title ?? 'Untitled page',
    images: input.images ?? [],
    foregroundImages: input.foregroundImages,
    querySelector(selector: string) {
      return selectors[selector] ?? null;
    },
  };
}

describe('detectPageCandidate', () => {
  it('uses social metadata when available', () => {
    const candidate = detectPageCandidate(
      createDocument({
        title: 'Cute Ginger Cat',
        selectors: {
          'meta[property="og:image"]': createElement({ content: '/images/cat.jpg' }),
        },
      }),
      'https://www.istockphoto.com/hk/photo/cat',
      'www.istockphoto.com',
    );

    expect(candidate?.imageUrl).toBe('https://www.istockphoto.com/images/cat.jpg');
    expect(candidate?.metadata.source_type).toBe('social-meta');
  });

  it('prefers the open foreground image over social metadata and larger background images', () => {
    const focused=createImage({src:'https://example.com/album/focused.jpg',width:450,height:700});
    const candidate=detectPageCandidate(createDocument({foregroundImages:[focused],images:[createImage({src:'https://example.com/other.jpg',width:1200,height:900}),focused],selectors:{'meta[property="og:image"]':createElement({content:'/share.jpg'})}}),'https://example.com/album','example.com');
    expect(candidate?.imageUrl).toBe(focused.src);
    expect(candidate?.metadata.source_type).toBe('foreground-image');
  });

  it('selects a dominant rendered image using generic scoring', () => {
    const expectedImage = createImage({
      src: 'https://www.zsport.com.tw/p/352/4/m/3223add6504c977f8f20d91557126a39f0ff5fa0.JPG',
      id: 'p_img',
      className: 'full-screen-image',
      width: 404,
      height: 604,
      naturalWidth: 400,
      naturalHeight: 600,
    });

    const candidate = detectPageCandidate(
      createDocument({
        title: 'Zsport Race Photo',
        images: [
          createImage({
            src: 'https://www.zsport.com.tw/img/zsport_logo.JPG',
            alt: 'Zsport logo',
            width: 54,
            height: 36,
            naturalWidth: 1800,
            naturalHeight: 1200,
          }),
          expectedImage,
        ],
        selectors: {
          'img#p_img.full-screen-image': expectedImage,
        },
      }),
      'https://www.zsport.com.tw/photo/30047238',
      'www.zsport.com.tw',
    );

    expect(candidate?.imageUrl).toBe('https://www.zsport.com.tw/p/352/4/m/3223add6504c977f8f20d91557126a39f0ff5fa0.JPG');
    expect(candidate?.metadata.source_type).toBe('largest-image');
  });

  it('prefers the largest rendered content image over a large natural-size logo', () => {
    const candidate = detectPageCandidate(
      createDocument({
        images: [
          createImage({
            src: 'https://example.com/assets/logo.jpg',
            alt: 'Example logo',
            width: 54,
            height: 36,
            naturalWidth: 1800,
            naturalHeight: 1200,
          }),
          createImage({
            src: 'https://example.com/gallery/cat.jpg',
            className: 'gallery-photo',
            width: 404,
            height: 604,
            naturalWidth: 400,
            naturalHeight: 600,
          }),
        ],
      }),
      'https://example.com/gallery/cat',
      'example.com',
    );

    expect(candidate?.imageUrl).toBe('https://example.com/gallery/cat.jpg');
    expect(candidate?.metadata.source_type).toBe('largest-image');
  });
});
it('does not turn an empty image src into the source page URL',()=>{
 const image=createImage({src:'https://example.com/album',width:600,height:800});image.getAttribute=()=>'';
 expect(detectPageCandidate(createDocument({images:[image]}),'https://example.com/album','example.com')).toBeNull();
});
it('does not use a stale currentSrc while a preview is loading a different image',()=>{
 const image=createImage({src:'https://example.com/new.jpg',currentSrc:'https://example.com/old.jpg',width:600,height:800});
 expect(detectPageCandidate(createDocument({images:[image]}),'https://example.com/album','example.com')?.imageUrl).toBe('https://example.com/new.jpg');
});

it('captures the loaded picture source rather than its fallback image', () => {
  const image = createImage({
    src: 'https://example.com/fallback.jpg',
    currentSrc: 'https://example.com/selected.jpg',
    width: 600, height: 400, naturalWidth: 1200,
  });
  image.complete = true;
  expect(detectPageCandidate(createDocument({ images: [image] }), 'https://example.com/album', 'example.com')?.imageUrl)
    .toBe('https://example.com/selected.jpg');
});

it('does not reuse currentSrc after a replacement image fails to load', () => {
  const image = createImage({
    src: 'https://example.com/missing.jpg',
    currentSrc: 'https://example.com/old.jpg',
    width: 600, height: 400, naturalWidth: 0,
  });
  image.complete = true;
  expect(detectPageCandidate(createDocument({ images: [image] }), 'https://example.com/album', 'example.com')?.imageUrl)
    .toBe(image.src);
});
