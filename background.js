// Debug log for background script initialization
console.log('[Mochi] Background script initialized');

chrome.action.onClicked.addListener((tab) => {
  console.log('[Mochi] Extension icon clicked for tab:', tab.id);
  chrome.tabs.sendMessage(tab.id, { action: "toggleExtraction" });
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Mochi] Extension installed/updated:', details.reason);
  if (details.reason === 'install') {
    // Create a new tab with instructions
    chrome.tabs.create({
      url: chrome.runtime.getURL('instructions.html')
    });
  }
});

// Add this new listener
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {  // Only inject in the main frame
    chrome.tabs.get(details.tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting tab:', chrome.runtime.lastError);
        return;
      }
      if (tab && tab.url && (
          tab.url.toLowerCase().includes('.pdf') || 
          (tab.url.startsWith('file://') && tab.url.toLowerCase().endsWith('.pdf'))
      )) {
        chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          files: ['content.js']
        });
      }
    });
  }
});

// Listen for tab updates to ensure chat button is always visible
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log('[Mochi] Tab updated:', { tabId, status: changeInfo.status, url: tab.url });
  
  // Skip chrome:// URLs and other restricted URLs
  if (tab.url?.startsWith('chrome://') || 
      tab.url?.startsWith('chrome-extension://') || 
      tab.url?.startsWith('devtools://')) {
    console.log('[Mochi] Skipping restricted URL:', tab.url);
    return;
  }

  if (changeInfo.status === 'complete') {
    console.log('[Mochi] Attempting to inject chat button for tab:', tabId);
    
    try {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: () => {
          console.log('[Mochi] Injection script running');
          
          let toggleButton = document.getElementById('chat-toggle-button');
          
          // Create button if it doesn't exist or is not properly initialized
          if (!toggleButton) {
            console.log('[Mochi] Creating chat button');
            toggleButton = document.createElement('div');
            toggleButton.id = 'chat-toggle-button';
          }

          // Ensure button is properly styled and visible
          toggleButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 44px;
            height: 44px;
            background: #ffffff;
            border-radius: 6px;
            display: flex !important;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
            transition: all 0.2s;
            z-index: 10000;
            color: #000000;
            border: 1px solid rgba(0, 0, 0, 0.08);
          `;

          toggleButton.innerHTML = `
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          `;

          // Add hover effect directly to the button
          toggleButton.addEventListener('mouseenter', () => {
            toggleButton.style.background = '#f9f9f9';
            toggleButton.style.transform = 'translateY(-1px)';
            toggleButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.08)';
          });

          toggleButton.addEventListener('mouseleave', () => {
            toggleButton.style.background = '#ffffff';
            toggleButton.style.transform = 'none';
            toggleButton.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.08)';
          });

          // Add click handler
          toggleButton.addEventListener('click', () => {
            console.log('[Mochi] Chat button clicked');
            // Send message to content script
            if (window.chrome && chrome.runtime) {
              chrome.runtime.sendMessage({ action: "toggleExtraction" });
            }
          });

          // Ensure button is in the document
          if (!toggleButton.parentElement) {
            document.body.appendChild(toggleButton);
            console.log('[Mochi] Chat button added to page');
          }

          // Force button to be visible
          setTimeout(() => {
            toggleButton.style.display = 'flex';
            console.log('[Mochi] Ensuring button visibility');
          }, 100);
        }
      }).catch(err => {
        console.error('[Mochi] Failed to inject chat button:', err);
      });
    } catch (err) {
      console.error('[Mochi] Error during injection setup:', err);
    }
  }
});

// Listen for keyboard command
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-chat") {
    // Send message to content script to toggle chat
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "toggleExtraction"});
    });
  }
});

const API_KEY = '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'; // Replace with your actual API key

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateResponse") {
    console.log('Received generateResponse request in background script:', request);
    generateChatGPTResponse(request.prompt, sender, request.history)
      .then(result => {
        console.log('ChatGPT response generated:', result);
        sendResponse({ success: true, result: result });
      })
      .catch(error => {
        console.error('Error generating ChatGPT response:', error);
        sendResponse({ error: error.message });
      });
    return true; // Indicates that the response is sent asynchronously
  }
  if (request.action === "openExtensionsPage") {
    chrome.tabs.create({
      url: 'chrome://extensions/?id=' + chrome.runtime.id
    });
  }
  if (request.action === "checkFilePermission") {
    try {
      chrome.extension.isAllowedFileSchemeAccess((allowed) => {
        console.log('File access permission:', allowed);
        if (chrome.runtime.lastError) {
          console.error('Permission check error:', chrome.runtime.lastError);
          sendResponse({ hasPermission: false });
        } else {
          sendResponse({ hasPermission: allowed });
        }
      });
    } catch (error) {
      console.error('Permission check exception:', error);
      sendResponse({ hasPermission: false });
    }
    return true;
  }
});

async function generateChatGPTResponse(prompt, sender, history) {
  const url = 'https://api.openai.com/v1/chat/completions';

  try {
    console.log('Sending request to ChatGPT API with prompt:', prompt);
    const messages = history.map(msg => ({ role: msg.role, content: msg.content }));
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API response not OK:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('Stream complete');
        break;
      }
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
              const textChunk = data.choices[0].delta.content;
              accumulatedResponse += textChunk;
              console.log('Processed text chunk:', textChunk);
              console.log('Current accumulated response:', accumulatedResponse);
              chrome.tabs.sendMessage(sender.tab.id, { 
                action: "updateStreamingResponse", 
                text: accumulatedResponse,
                chunk: textChunk
              });
            }
          } catch (error) {
            console.error('Error parsing streaming data:', error, 'Raw line:', line);
          }
        }
      }
    }

    console.log('Full accumulated response:', accumulatedResponse);

    // Send a final message with the complete response
    chrome.tabs.sendMessage(sender.tab.id, { 
      action: "updateStreamingResponse", 
      text: accumulatedResponse,
      isFinal: true
    });

    return accumulatedResponse;
  } catch (error) {
    console.error('Error in generateChatGPTResponse:', error);
    chrome.tabs.sendMessage(sender.tab.id, { action: "updateStreamingResponse", error: error.message });
    throw error;
  }
}
