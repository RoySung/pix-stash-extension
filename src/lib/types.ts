import type { SourceLocator } from './source-locator';
import type { CaptureErrorCode } from './capture-errors';
export type CaptureMode = 'instant_screenshot' | 'region_screenshot' | 'page_image';

export interface BookmarkRecord {
  id: string;
  name: string;
  url: string;
  position: number;
}

export interface CollectionRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface ItemRecord {
  id: string;
  previewUrl: string;
  imageUrl: string;
  originalImageUrl: string | null;
  sourceUrl: string;
  pageTitle: string;
  siteName: string;
  captureTime: string;
  captureMode: CaptureMode;
  notes: string;
  metadata: Record<string, string>;
  tags: string[];
  collectionIds: string[];
  sourceLocator?: SourceLocator;
  width?: number;
  height?: number;
}

export interface PageCandidate {
  imageUrl: string;
  sourceUrl: string;
  pageTitle: string;
  siteName: string;
  metadata: Record<string, string>;
}

export interface RegionSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ActiveContext {
  tabId: number;
  pageTitle: string;
  sourceUrl: string;
  siteName: string;
  pageCandidate: PageCandidate | null;
  captureError?: CaptureErrorCode;
  pagePreviewUrl?: string;
  previewError?: CaptureErrorCode;
}

export interface CaptureResponse {
  ok: boolean;
  item?: ItemRecord;
  duplicate?: boolean;
  error?: string;
  errorCode?: CaptureErrorCode;
}

export interface OrganizerData {
  collections: CollectionRecord[];
  knownTags: string[];
}

export interface SaveItemOrganizationInput {
  itemId: string;
  collectionIds: string[];
  tags: string[];
  newCollectionName?: string;
}

export interface SaveItemOrganizationResponse extends OrganizerData {
  ok: boolean;
  item?: ItemRecord;
  error?: string;
}

export const SYSTEM_COLLECTION_ID = 'uncategorized';
