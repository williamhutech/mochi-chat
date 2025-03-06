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
      <div id="mochi-chat-footer">
        <div id="mochi-footer-left">
          <a href="#" id="mochi-learn-more">Mochi is created by AI. Learn how &gt;</a>
        </div>
        <div id="mochi-footer-right">
          <a href="#" id="mochi-feedback">Feedback?</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(chatInterface);

  // Add event listeners

  document.getElementById('mochi-close-button').addEventListener('click', hideChatInterface);
  document.getElementById('mochi-expand-button').addEventListener('click', toggleExpand);
  
  // Footer event listeners
  document.getElementById('mochi-learn-more').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Open the "Learn how" page in a new tab directly
    window.open('https://dub.sh/Z5uBFK5', '_blank');
  });
  
  document.getElementById('mochi-feedback').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Open the feedback form or page in a new tab directly
    window.open('https://dub.sh/0qAwW9m', '_blank');
  });
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
      
      // Add click event to toggle chat interface
      container.addEventListener('click', () => {
        toggleChatInterface();
      });

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
        <img src="${chrome.runtime.getURL('submit.svg')}" width="12" height="12" 
             style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
        <div class="loader-wrapper">
          <span class="loader"></span>
        </div>
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
        if (e.key === 'Enter' && input.value.trim() && !isStreaming) {
          e.preventDefault();
          const prompt = input.value.trim();
          input.value = '';
          updateInputState(input, submitButton);
          await sendPrompt(prompt);
        }
      });

      // Send prompt when submit button is clicked
      submitButton.addEventListener('click', async (e) => {
        // Stop event propagation to prevent the container click from toggling the interface
        e.stopPropagation();
        
        // Process prompt if there's content and not streaming
        if (input.value.trim() && !isStreaming) {
          const prompt = input.value.trim();
          input.value = '';
          updateInputState(input, submitButton);
          
          // Make sure input remains focused
          input.focus();
          
          // Send the prompt
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
      
      // Create a separate hide button that appears when hovering over the chat toggle
      createHideButton(container);
    }
  } catch (error) {
    logToBackground('[Mochi-Content] Error initializing chat input: ' + error.message, true);
    throw error;
  }
}

/**
 * Initialize chat input field in hidden state
 * Creates the input field but keeps it hidden from the start
 * @returns {Promise<void>}
 */
