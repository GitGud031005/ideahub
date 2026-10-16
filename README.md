# IdeaHub

A minimal black-and-white dashboard for sharing ideas and building on them together.

## Run the frontend

Open `index.html` in a modern browser. No installation or build step is required. The prism image is embedded in the page, so the app has no network dependency.

## Dashboard

- Search titles, descriptions, and tags, including Vietnamese text without accents.
- Create an idea with a title, description, category, and tags.
- Filter all ideas, joined discussions, or your own ideas; sort by newest or participant count.
- Scroll long tag lists with touch, dragging, the wheel, or the right-arrow control.
- Click an idea to open its dedicated full-screen discussion page.

## Discussion page

Click an idea to open its dedicated route, such as `index.html#/idea/1`. The page fills the viewport, with no popup, backdrop, rounded frame, or dashboard header. The left-column header contains “Thảo luận”, the live total comment count, a back control, and adjacent comment sorting. The idea sidebar starts at the very top and spans the full height alongside both header and conversation. Browser Back/Forward and direct-link refresh work. Returning to the dashboard restores its filters and scroll position.

- The right pane contains the idea title, full description, creator, creation time, participant count, and tags. On narrow screens, this pane stacks above the conversation. There is no separate category section or joined-status message under the participant count.
- The main pane contains only comments and the comment composer, without a separate comments heading or counter.
- Reply to any comment, including replies within replies, with a nested hierarchy. Connector lines run from the parent avatar down through its full comment, then curve into the child avatar. Sibling trunks continue through the complete reply subtree. Compact nesting keeps the same connected geometry.
- Only comments that have replies show a “Xem N trả lời” / “Ẩn trả lời” control. Hiding replies keeps the parent comment visible. There are no vote buttons or plus/minus collapse controls.
- Sort root comments by newest or oldest from the page header; replies stay chronological.
- Type into a minimal underlined field that grows with its content. Press Enter to post, Shift+Enter for a new line, and Escape to cancel an inline reply. Enter and Esc hints appear on the action buttons. IME composition does not accidentally submit. No input icons, resize handles, or rounded focus rings are shown; the focused underline remains visible.
- Scroll conversation, details, and long text with the scrollbar tracks hidden; scrolling remains enabled.

Older flat demo messages are migrated into comments. Existing user-written messages, nested replies, and ideas are preserved. Comment and reply drafts remain available while switching between ideas in the current session.

## Demo data and limitations

This is a frontend prototype with fictional seed data and one demo user. Ideas, membership, and nested comments are stored in this browser's localStorage when available. It does not yet have a shared database, authentication, or realtime synchronization. Clearing the `ideahub-ui-v1` localStorage entry resets the demo.

The responsive UI supports keyboard controls and reduced motion. Light animation runs continuously while the hero is visible, pauses in background tabs or offscreen, and stays static when reduced motion is enabled.

## Validation

Validated application logic includes dedicated routes, browser Back/Forward, direct-link reloads, dashboard scroll restoration, membership deduplication, nested replies, child-only disclosure, comment persistence, draft isolation, escaped user content, header sorting, and simplified sidebar content. Enter submission, Shift+Enter, IME composition guards, Escape cancellation, textarea growth, and the live header count are also verified. Connector structure and shared alignment variables were checked. JavaScript syntax checks pass. Browser visual verification has not been performed in this environment.
