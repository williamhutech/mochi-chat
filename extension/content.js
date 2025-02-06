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
 * @type {boolean} isDynamicWebApp - Flag to indicate if current page is a dynamic web application
 * @type {boolean} isStreaming - Flag to prevent multiple prompts during streaming
 */
let chatInterface = null;        
let inputField = null;         
let isInterfaceVisible = false;  
let extractModule = null;        
let lastResponse = '';          
let initialized = false;         
let chatModule;                  
let accumulatedResponse = '';    
let isDynamicWebApp = false;     
let isStreaming = false;

/**
 * AI Provider configuration
 * Defines available providers and their models
 */
const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini'
};

/**
 * AI Model configuration
 * Models are selected based on whether the current page is a dynamic web app
 */
const AI_MODELS = {
  [AI_PROVIDERS.OPENAI]: {
    default: 'gpt-4o-mini',
    webApp: 'gpt-4o'
  },
  [AI_PROVIDERS.GEMINI]: 'gemini-2.0-flash-exp'
};

let currentProvider = AI_PROVIDERS.OPENAI;
let currentModel = AI_MODELS[AI_PROVIDERS.OPENAI].default;

//=============================================================================
// Core Module Loading
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
          <path d="M16 22L16 10M16 10L11 15M16 10L21 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
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
    // First show chat interface
    showChatInterface();

    // Update UI to show generating state
    const outputField = document.getElementById('mochi-output-field');
    const submitButton = document.getElementById('mochi-chat-submit-button');
    submitButton.classList.add('loading');
    
    let screenshot = null;
    
    // Only capture screenshot for dynamic web apps
    if (isDynamicWebApp) {
      logToBackground('[Mochi-Content] Capturing screenshot for dynamic web app');
      screenshot = await captureScreenWithoutInterface();
    }
    
    // Clear input and update state
    const input = document.getElementById('mochi-chat-input-field');
    input.value = '';
    const container = document.getElementById('mochi-chat-input-container');
    container.classList.remove('has-content');
    submitButton.disabled = true;
    
    // Get chat module and generate response
    const chat = await loadChatModule();
    await chat.generateChatGPTResponse(prompt, screenshot, {
      provider: AI_PROVIDERS.OPENAI,
      model: isDynamicWebApp ? AI_MODELS[AI_PROVIDERS.OPENAI].webApp : AI_MODELS[AI_PROVIDERS.OPENAI].default
    });
    
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
      submitButton.classList.remove('loading');
      isStreaming = false;
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

      // Save the final response
      lastResponse = finalText;
      
      // Check if we need to auto-expand
      checkAndExpandContent(outputField);
      
      submitButton.classList.remove('loading');
      isStreaming = false;
      
      // Reset accumulated response
      logToBackground(accumulatedResponse) //delete later
      accumulatedResponse = '';
      
      logToBackground('Processed final update');
    } else if (update.isFinal && !update.text) {
      // Handle final update without text
      submitButton.classList.remove('loading');
      isStreaming = false;
      
      // Reset accumulated response
      accumulatedResponse = '';
      
      logToBackground('Processed final update without text');
    }
  } catch (error) {
    logToBackground(`Error handling stream update: ${error}`, true);
    showError('Failed to process response');
    document.getElementById('mochi-chat-submit-button').classList.remove('loading');
    isStreaming = false;
    resetUIState();
  }
}

//=============================================================================
// UI Utility Functions
//=============================================================================

/**
 * Function to render markdown text with specific options
 * Supports LaTeX math expressions using KaTeX and markdown tables
 * @param {string} text - Text to render as markdown
 * @returns {string} HTML string of rendered markdown
 */