async function initializeChatInputHidden() {
  try {
    // First create a container with hidden state
    const container = document.createElement('div');
    container.id = 'mochi-chat-input-container';
    
    // Apply hidden styles BEFORE adding to DOM
    container.classList.add('mochi-chat-toggle-hidden');
    container.style.display = 'none';
    container.style.visibility = 'hidden';
    container.style.opacity = '0';
    
    // Now proceed with the rest of the creation
    // but add to DOM only after all setup is complete
    container.addEventListener('click', () => {
      toggleChatInterface();
    });
    
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
      <img src="${chrome.runtime.getURL('submit.svg')}" width="12" height="12" 
           style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
      <div class="loader-wrapper">
        <span class="loader"></span>
      </div>
    `;
    
    // Setup the input events (same as regular initialization but without DOM interaction yet)
    const updateInputState = (input, submitButton) => {
      const hasContent = input.value.trim().length > 0;
      submitButton.disabled = !hasContent;
      if (hasContent) {
        container.classList.add('has-content');
      } else {
        container.classList.remove('has-content');
      }
    };
    
    input.addEventListener('input', () => {
      updateInputState(input, submitButton);
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && input.value.trim() && !isStreaming) {
        e.preventDefault();
        const prompt = input.value.trim();
        input.value = '';
        updateInputState(input, submitButton);
        await sendPrompt(prompt);
      }
    });

    submitButton.addEventListener('click', async (e) => {
      // Stop event propagation to prevent the container click from toggling the interface
      e.stopPropagation();
      
      // Process prompt if there's content and not streaming
      if (input.value.trim() && !isStreaming) {
        const prompt = input.value.trim();
        input.value = '';
        updateInputState(input, submitButton);
        
        // Make sure input remains focused
        input.focus();
        
        // Send the prompt
        await sendPrompt(prompt);
      }
    });
    
    // Now assemble the components
    container.appendChild(input);
    container.appendChild(submitButton);
    
    // Add to DOM only after everything is set up
    document.body.appendChild(container);
    
    // Create hidden hide button
    const hideButton = document.createElement('button');
    hideButton.id = 'mochi-chat-toggle-hide-button';
    hideButton.style.display = 'none';
    hideButton.style.visibility = 'hidden';
    hideButton.style.opacity = '0';
    hideButton.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    hideButton.title = 'Hide chat toggle (use Alt+M to show again)';
    
    // Add to DOM
    document.body.appendChild(hideButton);
    
    logToBackground('[Mochi-Content] Chat toggle created in hidden state');
  } catch (error) {
    logToBackground('[Mochi-Content] Error initializing hidden chat input: ' + error.message, true);
    throw error;
  }
}

/**
 * Create a separate hide button that appears when hovering over the chat toggle
 * Positions the button relative to the container but outside its DOM hierarchy
 * @param {HTMLElement} container - The chat toggle container element
 */
function createHideButton(container) {
  // Remove any existing hide button
  const existingButton = document.getElementById('mochi-chat-toggle-hide-button');
  if (existingButton) {
    existingButton.remove();
  }

  // Create new hide button
  const hideButton = document.createElement('button');
  hideButton.id = 'mochi-chat-toggle-hide-button';
  hideButton.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  hideButton.title = 'Hide chat toggle (use Alt+M to show again)';
  
  // Add the button directly to the body, not inside the container
  document.body.appendChild(hideButton);
  
  // Position the button relative to the container
  const updateButtonPosition = () => {
    // If container is hidden, hide the button too
    if (container.classList.contains('mochi-chat-toggle-hidden')) {
      hideButton.style.display = 'none';
      return;
    }
    
    const rect = container.getBoundingClientRect();
    hideButton.style.position = 'fixed';
    hideButton.style.top = (rect.top - 10) + 'px';
    hideButton.style.left = (rect.right - 10) + 'px';
    hideButton.style.display = '';
  };
  
  // Initial positioning
  updateButtonPosition();
  
  // Update position whenever needed - observe both class changes AND size changes
  const mutationObserver = new MutationObserver(updateButtonPosition);
  mutationObserver.observe(container, { attributes: true, attributeFilter: ['class'] });
  
  // Add ResizeObserver to detect when the container changes size (extends in length)
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      updateButtonPosition();
    });
    resizeObserver.observe(container);
  }
  
  window.addEventListener('resize', updateButtonPosition);
  document.addEventListener('scroll', updateButtonPosition);
  
  // Show the button when hovering over the container
  container.addEventListener('mouseenter', () => {
    if (!container.classList.contains('mochi-chat-toggle-hidden')) {
      hideButton.classList.add('mochi-visible');
    }
  });
  
  // Hide the button when leaving the container area
  container.addEventListener('mouseleave', (event) => {
    // Add a small delay to check if mouse moved to button
    setTimeout(() => {
      const buttonRect = hideButton.getBoundingClientRect();
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      
      // If mouse is over the button, don't hide it
      if (mouseX >= buttonRect.left && mouseX <= buttonRect.right && 
          mouseY >= buttonRect.top && mouseY <= buttonRect.bottom) {
        return;
      }
      
      hideButton.classList.remove('mochi-visible');
    }, 100);
  });
  
  // Hide button also needs mouse events
  hideButton.addEventListener('mouseenter', () => {
    hideButton.classList.add('mochi-visible');
  });
  
  hideButton.addEventListener('mouseleave', () => {
    hideButton.classList.remove('mochi-visible');
  });
  
  // Add click event to hide the chat toggle
  hideButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Direct call to hide function with more forceful approach
    const chatToggle = document.getElementById('mochi-chat-input-container');
    if (chatToggle) {
      chatToggle.classList.add('mochi-chat-toggle-hidden');
      chatToggle.style.display = 'none';
      chatToggle.style.visibility = 'hidden';
      chatToggle.style.opacity = '0';
      
      // Store domain in hidden domains list
      const currentDomain = extractBaseDomain(window.location.href);
      if (currentDomain) {
        addDomainToHiddenList(currentDomain);
        logToBackground(`[Mochi-Content] Chat toggle hidden for domain: ${currentDomain}`);
      } else {
        logToBackground('[Mochi-Content] Chat toggle hidden but couldn\'t extract domain');
      }
    }
    
    // Hide the button itself
    hideButton.style.display = 'none';
    
    return false;
  });
}

/**
 * Extract the base domain from a URL
 * @param {string} url - The URL to extract domain from
 * @returns {string} The base domain (e.g., 'example.com' from 'https://www.example.com/page')
 */
function extractBaseDomain(url) {
  try {
    // Create a URL object
    const urlObj = new URL(url);
    // Get the hostname (e.g., www.example.com)
    let hostname = urlObj.hostname;
    
    // Remove 'www.' if present
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    return hostname;
  } catch (error) {
    logToBackground('[Mochi-Content] Error extracting domain: ' + error.message, true);
    return '';
  }
}

/**
 * Store domain in hidden domains list
 * @param {string} domain - Domain to store
 * @returns {Promise<void>}
 */
async function addDomainToHiddenList(domain) {
  if (!domain) return;
  
  try {
    // Get current hidden domains
    const result = await chrome.storage.local.get('mochiHiddenDomains');
    let hiddenDomains = result.mochiHiddenDomains || [];
    
    // Add domain if not already in the list
    if (!hiddenDomains.includes(domain)) {
      hiddenDomains.push(domain);
      // Store updated list
      await chrome.storage.local.set({ mochiHiddenDomains: hiddenDomains });
      logToBackground(`[Mochi-Content] Added ${domain} to hidden domains list`);
      invalidateHiddenDomainsCache();
    }
  } catch (error) {
    logToBackground('[Mochi-Content] Error storing hidden domain: ' + error.message, true);
  }
}

/**
 * Remove a domain from the hidden domains list
 * @param {string} domain - Domain to remove
 * @returns {Promise<boolean>} True if domain was removed
 */
async function removeDomainFromHiddenList(domain) {
  if (!domain) return false;
  
  try {
    // Get current hidden domains
    const result = await chrome.storage.local.get('mochiHiddenDomains');
    let hiddenDomains = result.mochiHiddenDomains || [];
    
    // Check if domain is in the list
    if (!hiddenDomains.includes(domain)) {
      return false;
    }
    
    // Remove domain from list
    const updatedDomains = hiddenDomains.filter(d => d !== domain);
    
    // Store updated list
    await chrome.storage.local.set({ mochiHiddenDomains: updatedDomains });
    logToBackground(`[Mochi-Content] Removed ${domain} from hidden domains list`);
    invalidateHiddenDomainsCache();
    return true;
  } catch (error) {
    logToBackground('[Mochi-Content] Error removing domain from hidden list: ' + error.message, true);
    return false;
  }
}

/**
 * Get all domains in the hidden domains list
 * @returns {Promise<string[]>} List of hidden domains
 */
async function getHiddenDomains() {
  try {
    const result = await chrome.storage.local.get('mochiHiddenDomains');
    return result.mochiHiddenDomains || [];
  } catch (error) {
    logToBackground('[Mochi-Content] Error getting hidden domains: ' + error.message, true);
    return [];
  }
}

/**
 * Cache to store the result of domain checks to avoid repeated storage access
 * @type {Object}
 */
const hiddenDomainsCache = {
  domains: null,
  timestamp: 0,
  // Cache valid for 5 minutes
  CACHE_TTL: 5 * 60 * 1000
};

/**
 * Get all domains in the hidden domains list with caching
 * @returns {Promise<string[]>} List of hidden domains
 */
async function getHiddenDomains() {
  try {
    // Check if we have a valid cached value
    const now = Date.now();
    if (hiddenDomainsCache.domains !== null && (now - hiddenDomainsCache.timestamp) < hiddenDomainsCache.CACHE_TTL) {
      logToBackground('[Mochi-Content] Using cached hidden domains list');
      return hiddenDomainsCache.domains;
    }
    
    // If no valid cache, get from storage
    const result = await chrome.storage.local.get('mochiHiddenDomains');
    const domains = result.mochiHiddenDomains || [];
    
    // Update cache
    hiddenDomainsCache.domains = domains;
    hiddenDomainsCache.timestamp = now;
    
    return domains;
  } catch (error) {
    logToBackground('[Mochi-Content] Error getting hidden domains: ' + error.message, true);
    return [];
  }
}

/**
 * Check if current domain is in hidden domains list
 * Uses caching for faster performance during initialization
 * @returns {Promise<boolean>} True if current domain should be hidden
 */
async function shouldHideChatToggle() {
  try {
    const currentDomain = extractBaseDomain(window.location.href);
    if (!currentDomain) return false;
    
    // Get hidden domains from cached storage
    const hiddenDomains = await getHiddenDomains();
    
    // Check if current domain is in the list
    return hiddenDomains.includes(currentDomain);
  } catch (error) {
    logToBackground('[Mochi-Content] Error checking hidden domains: ' + error.message, true);
    return false;
  }
}

/**
 * Invalidate the hidden domains cache
 * Call this after any changes to the hidden domains list
 */
function invalidateHiddenDomainsCache() {
  hiddenDomainsCache.domains = null;
  hiddenDomainsCache.timestamp = 0;
  logToBackground('[Mochi-Content] Hidden domains cache invalidated');
}

/**
 * Toggle chat interface visibility
 * Used by both click and keyboard shortcuts
 * @returns {void}
 */
function toggleChatInterface() {
  logToBackground('[Mochi-Content] Toggling chat');
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
 * Hide the chat toggle button
 * Makes the toggle button invisible until shown again via keyboard shortcut
 * @returns {void}
 */
function hideChatToggle() {
  const chatToggle = document.getElementById('mochi-chat-input-container');
  if (chatToggle) {
    // Use both CSS class and inline style to ensure it's hidden
    chatToggle.classList.add('mochi-chat-toggle-hidden');
    chatToggle.style.display = 'none';
    chatToggle.style.visibility = 'hidden';
    chatToggle.style.opacity = '0';
    logToBackground('[Mochi-Content] Chat toggle hidden');
    
    // Also hide the hide button if it exists
    const hideButton = document.getElementById('mochi-chat-toggle-hide-button');
    if (hideButton) {
      hideButton.style.display = 'none';
    }
  }
}

/**
 * Show the chat toggle button if it was hidden
 * @returns {void}
 */
async function showChatToggle() {
  // Check if current domain is in hidden list
  const currentDomain = extractBaseDomain(window.location.href);
  const result = await chrome.storage.local.get('mochiHiddenDomains');
  const hiddenDomains = result.mochiHiddenDomains || [];
  
  // If domain is in hidden list and user activates via keyboard shortcut,
  // Ask if they want to remove the domain from hidden list
  if (currentDomain && hiddenDomains.includes(currentDomain)) {
    logToBackground(`[Mochi-Content] Chat toggle requested for hidden domain: ${currentDomain}`);
    
    // Show temporary notification to user
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.left = '20px';
    notification.style.backgroundColor = 'rgba(241, 241, 241, 0.68)';
    notification.style.backdropFilter = 'blur(24px)';
    notification.style.color = 'rgba(0, 0, 0, 0.8)';
    notification.style.padding = '12px 15px';
    notification.style.borderRadius = '18px';
    notification.style.zIndex = '9999999';
    notification.style.fontFamily = "'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    notification.style.fontSize = '13px';
    notification.style.maxWidth = '300px';
    notification.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.04)';
    notification.innerHTML = `
      <div style="margin-bottom: 10px; font-weight: 400; color: rgba(0, 0, 0, 0.6);">Chat toggle was hidden for ${currentDomain}.</div>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button id="mochi-keep-hidden" style="padding: 8px 12px; background: rgba(0, 0, 0, 0.44); border: none; color: white; border-radius: 24px; cursor: pointer; font-size: 12px; font-weight: 400;">Keep Hidden</button>
        <button id="mochi-show-always" style="padding: 8px 12px; background: rgb(0, 0, 0); border: none; color: white; border-radius: 24px; cursor: pointer; font-size: 12px; font-weight: 400;">Show Always</button>
      </div>
    `;
    document.body.appendChild(notification);
    
    // Handle user choice
    document.getElementById('mochi-keep-hidden').addEventListener('click', () => {
      notification.remove();
    });
    
    document.getElementById('mochi-show-always').addEventListener('click', async () => {
      // Remove domain from hidden list
      const updatedDomains = hiddenDomains.filter(domain => domain !== currentDomain);
      await chrome.storage.local.set({ mochiHiddenDomains: updatedDomains });
      logToBackground(`[Mochi-Content] Removed ${currentDomain} from hidden domains list`);
      invalidateHiddenDomainsCache();
      
      // Show the toggle
      const chatToggle = document.getElementById('mochi-chat-input-container');
      if (chatToggle) {
        // Remove both CSS class and inline styles
        chatToggle.classList.remove('mochi-chat-toggle-hidden');
        chatToggle.style.display = '';
        chatToggle.style.visibility = '';
        chatToggle.style.opacity = '';
        logToBackground('[Mochi-Content] Chat toggle shown after removal from hidden list');
      }
      
      notification.remove();
    });
    
    // Auto-remove notification after 7 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.remove();
      }
    }, 7000);
    
    return;
  }
  
  // If not in hidden list, show toggle normally
  const chatToggle = document.getElementById('mochi-chat-input-container');
  if (chatToggle) {
    // Remove both CSS class and inline styles
    chatToggle.classList.remove('mochi-chat-toggle-hidden');
    chatToggle.style.display = '';
    chatToggle.style.visibility = '';
    chatToggle.style.opacity = '';
    logToBackground('[Mochi-Content] Chat toggle shown');
  }
}

/**
 * Reset UI state after error
 * Cleans up UI elements and resets flags
 * @returns {void}
 */
function resetUIState() {
  // Clear the loading placeholder from output field
  const outputField = document.getElementById('mochi-output-field');
  if (outputField && outputField.querySelector('.mochi-loading-placeholder')) {
    outputField.innerHTML = '';
  }
  
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
    // Set extraction as incomplete before starting
    if (conversationModule && conversationModule.setExtractionComplete) {
      conversationModule.setExtractionComplete(false);
      logToBackground('[Mochi-Content] Setting extraction status to incomplete');
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
    const extractedText = await extractModule.extractText(extractionOptions);
    
    // Add extracted text to conversation history
    await conversationModule.addExtractedText(extractedText);
    
    logToBackground('[Mochi-Content] Text extraction completed and added to conversation');
    
    // Mark extraction as complete
    if (conversationModule && conversationModule.setExtractionComplete) {
      conversationModule.setExtractionComplete(true);
      logToBackground('[Mochi-Content] Setting extraction status to complete');
    }
    
  } catch (error) {
    logToBackground(`[Mochi-Content] Error extracting text: ${error}`, true);
    showError('Failed to extract text from the document');
    
    // Ensure extraction is marked as complete even on error
    if (conversationModule && conversationModule.setExtractionComplete) {
      conversationModule.setExtractionComplete(true);
      logToBackground('[Mochi-Content] Setting extraction status to complete after error');
    }
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
 * Includes explicit permission request and retry logic for reliability
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
    
    // Minimal delay for DOM update
    await new Promise(resolve => setTimeout(resolve, 2));
    
    // Solution #1: Try to explicitly request activeTab permission if available
    try {
      if (chrome.permissions && chrome.permissions.request) {
        logToBackground('[Mochi-Content] Explicitly requesting activeTab permission');
        await chrome.permissions.request({ permissions: ['activeTab'] });
      }
    } catch (permError) {
      // Non-critical error, just log it and continue with capture attempt
      logToBackground('[Mochi-Content] Permission request failed: ' + permError.message, true);
    }
    
    // Solution #2: Add retry logic for screenshot capture
    let attempts = 0;
    let rawScreenshot = null;
    const MAX_ATTEMPTS = 3;
    
    while (!rawScreenshot && attempts < MAX_ATTEMPTS) {
      try {
        logToBackground(`[Mochi-Content] Screenshot attempt ${attempts + 1} of ${MAX_ATTEMPTS}`);
        rawScreenshot = await chrome.runtime.sendMessage({ action: 'captureVisibleTab' });
        
        if (!rawScreenshot) {
          throw new Error('No screenshot data returned');
        }
      } catch (error) {
        logToBackground(`[Mochi-Content] Screenshot attempt ${attempts + 1} failed: ${error.message}`, true);
        // Wait longer between retries with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempts)));
      }
      attempts++;
    }
    
    // Restore interface immediately if it was visible
    if (wasVisible) {
      chatInterface.style.display = '';
      isInterfaceVisible = true;
    }
    
    if (!rawScreenshot) {
      throw new Error('Screenshot capture failed after multiple attempts');
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
    
    // Check if text extraction or dynamic detection is still in progress and queue prompt if needed
    if (conversationModule && conversationModule.queuePromptIfNeeded) {
      const extractionComplete = conversationModule.isTextExtractionComplete?.() ?? true;
      const dynamicDetectionComplete = window.mochiDynamicDetectionComplete ?? false;
      const dynamicDetectionInProgress = window.mochiDynamicDetectionInProgress ?? false;
      
      if (!extractionComplete || dynamicDetectionInProgress) {
        logToBackground('[Mochi-Content] Text extraction or dynamic detection in progress, queuing prompt');
        logToBackground(`[Mochi-Content] Extraction complete: ${extractionComplete}, Dynamic detection in progress: ${dynamicDetectionInProgress}`);
        
        // Wait for extraction to complete before continuing
        await conversationModule.queuePromptIfNeeded();
        
        // If dynamic detection was in progress, we need to wait for it too
        if (dynamicDetectionInProgress) {
          logToBackground('[Mochi-Content] Waiting for dynamic web app detection to complete');
          
          // Wait for dynamic detection to complete with timeout
          const dynamicDetectionTimeout = 5000; // 5 seconds timeout
          const startTime = Date.now();
          
          while (window.mochiDynamicDetectionInProgress && (Date.now() - startTime < dynamicDetectionTimeout)) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms and check again
          }
          
          // If we timed out, assume it's a dynamic web app to be safe
          if (window.mochiDynamicDetectionInProgress) {
            logToBackground('[Mochi-Content] Dynamic detection timeout, assuming dynamic web app');
            isDynamic = true;
          }
        }
        
        logToBackground('[Mochi-Content] Processing complete, proceeding with queued prompt');
      }
    }
    
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
      // If this is the first chunk, clear the loading placeholder
      if (accumulatedResponse === '') {
        logToBackground('[Mochi-Content] First chunk received, clearing loading placeholder');
        outputField.innerHTML = '';
      }
      
      // Accumulate and render new text
      accumulatedResponse += update.text;
      const processedText = renderMarkdown(accumulatedResponse);
      outputField.innerHTML = processedText;
      
      // Ensure LaTeX is rendered after updating the outputField
      if (typeof renderMathInElement !== 'undefined') {
        try {
          renderMathInElement(outputField, window.katexOptions || {
            delimiters: [
              {left: '$$', right: '$$', display: true},
              {left: '$', right: '$', display: false},
              {left: '\\[', right: '\\]', display: true},
              {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false
          });
        } catch (error) {
          logToBackground(`[Mochi-Content] KaTeX rendering error during stream: ${error.message}`, true);
        }
      }
      
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
        
        // Final LaTeX rendering pass
        if (typeof renderMathInElement !== 'undefined') {
          try {
            renderMathInElement(outputField, window.katexOptions || {
              delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false}
              ],
              throwOnError: false
            });
          } catch (error) {
            logToBackground(`[Mochi-Content] KaTeX rendering error during final update: ${error.message}`, true);
          }
        }
        
        lastResponse = outputField.innerHTML;
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

/**
 * Initialize KaTeX auto-render with global configuration
 */
function initializeKaTeX() {
  logToBackground('[Mochi-Content] Initializing KaTeX auto-render');
  
  if (typeof katex === 'undefined' || typeof renderMathInElement === 'undefined') {
    logToBackground('[Mochi-Content] Warning: KaTeX or auto-render not available', true);
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
  
  logToBackground('[Mochi-Content] KaTeX auto-render initialized with options:', window.katexOptions);
}

/**
 * Renders markdown text with LaTeX math expressions using KaTeX
 * @param {string} text - Raw markdown text that may contain LaTeX expressions
 * @returns {string} HTML string with rendered markdown and LaTeX
 * 
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
      // Updated regex for more precise matching - improved to handle financial text with dollar signs
      /(\$\$[\s\S]*?\$\$|(?<!\$)(?<!\w)\$(?!\s)(?!\d)(?:(?!\$).)*?\$(?!\d)(?!\w)|\\begin\{align\*\}[\s\S]*?\\end\{align\*\}|\\begin\{align\}[\s\S]*?\\end\{align\}|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,
      (match) => {
        // Skip if it looks like a monetary value with text after it (e.g. $100 million, $99.99 billion)
        if (match.match(/^\$\s*\d+(?:\.\d+)?(?:\s+(?:million|billion|trillion|thousand|hundred|[kKmMbBtT])?)?$/)) {
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
        
        // Debug log the processed LaTeX block
        logToBackground(`[Mochi-Content] Processing LaTeX block: ${processedMatch.substring(0, 40)}...`);
        
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
      logToBackground('[Mochi-Content] KaTeX auto-render not available, initializing...', true);
      initializeKaTeX();
      if (typeof renderMathInElement === 'undefined') {
        throw new Error('KaTeX auto-render not available after initialization attempt');
      }
    }
    
    try {
      renderMathInElement(container, window.katexOptions || {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\[', right: '\\]', display: true},
          {left: '\\(', right: '\\)', display: false}
        ],
        throwOnError: false
      });
    } catch (katexError) {
      logToBackground(`[Mochi-Content] KaTeX rendering error: ${katexError.message}`, true);
      // If KaTeX fails, just return the HTML with unreplaced LaTeX
    }
    
    html = container.innerHTML;
    
    logToBackground('[Mochi-Content] Rendering complete');
    return html;
    
  } catch (err) {
    logToBackground(`[Mochi-Content] Error in renderMarkdown: ${err.message}`, true);
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
 * Counter to track the number of consecutive errors
 * Used to show different error messages based on frequency
 * @type {number}
 */
let errorCounter = 0;

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
  // Log the specific error for debugging but display standardized message to user
  logToBackground(`[Mochi-Content] Error details: ${message}`, true);
  
  // Make sure chat interface is visible
  showChatInterface();
  
  // Increment error counter
  errorCounter++;
  
  // Display standardized user-friendly error message in the output field
  const outputField = document.getElementById('mochi-output-field');
  if (outputField) {
    let errorMessage = '';
    
    // Show different message based on error count
    if (errorCounter <= 1) {
      errorMessage = `
        <br>
        <p class="mochi-error">Hmm, something didn't quite work as expected. Would you mind trying once more?</p>
      `;
    } else if (errorCounter == 2) {
      errorMessage = `
        <br>
        <p class="mochi-error">Something is not working as expected. Drop us a note through the feedback button and we'll get it fixed!</p>
      `;
    } else {
      errorMessage = `
        <br>
        <p class="mochi-error">So sorry about this. Let us know through the feedback button and I will get it fixed!</p>
        <br>
        <p class="mochi-error">- Will</p>
      `;
    }
    
    outputField.innerHTML = errorMessage;
    
    // Update lastResponse to preserve the error message if interface is toggled
    lastResponse = outputField.innerHTML;
  }
}

//=============================================================================
// Dynamic Web App Detection
//=============================================================================

/**
 * Check if the current webpage is a dynamic web application
 * Uses heuristics and content analysis to determine if text extraction is sufficient
 * This affects how we handle text extraction and API requests
 * Also updates the AI provider and model based on the result
 * @returns {Promise<boolean>} True if current page is a dynamic web app
 */
async function checkIfDynamicWebApp() {
  try {
    logToBackground('[Mochi-Content] Checking if page is a dynamic web application...');
    
    // Set a flag to track if dynamic detection is in progress
    window.mochiDynamicDetectionInProgress = true;
    
    // First check for article content
    const isArticle = await detectArticleContent();
    
    if (isArticle) {
      logToBackground('[Mochi-Content] Page detected as an article, not a dynamic web app');
      isDynamic = false;
      updateModelBasedOnDynamicDetection(false);
      window.mochiDynamicDetectionInProgress = false;
      window.mochiDynamicDetectionComplete = true;
      return false;
    }
    
    // Check for dynamic content loading characteristics
    const hasDynamicLoading = await checkForDynamicLoading();
    
    // Check for infinite scrolling behavior
    const hasInfiniteScroll = checkForInfiniteScrolling();
    
    // Check for rich JS interfaces that make text extraction difficult
    const hasRichJSInterface = checkForRichJSInterface();
    
    // Analyze DOM complexity and interactivity
    const domComplexity = analyzeDomComplexity();
    
    // Assess quality of extractable text content
    const contentQuality = await assessContentQuality();
    
    // Check for JS frameworks
    const hasFramework = detectJSFrameworks();
    
    // Combined score approach - weight each factor appropriately
    const dynamicLoadingWeight = 0.4;  // Increased from 0.35
    const infiniteScrollWeight = 0.1;
    const richJSInterfaceWeight = 0.35; // Increased from 0.3
    const domComplexityWeight = 0.2;   // Increased from 0.15
    const contentQualityWeight = 0.05; // Reduced from 0.1
    const frameworkWeight = 0.2;      // New factor
    
    // Calculate weighted score
    const dynamicScore = 
      (hasDynamicLoading ? dynamicLoadingWeight : 0) +
      (hasInfiniteScroll ? infiniteScrollWeight : 0) +
      (hasRichJSInterface ? richJSInterfaceWeight : 0) +
      (domComplexity > 0.6 ? domComplexityWeight : 0) +
      (contentQuality < 0.5 ? contentQualityWeight : 0) +
      (hasFramework ? frameworkWeight : 0);
    
    // Dynamic score threshold is now lower to catch more web apps
    const shouldUseImageCapture = dynamicScore >= 0.35;
    
    // Re-use in the future; do not delete
    // [Mochi-Content] Dynamic detection results:
    // - Article content: ${isArticle}
    // - Dynamic loading: ${hasDynamicLoading} (weight: ${dynamicLoadingWeight})
    // - Infinite scroll: ${hasInfiniteScroll} (weight: ${infiniteScrollWeight})
    // - Rich JS interface: ${hasRichJSInterface} (weight: ${richJSInterfaceWeight})
    // - DOM complexity: ${domComplexity} (weight: ${domComplexityWeight})
    // - Content quality: ${contentQuality} (weight: ${contentQualityWeight})
    // - JS Framework: ${hasFramework} (weight: ${frameworkWeight})
    // - Dynamic score: ${dynamicScore.toFixed(2)}
    // - Required threshold: 0.35
    // - Final decision: ${shouldUseImageCapture}
    
    // Update global isDynamic flag based on detection
    isDynamic = shouldUseImageCapture;
    
    // Update AI provider and model based on detection result
    updateModelBasedOnDynamicDetection(shouldUseImageCapture);
    
    // Mark detection as complete
    window.mochiDynamicDetectionInProgress = false;
    window.mochiDynamicDetectionComplete = true;
    
    logToBackground(`[Mochi-Content] Dynamic web app detection complete: ${isDynamic ? 'Yes' : 'No'}`);
    return isDynamic;
  } catch (error) {
    logToBackground('[Mochi-Content] Error detecting dynamic web app: ' + error.message, true);
    isDynamic = false;
    updateModelBasedOnDynamicDetection(false);
    window.mochiDynamicDetectionInProgress = false;
    window.mochiDynamicDetectionComplete = true;
    return false;
  }
}

/**
 * Updates the AI provider and model based on dynamic web app detection
 * Extracted to a separate function for better maintainability
 * @param {boolean} isDynamicApp - Whether the current page is a dynamic web app
 */
function updateModelBasedOnDynamicDetection(isDynamicApp) {
  if (isDynamicApp) {
    currentProvider = AI_PROVIDERS.OPENAI;
    currentModel = AI_MODELS[AI_PROVIDERS.OPENAI].webApp;
    logToBackground('[Mochi-Content] Dynamic web app detected, using gpt-4o model');
  } else {
    currentProvider = AI_PROVIDERS.OPENAI;
    currentModel = AI_MODELS[AI_PROVIDERS.OPENAI].default;
    logToBackground('[Mochi-Content] Standard web page, using gpt-4o-mini model');
  }
}

// Thresholds for detection
const DOM_COMPLEXITY_THRESHOLD = 0.6; // Lowered from 0.7 to catch more complex UIs
const CONTENT_QUALITY_THRESHOLD = 0.5;
const MIN_TEXT_LENGTH = 500; // Characters
const MIN_CONTENT_ELEMENTS = 5; // Number of content elements
const AJAX_REQUEST_THRESHOLD = 10; // Lowered from 15
const ARTICLE_SCORE_THRESHOLD = 0.6;
const DYNAMIC_SCORE_THRESHOLD = 0.35; // Lowered to catch more dynamic apps

/**
 * Detects if the current page is likely an article or blog post
 * Article pages typically have good text extraction and don't need screenshots
 * @returns {Promise<boolean>} True if the page is likely an article
 */
async function detectArticleContent() {
  try {
    // Check for common article structural elements
    const hasArticleTag = document.querySelector('article') !== null;
    const hasHeadingStructure = document.querySelectorAll('h1, h2, h3').length >= 2;
    const hasParagraphs = document.querySelectorAll('p').length >= 5;
    
    // Check for schema.org article metadata
    const hasArticleSchema = 
      document.querySelector('[itemtype*="Article"]') !== null ||
      document.querySelector('meta[property="og:type"][content*="article"]') !== null;
    
    // Check for common article containers/selectors
    const hasArticleContainer = 
      document.querySelector('.article, .post, .entry, .blog-post, .story, #article, #post, [class*="article-"], [class*="post-"]') !== null;
    
    // Check for publication date - common in articles
    const hasPublicationDate = 
      document.querySelector('time, [datetime], .date, .published, [itemprop="datePublished"]') !== null;
    
    // Check for author information - common in articles
    const hasAuthorInfo = 
      document.querySelector('[rel="author"], .author, .byline, [itemprop="author"]') !== null;
    
    // Check for article-specific features
    const hasShareButtons = 
      document.querySelector('.share, .social, [class*="share-"], [class*="social-"]') !== null;
    
    // Check for related articles or article navigation
    const hasArticleNavigation = 
      document.querySelector('.related, .recommended, .read-more, .next-article, .prev-article') !== null;
    
    // Check for reader comments section
    const hasCommentSection = 
      document.querySelector('.comments, #comments, .discussion, [class*="comment-"]') !== null;
    
    // Check content structure and length
    const extractModule = await initializeExtractModule();
    const extractionOptions = {
      type: extractModule.CONTENT_TYPES.WEBSITE
    };
    
    const extractedText = await extractModule.extractText(extractionOptions);
    const hasSubstantialText = extractedText && extractedText.length > 1500;
    
    // Check paragraph-to-heading ratio (articles typically have multiple paragraphs per heading)
    const paragraphCount = document.querySelectorAll('p').length;
    const headingCount = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    const goodParagraphHeadingRatio = headingCount > 0 && paragraphCount / headingCount > 3;
    
    // Check text formatting
    const hasFormatting = document.querySelectorAll('strong, em, b, i, u, mark, code, pre').length > 0;
    
    // Check for semantic structure
    const hasSemanticStructure = 
      document.querySelectorAll('article, section, header, footer, nav, aside, main').length > 0;
    
    // Check for data tables
    const hasTables = document.querySelectorAll('table').length > 0;
    
    // Composite article score
    const articleScore = 
      (hasArticleTag ? 0.2 : 0) +
      (hasHeadingStructure ? 0.15 : 0) +
      (hasParagraphs ? 0.15 : 0) +
      (hasArticleSchema ? 0.1 : 0) +
      (hasArticleContainer ? 0.1 : 0) +
      (hasPublicationDate ? 0.05 : 0) +
      (hasAuthorInfo ? 0.05 : 0) +
      (hasShareButtons ? 0.02 : 0) +
      (hasArticleNavigation ? 0.03 : 0) +
      (hasCommentSection ? 0.05 : 0) +
      (hasSubstantialText ? 0.15 : 0) +
      (goodParagraphHeadingRatio ? 0.1 : 0) +
      (hasFormatting ? 0.05 : 0) +
      (hasSemanticStructure ? 0.05 : 0) +
      (hasTables ? 0.05 : 0);
    
    const isArticle = articleScore >= ARTICLE_SCORE_THRESHOLD;
    
    // Will be re-used in the future; keep as it is.
    // logToBackground(`[Mochi-Content] Article detection:
    //   - Article tag: ${hasArticleTag}
    //   - Heading structure: ${hasHeadingStructure}
    //   - Paragraphs: ${hasParagraphs}
    //   - Article schema: ${hasArticleSchema}
    //   - Article container: ${hasArticleContainer}
    //   - Publication date: ${hasPublicationDate}
    //   - Author info: ${hasAuthorInfo}
    //   - Share buttons: ${hasShareButtons}
    //   - Article navigation: ${hasArticleNavigation}
    //   - Comment section: ${hasCommentSection}
    //   - Substantial text: ${hasSubstantialText}
    //   - Paragraph-heading ratio: ${goodParagraphHeadingRatio}
    //   - Article language: ${hasFormatting}
    //   - Article score: ${articleScore.toFixed(2)}
    //   - Threshold: ${ARTICLE_SCORE_THRESHOLD}
    //   - Is article: ${isArticle}`);
    
    return isArticle;
  } catch (error) {
    logToBackground('[Mochi-Content] Error detecting article content: ' + error.message, true);
    return false;
  }
}

