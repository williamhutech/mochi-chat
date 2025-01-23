/**
 * Content script for Mochi Chat Extension
 * Handles UI injection, text extraction, and communication with background script
 * 
 * Key Features:
 * - Chat interface creation and management
 * - Text extraction from PDFs and websites
 * - Real-time streaming response handling
 * - Page navigation and link creation
 * - Error handling and logging
 */

//=============================================================================
// Global State
//=============================================================================

/**
 * Global state variables for managing chat interface and functionality
 * @type {Object} chatInterface - Main chat interface DOM element
 * @type {Object} toggleButton - Toggle button DOM element
 * @type {boolean} isInterfaceVisible - Chat interface visibility state
 * @type {Object} extractModule - Text extraction module reference
 * @type {string} lastResponse - Last AI response
 * @type {boolean} initialized - Initialization state flag
 * @type {Object} chatModule - Chat module reference
 * @type {string} accumulatedResponse - Accumulated response from chat.js
 * @type {boolean} isDynamicWebApp - Flag to indicate if current page is a dynamic web application
 */
let chatInterface = null;        
let toggleButton = null;         
let isInterfaceVisible = false;  
let extractModule = null;        
let lastResponse = '';          
let initialized = false;         
let chatModule;                  
let accumulatedResponse = '';    
let isDynamicWebApp = false;     // Will be set during initialization

//=============================================================================
// Chat Toggle Button
//=============================================================================

/**
 * Initialize chat toggle button
 * Creates and injects the toggle button for the chat interface
 * @throws {Error} If button creation or injection fails
 * @returns {Promise<void>}
 */
