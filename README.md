# Chat Navigator for ChatGPT

A small Chrome extension I built to make navigating long ChatGPT conversations easier.

When a conversation gets really long, finding an older prompt can mean scrolling for ages. Chat Navigator adds a sidebar to the ChatGPT page that collects the prompts in the conversation and lets me jump back to them.

## Features

- **Prompt sidebar:** Shows a numbered list of the prompts in the current conversation.
- **Jump to a prompt:** Click an entry to scroll to that message when it is currently loaded in the page.
- **Search:** Search through the prompts collected from the conversation.
- **Active prompt indicator:** Highlights the prompt closest to the current reading position.
- **Scrollable list:** The sidebar can hold a long list of prompts without taking over the whole page.
- **Collapsible sidebar:** Collapse it when you need more screen space.
- **Draggable panel:** Move the sidebar to a different part of the screen.
- **Go to top:** Use the arrow button to move to the top of the currently loaded conversation.
- **Conversation switching:** The prompt list resets when you move to a different conversation, so prompts from separate chats do not get mixed together.
- **Light and dark themes:** The sidebar adapts to ChatGPT's current theme.

## Installation

This extension is currently installed manually through Chrome's developer mode. It is not published on the Chrome Web Store.

1. Download or clone this repository.
2. If you downloaded the ZIP, extract it.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the folder containing `manifest.json` and `content.js`.
7. Open or refresh [ChatGPT](https://chatgpt.com/).

The Chat Navigator panel should appear on the page.

## How to use it

1. Open a ChatGPT conversation.
2. The sidebar will start collecting the prompts it can detect in that conversation.
3. Click a prompt to navigate to its message.
4. Use the search box to find a specific prompt.
5. Click the **– / +** control to collapse or expand the sidebar.
6. Drag the header to reposition the panel.
7. Use the **↑** button to go to the top of the currently loaded conversation.

## How it works

The extension runs as a content script on ChatGPT pages. It looks for the accessible headings ChatGPT uses for user messages, extracts the prompt text, and displays it in a sidebar.

The sidebar is built inside a Shadow DOM. This keeps its styles separate from ChatGPT's page styles and helps prevent the two interfaces from interfering with each other.

ChatGPT does not keep every message mounted in the page at all times. In long conversations, older messages can be temporarily removed from the DOM as you scroll. To handle this, the extension keeps an in-memory list of prompts it has already detected and updates that list as more messages are loaded.

## Privacy

I wanted this to stay local, so the extension does not send conversation content to an external server.

- No account sign-in is required.
- No external API is used.
- No analytics or tracking are included.
- Prompt data is kept in the extension's page memory while the conversation is open.

The extension only runs on the ChatGPT page URLs listed in `manifest.json`.

## Current limitations

- Prompts are collected as ChatGPT loads them into the page. If a part of a conversation has never been loaded during the current visit, its prompts may not appear in the sidebar yet.
- If a prompt is no longer mounted in the page because of ChatGPT's virtual scrolling, clicking it moves towards the relevant end of the loaded conversation. It may take additional scrolling for ChatGPT to load the exact message.
- The **Go to top** button moves to the top of the currently loaded conversation view. It does not guarantee that ChatGPT has loaded the very first message in a very long conversation.
- ChatGPT can change its page structure at any time. If its message layout changes, the selectors used by the extension may need updating.

## Project structure

```text
chat-navigator/
├── manifest.json
├── content.js
└── README.md
```

- `manifest.json` contains the Chrome extension configuration.
- `content.js` creates the sidebar, detects prompts, and handles navigation and interaction.
- `README.md` contains the project documentation.

## Built with

- JavaScript
- Chrome Extension Manifest V3
- HTML and CSS
- DOM APIs and MutationObserver

## Contributing

This is a personal project, but suggestions, bug reports, and improvements are welcome. If you find an issue, feel free to open an issue or submit a pull request.

---

I built this project to solve a small problem I kept running into while using ChatGPT: losing track of older prompts in long conversations. I hope it makes navigating your chats a little easier too.
