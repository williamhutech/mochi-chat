/**
 * Conversation Manager Module for Mochi Chat Extension
 * 
 * This module manages the conversation history and context for the chat interface.
 * It handles storing extracted text, maintaining conversation flow, and managing
 * the AI instructions and context.
 * 
 * Key Features:
 * - Conversation history management
 * - Context preservation
 * - AI instruction management
 * - Message history tracking
 * 
 * @module conversation
 */

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
- When asked about a question involving some calculation, simply provide the answer/end result, and one line of work to show you have done the maths.
- Unless explicitly requested, share full calculation, only use Katex if appropriate. 

Main instruction/ask: `;

//=============================================================================
// State Management
//=============================================================================

/**
 * Conversation history array
 * Stores all messages in the conversation including system context
 * @type {Array<{role: string, content: string}>}
 */
let conversationHistory = [];

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
export function addExtractedText(extractedText) {
  try {
    // Clear existing history when new text is extracted
    conversationHistory = [];
    
    // Add system message with extracted text and instructions
    conversationHistory.push({
      role: 'system',
      content: extractedText + '\n\n' + CHAT_INSTRUCTIONS
    });
    
    logToBackground('Added extracted text to conversation history');
  } catch (error) {
    logToBackground('Failed to add extracted text: ' + error.message, true);
    throw error;
  }
}

/**
 * Add messages to conversation history
 * Appends new messages while preserving context
 * Handles both simple text messages and complex formats (text + image)
 * 
 * @param {Array<{role: string, content: string|Array}>} messages - Array of message objects
 * @returns {void}
 * @throws {Error} If no history exists or addition fails
 */
export function addToHistory(messages) {
  try {
    // Don't add if no history (means no extracted text)
    if (conversationHistory.length === 0) {
      const error = 'Cannot add messages - no extracted text in history';
      logToBackground(error, true);
      throw new Error(error);
    }
    
    // Ensure messages is an array
    const messagesToAdd = Array.isArray(messages) ? messages : [messages];
    
    // Add each message, handling both string and array content types
    messagesToAdd.forEach(message => {
      if (message && typeof message === 'object' && 'role' in message) {
        // For complex messages (like those with screenshots), preserve the entire structure
        conversationHistory.push(message);
        
        // Log the type of message being added
        const contentType = Array.isArray(message.content) ? 'complex' : 'text';
        logToBackground(`Added ${contentType} message from ${message.role}`);
      } else {
        logToBackground('Invalid message format: ' + JSON.stringify(message), true);
      }
    });
    
    logToBackground(`Added ${messagesToAdd.length} messages to history. Total: ${conversationHistory.length}`);
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
export function getHistory() {
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
