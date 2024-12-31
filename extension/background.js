/**
 * Background script for Mochi Chat Extension
 * 
 * Responsibilities:
 * 1. Logging from all components
 * 2. File permission checks
 * 3. Tab lifecycle management
 * 4. Extension lifecycle events
 * 5. Keyboard command handling
 */

//=============================================================================
// Logging Setup
//=============================================================================

/**
 * Log message to background console with module identifier and timestamp
 * @param {string} message - Message to log
 * @param {string} source - Source module of the message (e.g., Mochi-Content, Mochi-Chat)
 * @param {boolean} isError - Whether this is an error message
 */
function logToConsole(message, source = 'Mochi-Background', isError = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${source}] ${message}`;
  isError ? console.error(logMessage) : console.log(logMessage);
}

// Log background script initialization
logToConsole('Background script initialized');

//=============================================================================
// Message Handlers
//=============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Log all non-logging messages for debugging
  if (request.action !== "logFromContent") {
    logToConsole(`Received message: ${request.action}`);
  }
  
  switch (request.action) {
    case "checkFilePermission":
      // Check if extension has permission to access local files
      chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
        logToConsole(`File access permission: ${isAllowed}`);
        sendResponse({ hasPermission: isAllowed });
      });
      return true; // Will respond asynchronously
      
    case "openExtensionsPage":
      // Open Chrome extensions page for this extension
      chrome.tabs.create({ 
        url: 'chrome://extensions/?id=' + chrome.runtime.id 
      });
      break;
      
    case "logFromContent":
      // Handle logs from content scripts
      const { message, source, isError } = request;
      logToConsole(message, source || 'Mochi-Content', isError);
      break;
      
    case "conversationUpdated":
      logToConsole('Conversation history updated');
      break;
  }
  
  return true; // Will respond asynchronously
});

//=============================================================================
// Tab Lifecycle Management
//=============================================================================

// Log conversation history when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    logToConsole(`Tab ${tabId} closed`);
    
    const tabs = await chrome.tabs.query({});
    const targetTab = tabs.find(tab => tab.id === tabId);
    
    if (targetTab) {
      // Get final conversation history before tab closes
      chrome.tabs.sendMessage(tabId, {
        action: 'getFinalHistory'
      }, (response) => {
        if (chrome.runtime.lastError) {
          logToConsole(`Error getting final history: ${chrome.runtime.lastError.message}`, 'Mochi-Background', true);
          return;
        }
        
        if (response?.history) {
          logToConsole('Final conversation history:');
          response.history.forEach((msg, index) => {
            logToConsole(`[${index + 1}] ${msg.role}: ${msg.content}`);
          });
        }
      });
    }
  } catch (error) {
    logToConsole(`Error handling tab removal: ${error}`, 'Mochi-Background', true);
  }
});

//=============================================================================
// Extension Lifecycle Events
//=============================================================================

// Handle extension icon clicks
chrome.action.onClicked.addListener((tab) => {
  logToConsole(`Extension icon clicked for tab: ${tab.id}`);
});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  logToConsole(`Extension installed/updated: ${details.reason}`);
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('instructions.html')
    });
  }
});

//=============================================================================
// Keyboard Commands
//=============================================================================

chrome.commands.onCommand.addListener((command) => {
  logToConsole(`Keyboard command received: ${command}`);
  
  if (command === "toggle-chat") {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        logToConsole('Sending toggle chat command to content script');
        chrome.tabs.sendMessage(tabs[0].id, {action: "toggleChat"});
      } else {
        logToConsole('No active tab found for keyboard command', true);
      }
    });
  }
});
