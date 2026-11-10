# Continuous PDF preview and zoom

PDF pages now form one vertical document. Previous/next controls are removed;
the toolbar shows the total page count. The initial 100% retains the previous
fit-width baseline, with zoom bounded to 25–300%. Reset returns to 100%.

Ctrl+wheel is handled by a non-passive listener inside the PDF stage only.
Regular wheel events retain normal scrolling. Zoom preserves the page-relative
point under the pointer (or viewport center for toolbar actions). Page layouts
are measured before display; canvases render within a 600px viewport margin and
are cancelled/released outside it. Existing pixel allocation caps and render
cancellation/error timeouts remain in place. Native scroll anchoring is disabled
on the stage to avoid double correction during zoom.

Validation:
- Production build including TypeScript passed; whitespace check passed.
- Five targeted attachment tests passed, including actual portrait/landscape PDF
  rasterization, malformed-file rejection, allocation limits and zoom bounds.
- Synthetic Chrome preview: both portrait and landscape pages appear in a
  continuous stack. Ctrl+End reaches the second page without a page-turn button.
- Toolbar reduction: 100 → 75 → 50 → 25%; minus disables at 25%; reset returns 100%.
- Native Ctrl+wheel input changed 50 → 60 → 50%, leaving outer browser/frame
  dimensions unchanged. Ordinary wheel input changed scrollTop 473 → 353 while
  preserving 50% zoom.
- At 320x568, controls fit within the viewport (last right edge 307px), all 44px
  high; 100% pages have no horizontal overflow.
- Preview route and synthetic fixture are excluded from production.

Physical Android/iOS devices were not tested. Text selection/search and mobile
pinch gesture behavior are outside this change.
