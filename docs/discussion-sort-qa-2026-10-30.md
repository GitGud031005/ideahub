# Most-discussed chat sorting

Status: local implementation and automated checks complete; browser preview and production publication are pending approval.

The room sort menu now offers “Bàn luận nhiều nhất” alongside “Mới nhất” and “Cũ nhất”. It ranks sibling comments by their total descendant reply count, including every nested level and collapsed branches. Ties use newest comment timestamp, then deterministic ID order. The rule applies at every level of the tree. Default remains newest first.

Counts are computed from each complete comment snapshot using an iterative leaf-first pass, so incoming replies update rankings and deeply nested discussions do not overflow the stack. This mode preserves the reader's scroll anchor rather than treating the top of the ranked list as the chronological live edge. Existing chronological sorting and unread behavior remain unchanged.

Validation:
- TypeScript and production build passed.
- Full suite: 144 tests total, 143 passed, 1 skipped, zero failures.
- New tests cover nested reply counts, ranking at multiple sibling levels, tie breaking, fresh reply snapshots, unchanged chronological order, no source mutation, missing-parent normalization, 15,000-deep chains and cycle termination.
- Whitespace checks passed.
- Synthetic room fixture in `scripts/qa/discussion-sort.tsx` distinguishes a newer inactive branch from an older branch with more replies. Browser checks of menu fit, selection, ranked root/child order, and switching back to chronological modes remain pending.

Automatic approval review rejected creation of the preview source tree in public repository `GitGud031005/ideahub`: it required explicit authorization for public disclosure of this new application/QA payload. No alternate publication path was attempted. Production remains unchanged.

Requested publication scope: application changes, regression tests, this report and synthetic QA source to the preview branch; after browser acceptance, publish the production subset to main. Exclude the temporary preview route, public wrapper and same-origin frame-header exception from production.