function renderMarkdown(text) {
  logToBackground('[Mochi-Content] Starting markdown rendering');
  
  // First, protect LaTeX blocks from markdown processing
  const mathBlocks = [];
  let blockId = 0;

  // Helper function to add math block
  const addMathBlock = (formula, isDisplay) => {
    logToBackground(`[Mochi-Content] Processing math block ${blockId}: ${formula.substring(0, 50)}${formula.length > 50 ? '...' : ''}`);
    
    // Combine consecutive display math blocks
    if (isDisplay) {
      // First remove any existing \quad or \, spacing
      formula = formula.replace(/\\quad\s*/g, ' ').replace(/\\,\s*/g, ' ');
      
      // If we detect multiple display math blocks, combine them
      if (formula.includes('\\]') && formula.includes('\\[')) {
        formula = formula
          .replace(/\\\]\s*\\\[/g, ',\\quad ')  // Replace ]\s*[ with ,\quad
          .replace(/\s*\\\]\s*\\\[\s*/g, ',\\quad ')  // Clean up any remaining spaces
          .replace(/,\s*,/g, ',')  // Clean up double commas
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    // Remove align environments and convert to simple equations
    if (formula.includes('\\begin{align')) {
      formula = formula
        .replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, (_, content) => {
          return content
            .split('\\\\')
            .map(line => line.trim()
              .replace(/&=/g, '=')
              .replace(/&/g, '')
              .trim()
            )
            .filter(line => line)
            .join(',\\quad ');  // Use \quad for spacing between lines
        });
    }
    
    // Always convert to simple mathematical notation
    formula = formula
      // Basic cleanup
      .replace(/\\\\(?=[a-zA-Z{])/g, '\\')
      .replace(/\\{2,}/g, '\\')
      .replace(/([^\\])\n/g, '$1 ')
      .replace(/H/g, '')
      .trim()
      
      // Handle text blocks with proper spacing
      .replace(/\\text\{([^{}]+)\}/g, (_, text) => {
        const spacedText = text
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/\s+/g, ' ')
          .trim();
        return `\\text{${spacedText}}`;
      })
      
      // Convert fractions to division
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
      
      // Convert basic operators
      .replace(/\\cdot/g, '×')
      .replace(/\*/g, '×')
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      
      // Convert special symbols
      .replace(/\\approx/g, '≈')
      .replace(/\\pm/g, '±')
      .replace(/\\neq/g, '≠')
      .replace(/\\geq/g, '≥')
      .replace(/\\leq/g, '≤')
      .replace(/\\gt/g, '>')
      .replace(/\\lt/g, '<')
      
      // Convert roots and powers
      .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
      .replace(/\^2/g, '²')
      .replace(/\^3/g, '³')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/[\\{}$]/g, '')
      .trim();

    const id = `MATH_${blockId++}`;
    mathBlocks.push({ id, formula, isDisplay });
    return id;
  };

  // Handle display math (\[ ... \] and $$ ... $$) first
  text = text.replace(/\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g, (match, block1, block2) => {
    logToBackground('[Mochi-Content] Found display math block');
    const formula = (block1 || block2)?.trim();
    if (!formula) return match;
    return addMathBlock(formula, true);
  });

  // Handle inline math ($ ... $ and \( ... \))
  text = text.replace(/\$(\S[^\$\n]*?\S)\$|\$(\S)\$|\\\(([\s\S]*?)\\\)/g, (match, block1, block2, block3) => {
    logToBackground('[Mochi-Content] Found inline math expression');
    // If there's a space after the opening $ or before the closing $, treat as currency
    if (match.startsWith('$ ') || match.endsWith(' $') || /\$\s*\d+/.test(match)) {
      logToBackground('[Mochi-Content] Skipping currency value: ' + match);
      return match;
    }
    const formula = (block1 || block2 || block3)?.trim();
    if (!formula) return match;
    return addMathBlock(formula, false);
  });

  // Configure marked options for tables and other features
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
    tables: true,
    renderer: new marked.Renderer()
  });

  // Create custom renderer to handle tables
  const renderer = {
    table(header, body) {
      return `<div class="table-wrapper"><table class="mochi-table">
        <thead>${header}</thead>
        <tbody>${body}</tbody>
      </table></div>`;
    },
    tablerow(content) {
      return `<tr>${content}</tr>`;
    },
    tablecell(content, { header, align }) {
      const tag = header ? 'th' : 'td';
      const alignAttr = align ? ` align="${align}"` : '';
      return `<${tag}${alignAttr}>${content}</${tag}>`;
    },
    // Custom link renderer to open in new tab
    link(href, title, text) {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
  };

  // Use the custom renderer
  marked.use({ renderer });

  // Render markdown
  logToBackground('[Mochi-Content] Rendering markdown with ' + mathBlocks.length + ' math blocks');
  let html = marked.parse(text);

  // Replace math blocks with rendered LaTeX
  mathBlocks.forEach(({ id, formula, isDisplay }) => {
    try {
      logToBackground(`[Mochi-Content] Attempting to render LaTeX for block ${id}:`);
      logToBackground(`Formula: ${formula.substring(0, 100)}${formula.length > 100 ? '...' : ''}`);
      logToBackground(`Display mode: ${isDisplay}, Length: ${formula.length}`);
      
      // Analyze formula complexity
      const braceCount = (formula.match(/[\{\}]/g) || []).length;
      const commandCount = (formula.match(/\\/g) || []).length;
      logToBackground(`Complexity metrics - Braces: ${braceCount}, Commands: ${commandCount}`);
      
      // Validate formula before rendering
      if (formula.length > 500) {
        throw new Error('Formula too long');
      }

      const katexOptions = {
        displayMode: isDisplay,
        throwOnError: false,
        output: 'html',
        strict: false,
        trust: true,
        maxSize: 100,
        maxExpand: 100,
        macros: {
          "\\approx": "\\mathbin{\\approx}"  // Only keep approx macro for proper spacing
        }
      };

      // Try rendering with KaTeX
      logToBackground('[Mochi-Content] Calling KaTeX.renderToString');
      const rendered = katex.renderToString(formula, katexOptions);
      logToBackground('[Mochi-Content] KaTeX rendering successful');
      html = html.replace(id, rendered);
      
    } catch (err) {
      const errorDetails = {
        message: err.message,
        stack: err.stack,
        formula: formula.substring(0, 100) + (formula.length > 100 ? '...' : ''),
        formulaLength: formula.length
      };
      logToBackground(`[Mochi-Content] LaTeX error details: ${JSON.stringify(errorDetails, null, 2)}`, true);
      
      // Simple fallback: convert to plain text with basic formatting
      let fallback = formula
        .replace(/\\text\{([^{}]+)\}/g, '$1')
        .replace(/\\approx/g, '≈')
        .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
        .replace(/\^2/g, '²')
        .replace(/\^3/g, '³')
        .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
        .replace(/[\\{}$]/g, '')
        .trim();

      logToBackground('[Mochi-Content] Using fallback rendering');
      if (isDisplay) {
        html = html.replace(id, `<div class="katex-display"><span class="katex">${fallback}</span></div>`);
      } else {
        html = html.replace(id, `<span class="katex">${fallback}</span>`);
      }
    }
  });

  logToBackground('[Mochi-Content] Markdown rendering completed');
  return html;
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
// Initialization
//=============================================================================

/**
 * Main initialization function
 * Creates chat interface and input field, starts text extraction
 * @returns {Promise<void>}
 */
async function initializeContent() {
  try {
    logToBackground('[Mochi-Content] Initializing content script...');
    
    // Check if current page is a dynamic web app
    isDynamicWebApp = await checkIfDynamicWebApp();
    
    // Initialize UI components and extract text
    await Promise.all([
      initializeChatInput(),
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