/**
 * Checks for dynamic content loading through AJAX, WebSockets, or other real-time methods
 * @returns {Promise<boolean>} True if dynamic content loading is detected
 */
async function checkForDynamicLoading() {
  try {
    // Count AJAX requests
    const ajaxCount = await countAjaxRequests();
    
    // Check for WebSocket connections
    const hasWebSockets = Array.from(document.querySelectorAll('script')).some(script => 
      script.textContent && (
        script.textContent.includes('new WebSocket') ||
        script.textContent.includes('WebSocket(')
      )
    );
      
    // Check for EventSource (Server-Sent Events)
    const hasEventSource = Array.from(document.querySelectorAll('script')).some(script => 
      script.textContent && (
        script.textContent.includes('new EventSource') ||
        script.textContent.includes('EventSource(')
      )
    );
    
    // Check for real-time update patterns
    const scriptContent = Array.from(document.querySelectorAll('script'))
      .map(script => script.textContent || '')
      .join(' ');
    
    const realTimePatterns = (scriptContent.match(
      /setInterval|setTimeout|requestAnimationFrame/g
    ) || []).length > 15;
    
    // Check for fetch API usage
    const hasFetchAPI = scriptContent.includes('fetch(');
    
    // Check for mutation observers
    const hasMutationObserver = scriptContent.includes('MutationObserver');
    
    // Check for dynamic DOM updates
    const hasDocumentCreateElement = (scriptContent.match(/document\.createElement/g) || []).length > 10;
    
    return ajaxCount > AJAX_REQUEST_THRESHOLD || 
           hasWebSockets || 
           hasEventSource || 
           realTimePatterns ||
           (hasFetchAPI && hasMutationObserver) ||
           hasDocumentCreateElement;
  } catch (error) {
    logToBackground('[Mochi-Content] Error checking dynamic loading: ' + error.message, true);
    return false;
  }
}

