# Mobile attachment preview repair

Status: implementation, automated tests, local production build and synthetic browser acceptance passed; production deployment pending.

## Finding and prepared change

The previous viewer accepted only images. File rows in messages and the shared-files sidebar were download links; no in-room document preview existed. Image preview also lacked loading/error/retry states.

The prepared implementation:
- Opens the same preview from message attachments and shared-files rows.
- Displays images, PDF pages and UTF-8 TXT/CSV inside a bounded, responsive dialog.
- Keeps filename, file size, close and download actions visible outside the scrolling preview.
- Uses PDF.js 6.4.299, pinned in the dependency manifest/lockfile, loaded only when a PDF is opened. Its matching worker, fonts, CMaps and decoder assets are copied from the installed package during build/dev and served by IdeaHub. There is no third-party document-viewer upload or CDN dependency.
- Renders one PDF page at a time, provides previous/next and 100–200% zoom controls, and limits canvas allocation to four million pixels and DPR 2.
- Cancels outstanding fetches, rendering and workers on close/retry; handles failed loads with a timeout, readable error, retry and download.
- Reads TXT/CSV as inert text, truncating display after 100,000 characters while retaining full-file download.
- Gives DOCX/XLSX/PPTX/ZIP an explicit unsupported-preview message and download action. Native Office layout preview is not implemented.
- Preserves authenticated attachment URLs and server authorization; no server schema, attachment ACL or delivery-header change was made.

## Validation completed

- `npm run check`: TypeScript passed; 141 tests total, 140 passed, 1 skipped, zero failures.
- `npm run build`: passed, including local PDF runtime asset preparation.
- `git diff --check`: passed.
- New tests exercise preview selection, safe download URL construction, canvas memory limits across mobile widths/high DPR/zoom/tall pages, actual PDF parsing and canvas rasterization for portrait/landscape pages, and rejection of malformed PDF bytes.
- Existing file ownership, authentication, upload validation and private delivery tests remain passing.
- `scripts/qa/attachments.tsx` supplies synthetic PDF, TXT, CSV, Office fallback, broken PDF/image, and a fail-once/retry response. No real message or document content is included.

## Browser acceptance completed

Chrome preview checks used synthetic documents only:
- Opened PDF in the dialog at 390×844; its worker/assets loaded successfully and the first page rasterized.
- Changed to page 2, zoomed to 150%, resized to 320×480 and confirmed the header and every PDF control remained visible, with 44px buttons.
- A deliberately failed fetch displayed an error; Retry subsequently rendered the PDF.
- Broken PDF and image sources displayed error/retry states rather than a blank pane.
- Opened TXT from the shared-content section; its 5,738px text body scrolled inside a 401px viewport while the header remained outside the scrolling region. Embedded script-like text remained inert.
- CSV displayed its UTF-8 content. Office fallback exposed an explicit unsupported-preview message and download action.
- Image preview fit within an 844×390 landscape viewport.

Physical iOS/Android devices and OS download UI were not exercised. The synthetic browser checks establish responsive layout and document rendering, not physical-device certification.

## Publication

After automatic review initially rejected public source publication, the user explicitly authorized publishing the source, pinned PDF dependency, and synthetic QA to `GitGud031005/ideahub`, followed by browser acceptance and production deployment. Preview publication and browser acceptance then succeeded.

The production subset excludes the synthetic public wrapper, preview route and same-origin frame-header exception. Generated PDF runtime assets are built from the pinned dependency and are not committed as bundled application artifacts. No real message/document content is included in QA.
