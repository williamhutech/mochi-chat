/**
 * Conversation Manager Module for Mochi Chat Extension
 * 
 * This module manages the conversation history and context for the chat interface.
 * It handles storing extracted text, maintaining conversation flow, and managing
 * the AI instructions and context.
 * 
 * Key Features:
 * - Conversation history management with typed messages
 * - Context preservation with standardized content types
 * - AI instruction management
 * - Message history tracking with validation
 * 
 * @module conversation
 */

//=============================================================================
// Module State
//=============================================================================

let initialized = false;
let MessageRole;
let ContentType;
let isValidRole;
let isValidContent;
let createTextContent;
let conversationHistory = [];

/**
 * Track pending prompt requests and extraction status
 * @type {Array<{resolve: Function}>}
 */
let pendingPrompts = [];

/**
 * Flag to track if text extraction is complete
 * @type {boolean}
 */
let isExtractionComplete = false;

/**
 * Initialize required modules
 * @returns {Promise<void>}
 */
export async function initializeModules() {
  if (initialized) return;
  
  try {
    // Import module registry
    const moduleRegistryUrl = chrome.runtime.getURL('module-registry.js');
    const { getModule } = await import(moduleRegistryUrl);
    
    // Load message types
    const messageTypes = await getModule('types/message.js');
    ({ 
      MessageRole, 
      ContentType,
      isValidRole,
      isValidContent,
      createTextContent
    } = messageTypes);
    
    // Initialize empty conversation history
    conversationHistory = [];
    
    initialized = true;
    logToBackground('[Mochi-Conversation] Modules initialized successfully');
  } catch (error) {
    logToBackground('[Mochi-Conversation] Error initializing modules: ' + error.message, true);
    throw error;
  }
}

//=============================================================================
// Constants and Configuration
//=============================================================================

/**
 * Base instructions for the AI model
 * These instructions shape how the AI responds to user queries
 * 
 * Guidelines:
 * - Keep responses concise and straightforward
 * - Use bullet points for clarity
 * - Page-specific responses when requested
 * - Clear calculation explanations
 * 
 * @constant {string}
 */
const CHAT_INSTRUCTIONS = `Based on the text above:
- **Provide a straightforward, concise response**
- Use bullet points or numbering when appropriate
- Only when asked about which page, answer the page numbers from the PDF text and in relevance to the query or most recent conversation.
- When asked about a question involving some calculation, show full calculation and answer, only up to 2 decimals.
- To display complex math, you must wrap your expressions with: "$$...$$" and for inline math, use: "$…$".

Main instruction/ask: `;

//=============================================================================
// State Management
//=============================================================================

/**
 * Conversation history array
 * Stores all messages in the conversation including system messages
 * @type {Array<import('./types/message.js').Message>}
 */

//=============================================================================
// Extraction Status Management
//=============================================================================

/**
 * Set extraction completion status and process any pending prompts
 * 
 * @param {boolean} complete - Whether extraction is complete
 * @returns {void}
 */
export function setExtractionComplete(complete = true) {
  isExtractionComplete = complete;
  
  // Process any pending prompts when extraction completes
  if (complete && pendingPrompts.length > 0) {
    logToBackground(`[Mochi-Conversation] Processing ${pendingPrompts.length} pending prompts after extraction completion`);
    // Process all pending prompts in FIFO order
    while (pendingPrompts.length > 0) {
      const nextPrompt = pendingPrompts.shift();
      nextPrompt.resolve();
    }
  }
}

/**
 * Queue prompt if extraction is not complete
 * Returns a promise that resolves when extraction is complete
 * 
 * @returns {Promise<void>} Promise that resolves when ready to process prompt
 */
export function queuePromptIfNeeded() {
  if (!isExtractionComplete) {
    logToBackground('[Mochi-Conversation] Extraction not complete, queuing prompt');
    return new Promise(resolve => {
      pendingPrompts.push({ resolve });
    });
  }
  return Promise.resolve();
}

/**
 * Check if extraction is complete
 * 
 * @returns {boolean} Whether extraction is complete
 */
export function isTextExtractionComplete() {
  return isExtractionComplete;
}

//=============================================================================
// History Management Functions
//=============================================================================