/**
 * Checks for infinite scrolling behavior
 * @returns {boolean} True if infinite scrolling is detected
 */
function checkForInfiniteScrolling() {
  try {
    // Check common indicator elements used by infinite scroll libraries
    const infiniteScrollIndicators = [
      '.infinite-scroll',
      '.infinite-scroll-component',
      '.load-more',
      '.loading-spinner',
      '[aria-label*="loading more"]',
      '[data-testid*="infinite"]',
      '[data-testid*="scroll"]',
      '[class*="infinite"]',
      '[class*="scroll-sentinel"]',
      '[id*="infinite"]'
    ];
    
    const hasIndicators = infiniteScrollIndicators.some(selector => {
      return document.querySelector(selector) !== null;
    });
    
    // Check for scroll event listeners that may indicate infinite scrolling
    const hasScrollListeners = document.addEventListener.toString().includes('scroll');
    
    // Check for very tall containers with overflow (common in infinite scroll)
    const tallContainers = Array.from(document.querySelectorAll('div, main, section'))
      .filter(el => {
        const style = window.getComputedStyle(el);
        return el.scrollHeight > window.innerHeight * 3 && 
               (style.overflow === 'auto' || style.overflow === 'scroll' || 
                style.overflowY === 'auto' || style.overflowY === 'scroll');
      });
    
    const hasTallContainers = tallContainers.length > 0;
    
    logToBackground(`[Mochi-Content] Infinite scroll detection:
      - Scroll indicators: ${hasIndicators}
      - Scroll listeners: ${hasScrollListeners}
      - Tall containers: ${hasTallContainers}`);
    
    return hasIndicators || (hasScrollListeners && hasTallContainers);
  } catch (error) {
    logToBackground('[Mochi-Content] Error checking for infinite scrolling: ' + error.message, true);
    return false;
  }
}

