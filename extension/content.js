/**
 * Content script for Mochi Chat
 * Handles UI injection, text extraction, and communication with background script
 */

//=============================================================================
// Global State
//=============================================================================
let chatInterface = null;        // Main chat interface reference
let toggleButton = null;         // Toggle button reference
let isInterfaceVisible = false;  // Chat interface visibility state
let extractModule = null;        // Text extraction module reference
let lastResponse = '';          // Last AI response
let initialized = false;         // Initialization state flag
let chatModule;                  // Chat module reference
let accumulatedResponse = '';    // Accumulated response from chat.js

//=============================================================================
// Chat Toggle Button
//=============================================================================

/**
 * Initialize chat toggle button
 * Creates and injects the toggle button for the chat interface
 */
async function initializeChatToggle() {
  try {
    if (!toggleButton) {
      const button = document.createElement('div');
      button.id = 'chat-toggle-button';
      button.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
      
      // Add click listener for toggle (of chrome extension)
      button.addEventListener('click', toggleChatInterface);
      
      // Add to DOM and make visible
      document.body.appendChild(button);
      button.style.display = 'flex';  // Flex display for proper SVG centering
      toggleButton = button;
      logToBackground('Chat toggle button created and shown');
    }
  } catch (error) {
    logToBackground(`Error initializing chat toggle: ${error}`, true);
  }
}

//=============================================================================
// Chat Interface Creation & Management
//=============================================================================

/**
 * Create the chat interface in hidden state
 * Called during initialization alongside toggle button creation
 */
