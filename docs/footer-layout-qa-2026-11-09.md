# Footer layout update

The shared footer used a 21px non-interactive wordmark and an 11px startup link,
shrinking the link text to 10px below 400px. Styling was split between the start
of globals.css and later rules.

The update moves footer styles into a scoped CSS module. The wordmark now links
to the homepage and uses 26px text. Both links have at least 48px height and a
white focus outline on the dark background. The startup link uses 13px text.
Desktop keeps the logo on the left and startup link on the right, within the
same content width and gutter as the dashboard. At 480px and below the footer
stacks with a full-width startup link. Safe-area padding remains supported.

Validation:
- Production build, including TypeScript, passed with a temporary synthetic footer route.
- Whitespace checks passed.
- Synthetic Chrome preview at 320, 390 and 480px: stacked layout, no horizontal
  overflow, both links 48px high, startup text 13px. At 320px the startup link
  occupies the available 280px between 20px gutters.
- At 481, 768, 1363 and 1440px the links share a row and vertical center, with
  no horizontal overflow. The desktop footer height is 104px; stacked is 168px.
- At 1440px the inner content starts at x=60 and ends at x=1380, matching the
  dashboard content width of 1320px.
- Keyboard Tab reaches the startup link with a visible 2px white focus outline.
- Clicking Business for Startup navigates to the actual document overview;
  clicking that page's footer logo navigates back to the dashboard.
- No application data or notification behavior changes are included.

The temporary QA routes, responsive wrapper and preview-only framing exception
are excluded from production. Physical Android/iOS devices have not been tested.