/**
 * Checks for rich JavaScript interfaces that make text extraction difficult
 * @returns {boolean} True if rich JS interface is detected
 */
function checkForRichJSInterface() {
  try {
    // Check for JS frameworks
    const hasFramework = detectJSFrameworks();
    
    // Check for email client patterns (like Outlook)
    const hasEmailClientPatterns = [
      'div[role="grid"]',          // Email list grid
      'div[aria-label="Command Bar"]', // Outlook's command bar
      'div[data-app-section="NavigationPane"]', // Navigation pane
      '.ms-Fabric',                // Microsoft Fabric UI
      '[data-automation-id="CanvasZone"]' // SharePoint/Office patterns
    ].some(selector => document.querySelector(selector) !== null);
    
    // Check for complex UI patterns
    const hasComplexUI = 
      document.querySelectorAll('[role="menu"], [role="dialog"], [role="tooltip"], [role="tablist"]').length > 2 ||
      document.querySelectorAll('[draggable="true"]').length > 0;
    
    // Check for rich text editors
    const hasRichEditor = document.querySelector('[contenteditable="true"]') !== null;
    
    // Check for canvas elements (often used in complex web apps)
    const hasCanvas = document.querySelectorAll('canvas').length > 0;
    
    // Check for custom elements (Web Components)
    const hasCustomElements = Array.from(document.querySelectorAll('*'))
      .some(el => el.tagName && el.tagName.includes('-'));
    
    // Check for shadow DOM (advanced web component usage)
    const hasShadowDOM = Array.from(document.querySelectorAll('*'))
      .some(el => el.shadowRoot);
    
    // Check for heavy event listener usage
    const hasEventListeners = document.querySelectorAll('[onclick], [onchange], [onkeyup], [onkeydown], [onmouseover]').length > 10;
    
    return hasFramework || 
           hasEmailClientPatterns || 
           hasComplexUI || 
           hasRichEditor || 
           hasCanvas || 
           hasCustomElements || 
           hasShadowDOM ||
           hasEventListeners;
  } catch (error) {
    logToBackground('[Mochi-Content] Error checking rich JS interface: ' + error.message, true);
    return false;
  }
}

