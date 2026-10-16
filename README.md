# IdeaHub

A minimal black-and-white dashboard for sharing ideas and building on them together.

## Run the frontend

Open `index.html` in a modern browser. No installation or build step is required. The prism image is embedded in the page, so the app has no network dependency.

## Dashboard

- Search titles, descriptions, and tags, including Vietnamese text without accents.
- Create an idea with a title, description, category, and tags.
- Filter all ideas, joined discussions, or your own ideas; sort by newest or participant count.
- Scroll long tag lists with touch, dragging, the wheel, or the right-arrow control.
- Click an idea to open its discussion in a popup over the current dashboard, without navigating.

## Discussion popup

The popup occupies 90% of the viewport width and height. The dashboard remains visible behind the overlay, retains its filters and scroll position, and is inert while the popup is open. Close with the close button, backdrop, or Escape. Keyboard focus stays inside the popup and returns to the dashboard when it closes.

- The right pane contains the idea title, full description, creator, creation time, participant count, joined status, category, and tags. On narrow screens, this pane stacks above the conversation.
- The main pane contains only the comments, sorting, and comment composer.
- Reply to any comment, including replies within replies, with a nested hierarchy and connector lines.
- Only comments that have replies show a “Xem N trả lời” / “Ẩn trả lời” control. Hiding replies keeps the parent comment visible. There are no vote buttons or plus/minus collapse controls.
- Sort root comments by newest or oldest; replies stay chronological.
- Use Ctrl+Enter (or Cmd+Enter) to post from a comment field.
- Existing `index.html#/idea/1` links still open the relevant popup over the dashboard. Opening a card does not change the URL.

Older flat demo messages are migrated into comments. Existing user-written messages, nested replies, and ideas are preserved. Comment and reply drafts remain available while switching between ideas in the current session.

## Demo data and limitations

This is a frontend prototype with fictional seed data and one demo user. Ideas, membership, and nested comments are stored in this browser's localStorage when available. It does not yet have a shared database, authentication, or realtime synchronization. Clearing the `ideahub-ui-v1` localStorage entry resets the demo.

The responsive UI supports keyboard controls and reduced motion. Light animation runs continuously while the hero is visible, pauses in background tabs or offscreen, and stays static when reduced motion is enabled.

## Validation

Validated application logic includes popup opening and closing, unchanged dashboard and URL, scroll locking, keyboard focus containment, membership deduplication, nested replies, child-only disclosure, comment persistence, draft isolation, legacy deep links, and escaped user content. JavaScript syntax checks pass. Browser visual verification has not been performed in this environment.