async function initializeChatToggle() {
  try {
    if (!toggleButton) {
      const button = document.createElement('div');
      button.id = 'mochi-chat-toggle-button';
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
 * Sets up UI elements, styles, and event listeners
 * @returns {Promise<void>}
 */
async function createChatInterface() {
  if (chatInterface) return;

  // Create the main chat UI container (hidden by default)
  chatInterface = document.createElement('div');
  chatInterface.id = 'mochi-pdf-extractor-ui';
  chatInterface.classList.add('mochi-hidden');
  
  // Prevent text selection issues with parent page
  chatInterface.addEventListener('mousedown', (e) => e.stopPropagation());
  chatInterface.addEventListener('mouseup', (e) => e.stopPropagation());
  chatInterface.addEventListener('click', (e) => e.stopPropagation());
  
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
  
  // Load the title
  const title = 'Mochi Chat';
  
  // Create chat interface HTML structure
  chatInterface.innerHTML = `
    <div id="mochi-chat-container">
      <div id="mochi-chat-header">
        <div id="mochi-chat-title">${title}</div>
        <div class="mochi-header-buttons">
          <button id="mochi-expand-button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h6v6"></path>
              <path d="M9 21H3v-6"></path>
              <path d="M21 3l-7 7"></path>
              <path d="M3 21l7-7"></path>
            </svg>
          </button>
          <button id="mochi-close-button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div id="mochi-output-field"></div>
      <div id="mochi-input-container">
        <div id="mochi-prompt-wrapper">
          <input type="text" id="mochi-prompt-input" placeholder="What would you like to ask?">
          <button id="mochi-send-button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <button id="mochi-generating-button" class="mochi-hidden">
          <span class="mochi-loading-dots">Thinking</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(chatInterface);

  // Add event listeners
  document.getElementById('mochi-send-button').addEventListener('click', sendPrompt);
  document.getElementById('mochi-prompt-input').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      sendPrompt();
    }
  });
  document.getElementById('mochi-close-button').addEventListener('click', hideChatInterface);
  document.getElementById('mochi-expand-button').addEventListener('click', toggleExpand);
}

/**
 * Toggle chat interface visibility
 * Used by both click and keyboard shortcuts
 * @returns {Promise<void>}
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
 * Only handles visibility toggling and state management
 * @returns {Promise<void>}
 */
function showChatInterface() {
  if (!isInterfaceVisible) {
    // Restore last response if any
    const outputField = document.getElementById('mochi-output-field');
    outputField.innerHTML = lastResponse || '';
    
    chatInterface.classList.remove('mochi-hidden');
    requestAnimationFrame(() => {
      chatInterface.classList.add('mochi-visible');
      // Focus on input field after UI is visible
      document.getElementById('mochi-prompt-input').focus();
    });
    isInterfaceVisible = true;
  }
}

/**
 * Hide the chat interface
 * Handles visibility toggling and state cleanup
 * @returns {Promise<void>}
 */
function hideChatInterface() {
  if (chatInterface) {
    // Save the current response before hiding
    lastResponse = document.getElementById('mochi-output-field').innerHTML;
    chatInterface.classList.remove('mochi-visible');
    setTimeout(() => {
      chatInterface.classList.add('mochi-hidden');
      // Remove expanded class when hiding
      chatInterface.classList.remove('mochi-expanded');
    }, 200);
    isInterfaceVisible = false;
  }
}

/**
 * Toggle expand/collapse of chat interface
 * Manages UI state for expanded/collapsed view
 * @returns {void}
 */
function toggleExpand() {
  if (chatInterface) {
    chatInterface.classList.toggle('mochi-expanded');
  }
}

//=============================================================================
// Text Extraction and Processing
//=============================================================================

/**
 * Extract text from the current page
 * Loads extract-text.js module if needed and processes page content
 * @returns {Promise<void>}
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
      logToBackground('[Mochi-Content] Text extraction module loaded');
    }

    // Detect content type and prepare extraction options
    const isPDF = document.contentType === 'application/pdf' || 
                  window.location.href.toLowerCase().endsWith('.pdf');
    
    let extractionOptions;
    if (isPDF) {
      logToBackground('[Mochi-Content] Detected PDF document');
      
      // Check if it's a local PDF
      const isLocalFile = window.location.protocol === 'file:';
      let pdfData;
      
      if (isLocalFile) {
        // For local files, get the PDF data through chrome.runtime message
        logToBackground('[Mochi-Content] Local PDF detected, requesting data from background');
        
        const response = await chrome.runtime.sendMessage({
          action: 'fetchLocalPDF',
          url: window.location.href
        });
        
        if (response.error) {
          throw new Error(`Failed to get local PDF: ${response.error}`);
        }
        
        // Convert base64 to ArrayBuffer so the LocalFileReader can read it
        const binaryString = atob(response.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfData = bytes.buffer;
      } else {

        // For remote files, fetch the PDF
        logToBackground('[Mochi-Content] Remote PDF detected, fetching file');
        const response = await fetch(window.location.href);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }
        pdfData = await response.arrayBuffer();
      }
        // PDF content    
      extractionOptions = {
        type: extractModule.CONTENT_TYPES.PDF,
        file: pdfData
      };
    } else {
      // Website content
      extractionOptions = {
        type: extractModule.CONTENT_TYPES.WEBSITE
      };
    }

    // Extract text using the appropriate method
    logToBackground(`[Mochi-Content] Starting extraction`);
    await extractModule.extractText(extractionOptions);
    logToBackground('[Mochi-Content] Text extraction completed');
    
  } catch (error) {
    logToBackground(`[Mochi-Content] Error extracting text: ${error}`, true);
    showError('Failed to extract text from the document');
  }
}

//=============================================================================
// Chat and Response Handling
//=============================================================================

/**
 * Load chat module dynamically
 * Imports chat.js using chrome.runtime.getURL
 * @returns {Promise<void>}
 */
async function loadChatModule() {
  if (!chatModule) {
    const chatModuleUrl = chrome.runtime.getURL('chat.js');
    const { generateChatGPTResponse } = await import(chatModuleUrl);
    chatModule = { generateChatGPTResponse };
    logToBackground('Chat module loaded');
  }
  return chatModule;
}

/**
 * Handle sending prompts to the AI
 * Communicates directly with chat.js for response generation
 * @param {string} prompt - User input prompt
 * @returns {Promise<void>}
 */
async function sendPrompt() {
  const promptInput = document.getElementById('mochi-prompt-input');
  const promptText = promptInput.value.trim();
  
  if (!promptText) return;
  
  try {
    // Update UI to show generating state
    const promptWrapper = document.getElementById('mochi-prompt-wrapper');
    const generatingButton = document.getElementById('mochi-generating-button');
    const outputField = document.getElementById('mochi-output-field');
    
    promptWrapper.classList.add('mochi-hidden');
    generatingButton.classList.remove('mochi-hidden');
    
    let screenshot = null;
    
    // Only capture screenshot for dynamic web apps
    if (isDynamicWebApp) {
      hideChatInterface();
      logToBackground('[Mochi-Content] Capturing screenshot for dynamic web app');
      const rawScreenshot = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'captureVisibleTab' }, (response) => {
          if (chrome.runtime.lastError) {
            logToBackground(`[Mochi-Content] Screenshot error: ${chrome.runtime.lastError.message}`, true);
            resolve(null);
          } else {
            logToBackground('[Mochi-Content] Screenshot captured successfully');
            resolve(response);
          }
        });
      });

      if (rawScreenshot) {
        try {
          screenshot = await enhanceScreenshot(rawScreenshot);
          logToBackground('[Mochi-Content] Screenshot enhanced successfully');
        } catch (error) {
          logToBackground(`[Mochi-Content] Screenshot enhancement failed: ${error}`, true);
          screenshot = rawScreenshot; // Fallback to raw screenshot if enhancement fails
        }
      }
    }
    
    // Clear input
    promptInput.value = '';
    
    // Get chat module and generate response
    const chat = await loadChatModule();
    await chat.generateChatGPTResponse(promptText, screenshot);
    
  } catch (error) {
    logToBackground(`[Mochi-Content] Error sending prompt: ${error}`, true);
    showError('Failed to send prompt');
    resetUIState();
  }
}

/**
 * Reset UI state after error
 * Cleans up UI elements and resets flags
 * @returns {void}
 */
function resetUIState() {
  document.getElementById('mochi-prompt-wrapper').classList.remove('mochi-hidden');
  document.getElementById('mochi-generating-button').classList.add('mochi-hidden');
  document.getElementById('mochi-prompt-input').focus();
}

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Function to render markdown text with specific options
 * @param {string} text - Text to render as markdown
 * @returns {string} HTML string of rendered markdown
 */
function renderMarkdown(text) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false
  });
  return marked.parse(text);
}

/**
 * Function to create clickable page number links in the text
 * @param {string} text - Text to process for page numbers
 * @returns {string} Text with clickable page number links
 */
function createPageLinks(text) {
  const linkedText = text.replace(/Page\s+(\d+)/gi, (match, pageNum) => {
    return `<a href="#" class="mochi-page-link" data-page="${pageNum}" style="color: black; text-decoration: underline; cursor: pointer;">Page ${pageNum}</a>`;
  });
  
  // Add click event listener using event delegation
  setTimeout(() => {
    const outputField = document.getElementById('mochi-output-field');
    if (outputField) {
      outputField.addEventListener('click', (e) => {
        if (e.target.classList.contains('mochi-page-link')) {
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
 * Check if content exceeds visible area and expand if needed
 * @param {HTMLElement} outputField - The output field element
 * @returns {void}
 */
function checkAndExpandContent(outputField) {
  if (outputField.scrollHeight > outputField.clientHeight && chatInterface) {
    if (!chatInterface.classList.contains('mochi-expanded')) {
      chatInterface.classList.add('mochi-expanded');
      logToBackground('Auto-expanded chat interface due to content overflow');
    }
  }
}

/**
 * Utility function to send logs to background script
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
 * @returns {void}
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
 * Function to show error message in UI
 * @param {string} message - Error message to display
 * @returns {void}
 */
function showError(message) {
  showChatInterface(`<p class="mochi-error">${message}</p>`);
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
 * @returns {Promise<void>}
 */
function handleStreamingUpdate(update) {
  try {
    logToBackground(`Processing update: ${JSON.stringify(update)}`);
    
    // Get UI elements
    const outputField = document.getElementById('mochi-output-field');
    const promptWrapper = document.getElementById('mochi-prompt-wrapper');
    const generatingButton = document.getElementById('mochi-generating-button');
    
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
      
      // Check if we need to auto-expand
      checkAndExpandContent(outputField);
      
      logToBackground(`Updated output with text: ${update.text}`);
    }
    
    // Handle final update
    if (update.isFinal) {
      // Process final text with page links
      const finalText = createPageLinks(outputField.innerHTML);
      outputField.innerHTML = finalText;
      
      // Check if we need to auto-expand
      checkAndExpandContent(outputField);
      
      // Reset UI state
      promptWrapper.classList.remove('mochi-hidden');
      generatingButton.classList.add('mochi-hidden');
      
      // Reset accumulated response
      accumulatedResponse = '';
      
      // Focus the input field
      const inputField = document.getElementById('mochi-prompt-input');
      if (inputField) {
        inputField.focus();
      }
      
      logToBackground('Processed final update');
    } else if (update.isFinal && !update.text) {
      // Handle final update without text
      promptWrapper.classList.remove('mochi-hidden');
      generatingButton.classList.add('mochi-hidden');
      
      // Reset accumulated response
      accumulatedResponse = '';
      
      // Focus the input field
      const inputField = document.getElementById('mochi-prompt-input');
      if (inputField) {
        inputField.focus();
      }
      
      logToBackground('Processed final update without text');
    }
  } catch (error) {
    logToBackground(`Error handling stream update: ${error}`, true);
    showError('Failed to process response');
    resetUIState();
  }
}

//=============================================================================
// Dynamic Web App Detection
//=============================================================================

/**
 * Check if current page is a dynamic web application
 * Uses patterns defined in dynamic-apps.js
 * @returns {Promise<boolean>} True if current page matches dynamic app patterns
 */
async function checkIfDynamicWebApp() {
  try {
    const { DYNAMIC_APP_PATTERNS } = await import(chrome.runtime.getURL('./dynamic-apps.js'));
    const currentUrl = window.location.href;
    const currentDomain = window.location.hostname;
    
    logToBackground('[Mochi-Content] Checking if dynamic web app...');
    
    // Check if current site matches any pattern
    const isDynamic = DYNAMIC_APP_PATTERNS.some(pattern => {
      if (!currentDomain.includes(pattern.domain)) {
        return false;
      }
      if (pattern.paths) {
        return pattern.paths.some(path => currentUrl.includes(path));
      }
      return true;
    });
    
    logToBackground(`[Mochi-Content] Dynamic web app check result: ${isDynamic}`);
    return isDynamic;
    
  } catch (error) {
    logToBackground(`[Mochi-Content] Error checking dynamic web app: ${error}`, true);
    return false;
  }
}

//=============================================================================
// Initialization
//=============================================================================

/**
 * Main initialization function
 * Creates chat interface and toggle button, starts text extraction
 * @returns {Promise<void>}
 */
async function initializeContent() {
  try {
    logToBackground('[Mochi-Content] Initializing content script...');
    
    // Check if current page is a dynamic web app
    isDynamicWebApp = await checkIfDynamicWebApp();
    
    // Initialize UI components and extract text
    await Promise.all([
      initializeChatToggle(),
      createChatInterface(),
      hideChatInterface(),
      extractPageText(),
      checkIfDynamicWebApp()
    ]);
    
    logToBackground('[Mochi-Content] Content script initialized successfully');
    
  } catch (error) {
    logToBackground(`[Mochi-Content] Error initializing content: ${error}`, true);
  }
}

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContent);
} else {
  initializeContent();
}

/**
 * Enhance screenshot for optimal text extraction
 * Optimized for performance while maintaining quality
 * 
 * @param {string} base64Image - Original screenshot in base64
 * @returns {Promise<string>} Enhanced base64 image
 */
async function enhanceScreenshot(base64Image) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimization: disable alpha
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Draw original image
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Fast background detection using sampling
        let backgroundSum = 0;
        const sampleSize = Math.floor(data.length / 400); // Sample 0.25% of pixels
        for (let i = 0; i < data.length; i += sampleSize) {
          backgroundSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const isDarkBackground = (backgroundSum / (data.length / sampleSize)) < 128;
        
        // Optimized single-pass processing
        const contrast = isDarkBackground ? 1.6 : 1.4;
        const threshold = isDarkBackground ? 140 : 128;
        
        // Process in chunks for better performance
        const chunkSize = 16384; // Process 4096 pixels at a time
        for (let offset = 0; offset < data.length; offset += chunkSize) {
          const end = Math.min(offset + chunkSize, data.length);
          for (let i = offset; i < end; i += 4) {
            // Combined grayscale and contrast adjustment
            const grey = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            let factor = (grey - threshold) * contrast + threshold;
            
            // Fast edge enhancement
            if (Math.abs(grey - threshold) < 20) {
              factor += isDarkBackground ? -15 : 15;
            }
            
            // Apply to all channels at once
            data[i] = data[i + 1] = data[i + 2] = 
              isDarkBackground ? 
              255 - Math.max(0, Math.min(255, factor)) : 
              Math.max(0, Math.min(255, factor));
          }
        }
        
        // Apply sharpening using CSS filter instead of convolution
        ctx.putImageData(imageData, 0, 0);
        
        // Create temporary canvas for filter application
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { alpha: false });
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        // Apply filters using CSS (faster than convolution)
        tempCtx.filter = `contrast(${isDarkBackground ? '160%' : '140%'}) 
                         saturate(0%) 
                         brightness(${isDarkBackground ? '110%' : '100%'})`;
        tempCtx.drawImage(canvas, 0, 0);
        
        logToBackground(`[Mochi-Content] Enhanced screenshot (${isDarkBackground ? 'dark' : 'light'} mode)`);
        
        // Output final image
        const enhancedBase64 = tempCanvas.toDataURL('image/jpeg', 0.92);
        resolve(enhancedBase64);
        
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = reject;
    img.src = base64Image;
  });
}