/**
 * Analyzes DOM complexity and interactivity
 * @returns {number} Complexity score between 0 and 1
 */
function analyzeDomComplexity() {
  try {
    // Count total DOM nodes
    const totalNodes = document.getElementsByTagName('*').length;
    
    // Calculate maximum DOM depth
    const depth = calculateMaxDepth(document.documentElement);
    
    // Count interactive elements
    const interactiveElements = document.querySelectorAll(
      'button, [role="button"], input, select, textarea, [tabindex], a, [onclick], [contenteditable]'
    ).length;
    
    // Count form elements
    const formElements = document.querySelectorAll('form, input, select, textarea, button').length;
    
    // Component density score
    const componentDensity = interactiveElements / (totalNodes || 1);
    
    // Style complexity
    const inlineStyles = document.querySelectorAll('[style]').length;
    const styleSheets = document.styleSheets.length;
    
    // Check for complex layouts
    const hasGrid = document.querySelectorAll('[style*="grid"], [class*="grid"]').length > 0;
    const hasFlex = document.querySelectorAll('[style*="flex"], [class*="flex"]').length > 0;
    
    // Check for iframes
    const hasIframes = document.querySelectorAll('iframe').length > 0;
    
    // Composite score calculation (normalized to 0-1)
    const complexityScore = Math.min(
      (totalNodes / 3000) * 0.25 +
      (depth / 15) * 0.15 +
      (interactiveElements / 50) * 0.2 +
      (formElements / 20) * 0.1 +
      (componentDensity * 10) * 0.1 +
      (inlineStyles / 30) * 0.05 +
      (styleSheets / 5) * 0.05 +
      (hasGrid ? 0.05 : 0) +
      (hasFlex ? 0.03 : 0) +
      (hasIframes ? 0.02 : 0),
      1
    );
    
    return complexityScore;
  } catch (error) {
    logToBackground('[Mochi-Content] Error analyzing DOM complexity: ' + error.message, true);
    return 0;
  }
}

