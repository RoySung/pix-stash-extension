import { getDb } from './db';
import type { CaptureMode } from './types';

/** Preview fixtures. Existing records are never overwritten. */
export async function seedDevLibrary() {
  const db = await getDb();
  const tx = db.transaction(['items', 'collections'], 'readwrite');
  const createdAt = new Date().toISOString();
  const names = [
    '旅行靈感', '設計參考', '日常收藏', '攝影構圖', '品牌識別', '網頁設計',
    '介面靈感', '字體排版', '色彩搭配', '建築空間', '室內佈置', '自然風景',
    '城市散步', '咖啡時光', '美食筆記', '插畫收藏', '海報設計', '包裝靈感',
    '穿搭參考', '生活提案', '週末計畫', '展覽紀錄', '工作素材', '待整理靈感',
    '日本旅行', '台灣秘境', '山林步道', '海邊日落', '光影研究', '長名稱資料夾：值得慢慢整理的日常風景與設計靈感',
  ];
  for (const [index, name] of names.entries()) {
    if (await tx.objectStore('collections').get(`mock-collection-${index}`)) continue;
    await tx.objectStore('collections').put({ id: `mock-collection-${index}`, name, createdAt });
  }
  const titles = ['山間晨光', '城市街角', '海岸散步', '午後咖啡', '森林小徑', '建築線條', '湖畔倒影', '週末旅行', '自然紋理', '遠方的風景', '生活片刻', '光影練習', '色彩靈感', '安靜的午後', '旅途筆記', '窗邊風景', '山海之間', '值得收藏的瞬間'];
  const sizes = [[1200, 800], [800, 1200], [1000, 1000], [1400, 700]];
  for (const [index, pageTitle] of titles.entries()) {
    if (await tx.objectStore('items').get(`mock-item-${index}`)) continue;
    const [width, height] = sizes[index % sizes.length];
    const imageUrl = `https://picsum.photos/seed/pixstash-${index + 1}/${width}/${height}`;
    await tx.objectStore('items').put({
      id: `mock-item-${index}`, previewUrl: imageUrl, imageUrl,
      originalImageUrl: imageUrl, sourceUrl: `https://example.com/reference/${index + 1}`,
      pageTitle, siteName: ['Unsplash', 'Pinterest', 'Behance'][index % 3],
      captureTime: new Date(Date.now() - index * 3600000).toISOString(),
      captureMode: (['page_image', 'region_screenshot', 'instant_screenshot'] as CaptureMode[])[index % 3],
      notes: index % 3 === 0 ? '預覽用資料：試試圖片切換、標籤篩選與收藏分類。' : '',
      metadata: { mock: 'true' }, tags: [['自然', '旅行'], ['設計', '靈感'], ['生活'], []][index % 4],
      collectionIds: index % 4 === 3 ? [] : [`mock-collection-${index % 3}`], width, height,
    });
  }
  await tx.done;
}

/** Remove only fixtures created by the preview seeder. */
export async function clearDevLibrary() {
  const db = await getDb();
  const tx = db.transaction(['items', 'collections'], 'readwrite');
  const items = await tx.objectStore('items').getAll();
  for (const item of items) {
    if (/^mock-item-\d+$/.test(item.id) && item.metadata?.mock === 'true') {
      await tx.objectStore('items').delete(item.id);
    }
  }
  const collections = await tx.objectStore('collections').getAllKeys();
  for (const id of collections) {
    if (/^mock-collection-\d+$/.test(id)) {
      await tx.objectStore('collections').delete(id);
    }
  }
  await tx.done;
}
