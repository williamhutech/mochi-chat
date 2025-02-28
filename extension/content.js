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
 * @type {Object} inputField - Input field DOM element
 * @type {boolean} isInterfaceVisible - Chat interface visibility state
 * @type {Object} extractModule - Text extraction module reference
 * @type {string} lastResponse - Last AI response
 * @type {boolean} initialized - Initialization state flag
 * @type {Object} chatModule - Chat module reference
 * @type {string} accumulatedResponse - Accumulated response from chat.js
 * @type {boolean} isDynamic - Flag to indicate if current page is a dynamic web application
 * @type {boolean} isStreaming - Flag to prevent multiple prompts during streaming
 * @type {Object} conversationModule - Conversation module reference
 * @type {Object} messageTypes - Message types reference
 * @type {Object} AI_PROVIDERS - AI provider configuration
 * @type {Object} AI_MODELS - AI model configuration
 */
let chatInterface = null;        
let inputField = null;         
let isInterfaceVisible = false;  
let extractModule = null;        
let lastResponse = '';          
let initialized = false;         
let chatModule;                  
let accumulatedResponse = '';    
let isDynamic = false;     
let isStreaming = false;
let conversationModule;          // Add conversation module reference
let messageTypes;               // Add message types reference
let AI_PROVIDERS;               // Will be imported from chat.js
let AI_MODELS;                  // Will be imported from chat.js
let currentProvider;            // Will be set after modules load
let currentModel;               // Will be set after modules load

//=============================================================================
// Core Module Loading
//=============================================================================

/**
 * Initialize required modules
 * Loads chat, conversation, message types, and extract-text modules
 * @returns {Promise<void>}
 */
async function initializeModules() {
  try {
    // Import module registry
    const moduleRegistryUrl = chrome.runtime.getURL('module-registry.js');
    const { getModule } = await import(moduleRegistryUrl);
    
    // Load message types first as it's required by other modules
    messageTypes = await getModule('types/message.js');
    
    // Load conversation module
    conversationModule = await getModule('conversation.js', async (module) => {
      await module.initializeModules();
    });

    // Load chat module and initialize it first
    const chatModuleImport = await getModule('chat.js', async (module) => {
      await module.initializeModules();
    });
    
    // After chat module is initialized, set up our references
    chatModule = { generateChatGPTResponse: chatModuleImport.generateChatGPTResponse };
    AI_PROVIDERS = chatModuleImport.AI_PROVIDERS;
    AI_MODELS = chatModuleImport.AI_MODELS;
    
    // Set default provider and model after imports
    currentProvider = AI_PROVIDERS.OPENAI;
    currentModel = AI_MODELS[AI_PROVIDERS.OPENAI].default;

    // Load extract-text module
    const extractModuleImport = await getModule('extract-text.js');
    extractModule = { 
      extractText: extractModuleImport.extractText, 
      CONTENT_TYPES: extractModuleImport.CONTENT_TYPES 
    };
    
    logToBackground('[Mochi-Content] All modules initialized successfully');
  } catch (error) {
    logToBackground('[Mochi-Content] Error initializing modules: ' + error.message, true);
    throw error;
  }
}

