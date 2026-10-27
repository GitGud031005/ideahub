# Mobile room UI follow-up — 27 October 2026

## Reproduced issues and fixes

| Issue | Evidence before the fix | Result |
| --- | --- | --- |
| Header bell painted over the drawer | The notification control's stacking context escaped the header and appeared above the information/search panel | Header controls now stay under the drawer and scrim |
| Mentions clipped below a multiline composer | At 390 × 480, typing another character after a multiline `@` placed suggestions at y=418–597.5, beyond the 480px viewport | Suggestions are portalled and repositioned using the visible viewport, with a scrollable height cap |
| Comment actions clipped by the message scroller | The edit menu was absolutely positioned inside the scrolling comment article | Menu is portalled, remains hit-testable and opens the inline editor |
| Larger-phone header overflow | At 412px, the header actions ended at x=413.84 | Compact sort control now applies through 480px; final room scroll width equals 412px |
| Short-screen recap reading area | At 844 × 390, only about 90px remained for the recap body between fixed header/footer sections | Short screens use one scrollable reader; close control stays sticky while scrolling |
| Uneven notification-dialog margins | The browser's native max-width reduced the 320px dialog to 286px despite 12px side offsets | Explicit width handling gives 296px width, x=12–308 |
| Image-preview controls and focus | Long names competed with actions; focus initially landed on download | Filename truncates, close/download targets are 44px, image uses visible viewport height, and focus returns to the source image |
| Keyboard pan and nested scrolling | Height-only constraints did not move the room/drawer to the panned viewport | Room, drawer and dialogs follow visible viewport offset and height; background room scrolling is locked on small screens |

## Interaction checks

Used the real React components in an isolated browser fixture with mocked API/account/push state. No production messages, account settings or notification permissions were changed.

- Seven-line composer, filtering mention names, selecting a member and retaining the resulting mention.
- A 340px visible viewport offset by 100px: room bounds y=100–440, suggestions remain inside y=112–428, and messages retain a usable scroller.
- Long room title/description, long image filename, 27 members, sender filtering, search result selection, drawer dismissal and nested reply expansion at 320px.
- Open/edit/cancel a comment using the portalled action menu.
- Open notifications from the room at 320px; dialog bounds x=12–308, y=12–556 and close target 44px.
- Open recap after scrolling the drawer, rotate to landscape, scroll to the end and close. ScrollTop reached 272px while close stayed at y=19.
- Image preview under a panned viewport: all content fits without inner overflow; closing restores focus to the image trigger.
- Login/register, nested avatar chooser, new-idea form and tag filtering/selection remain bounded within the short/panned viewport.

Final room-layout sweep:

| Viewport | Room width / scroll width | Room height | Composer bottom |
| --- | --- | --- | --- |
| 320 × 568 | 320 / 320 | 568 | 568 |
| 375 × 667 | 375 / 375 | 667 | 667 |
| 390 × 844 | 390 / 390 | 844 | 844 |
| 430 × 932 | 430 / 430 | 932 | 932 |
| 360 × 800 | 360 / 360 | 800 | 800 |
| 412 × 915 | 412 / 412 | 915 | 915 |
| 844 × 390 | 844 / 844 | 390 | 390 |
| 390 × 480 | 390 / 390 | 480 | 480 |

## Validation and limits

TypeScript and production build pass. Full suite: 112 passed, one external PostgreSQL integration test skipped. New geometry tests cover phone sizes, short viewports and panned keyboard offsets. Temporary public QA bundles are excluded from the final production tree.

This pass exercises Chrome/Blink at Android/iPhone viewport sizes with simulated keyboard pan. It does not certify physical iOS Safari, native Android keyboards, pinch/pan behavior or operating-system push banners. Those still need real-device checks.
