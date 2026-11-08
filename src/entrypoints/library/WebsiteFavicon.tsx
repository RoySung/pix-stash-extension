import { useState } from 'react';
import './WebsiteFavicon.css';

export function WebsiteFavicon({ url }: { url: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  let source: string | null = null;
  try {
    const website = new URL(url);
    if (website.protocol === 'https:' || website.protocol === 'http:') {
      source = new URL('/favicon.ico', website.origin).href;
    }
  } catch { /* Invalid addresses use the default website icon. */ }

  if (!source || failedUrl === source) {
    return (
      <svg className="website-favicon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="7" />
        <ellipse cx="10" cy="10" rx="3" ry="7" />
        <path d="M3 10h14" />
      </svg>
    );
  }

  return <img className="website-favicon" src={source} alt="" aria-hidden="true" width={18} height={18}
    referrerPolicy="no-referrer" onError={() => setFailedUrl(source)} />;
}