//=============================================================================
// UI Components - Creation & Management
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
    </div>
  `;
  document.body.appendChild(chatInterface);

  // Add event listeners

  document.getElementById('mochi-close-button').addEventListener('click', hideChatInterface);
  document.getElementById('mochi-expand-button').addEventListener('click', toggleExpand);
}

/**
 * Initialize chat input field
 * Creates and injects the input field for the chat interface
 * @throws {Error} If input field creation or injection fails
 * @returns {Promise<void>}
 */
async function initializeChatInput() {
  try {
    if (!document.getElementById('mochi-chat-input-container')) {
      // Create container
      const container = document.createElement('div');
      container.id = 'mochi-chat-input-container';

      // Create input field
      const input = document.createElement('input');
      input.id = 'mochi-chat-input-field';
      input.type = 'text';
      input.placeholder = 'Ask anything...';

      // Create submit button
      const submitButton = document.createElement('button');
      submitButton.id = 'mochi-chat-submit-button';
      submitButton.type = 'button';
      submitButton.disabled = true;
      submitButton.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 16L22 16M22 16L17 11M22 16L17 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        <span class="loader"></span>
      `;
      
      /**
       * Updates input state and UI based on current input value
       * @param {HTMLInputElement} input - The input element
       * @param {HTMLButtonElement} submitButton - The submit button
       */
      const updateInputState = (input, submitButton) => {
        const hasContent = input.value.trim().length > 0;
        submitButton.disabled = !hasContent;
        
        // Toggle has-content class
        const container = document.getElementById('mochi-chat-input-container');
        if (hasContent) {
          container.classList.add('has-content');
        } else {
          container.classList.remove('has-content');
        }
      };
      
      // Add input event listener to enable/disable submit button and update styles
      input.addEventListener('input', () => {
        updateInputState(input, submitButton);
      });

      // Send prompt when Enter is pressed
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && document.activeElement === input && input.value.trim() && !isStreaming) {
          e.preventDefault();
          const prompt = input.value.trim();
          input.value = '';
          updateInputState(input, submitButton);
          await sendPrompt(prompt);
        }
      });

      // Send prompt when submit button is clicked
      submitButton.addEventListener('click', async () => {
        if (document.activeElement === input && input.value.trim() && !isStreaming) {
          const prompt = input.value.trim();
          input.value = '';
          updateInputState(input, submitButton);
          await sendPrompt(prompt);
        }
      });

      // Add escape listener for leaving the chat input focus
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          input.value = '';
          input.blur();
          hideChatInterface();
        }
      });
      
      // Assemble and add to DOM
      container.appendChild(input);
      container.appendChild(submitButton);
      document.body.appendChild(container);
    }
  } catch (error) {
    logToBackground('[Mochi-Content] Error initializing chat input: ' + error.message, true);
    throw error;
  }
}

/**
 * Toggle chat interface visibility
 * Used by both click and keyboard shortcuts
 * @returns {Promise<void>}
 */
function toggleChatInterface() {
  logToBackground('Toggling chat');
  if (!lastResponse) {
    // No previous chat, focus the input field
    const input = document.getElementById('mochi-chat-input-field');
    if (input) {
      input.focus();
    }
  } else if (isInterfaceVisible) {
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
    // Show chat interface
    chatInterface.classList.remove('mochi-hidden');
    requestAnimationFrame(() => {
      chatInterface.classList.add('mochi-visible');
    });
    isInterfaceVisible = true;
    // Ensure the input field is focused
    const input = document.getElementById('mochi-chat-input-field');
    if (input) {
      input.focus();
    }
  }
}

/**
 * Hide the chat interface
 * Handles visibility toggling and state cleanup
 * @returns {Promise<void>}
 */
