# Recap reading-area correction — 27 October 2026

The earlier popup QA was insufficient to claim that every recap state was usable: popup bounds alone do not establish a readable content area. The short-screen workaround also left the original flex body between non-scrolling metadata and footer in other viewports.

The reader now portals directly to BODY and uses an explicit viewport-bounded height. A fixed 57px close bar is the only non-scrolling row. Metadata, headings, content, source links and footer share one focusable scrolling document; the inner content has normal block height rather than a second constrained scroller. The closed dialog remains hidden until `showModal`.

## Measured reading viewport

| Browser fixture | Reading height |
| --- | ---: |
| 320 × 568 | 485px |
| 375 × 667 | 584px |
| 390 × 844 | 761px |
| 430 × 932 | 849px |
| 360 × 800 | 717px |
| 412 × 915 | 832px |
| 844 × 390 landscape | 283px |
| 390 × 480 short viewport | 397px |
| 340px visible height, offset 100px | 257px |
| 1440 × 844 desktop | 737px |

Actual React reader tested with a 32-bullet recap, a long filename, loading and failed-request states. Its parent is BODY and the content body has visible overflow into the one document scroller. At the end of the long landscape recap, scrollTop reached 4266px, the footer was visible, and the close button remained at y=31px. The panned dialog stayed within y=112–428.

Production build and TypeScript checks pass. These measurements are from Chrome/Blink fixtures with simulated phone sizes and keyboard viewport geometry. They do not certify physical Safari or Android devices, or every other popup. No account preferences or production messages were changed during fixture QA.

Generated public QA assets are removed from the final production tree. The fixture build compresses its generated payloads to keep preview uploads manageable.