/**
 * Calculates the maximum depth of a DOM element
 * @param {Element} element - The DOM element to analyze
 * @param {number} currentDepth - The current depth in the recursion
 * @returns {number} The maximum depth of the element
 */
function calculateMaxDepth(element, currentDepth = 0) {
  if (!element || !element.children) {
    return currentDepth;
  }
  
  let maxChildDepth = currentDepth;
  
  for (let i = 0; i < element.children.length; i++) {
    const childDepth = calculateMaxDepth(element.children[i], currentDepth + 1);
    maxChildDepth = Math.max(maxChildDepth, childDepth);
  }
  
  return maxChildDepth;
}

/**
 * Assesses the quality of extractable text content
 * @returns {Promise<number>} Quality score between 0 and 1 (higher is better)
 */
async function assessContentQuality() {
  try {
    // Initialize extract module
    const extractModule = await initializeExtractModule();
    const extractionOptions = {
      type: extractModule.CONTENT_TYPES.WEBSITE
    };
    
    // Extract text content
    const extractedText = await extractModule.extractText(extractionOptions);
    
    if (!extractedText || extractedText.length < MIN_TEXT_LENGTH) {
      return 0; // Poor quality if very little text is extracted
    }
    
    // Count content elements
    const paragraphs = document.querySelectorAll('p').length;
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    const lists = document.querySelectorAll('ul, ol').length;
    const contentElements = paragraphs + headings + lists;
    
    if (contentElements < MIN_CONTENT_ELEMENTS) {
      return 0.3; // Poor quality if few content elements
    }
    
    // Check text-to-code ratio
    const htmlSize = document.documentElement.outerHTML.length;
    const textRatio = extractedText.length / htmlSize;
    
    // Check for text formatting
    const hasFormatting = document.querySelectorAll('strong, em, b, i, u, mark, code, pre').length > 0;
    
    // Check for semantic structure
    const hasSemanticStructure = 
      document.querySelectorAll('article, section, header, footer, nav, aside, main').length > 0;
    
    // Check for data tables
    const hasTables = document.querySelectorAll('table').length > 0;
    
    // Composite quality score
    const qualityScore = 
      (Math.min(extractedText.length / 2000, 1) * 0.3) + // Text length (up to 2000 chars)
      (Math.min(contentElements / 20, 1) * 0.2) + // Content elements (up to 20)
      (Math.min(textRatio * 10, 1) * 0.2) + // Text-to-code ratio
      (hasFormatting ? 0.1 : 0) + // Text formatting
      (hasSemanticStructure ? 0.1 : 0) + // Semantic structure
      (hasTables ? 0.1 : 0); // Data tables
    
    return qualityScore;
  } catch (error) {
    logToBackground('[Mochi-Content] Error assessing content quality: ' + error.message, true);
    return 0.5; // Default to middle quality on error
  }
}

/**
 * Initialize the text extraction module
 * @returns {Object} Extract module with necessary functions
 */
