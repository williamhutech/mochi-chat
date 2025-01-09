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
- Only when asked about a specific page, provide a response based on the page text alone.
- Only when asked about which page, answer the page numbers from the PDF text and in relevance to the query or most recent conversation.
- When asked about a question involving some calculation, simply provide the answer/end result, and one line of work in human language (i.e. Profit Margin = Net Income / Revenue)

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
 * 
 * @param {Array<{role: string, content: string}>} messages - Array of message objects
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
    
    conversationHistory.push(...messages);
    logToBackground(`Added to history. History now has ${messages.length} messages.`);
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
