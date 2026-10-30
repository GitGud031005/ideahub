# Mobile attachment preview repair

Status: implementation, automated tests and local production build complete. Browser acceptance and deployment are pending public-repository publication approval.

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

## Remaining acceptance

The current patch has not been inspected in a browser or on physical iOS/Android devices. Before release, check 320/390/430px widths and short landscape viewports, opening from both UI locations, PDF page changes/zoom/resize/rapid close-reopen, image timeout/retry, TXT/CSV scrolling, unsupported formats, and failed-network recovery.

Automatic approval review rejected creating the preview source tree in the public GitHub repository `GitGud031005/ideahub`, because explicit authorization was required for public disclosure of this application source, dependency lockfile and synthetic preview route. No retry or alternate publication path was used after that rejection. Production is unchanged.

The requested next step is to publish the reviewed source/dependency/QA changes to the existing preview branch, complete browser acceptance, then deploy the production subset to main. The synthetic public wrapper, preview route, and same-origin frame-header exception must be excluded from production. Generated PDF runtime assets are built from the pinned dependency and are not committed as bundled application artifacts.