async function initializeExtractModule() {
  try {
    const extractModuleUrl = chrome.runtime.getURL('extract-text.js');
    return await import(extractModuleUrl);
  } catch (error) {
    logToBackground('[Mochi-Content] Error initializing extract module: ' + error.message, true);
    throw error;
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
      // First show the chat toggle if it's hidden before toggling the interface
      showChatToggle();
      toggleChatInterface();
      break;
      
    case "logFromContent":
      logToBackground(message.message, message.isError);
      break;
      
    case "removeDomainFromHidden":
      if (message.domain) {
        removeDomainFromHiddenList(message.domain)
          .then(success => {
            sendResponse({ success });
            if (success) {
              // Show the chat toggle if on the domain that was just removed
              const currentDomain = extractBaseDomain(window.location.href);
              if (currentDomain === message.domain) {
                showChatToggle();
              }
            }
          })
          .catch(error => {
            logToBackground('[Mochi-Content] Error in removeDomainFromHidden: ' + error.message, true);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Indicates async response
      }
      sendResponse({ success: false, error: 'No domain provided' });
      break;
      
    case "getHiddenDomains":
      getHiddenDomains()
        .then(domains => {
          sendResponse({ success: true, domains });
        })
        .catch(error => {
          logToBackground('[Mochi-Content] Error in getHiddenDomains: ' + error.message, true);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates async response
  }
  
  return true;
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
    
    // Initialize KaTeX options
    initializeKaTeX();
    
    // Check if chat toggle should be hidden based on domain BEFORE creating UI
    const shouldHide = await shouldHideChatToggle();
    
    // Create UI components with visibility based on domain preferences
    if (shouldHide) {
      // Create UI in hidden state first
      logToBackground(`[Mochi-Content] Domain is in hidden list, creating UI in hidden state`);
      
      // Create chat interface (always needed for toggle chat command)
      await createChatInterface();
      hideChatInterface();
      
      // Create input but keep it hidden
      await initializeChatInputHidden();
    } else {
      // Normal initialization (visible)
      await initializeChatInput();
      await createChatInterface();
      hideChatInterface();
    }
    
    // Check if the current page is a PDF
    const isPDF = document.contentType === 'application/pdf' || 
                  window.location.href.toLowerCase().endsWith('.pdf');
    
    // Extract page text and only check for dynamic web app if not a PDF
    const extractionPromise = extractPageText();
    
    if (isPDF) {
      logToBackground('[Mochi-Content] PDF detected, skipping dynamic web app check');
      // For PDFs, we'll default to non-dynamic behavior
      updateModelBasedOnDynamicDetection(false);
      window.mochiDynamicDetectionComplete = true;
    } else {
      // Only run checkIfDynamicWebApp for non-PDF pages
      const dynamicCheckPromise = checkIfDynamicWebApp();
      // Wait for both extraction and dynamic check to complete
      await Promise.all([extractionPromise, dynamicCheckPromise]);
    }
    
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

// Add a debug function to check if elements are properly hidden
window.mochiDebugHideButton = function() {
  console.log('[Mochi-Debug] Checking hide button functionality');
  const chatToggle = document.getElementById('mochi-chat-input-container');
  const hideButton = document.getElementById('mochi-chat-toggle-hide-button');
  
  if (chatToggle) {
    console.log('[Mochi-Debug] Chat toggle found:', chatToggle);
    console.log('[Mochi-Debug] Current styles:', {
      display: window.getComputedStyle(chatToggle).display,
      visibility: window.getComputedStyle(chatToggle).visibility,
      opacity: window.getComputedStyle(chatToggle).opacity,
      zIndex: window.getComputedStyle(chatToggle).zIndex,
      classes: chatToggle.className
    });
    
    // Force hide with all methods
    chatToggle.classList.add('mochi-chat-toggle-hidden');
    chatToggle.style.display = 'none';
    chatToggle.style.visibility = 'hidden';
    chatToggle.style.opacity = '0';
    console.log('[Mochi-Debug] After applying all hide methods:');
    console.log({
      display: window.getComputedStyle(chatToggle).display,
      visibility: window.getComputedStyle(chatToggle).visibility,
      opacity: window.getComputedStyle(chatToggle).opacity
    });
  } else {
    console.log('[Mochi-Debug] Chat toggle not found!');
  }
  
  if (hideButton) {
    console.log('[Mochi-Debug] Hide button found:', hideButton);
    hideButton.style.display = 'none';
  } else {
    console.log('[Mochi-Debug] Hide button not found!');
  }
};

/**
 * Detects if modern JavaScript frameworks are in use
 * @returns {boolean} True if a JS framework is detected
 */
function detectJSFrameworks() {
  try {
    // Check for React
    const hasReact = 
      !!document.querySelector('[data-reactroot], [data-reactid], [data-react-checksum]') ||
      !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
      Array.from(document.querySelectorAll('*')).some(el => 
        Object.keys(el).some(key => key.startsWith('__react'))
      );
    
    // Check for Angular
    const hasAngular = 
      !!document.querySelector('[ng-version], [ng-app], [data-ng-app], .ng-binding, .ng-scope') ||
      typeof window.angular !== 'undefined' ||
      !!document.querySelector('app-root');
    
    // Check for Vue
    const hasVue = 
      !!document.querySelector('[data-v-], [v-cloak], [v-html]') ||
      typeof window.__VUE__ !== 'undefined' ||
      Array.from(document.querySelectorAll('*')).some(el => 
        el.__vue__ || (el.__vue_app__ && el.__vue_app__._context)
      );
    
    // Check for Ember
    const hasEmber = 
      typeof window.Ember !== 'undefined' ||
      document.querySelector('[data-ember-action]') !== null;
    
    // Check for jQuery
    const hasJQuery = 
      typeof window.jQuery !== 'undefined' || 
      typeof window.$ !== 'undefined';
    
    // Check for Microsoft's Fluent UI (used in Outlook)
    const hasFluentUI = 
      !!document.querySelector('.ms-Fabric, .ms-Button, .ms-TextField, .ms-Dialog, .ms-Panel') ||
      !!document.querySelector('[class*="ms-"]');
    
    // Check for Google's Material Design
    const hasMaterialDesign = 
      !!document.querySelector('.mdc-button, .mat-button, .material-icons') ||
      !!document.querySelector('[class*="mat-"]');
    
    return hasReact || hasAngular || hasVue || hasEmber || (hasJQuery && hasFluentUI) || hasMaterialDesign;
  } catch (error) {
    logToBackground('[Mochi-Content] Error detecting JS frameworks: ' + error.message, true);
    return false;
  }
}

/**
 * Counts the number of AJAX requests made by the page
 * @returns {Promise<number>} The number of AJAX requests
 */
async function countAjaxRequests() {
  try {
    // Initialize a counter for AJAX requests
    let ajaxCount = 0;
    
    // Create a proxy for the XMLHttpRequest object
    const originalXMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXMLHttpRequest();
      
      // Override the send method to count AJAX requests
      xhr.send = function() {
        ajaxCount++;
        return originalXMLHttpRequest.prototype.send.apply(xhr, arguments);
      };
      
      return xhr;
    };
    
    // Create a proxy for the fetch API
    const originalFetch = window.fetch;
    window.fetch = function() {
      ajaxCount++;
      return originalFetch.apply(window, arguments);
    };
    
    // Wait for a short period to allow AJAX requests to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Restore the original XMLHttpRequest and fetch implementations
    window.XMLHttpRequest = originalXMLHttpRequest;
    window.fetch = originalFetch;
    
    return ajaxCount;
  } catch (error) {
    logToBackground('[Mochi-Content] Error counting AJAX requests: ' + error.message, true);
    return 0;
  }
}
