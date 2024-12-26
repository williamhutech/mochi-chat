// Debug log for background script initialization
console.log('[Mochi-Background] Background script initialized');

chrome.action.onClicked.addListener((tab) => {
  console.log('[Mochi-Background] Extension icon clicked for tab:', tab.id);
  chrome.tabs.sendMessage(tab.id, { action: "toggleExtraction" });
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Mochi-Background] Extension installed/updated:', details.reason);
  if (details.reason === 'install') {
    // Create a new tab with instructions
    chrome.tabs.create({
      url: chrome.runtime.getURL('instructions.html')
    });
  }
});

// Listen for tab updates to ensure chat button is always visible
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Skip if URL is undefined or empty
  if (!tab.url) {
    console.log('[Mochi-Background] Skipping undefined URL for tab:', tabId);
    return;
  }

  // Skip restricted URLs
  if (tab.url.startsWith('chrome://') || 
      tab.url.startsWith('chrome-extension://') || 
      tab.url.startsWith('devtools://')) {
    console.log('[Mochi-Background] Skipping restricted URL:', tab.url, 'for tab:', tabId);
    return;
  }

  if (changeInfo.status === 'complete') {
    console.log('[Mochi-Background] Tab load complete, injecting for tab:', tabId);
    
    try {
      // First, check if we can access the tab
      await chrome.tabs.get(tabId);
      
      // Create a separate function for injection
      function injectChatButton() {
        // Send a message back to background script for logging
        chrome.runtime.sendMessage({ 
          action: "logFromContent", 
          message: `Injecting chat button for tab ${tabId}`
        });

        let toggleButton = document.getElementById('chat-toggle-button');
        
        if (!toggleButton) {
          toggleButton = document.createElement('div');
          toggleButton.id = 'chat-toggle-button';
          document.body.appendChild(toggleButton);
          chrome.runtime.sendMessage({ 
            action: "logFromContent", 
            message: `Created chat button for tab ${tabId}`
          });
        }

        // Ensure button is visible
        toggleButton.style.display = 'flex';
        chrome.runtime.sendMessage({ 
          action: "logFromContent", 
          message: `Ensured button visibility for tab ${tabId}`
        });
      }

      // Execute the injection
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: injectChatButton
      });
      
      console.log('[Mochi-Background] Chat button injection successful for tab:', tabId);
    } catch (err) {
      console.error('[Mochi-Background] Error during chat button injection:', err, 'for tab:', tabId);
    }
  }
});

// Handle logs from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "logFromContent") {
    console.log(`[Mochi-Content] ${request.message}`);
  }
});

// Listen for keyboard command
chrome.commands.onCommand.addListener((command) => {
  console.log('[Mochi-Background] Keyboard command received:', command);
  if (command === "toggle-chat") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        console.log('[Mochi-Background] Sending toggle message to tab:', tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {action: "toggleExtraction"});
      } else {
        console.error('[Mochi-Background] No active tab found for keyboard command');
      }
    });
  }
});

//OpenAI API Key
const API_KEY = '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';

// Handle chat messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateResponse") {
    console.log('[Mochi-Background] Received generateResponse request in background script:', request);
    generateChatGPTResponse(request.prompt, sender, request.history)
      .then(result => {
        console.log('[Mochi-Background] ChatGPT response generated:', result);
        sendResponse({ success: true, result: result });
      })
      .catch(error => {
        console.error('[Mochi-Background] Error generating ChatGPT response:', error);
        sendResponse({ error: error.message });
      });
    return true; // Indicates that the response is sent asynchronously
  } else if (request.action === "checkFilePermission") {
    try {
      chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
        console.log('[Mochi-Background] File access permission:', isAllowed);
        if (chrome.runtime.lastError) {
          console.error('[Mochi-Background] Permission check error:', chrome.runtime.lastError);
          sendResponse({ hasPermission: false });
        } else {
          sendResponse({ hasPermission: isAllowed });
        }
      });
    } catch (error) {
      console.error('[Mochi-Background] Permission check exception:', error);
      sendResponse({ hasPermission: false });
    }
    return true;
  } else if (request.action === "openExtensionsPage") {
    chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
  }
});

// Function to generate chat response
async function generateChatGPTResponse(prompt, sender, history) {
  const url = 'https://api.openai.com/v1/chat/completions';

  try {
    console.log('[Mochi-Background] Sending request to ChatGPT API with prompt:', prompt);
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
        stream: true,
        stream_options: {"include_usage": true}
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Mochi-Background] API response not OK:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[Mochi-Background] Stream complete');
        break;
      }
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = line.slice(6); // Remove 'data: ' prefix
            if (jsonData === '[DONE]') continue;
            
            const data = JSON.parse(jsonData);
            
            // Handle content delta
            if (data.choices?.[0]?.delta?.content) {
              const textChunk = data.choices[0].delta.content;
              accumulatedResponse += textChunk;
              console.log('[Mochi-Background] Processed text chunk:', textChunk);
              
              chrome.tabs.sendMessage(sender.tab.id, { 
                action: "updateStreamingResponse", 
                text: accumulatedResponse,
                isFinal: false
              });
            }
            
            // Handle usage information if present
            if (data.usage) {
              console.log('[Mochi-Background] Token usage:', data.usage);
            }
          } catch (error) {
            // Log the problematic line for debugging
            console.error('[Mochi-Background] Error parsing streaming data:', error);
            console.error('[Mochi-Background] Problematic line:', line);
            // Continue processing other lines instead of breaking
            continue;
          }
        }
      }
    }

    console.log('[Mochi-Background] Full accumulated response:', accumulatedResponse);

    // Send final message with complete response
    chrome.tabs.sendMessage(sender.tab.id, { 
      action: "updateStreamingResponse", 
      text: accumulatedResponse,
      isFinal: true
    });

    return accumulatedResponse;
  } catch (error) {
    console.error('[Mochi-Background] Error in generateChatGPTResponse:', error);
    chrome.tabs.sendMessage(sender.tab.id, { 
      action: "updateStreamingResponse", 
      error: error.message 
    });
    throw error;
  }
}
