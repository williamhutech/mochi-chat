chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggleExtraction" });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [{
          header: 'Content-Security-Policy',
          operation: 'set',
          value: "script-src 'self' 'unsafe-eval'; object-src 'self'"
        }]
      },
      condition: {
        urlFilter: '|https://*',
        resourceTypes: ['main_frame']
      }
    }]
  });
});

// Add this new listener
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {  // Only inject in the main frame
    chrome.tabs.get(details.tabId, (tab) => {
      if (tab.url.toLowerCase().includes('.pdf')) {
        chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          files: ['content.js']
        });
      }
    });
  }
});