function hideChatInterface() {
  if (chatInterface) {
    // Save the current response before hiding; will optimise last response in the future
    lastResponse = document.getElementById('mochi-output-field').innerHTML;
    chatInterface.classList.remove('mochi-visible');
    setTimeout(() => {
      chatInterface.classList.add('mochi-hidden');
    }, 200);
    isInterfaceVisible = false;
    // The input field to leave focus
    const input = document.getElementById('mochi-chat-input-field');
    if (input) {
      input.blur();
    }
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

/**
 * Reset UI state after error
 * Cleans up UI elements and resets flags
 * @returns {void}
 */
function resetUIState() {
  document.getElementById('mochi-chat-input-field').focus();
}

//=============================================================================
// Text Processing & Screenshot Handling
//=============================================================================

/**
 * Extract text from the current page
 * Loads extract-text.js module if needed and processes page content
 * @returns {Promise<void>}
 */
async function extractPageText() {
  try {
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
    const extractedText = await extractModule.extractText(extractionOptions);
    
    // Add extracted text to conversation history
    await conversationModule.addExtractedText(extractedText);
    
    logToBackground('[Mochi-Content] Text extraction completed and added to conversation');
    
  } catch (error) {
    logToBackground(`[Mochi-Content] Error extracting text: ${error}`, true);
    showError('Failed to extract text from the document');
  }
}

/**
 * Enhance screenshot for optimal text extraction and GPT-4V processing
 * Optimized for performance while maintaining quality
 * Includes smart dimension handling and background detection
 * 
 * @param {string} base64Image - Original screenshot in base64
 * @returns {Promise<string>} Enhanced base64 image
 */
async function enhanceScreenshot(base64Image) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const tempCanvas = document.createElement('canvas');
      
      try {
        // Calculate optimal dimensions while maintaining aspect ratio
        const MAX_DIMENSION = 2048; // Max dimension for GPT-4V
        const QUALITY_THRESHOLD = 800; // Min dimension for good quality
        
        let width = img.width;
        let height = img.height;
        const aspectRatio = width / height;

        // Only resize if dimensions exceed MAX_DIMENSION
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            width = MAX_DIMENSION;
            height = Math.round(width / aspectRatio);
          } else {
            height = MAX_DIMENSION;
            width = Math.round(height * aspectRatio);
          }
        }
        // Don't resize if both dimensions are below QUALITY_THRESHOLD
        else if (width < QUALITY_THRESHOLD && height < QUALITY_THRESHOLD) {
          width = Math.min(width * 1.5, MAX_DIMENSION);
          height = Math.min(height * 1.5, MAX_DIMENSION);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimization: disable alpha
        
        // Draw original image with new dimensions
        ctx.drawImage(img, 0, 0, width, height);
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
        const tempCtx = tempCanvas.getContext('2d', { alpha: false });
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        // Apply filters using CSS (faster than convolution)
        tempCtx.filter = `contrast(${isDarkBackground ? '160%' : '140%'}) 
                         saturate(0%) 
                         brightness(${isDarkBackground ? '110%' : '100%'})`;
        tempCtx.drawImage(canvas, 0, 0);
        
        logToBackground(`[Mochi-Content] Enhanced screenshot (${isDarkBackground ? 'dark' : 'light'} mode) ${width}x${height}`);
        
        // Output final image with optimal quality
        const enhancedBase64 = tempCanvas.toDataURL('image/jpeg', 1.0);
        resolve(enhancedBase64);
        
      } catch (error) {
        logToBackground(`[Mochi-Content] Error enhancing screenshot: ${error}`, true);
        reject(error);
      } finally {
        // Clean up canvas elements
        cleanupCanvases([canvas, tempCanvas]);
      }
    };
    img.onerror = (error) => {
      logToBackground(`[Mochi-Content] Error loading image: ${error}`, true);
      reject(error);
    };
    img.src = base64Image;
  });
}

/**
 * Capture screen without chat interface
 * Temporarily hides chat interface, captures screen, then restores state
 * Uses minimal delay to make the transition almost unnoticeable
 * 
 * @returns {Promise<string>} Enhanced base64 encoded screenshot
 */
async function captureScreenWithoutInterface() {
  // Store current visibility state
  const wasVisible = isInterfaceVisible;
  
  try {
    // Hide interface if visible
    if (wasVisible) {
      // Use direct style manipulation for instant hide
      chatInterface.style.display = 'none';
      isInterfaceVisible = false;
    }
    
    // Minimal delay for DOM update (5ms is typically sufficient)
    await new Promise(resolve => setTimeout(resolve, 2));
    
    // Capture screen
    const rawScreenshot = await chrome.runtime.sendMessage({ action: 'captureVisibleTab' });
    
    // Restore interface immediately if it was visible
    if (wasVisible) {
      chatInterface.style.display = '';
      isInterfaceVisible = true;
    }
    
    if (!rawScreenshot) {
      throw new Error('Screenshot capture failed');
    }

    // Enhance the screenshot
    try {
      const enhancedScreenshot = await enhanceScreenshot(rawScreenshot);
      logToBackground('[Mochi-Content] Screenshot enhanced successfully');
      return enhancedScreenshot;
    } catch (error) {
      logToBackground('[Mochi-Content] Screenshot enhancement failed: ' + error.message, true);
      return rawScreenshot; // Fallback to raw screenshot if enhancement fails
    }
    
  } catch (error) {
    // Ensure interface is restored even if capture fails
    if (wasVisible) {
      chatInterface.style.display = '';
      isInterfaceVisible = true;
    }
    logToBackground('[Mochi-Content] Screen capture failed: ' + error.message, true);
    throw error;
  }
}

