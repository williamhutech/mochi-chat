/**
 * Background script for Mochi Chat Extension
 * Handles extension-wide functionality including:
 * - Message passing between content scripts and extension
 * - File access permissions
 * - Extension lifecycle events
 * - Keyboard shortcuts
 * - Local file operations
 */

//=============================================================================
// Logging Setup
//=============================================================================

/**
 * Log message to background console with module identifier and timestamp
 * @param {string} message - Message to log
 * @param {string} source - Source module identifier (e.g., Mochi-Background, Mochi-Content)
 * @param {boolean} isError - If true, logs as error; otherwise as info
 */
function logToConsole(message, source = 'Mochi-Background', isError = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${source}] ${message}`;
  isError ? console.error(logMessage) : console.log(logMessage);
}

// Log background script initialization
logToConsole('Background script initialized');

//=============================================================================
// Message Handling & Response Functions
//=============================================================================

/**
 * Handle fetching local PDF files
 * @param {string} url - Local file URL to fetch
 * @returns {Promise<{data: string|null, error: string|null}>} Base64 encoded PDF data or error message
 */
async function fetchLocalPDF(url) {
  try {
    logToConsole('Fetching local PDF: ' + url);
    
    // Remove 'file://' prefix if present for consistency
    const filePath = url.replace(/^file:\/\//, '');
    
    // Use fetch API to read local file
    const response = await fetch('file://' + filePath);
    const arrayBuffer = await response.arrayBuffer();
    
    // Convert ArrayBuffer to base64 string
    const base64 = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    logToConsole('Successfully read local PDF');
    return { data: base64, error: null };
  } catch (error) {
    logToConsole('Error reading local PDF: ' + error.message, true);
    return { data: null, error: error.message };
  }
}

/**
 * Main message listener for handling all incoming messages
 * @param {object} request - Message request object
 * @param {string} request.action - Action to perform
 * @param {object} sender - Sender information
 * @param {function} sendResponse - Callback to send response
 * @returns {boolean} True if response will be sent asynchronously
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "checkFilePermission":
      chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
        logToConsole(`File access permission: ${isAllowed}`);
        sendResponse({ hasPermission: isAllowed });
      });
      return true;
      
    case "openExtensionsPage":
      logToConsole(`Opening extensions page. Source: ${request.source}`);
      const url = `chrome://extensions/?id=${chrome.runtime.id}`;
      logToConsole(`URL: ${url}`);
      chrome.tabs.create({ url });
      sendResponse({ success: true, url });
      break;
      
    case "logFromContent":
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
      return true;
  }
  
  return true;
});

//=============================================================================
// Extension Lifecycle Events
//=============================================================================

/**
 * Handle extension icon clicks
 * @param {chrome.tabs.Tab} tab - Information about the active tab
 */
chrome.action.onClicked.addListener((tab) => {
  logToConsole(`Extension icon clicked for tab: ${tab.id}`);
});

/**
 * Handle extension installation and updates
 * @param {Object} details - Installation details
 * @param {string} details.reason - Event reason: 'install', 'update', 'chrome_update', 'shared_module_update'
 * @param {string} details.previousVersion - Previous version (for updates only)
 */
chrome.runtime.onInstalled.addListener((details) => {
  switch (details.reason) {
    case 'install':
      logToConsole('Extension installed for the first time');
      chrome.tabs.create({
        url: chrome.runtime.getURL('instructions.html')
      });
      break;
      
    case 'update':
      logToConsole(`Extension updated from version ${details.previousVersion}`);
      break;
  }
});

//=============================================================================
// Keyboard Command Handling
//=============================================================================

/**
 * Handle keyboard shortcuts defined in manifest.json
 * @param {string} command - The keyboard command that was triggered
 */
chrome.commands.onCommand.addListener((command) => {
  logToConsole(`Keyboard command received: ${command}`);
  
  if (command === "toggle-chat") {
    logToConsole('Processing toggle-chat command');
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        logToConsole(`Sending toggle chat command to tab ${tabs[0].id}`);
        chrome.tabs.sendMessage(tabs[0].id, {action: "toggleChat"}, (response) => {
          if (chrome.runtime.lastError) {
            logToConsole(`Error sending message: ${chrome.runtime.lastError.message}`, true);
          } else {
            logToConsole('Toggle chat command sent successfully');
          }
        });
      } else {
        logToConsole('No active tab found for keyboard command', true);
      }
    });
  } else {
    logToConsole(`Unknown command received: ${command}`, true);
  }
});

// Log that keyboard command listener is initialized
logToConsole('Keyboard command listener initialized');
