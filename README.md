# IdeaHub

A minimal black-and-white dashboard for sharing ideas and building on them together.

## Run the frontend

Open `index.html` in a modern browser. No installation or build step is required. The prism image is embedded in the page, so the app has no network dependency.

## Dashboard

- Search titles, descriptions, and tags, including Vietnamese text without accents.
- Create an idea with a title, description, category, and tags.
- Filter all ideas, joined discussions, or your own ideas; sort by newest or participant count.
- Scroll long tag lists with touch, dragging, the wheel, or the right-arrow control.
- Click an idea to open its dedicated discussion page.

## Discussion pages

Each idea has a separate frontend route, for example `index.html#/idea/1`. The route can be opened directly or refreshed. The back control returns to the dashboard, and browser Back/Forward follows route changes.

- Read the idea and its full description at the top of the page.
- Post a comment or reply to any comment, including replies within replies.
- Collapse and reopen a comment branch.
- Upvote or downvote a comment; click the same vote again to clear it.
- Sort root comments by score, newest, or oldest; replies stay in chronological order.
- Use Ctrl+Enter (or Cmd+Enter) to post from a comment field.

Older flat demo messages are migrated into comments. Existing user-written messages and ideas are preserved. Comment drafts remain available while navigating between ideas in the current session.

## Demo data and limitations

This is a frontend prototype with fictional seed data and one demo user. Ideas, membership, nested comments, and votes are stored in this browser's localStorage when available. It does not yet have a shared database, authentication, or realtime synchronization. Clearing the `ideahub-ui-v1` localStorage entry resets the demo.

The responsive UI supports keyboard controls and reduced motion. Light animation runs continuously while the hero is visible, pauses in background tabs or offscreen, and stays static when reduced motion is enabled.

## Validation

Validated application logic includes routing and deep-link reloads, membership deduplication, nested replies, branch collapse/expand, voting, comment persistence, legacy migration, room isolation, and escaped user content. Browser visual verification has not been performed in this environment.