//=============================================================================
// Chat Interaction & Response Handling
//=============================================================================

/**
 * Handle sending prompts to the AI
 * Communicates directly with chat.js for response generation
 * @param {string} prompt - User input prompt
 * @returns {Promise<void>}
 */
async function sendPrompt(prompt) {
  try {
    if (isStreaming) return;
    
    isStreaming = true;
    logToBackground('[Mochi-Content] Starting prompt send...');
    
    // First show chat interface
    showChatInterface();

    // Update UI to show generating state
    const outputField = document.getElementById('mochi-output-field');
    const submitButton = document.getElementById('mochi-chat-submit-button');
    submitButton.classList.add('loading');
    
    // Show loading placeholder
    outputField.innerHTML = `
      <div class="mochi-loading-placeholder">
        <div class="mochi-loading-line"></div>
        <div class="mochi-loading-line"></div>
        <div class="mochi-loading-line"></div>
        <div class="mochi-loading-line"></div>
      </div>
    `;
    
    let screenshot = null;
    
    // Only capture screenshot for dynamic web apps
    if (isDynamic) {
      logToBackground('[Mochi-Content] Capturing screenshot for dynamic web app');
      screenshot = await captureScreenWithoutInterface();
    }
    
    // Clear input and update state
    const input = document.getElementById('mochi-chat-input-field');
    input.value = '';
    const container = document.getElementById('mochi-chat-input-container');
    container.classList.remove('has-content');
    submitButton.disabled = true;
    
    // Create message content
    const messageContent = screenshot ? [
      messageTypes.createTextContent(prompt),
      messageTypes.createImageUrlContent(screenshot)
    ] : [messageTypes.createTextContent(prompt)];
    
    // Create user message
    const userMessage = {
      role: messageTypes.MessageRole.USER,
      content: messageContent
    };
    
    // Create config
    const config = {
      provider: currentProvider,
      model: isDynamic ? AI_MODELS[currentProvider].webApp : AI_MODELS[currentProvider].default
    };
    
    // Enhanced logging for debugging
    logToBackground(`[Mochi-Content] === Prompt Details ===`);
    logToBackground(`[Mochi-Content] Is Dynamic: ${isDynamic}`);
    logToBackground(`[Mochi-Content] Model: ${config.model}`);
    logToBackground(`[Mochi-Content] Screenshot Captured: ${screenshot ? 'Yes' : 'No'}`);
    logToBackground(`[Mochi-Content] Content Types: ${messageContent.map(c => c.type).join(', ')}`);
    logToBackground(`[Mochi-Content] Prompt: ${prompt}`);
    logToBackground(`[Mochi-Content] Full Message:\n${JSON.stringify(userMessage, null, 2)}`);
    logToBackground(`[Mochi-Content] Config:\n${JSON.stringify(config, null, 2)}`);
    
    // Generate response using chatModule
    await chatModule.generateChatGPTResponse(userMessage, config);
    
  } catch (error) {
    logToBackground(`[Mochi-Content] Error sending prompt: ${error}`, true);
    showError('Failed to send prompt');
    document.getElementById('mochi-chat-submit-button').classList.remove('loading');
    resetUIState();
  } finally {
    isStreaming = false;
  }
}

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
    // Get UI elements
    const outputField = document.getElementById('mochi-output-field');
    const submitButton = document.getElementById('mochi-chat-submit-button');
    
    if (!outputField || !submitButton) {
      throw new Error('Required UI elements not found');
    }

    // Handle error case
    if (update.error) {
      logToBackground(`[Mochi-Content] Streaming error: ${update.error}`, true);
      submitButton.classList.remove('loading');
      isStreaming = false;
      showError(update.error);
      resetUIState();
      return;
    }
    
    // Handle streaming text
    if (update.text) {
      logToBackground(`[Mochi-Content] Received streaming update: "${update.text}"`);
      
      // If this is the first chunk, clear the loading placeholder
      if (accumulatedResponse === '') {
        logToBackground('[Mochi-Content] First chunk received, clearing loading placeholder');
        outputField.innerHTML = '';
      }
      
      // Accumulate and render new text
      accumulatedResponse += update.text;
      const processedText = renderMarkdown(accumulatedResponse);
      outputField.innerHTML = processedText;
      
      // Check if we need to auto-expand
      checkAndExpandContent(outputField);
    }
    
    // Handle final update
    if (update.isFinal) {
      logToBackground('[Mochi-Content] Processing final update');
      
      if (accumulatedResponse) {
        // Process final text with page links
        const finalText = createPageLinks(outputField.innerHTML);
        outputField.innerHTML = finalText;
        lastResponse = finalText;
      }
      
      // Check if we need to auto-expand
      checkAndExpandContent(outputField);
      
      submitButton.classList.remove('loading');
      submitButton.disabled = false;
      isStreaming = false;
      accumulatedResponse = '';
    }
  } catch (error) {
    logToBackground(`[Mochi-Content] Error handling streaming update: ${error}`, true);
    showError('Failed to process response');
    resetUIState();
  }
}

