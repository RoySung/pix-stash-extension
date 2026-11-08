import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RecommendedWebsites } from './RecommendedWebsites';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RecommendedWebsites', () => {
  it('keeps hidden category controls out of the modal focus list', () => {
    const markup = renderToStaticMarkup(
      <RecommendedWebsites bookmarks={[]} busy={false} error={null} onAdd={vi.fn()} />,
    );
    const panels = [...markup.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)];
    expect(panels).toHaveLength(2);

    const hiddenPanels = panels.filter(([, attributes]) => attributes.includes('hidden=""'));
    expect(hiddenPanels).toHaveLength(1);
    for (const [, , content] of hiddenPanels) {
      expect(content).not.toMatch(/<(?:a|button|input|textarea|select)\b|tabindex=/i);
    }

    const visiblePanel = panels.find(([, attributes]) => !attributes.includes('hidden=""'));
    expect(visiblePanel?.[2]).toContain('href="https://unsplash.com/"');
    expect(visiblePanel?.[2]).toContain('data-bookmark-add');
  });
});
