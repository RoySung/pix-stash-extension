import { detectPageCandidate as detect } from '../../src/lib/detect-page-candidate';
import { foregroundImages } from '../../src/lib/foreground-images';
export function detectPageCandidate(doc:Document, href:string, hostname:string) {return detect({title:doc.title,images:doc.images,foregroundImages:foregroundImages(),querySelector:doc.querySelector.bind(doc)},href,hostname);}
export { captureSourceLocator, domElements, visible, imageUrls, describeElement, textAnchors } from '../../src/lib/source-locator-dom';
export { matchDomAnchors, runSourceRelocation } from '../../src/lib/source-relocation-dom';