//=============================================================================
// UI Utility Functions
//=============================================================================

/**
 * Initialize KaTeX auto-render with global configuration
 */
function initializeKaTeX() {
  logToBackground('[Mochi-Content] Initializing KaTeX auto-render');
  
  if (typeof katex === 'undefined') {
    logToBackground('[Mochi-Content] Warning: KaTeX not available', true);
    return;
  }
  
  window.katexOptions = {
    delimiters: [
      {left: '$$', right: '$$', display: true},
      {left: '$', right: '$', display: false},
      {left: '\\[', right: '\\]', display: true},
      {left: '\\(', right: '\\)', display: false}
    ],
    throwOnError: false,
    errorCallback: function(msg) {
      logToBackground(`[Mochi-Content] LaTeX error: ${msg}`, true);
    },
    trust: true,
    strict: false,
    maxSize: 1000,
    maxExpand: 1000,
    fleqn: false,
    leqno: false
  };
  
  logToBackground('[Mochi-Content] KaTeX auto-render initialized');
}

/**
 * Renders markdown text with LaTeX math expressions using KaTeX
 * @param {string} text - Raw markdown text that may contain LaTeX expressions
 * @returns {string} HTML string with rendered markdown and LaTeX
 * 
 * IMPORTANT: LaTeX Rendering Implementation Notes
 * --------------------------------------------
 * 1. Block Preservation Strategy:
 *    - Extract LaTeX blocks BEFORE markdown processing
 *    - Use placeholders to protect LaTeX from markdown
 *    - Restore blocks AFTER markdown, BEFORE KaTeX
 * 
 * 2. LaTeX Block Detection:
 *    - Comprehensive regex catches ALL math formats:
 *      $$...$$     (display math)
 *      $...$       (inline math)
 *      \[...\]     (display math)
 *      \(...\)     (inline math)
 *      \begin{align*}...\end{align*}
 *    - Convert \(...\) to $...$ for better inline math support
 *    - Remove newlines between consecutive \]...\[ blocks
 * 
 * 3. Critical Preprocessing:
 *    - Add spacing in \text{...} commands
 *    - Fix sqrt and fraction formatting
 *    - Handle operator spacing
 *    - Escape special chars in text mode
 *    - Remove extra newlines within math blocks
 *    - Convert inline delimiters for consistency
 * 
 * 4. Common Pitfalls:
 *    - Don't convert between display math styles
 *    - Don't use \mathbin for operators
 *    - Don't over-escape backslashes
 *    - Don't let markdown process LaTeX
 *    - Watch for newlines between consecutive math blocks
 * 
 * 5. Error Handling:
 *    - Always have fallback rendering
 *    - Log blocks for debugging
 *    - Return markdown-only on KaTeX fails
 * 
 * 6. Key Improvements:
 *    - Handles mixed delimiter styles ($$ vs \[ vs \begin{align*})
 *    - Preserves spacing in text mode
 *    - Maintains tight spacing between consecutive equations
 *    - Converts problematic delimiters to more compatible ones
 *    - Properly escapes special characters in text mode
 */
