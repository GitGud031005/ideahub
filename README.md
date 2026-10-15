# IdeaHub

A minimal black-and-white dashboard for sharing ideas and starting conversations.

## Preview

Open `index.html` in a modern browser. No installation or build step is required.

## Frontend interactions

- Search idea titles, descriptions, and categories, including Vietnamese text without accents.
- Create an idea with a title, short description, and category.
- Filter all ideas, joined conversations, or your own ideas.
- Sort by newest or participant count.
- Join a conversation and send messages in its own room.
- Use Escape to close a dialog and Enter to send a message.

## Demo scope

This is a frontend prototype with fictional seed data and a demo user. Ideas, membership, and messages are stored in this browser's localStorage when available. There is no shared database, authentication, or realtime synchronization yet. Clear the `ideahub-ui-v1` localStorage entry to reset demo data.

The layout adapts to mobile and supports keyboard navigation and reduced motion preferences.
