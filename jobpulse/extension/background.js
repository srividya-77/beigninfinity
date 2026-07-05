// background.js — Service Worker
// Opens the side panel when the extension icon is clicked

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Forward messages from content script to side panel
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "APPLICATION_LOGGED") {
    // Broadcast to all extension pages (side panel picks it up)
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});
