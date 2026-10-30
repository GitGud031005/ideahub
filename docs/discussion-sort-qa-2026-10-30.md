# Most-discussed chat sorting

Status: local automated checks and synthetic mobile/desktop browser acceptance passed; production deployment pending.

The room sort menu now offers “Bàn luận nhiều nhất” alongside “Mới nhất” and “Cũ nhất”. It ranks sibling comments by their total descendant reply count, including every nested level and collapsed branches. Ties use newest comment timestamp, then deterministic ID order. The rule applies at every level of the tree. Default remains newest first.

Counts are computed from each complete comment snapshot using an iterative leaf-first pass, so incoming replies update rankings and deeply nested discussions do not overflow the stack. This mode preserves the reader's scroll anchor rather than treating the top of the ranked list as the chronological live edge. Existing chronological sorting and unread behavior remain unchanged.

Validation:
- TypeScript and production build passed.
- Full suite: 144 tests total, 143 passed, 1 skipped, zero failures.
- New tests cover nested reply counts, ranking at multiple sibling levels, tie breaking, fresh reply snapshots, unchanged chronological order, no source mutation, missing-parent normalization, 15,000-deep chains and cycle termination.
- Whitespace checks passed.
- Synthetic room fixture in `scripts/qa/discussion-sort.tsx` distinguishes a newer inactive branch from an older branch with more replies. Browser checks passed: default newest-first order, most-discussed root order, nested sibling ranking, switching back to oldest/newest, and the new option on desktop at 1440px. At 320×568, the 184px menu stayed within the viewport, all three options fit without text overflow, and each option was 44px high.

The user explicitly approved public publication and deployment after an earlier automatic-review block. The preview was published to `GitGud031005/ideahub` and browser acceptance then completed successfully.

The production subset excludes the temporary preview route, public wrapper and same-origin frame-header exception. No real messages were created or changed during QA. Physical Android/iOS devices were not exercised.
