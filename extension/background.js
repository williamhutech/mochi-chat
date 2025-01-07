/**
 * Background script for Mochi Chat
 * Handles extension-wide functionality and messaging
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
      logToConsole(`[Mochi-Background] Opening extensions page. Source: ${request.source}`);
      const url = `chrome://extensions/?id=${chrome.runtime.id}`;
      logToConsole(`[Mochi-Background] URL: ${url}`);
      chrome.tabs.create({ url });
      sendResponse({ success: true, url });
      break;
      
    case "logFromContent":
      // Handle logs from content scripts
      const { message, source, isError } = request;
      logToConsole(message, source || 'Mochi-Content', isError);
      break;
      
    case "conversationUpdated":
      logToConsole('Conversation history updated');
      break;
      
    case "fetchLocalPDF":
      fetchLocalPDF(request.url)
        .then(sendResponse)
        .catch(error => sendResponse({ data: null, error: error.message }));
      return true; // Will respond asynchronously
  }
  
  return true; // Will respond asynchronously
});

/**
 * Handle fetching local PDF files
 * @param {string} url - Local file URL to fetch
 * @returns {Promise<{data: string, error: string|null}>} Base64 encoded PDF data or error
 */
async function fetchLocalPDF(url) {
  try {
    logToConsole('[Mochi-Background] Fetching local PDF: ' + url);
    
    // Remove 'file://' prefix if present
    const filePath = url.replace(/^file:\/\//, '');
    
    // Use chrome.runtime.getPackageDirectoryEntry to read local file
    const response = await fetch('file://' + filePath);
    const arrayBuffer = await response.arrayBuffer();
    
    // Convert to base64
    const base64 = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    logToConsole('[Mochi-Background] Successfully read local PDF');
    return { data: base64, error: null };
  } catch (error) {
    logToConsole('[Mochi-Background] Error reading local PDF: ' + error.message, true);
    return { data: null, error: error.message };
  }
}

//=============================================================================
// Extension Lifecycle Events
//=============================================================================

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  logToConsole(`[Mochi-Background] Extension icon clicked for tab: ${tab.id}`);
});

// Handle extension installation and updates
/**
 * Handle extension installation and updates
 * @param {Object} details - Installation details
 * @param {string} details.reason - Reason for the event: 'install', 'update', 'chrome_update', or 'shared_module_update'
 * @param {string} details.previousVersion - Previous version of the extension (only for 'update')
 */
chrome.runtime.onInstalled.addListener((details) => {
  switch (details.reason) {
    case 'install':
      // First time installation
      logToConsole('[Mochi-Background] Extension installed for the first time');
      chrome.tabs.create({
        url: chrome.runtime.getURL('instructions.html')
      });
      break;
      
    case 'update':
      // Extension updated to a new version
      logToConsole(`[Mochi-Background] Extension updated from version ${details.previousVersion}`);
      // Could show update notes or migration instructions if needed
      break;
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