function renderMarkdown(text) {
  logToBackground('[Mochi-Content] Starting markdown rendering');
  
  try {
    // Store LaTeX blocks temporarily
    const blocks = [];
    const placeholder = '###LATEX_BLOCK_###';
    
    // First, handle consecutive display math blocks by removing extra newlines between them
    text = text.replace(/\\\]\s+\\\[/g, '\\]\\[');
    
    // Extract and store LaTeX blocks, including align environments and inline math
    text = text.replace(
      // Updated regex for more precise matching
      /(\$\$[\s\S]*?\$\$|(?<!\$)(?<!\w)\$(?!\s)(?:(?!\$).)*?\$(?!\d)(?!\w)|\\begin\{align\*\}[\s\S]*?\\end\{align\*\}|\\begin\{align\}[\s\S]*?\\end\{align\}|\\\[[\s\S]*?\\\]|\\\([^\)]*?\\\))/g,
      (match) => {
        // Skip if it looks like a monetary value (e.g. $100, $99.99)
        if (match.match(/^\$\s*\d+(?:\.\d{2})?$/)) {
          return match;
        }
        
        // Pre-process LaTeX content
        let processedMatch = match
          // Fix text command spacing
          .replace(/\\text\{([^}]+)\}/g, '\\text{ $1 }')
          // Ensure proper sqrt command
          .replace(/\\sqrt\{([^}]+)\}/g, '\\sqrt{$1}')
          // Fix spacing around operators
          .replace(/([0-9])\\approx([0-9])/g, '$1 \\approx $2')
          // Fix fraction spacing
          .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '\\frac{$1}{$2}')
          // Fix text command inside equations
          .replace(/\\text\{([^}]*?)\}/g, (_, content) => {
            // Escape special characters in text mode
            return '\\text{' + content.replace(/[_^]/g, '\\$&') + '}';
          })
          // Remove extra newlines within display math
          .replace(/\n\s*/g, ' ');
        
        // Convert inline parentheses to dollar signs if needed
        if (processedMatch.startsWith('\\(') && processedMatch.endsWith('\\)')) {
          processedMatch = '$' + processedMatch.slice(2, -2) + '$';
        }
        
        blocks.push(processedMatch);
        return placeholder;
      });
    
    // Render markdown
    marked.setOptions({
      gfm: true,
      breaks: true,
      headerIds: false,
      mangle: false,
      tables: true,
      sanitize: false
    });
    
    let html = marked.parse(text);
    
    // Restore LaTeX blocks
    blocks.forEach((block) => {
      html = html.replace(placeholder, block);
    });
    
    // Render LaTeX
    const container = document.createElement('div');
    container.innerHTML = html;
    
    if (typeof renderMathInElement === 'undefined') {
      throw new Error('KaTeX auto-render not available');
    }
    
    renderMathInElement(container, window.katexOptions || {});
    html = container.innerHTML;
    
    logToBackground('[Mochi-Content] Rendering complete');
    return html;
    
  } catch (err) {
    logToBackground(`[Mochi-Content] Error: ${err.message}`, true);
    return marked.parse(text);
  }
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
 * Clean up canvas elements to free memory
 * @param {HTMLCanvasElement[]} canvases - Array of canvas elements to clean
 */
function cleanupCanvases(canvases) {
  canvases.forEach(canvas => {
    canvas.width = canvas.height = 0;  // Clear canvas data
    canvas.remove();  // Remove from DOM
  });
}

//=============================================================================
// Error Handling & Logging
//=============================================================================

/**
 * Utility function to send logs to background script
 * Accepts multiple parameters which are concatenated to a single string
 * @param {...*} args - Log messages, with an optional final boolean flag indicating error
 * @returns {void}
 */
