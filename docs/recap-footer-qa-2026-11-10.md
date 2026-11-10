# AI recap footer placement

The recap dialog has a fixed viewport-bounded reading height. With short content,
its footer previously followed the content and left unused space beneath it.
The scrolling document now uses a column flex layout and the footer has an auto
top margin. Short documents put the footer at the bottom; long documents retain
the same single scroll region, with the footer after the content. The close bar
and mobile viewport height rules remain unchanged.

Validation:
- Production build including TypeScript and whitespace checks passed.
- Synthetic Chrome fixture using the production CSS: at 1100x900, short content
  has a 741px reading region, no scroll overflow, and zero space below the footer.
- At 390x844, short content has a 737px region and zero footer-bottom gap.
- Long content remains scrollable to the footer: 320x568 (461px reader,
  scrollTop 4122), 390x844 (737px reader, scrollTop 3802), and 844x390
  (283px reader, scrollTop 2609). Footer bottom aligns within 1px of the reader
  bottom after scrolling to the end; the top bar stays visible.
- Fixture data is synthetic; the preview route is excluded from production.
- Physical Android/iOS devices have not been tested.
