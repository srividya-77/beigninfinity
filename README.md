# beigninfinity

A hackathon project containing **JobPulse** — a Chrome extension and landing page for monitoring multiple job-hunting Gmail inboxes from one dashboard.

## What it does

Job seekers often use several separate email accounts to avoid spam on their primary inbox. JobPulse removes the need to manually switch between those accounts. It has two parts:

**Chrome Extension (`hackathon/jobpulse/extension/`)**
- Opens as a side panel when you click the extension icon
- Polls a backend server every 30 seconds to check for new emails across all added accounts
- Tracks job applications automatically on Greenhouse (`boards.greenhouse.io`) and Lever (`jobs.lever.co`) pages via a content script
- Shows unread counts and an application tracker per account
- Uses `chrome.storage.local` to persist accounts and tracker entries

**Landing page (`hackathon/jobpulse/website/`)**
- Static HTML/CSS marketing page for the product

The `hackathon/docs/` folder contains the project proposal and technical specification written for the hackathon submission.

> **Note:** The extension's `sidepanel.js` points to `https://your-node-backend.com` as the backend URL — a real backend is not included in this repository.

## Built with

- Chrome Extensions Manifest V3 (service worker, side panel, content scripts)
- Vanilla JavaScript, HTML, CSS
- Chrome APIs: `storage`, `identity`, `notifications`, `sidePanel`

## How to run

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `hackathon/jobpulse/extension/` folder
4. Click the extension icon in the toolbar to open the side panel

The landing page can be opened directly by opening `hackathon/jobpulse/website/index.html` in a browser.