async function createChatInterface() {
  if (chatInterface) return;

  // Create the main chat UI container (hidden by default)
  chatInterface = document.createElement('div');
  chatInterface.id = 'pdf-extractor-ui';
  chatInterface.classList.add('hidden');
  
  // Load Noto Sans font for consistent typography
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);
  
  // Load our custom styles
  const styleLink = document.createElement('link');
  styleLink.href = chrome.runtime.getURL('styles.css');
  styleLink.rel = 'stylesheet';
  document.head.appendChild(styleLink);
  
  // Determine if we're on a PDF file or regular website
  const isPDF = document.contentType === 'application/pdf' || 
                window.location.href.toLowerCase().endsWith('.pdf');
  const title = isPDF ? 'Mochi Chat - PDF' : 'Mochi Chat - Website';
  
  // Create chat interface HTML structure
  chatInterface.innerHTML = `
    <div id="chat-container">
      <div id="chat-header">
        <div id="chat-title">${title}</div>
        <div class="header-buttons">
          <button id="expand-button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h6v6"></path>
              <path d="M9 21H3v-6"></path>
              <path d="M21 3l-7 7"></path>
              <path d="M3 21l7-7"></path>
            </svg>
          </button>
          <button id="close-button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div id="output-field"></div>
      <div id="input-container">
        <div id="prompt-wrapper">
          <input type="text" id="prompt-input" placeholder="What would you like to ask?">
          <button id="send-button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <button id="generating-button" class="hidden">
          <span class="loading-dots">Thinking</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(chatInterface);

  // Add event listeners
  document.getElementById('send-button').addEventListener('click', sendPrompt);
  document.getElementById('prompt-input').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      sendPrompt();
    }
  });
  document.getElementById('close-button').addEventListener('click', hideChatInterface);
  document.getElementById('expand-button').addEventListener('click', toggleExpand);
}

/**
 * Toggle chat interface visibility
 * Used by both click and keyboard shortcuts
 */
function toggleChatInterface() {
  logToBackground('Toggling chat interface');
  if (isInterfaceVisible) {
    hideChatInterface();
  } else {
    showChatInterface();
  }
}

/**
 * Show the chat interface
 * Only handles visibility toggling
 */
function showChatInterface() {
  if (!isInterfaceVisible) {
    // Restore last response if any
    const outputField = document.getElementById('output-field');
    outputField.innerHTML = lastResponse || '';
    
    chatInterface.classList.remove('hidden');
    requestAnimationFrame(() => {
      chatInterface.classList.add('visible');
      // Focus on input field after UI is visible
      document.getElementById('prompt-input').focus();
    });
    isInterfaceVisible = true;
  }
}

/**
 * Hide the chat interface
 */
function hideChatInterface() {
  if (chatInterface) {
    // Save the current response before hiding
    lastResponse = document.getElementById('output-field').innerHTML;
    chatInterface.classList.remove('visible');
    setTimeout(() => {
      chatInterface.classList.add('hidden');
      // Remove expanded class when hiding
      chatInterface.classList.remove('expanded');
    }, 200);
    isInterfaceVisible = false;
  }
}

/**
 * Toggle expand/collapse of chat interface
 */
function toggleExpand() {
  if (chatInterface) {
    chatInterface.classList.toggle('expanded');
  }
}

//=============================================================================
// Text Extraction and Processing
//=============================================================================

/**
 * Extract text from the current page
 * Loads extract-text.js module if needed
 */
async function extractPageText() {
  try {
    // Load extract-text.js if not loaded
    if (!extractModule) {
      const extractModuleUrl = chrome.runtime.getURL('extract-text.js');
      const [{ extractText, CONTENT_TYPES }] = await Promise.all([
        import(extractModuleUrl)
      ]);
      extractModule = { extractText, CONTENT_TYPES };
      logToBackground('Text extraction module loaded');
    }

    // Extract text using loaded module
    await extractModule.extractText({ type: extractModule.CONTENT_TYPES.WEBSITE });
    logToBackground('Text extraction completed');
  } catch (error) {
    logToBackground(`Error extracting text: ${error}`, true);
    showError('Failed to extract text from the document');
  }
}

//=============================================================================
// Chat and Response Handling
//=============================================================================

/**
 * Import chat module
 */
const chatModuleUrl = chrome.runtime.getURL('chat.js');

/**
 * Load chat module
 */
async function loadChatModule() {
  if (!chatModule) {
    const { generateChatGPTResponse } = await import(chatModuleUrl);
    chatModule = { generateChatGPTResponse };
    logToBackground('Chat module loaded');
  }
  return chatModule;
}

/**
 * Handle sending prompts to the AI
 * Communicates directly with chat.js for response generation
 */
async function sendPrompt() {
  const promptInput = document.getElementById('prompt-input');
  const promptText = promptInput.value.trim();
  
  if (!promptText) return;
  
  try {
    // Update UI to show generating state
    const promptWrapper = document.getElementById('prompt-wrapper');
    const generatingButton = document.getElementById('generating-button');
    const outputField = document.getElementById('output-field');
    
    promptWrapper.classList.add('hidden');
    generatingButton.classList.remove('hidden');
    
    outputField.scrollTop = outputField.scrollHeight;
    
    // Clear input
    promptInput.value = '';
    
    // Get chat module and generate response
    const chat = await loadChatModule();
    await chat.generateChatGPTResponse(promptText);
    
  } catch (error) {
    logToBackground(`Error sending prompt: ${error}`, true);
    showError('Failed to send prompt');
    resetUIState();
  }
}

/**
 * Reset UI state after error
 */
function resetUIState() {
  document.getElementById('prompt-wrapper').classList.remove('hidden');
  document.getElementById('generating-button').classList.add('hidden');
  document.getElementById('prompt-input').focus();
}

//=============================================================================
// Utility Functions
//=============================================================================

// Function to render markdown text with specific options
function renderMarkdown(text) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false
  });
  return marked.parse(text);
}

// Function to create clickable page number links in the text
function createPageLinks(text) {
  const linkedText = text.replace(/Page\s+(\d+)/gi, (match, pageNum) => {
    logToBackground(`Found page reference: ${pageNum}`);
    return `<a href="#" class="page-link" data-page="${pageNum}" style="color: black; text-decoration: underline; cursor: pointer;">Page ${pageNum}</a>`;
  });
  
  // Add click event listener using event delegation
  setTimeout(() => {
    const outputField = document.getElementById('output-field');
    if (outputField) {
      outputField.addEventListener('click', (e) => {
        if (e.target.classList.contains('page-link')) {
          e.preventDefault();
          const pageNum = parseInt(e.target.dataset.page, 10);
          
          // Check if we're in a PDF context
          const isPDF = document.contentType === 'application/pdf' || 
                       window.location.href.toLowerCase().endsWith('.pdf');
          
          if (isPDF) {
            // Get the current URL and update it with the new page number
            const currentUrl = window.location.href;
            const baseUrl = currentUrl.split('#')[0]; // Remove any existing hash
            const newUrl = `${baseUrl}#page=${pageNum}`;
            
            // First update the hash
            window.location.hash = `page=${pageNum}`;
            
            // Then force a reload after a small delay
            setTimeout(() => {
              window.location.reload();
            }, 100);
          } else {
            // Fallback to hash-based navigation for non-PDF pages
            window.location.hash = `page=${pageNum}`;
          }
        }
      });
    }
  }, 0);
  
  return linkedText;
}

