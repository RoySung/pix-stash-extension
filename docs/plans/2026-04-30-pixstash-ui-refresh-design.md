## PixStash UI Refresh

### Goal
Shift PixStash from a decorative browser utility toward a calmer, material-first collection tool.
The interface should help users gather, review, and narrow visual materials across sites with less chrome and clearer action hierarchy.

### Product Intent
- Capture quickly while browsing.
- Review visually before managing metadata.
- Keep the product feeling local, quiet, and curated rather than dashboard-heavy.

### Design Decisions
1. Reduce decorative density.
   Keep the light editorial direction, but remove repeated corner marks, heavy frames, and over-expressive panel treatments from every surface.

2. Make popup decisions immediate.
   The popup should show page context and a single dominant capture path. When a page image exists, that action becomes the primary CTA and the image itself should appear in the interface.

3. Make library image-first.
   Shrink the header, keep filters compact, and move management controls out of the visual foreground. Cards should emphasize previews, source context, and quick narrowing rather than six equal-weight buttons.

4. Reframe options as trust and data information.
   The current page is not actually settings. Rename and redesign it as a lightweight explanation of local data, capture flow, and browser access.

5. Keep interaction language calm.
   Copy should sound clear and human, not like product marketing or technical documentation.

### Surface Plan
#### Shared Theme
- Softer paper palette
- Lower-contrast grid and borders
- Calmer buttons, tags, and cards

#### Popup
- Compact top bar
- Visual preview when a page image is available
- One primary capture action with supporting secondary actions
- Minimal explanatory footer instead of two extra cards

#### Library
- Compact header and collection sidebar
- Filters condensed into a lighter toolbar
- Card actions split into primary links and secondary management controls
- Selection bar shown only when needed
- Empty state teaches the three capture paths

#### Options
- Rename to reflect data and permissions
- Use structured panels instead of a single generic settings card

### Validation
- Typecheck after each major UI slice
- Full build after all changes
- Visual spot-check popup, library, and options against the refreshed hierarchy