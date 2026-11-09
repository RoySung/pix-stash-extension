/** A loaded responsive image may select a picture/source URL instead of img.src. */
export function loadedImageUrl(image: {
  currentSrc?: string;
  src?: string;
  complete?: boolean;
  naturalWidth?: number;
}): string | undefined {
  // During node reuse currentSrc can still point to the preceding resource.
  // complete also becomes true for failed loads, which have no natural width.
  if (image.currentSrc && (image.currentSrc === image.src || (image.complete === true && (image.naturalWidth ?? 0) > 0)))
    return image.currentSrc;
}
