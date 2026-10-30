# Chat header alignment

The sort selector previously appeared as unboxed text beside boxed bell/search actions and changed width with its selected label. The room toolbar now uses aligned 44px controls, consistent gaps, and a bordered 208px sort button with an icon. The standalone caption is hidden. Sorting labels no longer move adjacent actions.

A named container query switches the sort control to a 44px icon button when the actual chat header is narrow, including tablet layouts with the idea sidebar open. The accessible selected-sort label and all menu options remain available. Styles are scoped to the discussion header; generic selects elsewhere are unaffected.

Validation:
- Production build and TypeScript completed successfully; whitespace check passed.
- Synthetic browser measurements at 320/390px: all action buttons were 44×44px, shared vertical center 31.5px, and stayed inside the viewport. At 320px the rightmost action ended at 310px, with no header overflow.
- At 1440px: bell/search/sidebar buttons were 44px wide, sort was 208px wide, and all controls shared center 35.5px. Changing newest to most-discussed preserved every action's x coordinate and width exactly.
- With sidebar open at a 768px viewport, the 488px chat header used compact controls, each 44px high and centered at 35.5px, with no overflow.
- At 1917px with sidebar open, the full selector and neighboring buttons remained 44px high and centered at 35.5px, with no overflow.
- The synthetic fixture was inspected visually. Physical Android/iOS devices were not exercised.

No sorting or data behavior changed. The preview-only route, wrapper and same-origin framing exception are excluded from production.
