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
