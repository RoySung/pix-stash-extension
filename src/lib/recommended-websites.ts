export type WebsiteCategory = 'design' | 'race';

export interface RecommendedWebsite {
  id: string;
  name: string;
  url: string;
  category: WebsiteCategory;
}

export const RECOMMENDED_WEBSITES: readonly RecommendedWebsite[] = [
  { id: 'unsplash', name: 'Unsplash', url: 'https://unsplash.com/', category: 'design' },
  { id: 'pexels', name: 'Pexels', url: 'https://www.pexels.com/', category: 'design' },
  { id: 'pixabay', name: 'Pixabay', url: 'https://pixabay.com/', category: 'design' },
  { id: 'flaticon', name: 'Flaticon', url: 'https://www.flaticon.com/', category: 'design' },
  { id: 'freepik', name: 'Freepik / Magnific', url: 'https://www.magnific.com/', category: 'design' },
  { id: 'biji', name: '運動筆記', url: 'https://running.biji.co/?q=album', category: 'race' },
  { id: 'sportag', name: 'Sportag 運動標籤', url: 'https://www.sportag.net/', category: 'race' },
  { id: 'phomi', name: '瘋迷 PhoMi', url: 'https://phomi.net/', category: 'race' },
  { id: 'soonnet', name: '尋寶網', url: 'https://www.soonnet.org/', category: 'race' },
  { id: 'goodshot', name: '好拍 goodshot', url: 'https://www.goodshot.com.tw/findPhotos?searchText=17507&competitionId=285', category: 'race' },
  { id: 'zsport', name: 'Zsport', url: 'https://www.zsport.com.tw/activity/233', category: 'race' },
  { id: 'allsport', name: 'AllSport', url: 'https://photos.allsports.tw/events/778807', category: 'race' },
  { id: 'phomi_album', name: 'PhoMi', url: 'http://www.phomi.com.tw/activity-photo.php?ActCode=22686237', category: 'race' },
  { id: 'sportag_album', name: 'SportTag', url: 'https://www.sportag.net/web/event-photo.php?event_id=1204&view=all', category: 'race' },
  { id: 'soonnet_album', name: '尋寶網', url: 'https://www.soonnet.org/eventview/9086', category: 'race' },
];
