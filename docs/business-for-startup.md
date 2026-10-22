# Business for Startup

Public Vietnamese entrepreneurship reading area at `/business-for-startup`, linked from the dashboard footer. Eleven supplied chapters keep their original numbering (1–6, 8–12), followed by a worked proposal, editable-by-copy outline and ten-step implementation workflow.

## Content

- `src/content/business-for-startup/`: typed blocks, chapter content, proposal and source notes. No PDF, slide screenshot, student identity or uploaded course asset is included in the repository or deployment.
- Chapters are condensed original-language explanations, not verbatim slide transcriptions. Barringer/Ireland and the nine-cell BMC are identified separately. Conceptual IP material does not reproduce dated US procedures as Vietnamese legal advice.
- The AI NextGen case is explicitly hypothetical. Market, pilot and sales quantities are illustrative, with no claimed users, partners or results. All financial amounts are newly authored assumptions in millions of VND, before tax, without inventory, receivables or debt. Tax is not modeled and the simplified case is labeled accordingly.
- `financial-example.ts` supplies every worked-case table from one model. Equipment cash purchases and depreciation are separated; cash, assets and equity reconcile.
- The case sells four-week packages completed within each modeled year. Its management statement uses contribution (sales less variable costs), not gross profit. The six-week free pilot's 12m VND budget is included once within year-one fixed cash costs; the proposal includes a sources-and-uses reconciliation. See [final content QA](business-for-startup-content-qa-2026-10-22.md).
- Illustrations are semantic HTML/CSS and a labeled SVG calculator. No external image request or runtime AI generation is required.

## Rendering and navigation

App Router server pages prerender the overview and twelve lesson routes. Unknown slugs return 404. The shell provides chapter navigation and client-side document search; all substantive chapter text remains available in the initial HTML. Search is limited to this curriculum and supports Vietnamese with or without accents. Heading links, previous/next lessons, mobile native dialog, table scrolling, templates and clipboard fallback are included. No new database, authentication gate or dependency is required.

## Validation

Run `npm run check` and `npm run build`. `tests/startup.test.ts` validates chapter numbering, live search anchors, table shape, accent-insensitive/body search, financial reconciliation and break-even edge cases. For responsive QA, inspect overview, footer, long proposal and finance lesson at 320/390/768/1440 px; verify native menu/Escape, search navigation and empty results, copy behavior and calculator validation. Do not publish temporary QA fixture assets.

## Updating

Edit typed content and retain stable slugs and heading IDs. Update source notes and editorial date when appropriate. For a current market/legal claim, verify official sources and add dated attribution before replacing a labeled assumption. Never upload the course PDFs to `public/`, import them into source or link local upload paths from the product.