/**
 * Add extracted text to conversation history
 * Resets history and sets up initial system context with AI instructions
 * 
 * @param {string} extractedText - The extracted document text to add as context
 * @returns {void}
 * @throws {Error} If text addition fails
 */
export async function addExtractedText(extractedText) {
  await initializeModules();
  try {
    // Clear existing history when new text is extracted
    conversationHistory = [];
        
    // Add system message with extracted text and instructions
    const systemMessage = {
      role: MessageRole.SYSTEM,
      content: createTextContent(extractedText + '\n\n' + CHAT_INSTRUCTIONS)
    };
    
    conversationHistory.push(systemMessage);
    
    // To re-use in the future; do not delete.
    // logToBackground('=== Current Conversation History ===');
    // conversationHistory.forEach((msg, i) => {
    //   logToBackground(`Message ${i + 1}:`);
    //   logToBackground(`Role: ${msg.role}`);
    //   logToBackground(`Content: ${JSON.stringify(msg.content, null, 2)}`);
    //   logToBackground('---');
    // });
    
    // Mark extraction as complete and process any pending prompts
    setExtractionComplete(true);
    
    logToBackground('[Mochi-Conversation] Added extracted text to conversation history');
  } catch (error) {
    logToBackground('[Mochi-Conversation] Failed to add extracted text: ' + error.message, true);
    // Even on error, mark extraction as complete to prevent hanging
    setExtractionComplete(true);
    throw error;
  }
}

/**
 * Add messages to conversation history
 * Appends new messages while preserving context
 * Handles both simple text messages and complex formats (text + image)
 * 
 * @param {Array<import('./types/message.js').Message>|import('./types/message.js').Message} messages - Message object(s) to add
 * @returns {void}
 * @throws {Error} If no history exists or addition fails
 */
export async function addToHistory(messages) {
  await initializeModules();
  
  try {
    // Convert single message to array for consistent handling
    const messageArray = Array.isArray(messages) ? messages : [messages];
    
    logToBackground(`[Mochi-Conversation] Number of messages to add: ${messageArray.length}`);
    logToBackground(`[Mochi-Conversation] Role: ${messageArray[0]?.role || 'unknown'}`);
    logToBackground(`[Mochi-Conversation] Original Content:\n${JSON.stringify(messageArray[0]?.content, null, 2)}`);
    
    // Validate and process each message
    for (const message of messageArray) {
      // Validate role
      if (!isValidRole(message.role)) {
        throw new Error('Invalid message role');
      }
      
      // Handle string content by converting to proper TextContent
      if (typeof message.content === 'string') {
        logToBackground('Converting string content to TextContent');
        message.content = createTextContent(message.content);
        logToBackground('Converted Content:', JSON.stringify(message.content, null, 2));
      }
      
      // Validate content after potential conversion
      if (!isValidContent(message.content)) {
        logToBackground('Invalid content format:', JSON.stringify(message.content, null, 2));
        throw new Error('Invalid message content format');
      }
      
      // Add message to history
      conversationHistory.push(message);
    }
    
    logToBackground('=== Current Conversation History ===');
    conversationHistory.forEach((msg, i) => {
      logToBackground(`Message ${i + 1}:`);
      logToBackground(`Role: ${msg.role}`);
      logToBackground(`Content: ${JSON.stringify(msg.content, null, 2)}`);
      logToBackground('---');
    });
    
    logToBackground('Added messages to history');
  } catch (error) {
    logToBackground('Failed to add to history: ' + error.message, true);
    throw error;
  }
}

/**
 * Get current conversation history
 * Returns the full conversation context including system messages
 * 
 * @returns {Array<{role: string, content: string}>} Array of message objects
 */
export async function getHistory() {
  await initializeModules();
  return conversationHistory;
}

/**
 * Clear conversation history
 * Resets the conversation state to empty
 * Used when starting fresh or handling errors
 * 
 * @returns {void}
 */
export function clearHistory() {
  try {
    conversationHistory = [];
    logToBackground('History cleared successfully');
  } catch (error) {
    logToBackground('Failed to clear history: ' + error.message, true);
    throw error;
  }
}

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Log to background console with module identifier
 * Sends logs to background script for centralized logging
 * 
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
 * @returns {void}
 */
function logToBackground(message, isError = false) {
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message,
    source: 'Mochi-Conversation',
    isError
  });
}