function logToBackground(...args) {
  let isError = false;
  if (typeof args[args.length - 1] === 'boolean') {
    isError = args.pop();
  }
  const message = args.join(' ');
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message,
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
// Dynamic Web App Detection
//=============================================================================

/**
 * Load dynamic app patterns from the configuration file
 * @returns {Promise<Array>} Array of dynamic app patterns
 * @throws {Error} If module loading fails
 */
async function loadDynamicAppsModule() {
  try {
    // Import module registry
    const moduleRegistryUrl = chrome.runtime.getURL('module-registry.js');
    const { getModule } = await import(moduleRegistryUrl);
    
    // Load dynamic apps module
    const dynamicAppsModule = await getModule('dynamic-apps.js');
    return dynamicAppsModule.DYNAMIC_APP_PATTERNS;
  } catch (error) {
    logToBackground('[Mochi-Content] Error loading dynamic apps module: ' + error.message, true);
    throw error;
  }
}

/**
 * Check if the current webpage is a dynamic web application
 * This affects how we handle text extraction and API requests
 * Also updates the AI provider and model based on the result
 * @returns {Promise<boolean>} True if current page is a dynamic web app
 */
async function checkIfDynamicWebApp() {
  try {
    const DYNAMIC_APP_PATTERNS = await loadDynamicAppsModule();
    const currentUrl = window.location.href;
    const currentDomain = window.location.hostname;
    
    logToBackground('[Mochi-Content] Checking if dynamic web app...');
    logToBackground(`[Mochi-Content] Current domain: ${currentDomain}`);
    
    // Check if current site matches any pattern
    const isMatch = DYNAMIC_APP_PATTERNS.some(pattern => {
      const domainMatch = currentDomain.includes(pattern.domain);
      logToBackground(`[Mochi-Content] Checking domain ${pattern.domain}: ${domainMatch}`);
      
      if (!domainMatch) {
        return false;
      }
      
      if (pattern.paths) {
        const pathMatch = pattern.paths.some(path => currentUrl.includes(path));
        logToBackground(`[Mochi-Content] Checking paths for ${pattern.domain}: ${pathMatch}`);
        return pathMatch;
      }
      return true;
    });
    
    // Update global isDynamic flag
    isDynamic = isMatch;
    
    // Update provider and model based on web app detection
    if (isDynamic) {
      currentProvider = AI_PROVIDERS.OPENAI;
      currentModel = AI_MODELS[AI_PROVIDERS.OPENAI].webApp;
      logToBackground('[Mochi-Content] Dynamic web app detected, using gpt-4o model');
    } else {
      currentProvider = AI_PROVIDERS.OPENAI;
      currentModel = AI_MODELS[AI_PROVIDERS.OPENAI].default;
      logToBackground('[Mochi-Content] Standard web page, using gpt-4o-mini model');
    }
    
    logToBackground(`[Mochi-Content] Dynamic web app check result: ${isDynamic}`);
    return isDynamic;
    
  } catch (error) {
    logToBackground('[Mochi-Content] Error checking dynamic web app status: ' + error.message, true);
    isDynamic = false;
    return false;
  }
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

//=============================================================================
// Print Mode Handling
//=============================================================================

/**
 * Handle print mode events to ensure chat interface is hidden during printing
 * Uses both CSS (media query) and JavaScript event handlers for maximum compatibility
 * Also handles print preview mode which may not trigger standard print events
 * @returns {void}
 */
function setupPrintModeHandling() {
  // Store interface visibility state before printing
  let wasInterfaceVisible = false;
  let printModeActive = false;
  
  /**
   * Helper function to hide all Mochi elements
   * @private
   */
  const hideAllMochiElements = () => {
    // Store current state to restore after printing
    wasInterfaceVisible = isInterfaceVisible;
    
    // Hide chat interface if visible
    if (isInterfaceVisible && chatInterface) {
      hideChatInterface();
    }
    
    // Hide all Mochi elements using attribute selectors
    const mochiElements = document.querySelectorAll('[id^="mochi-"], [class^="mochi-"]');
    mochiElements.forEach(element => {
      element.classList.add('mochi-print-hidden');
    });
    
    logToBackground('[Mochi-Content] All Mochi elements hidden for print mode');
  };
  
  /**
   * Helper function to restore all Mochi elements
   * @private
   */
  const restoreAllMochiElements = () => {
    // Only restore if we're not in actual print mode
    if (printModeActive) return;
    
    // Restore chat interface if it was visible before
    if (wasInterfaceVisible && chatInterface) {
      showChatInterface();
    }
    
    // Restore all Mochi elements
    const mochiElements = document.querySelectorAll('.mochi-print-hidden');
    mochiElements.forEach(element => {
      element.classList.remove('mochi-print-hidden');
    });
    
    logToBackground('[Mochi-Content] All Mochi elements restored after print mode');
  };
  
  // Before print: Hide interface if visible
  window.addEventListener('beforeprint', () => {
    logToBackground('[Mochi-Content] Print mode detected, hiding chat interface');
    printModeActive = true;
    hideAllMochiElements();
  });
  
  // After print: Restore interface if it was visible before
  window.addEventListener('afterprint', () => {
    logToBackground('[Mochi-Content] Print mode ended, restoring chat interface');
    printModeActive = false;
    restoreAllMochiElements();
  });
  
  // Additional detection for print preview mode
  // Some browsers don't trigger beforeprint/afterprint for preview
  document.addEventListener('visibilitychange', () => {
    // When tab becomes hidden, check if it might be due to print preview
    if (document.visibilityState === 'hidden') {
      // We can't be certain it's print preview, but we'll hide the UI just in case
      hideAllMochiElements();
      logToBackground('[Mochi-Content] Tab hidden, hiding chat interface (possible print preview)');
    } else if (document.visibilityState === 'visible' && !printModeActive) {
      // Only restore if we're not in actual print mode
      restoreAllMochiElements();
      logToBackground('[Mochi-Content] Tab visible again, restoring chat interface');
    }
  });
  
  // Detect print preview via keyboard shortcuts (Cmd+P or Ctrl+P)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      logToBackground('[Mochi-Content] Print shortcut detected, hiding chat interface');
      hideAllMochiElements();
      
      // Set a timeout to check if we need to restore elements
      // This handles the case where user cancels the print dialog
      setTimeout(() => {
        if (!printModeActive && document.visibilityState === 'visible') {
          restoreAllMochiElements();
        }
      }, 1000);
    }
  });
  
  // Create a MutationObserver to detect print preview dialog
  // This is a fallback method for browsers that don't trigger other events
  const bodyObserver = new MutationObserver((mutations) => {
    // Check if any print-related classes or attributes were added to the body
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const body = document.body;
        // Different browsers may add different classes/attributes when printing
        if (body.classList.contains('print-preview') || 
            body.hasAttribute('data-print-preview') ||
            window.matchMedia('print').matches) {
          hideAllMochiElements();
          logToBackground('[Mochi-Content] Print preview detected via body mutation');
        }
      }
    }
  });
  
  // Start observing the body for attribute changes
  bodyObserver.observe(document.body, { 
    attributes: true,
    attributeFilter: ['class', 'style', 'data-print-preview']
  });
  
  logToBackground('[Mochi-Content] Print mode handlers initialized');
}

//=============================================================================
// Initialization
//=============================================================================

/**
 * Main initialization function
 * Creates chat interface and input field, starts text extraction
 * @returns {Promise<void>}
 */
async function initializeContent() {
  try {
    if (initialized) return;
    
    // Initialize all required modules first
    await initializeModules();
    
    // Create UI components
    await initializeChatInput();
    await createChatInterface();
    hideChatInterface();
    
    // Extract page text and initialize conversation
    await extractPageText();
    await checkIfDynamicWebApp();
    
    // Set up print mode handling
    setupPrintModeHandling();
    
    // Set up keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Alt+M to toggle chat interface
      if (e.altKey && e.key === 'm') {
        toggleChatInterface();
      }
    });
    
    initialized = true;
    logToBackground('[Mochi-Content] Content script initialized successfully');
  } catch (error) {
    logToBackground('[Mochi-Content] Error initializing content script: ' + error.message, true);
  }
}

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContent);
} else {
  initializeContent();
}
