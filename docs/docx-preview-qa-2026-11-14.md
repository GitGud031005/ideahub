# DOCX attachment preview

DOCX attachments now open in the existing file dialog from both message attachments and the shared Files panel. MIME type and case-insensitive filename detection support earlier octet-stream uploads. PDF, image and text paths retain their existing behavior; legacy DOC, macro-enabled DOCM, XLSX and PPTX remain download-only.

The client lazily loads a Word renderer and converts the file in a disposable Web Worker. Semantic content includes headings, Vietnamese text, emphasis, lists, tables, embedded raster images and links. Long content uses a native vertical scroll region; wide tables scroll independently within the document. The header keeps download and close controls visible. Exact Word page layout, headers/footers, text boxes and complex diagrams are not reproduced; an explicit content-preview note explains this.

The existing authenticated fetch and compressed-upload size limit remain in use. External file access and embedded style maps are disabled. Before conversion the worker checks ZIP entry counts and declared expanded sizes (2,000 entries, 16 MiB per entry, 40 MiB total); a 20-second timeout terminates the worker. Generated HTML is sanitized with a narrow tag/attribute allowlist; only embedded PNG/JPEG/GIF/WebP images survive, and external links use noopener/noreferrer. No Office/Google viewer upload or database change is involved. Unsupported, malformed, empty and failed files have explicit states, retry and the existing download action.

## Validation

- Full check: 147 passed, 1 database-specific skip, 0 failed; TypeScript passed.
- Production build passed; PDF rendering regression test still passed.
- Conversion tests cover Vietnamese, headings, emphasis, tables, embedded images, document end, empty documents, invalid ZIP/non-Word packages and expanded-size rejection.
- Browser preview at 360×800 and 320×568: dialog and content do not overflow horizontally, close stays 44×44px, table overflow is contained, and a 70-paragraph document scrolls to its end.
- Browser preview at 1100×820: readable centered document and table layout.
- Opened from both attachment list and shared Files panel; verified malformed DOCX retry and empty DOCX states.
- Verified the synthetic javascript link loses its href, the normal web link has noopener/noreferrer, and the embedded PNG decodes.
- QA uses desktop Chrome with resized viewports, not physical Android/iOS devices. Mobile layout uses the existing dialog safe-area and visual-viewport handling.

The QA route and framing exception are preview-only and are not part of the production source change.