/**
 * Utility function to send logs to background script
 */
function logToBackground(message, isError = false) {
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message: message,
    source: 'Mochi-Content',
    isError
  });
}

/**
 * Function to show error message
 */
function showError(message) {
  showChatInterface(`<p class="error">${message}</p>`);
}

//=============================================================================
// Message Handling
//=============================================================================

// Add event listeners for chat updates
window.addEventListener('mochiChatUpdate', (event) => {
  const message = event.detail;
  logToBackground(`Received direct update: ${message.action}`);
  
  if (message.action === 'updateStreamingResponse') {
    handleStreamingUpdate(message);
  }
});

// Keep the chrome.runtime.onMessage listener for other extension messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logToBackground(`Received extension message: ${message.action}`);
  
  switch (message.action) {
    case "toggleChat":
      toggleChatInterface();
      break;
      
    case "logFromContent":
      logToBackground(message.message, message.isError);
      break;
  }
  
  // Send response to acknowledge receipt
  if (sendResponse) {
    sendResponse({ received: true });
  }
});

/**
 * Handle streaming response updates from chat.js
 * Processes chunks and updates the UI accordingly
 * @param {Object} update - Update data from chat.js
 * @param {string} update.text - Processed text content to append
 * @param {boolean} update.isFinal - Whether this is the final update
 * @param {string} update.error - Error message if any
 */
function handleStreamingUpdate(update) {
  try {
    logToBackground(`Processing update: ${JSON.stringify(update)}`);
    
    // Get UI elements
    const outputField = document.getElementById('output-field');
    const promptWrapper = document.getElementById('prompt-wrapper');
    const generatingButton = document.getElementById('generating-button');
    
    if (!outputField || !promptWrapper || !generatingButton) {
      throw new Error('Required UI elements not found');
    }

    // Handle error case
    if (update.error) {
      showError(update.error);
      resetUIState();
      return;
    }
    
    // Handle streaming text
    if (update.text) {
      // Accumulate and render new text
      accumulatedResponse += update.text;
      const processedText = renderMarkdown(accumulatedResponse);
      outputField.innerHTML = processedText;
      outputField.scrollTop = outputField.scrollHeight;
      
      logToBackground(`Updated output with text: ${update.text}`);
    }
    
    // Handle final update
    if (update.isFinal) {
      // Process final text with page links
      const finalText = createPageLinks(outputField.innerHTML);
      outputField.innerHTML = finalText;
      
      // Reset UI state
      promptWrapper.classList.remove('hidden');
      generatingButton.classList.add('hidden');
      
      // Reset accumulated response
      accumulatedResponse = '';
      
      // Ensure scroll to bottom
      outputField.scrollTop = outputField.scrollHeight;
      
      logToBackground('Processed final update');
    } else if (update.isFinal && !update.text) {
      // Handle final update without text
      promptWrapper.classList.remove('hidden');
      generatingButton.classList.add('hidden');
      
      // Reset accumulated response
      accumulatedResponse = '';
      
      // Ensure scroll to bottom
      outputField.scrollTop = outputField.scrollHeight;
      
      logToBackground('Processed final update without text');
    }
  } catch (error) {
    logToBackground(`Error handling stream update: ${error}`, true);
    showError('Failed to process response');
    resetUIState();
  }
}

//=============================================================================
// Initialization
//=============================================================================

/**
 * Main initialization function
 * Creates chat interface and toggle button, starts text extraction
 */
async function initializeContent() {
  if (initialized) return;
  initialized = true;
  
  try {
    // Initialize UI components and extract text
    await Promise.all([
      initializeChatToggle(),
      createChatInterface(),
      extractPageText()
    ]);
    
    logToBackground('Content script initialized successfully');
  } catch (error) {
    logToBackground(`Error in initialization: ${error}`, true);
    initialized = false;
    throw error;
  }
}

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContent);
} else {
  initializeContent();
}