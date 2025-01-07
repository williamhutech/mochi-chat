/**
 * Conversation manager for Mochi Chat
 * Handles conversation history and context management
 */

// Instructions for the AI model
const CHAT_INSTRUCTIONS = `Based on the text above:
- **Provide a straightforward, concise response**
- Use bullet points or numbering when appropriate
- Only when asked about a specific page, provide a response based on the page text alone.
- Only when asked about which page, answer the page numbers from the PDF text and in relevance to the query or most recent conversation.
- When asked about a question involving some calculation, simply provide the answer/end result, and one line of work in human language (i.e. Profit Margin = Net Income / Revenue)

Main instruction/ask: `;

// Conversation history
let conversationHistory = [];

/**
 * Add extracted text to conversation history
 * This should be called when text is successfully extracted
 * @param {string} extractedText - The extracted document text
 */
export function addExtractedText(extractedText) {
  // Clear existing history when new text is extracted
  conversationHistory = [];
  
  // Add system message with extracted text and instructions
  conversationHistory.push({
    role: 'system',
    content: extractedText + '\n\n' + CHAT_INSTRUCTIONS
  });
  
  logToBackground('Added extracted text to conversation history');
}

/**
 * Add messages to conversation history
 * @param {Array<Object>} messages - Array of message objects {role, content}
 */
export function addToHistory(messages) {
  // Don't add if no history (means no extracted text)
  if (conversationHistory.length === 0) {
    logToBackground('Cannot add messages - no extracted text in history', true);
    return;
  }
  
  conversationHistory.push(...messages);
  logToBackground(`Added ${messages.length} messages to history`);
}

/**
 * Get current conversation history
 * @returns {Array<Object>} Array of message objects
 */
export function getHistory() {
  return conversationHistory;
}

/**
 * Clear conversation history
 */
export function clearHistory() {
  conversationHistory = [];
  logToBackground('Conversation history cleared');
}

/**
 * Log to background console
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error
 */
function logToBackground(message, isError = false) {
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message,
    source: 'Mochi-Conversation',
    isError
  });
}
