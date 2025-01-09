/**
 * Chat Module for Mochi Chat Extension
 * 
 * This module handles all OpenAI API interactions and response streaming.
 * It manages the communication with OpenAI's GPT model and handles
 * real-time response processing and delivery.
 * 
 * Key Features:
 * - OpenAI API integration
 * - Real-time response streaming
 * - Error handling and recovery
 * - Message processing and formatting
 * 
 * @module chat
 */

//=============================================================================
// Configuration and Imports
//=============================================================================

/**
 * Dynamic import of conversation module
 * Using dynamic import as per extension guidelines
 */
const conversationModule = await import(chrome.runtime.getURL('./conversation.js'));
const { getHistory, addToHistory } = conversationModule;

/**
 * OpenAI API Key
 */
const API_KEY = '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';

//=============================================================================
// State Management
//=============================================================================

/**
 * Accumulated response from the streaming API
 * Used to build complete response for history
 * @type {string}
 */
let accumulatedResponse = '';

//=============================================================================
// Utility Functions
//=============================================================================

/**
 * Log to background console with module identifier
 * Centralizes logging through background script
 * 
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
 * @returns {void}
 */
function logToBackground(message, isError = false) {
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message: `[Mochi-Chat] ${message}`,
    isError
  });
}

/**
 * Send message to content script
 * Handles communication with main content script
 * 
 * @param {Object} message - Message to send
 * @param {string} message.action - Action type for the message
 * @param {string} [message.text] - Text content if any
 * @param {boolean} [message.isFinal] - Whether this is the final message
 * @param {string} [message.error] - Error message if any
 * @returns {void}
 */
function sendToContent(message) {
  try {
    window.dispatchEvent(new CustomEvent('mochiChatUpdate', { detail: message }));
  } catch (error) {
    logToBackground(`Error sending message: ${error}`, true);
  }
}

//=============================================================================
// OpenAI Integration
//=============================================================================

/**
 * Generate chat response using OpenAI
 * Main entry point for chat functionality
 * 
 * Process:
 * 1. Reset accumulated response
 * 2. Get conversation history
 * 3. Stream response from OpenAI
 * 4. Update history with completed conversation
 * 
 * @param {string} prompt - User's input prompt
 * @returns {Promise<void>} Resolves when response is complete
 * @throws {Error} If response generation fails
 */
export async function generateChatGPTResponse(prompt) {
  accumulatedResponse = ''; // Reset at start
  
  try {
    logToBackground('Getting conversation history');
    const history = await getHistory();
    
    if (history.length === 0) {
      throw new Error('No conversation context available. Please extract text first.');
    }
    
    const messages = [
      ...history,
      { role: 'user', content: prompt }
    ];
    
    logToBackground('Starting OpenAI stream');
    const response = await streamOpenAIResponse(messages);
    
    if (response.success) {
      logToBackground('Stream completed, adding to history');
      await addToHistory([
        { role: 'user', content: prompt },
        { role: 'assistant', content: accumulatedResponse }
      ]);
    } else {
      throw new Error(response.error || 'Failed to get response from OpenAI');
    }
    
  } catch (error) {
    logToBackground(`Error generating response: ${error}`, true);
    sendToContent({
      action: 'updateStreamingResponse',
      error: error.message,
      isFinal: true
    });
    throw error;
  }
}

/**
 * Process a chunk of streaming data from OpenAI
 * Handles parsing and extraction of content from stream chunks
 * 
 * @param {string} chunk - Raw chunk data from the stream
 * @returns {string} Processed text from the chunk
 */
function processStreamChunk(chunk) {
  try {
    const lines = chunk.split('\n').filter(line => line.trim() !== '');
    
    let processedText = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;
          if (content) {
            processedText += content;
          }
        } catch (e) {
          logToBackground(`Error parsing chunk JSON: ${e}`, true);
        }
      }
    }
    
    return processedText;
  } catch (error) {
    logToBackground(`Error processing chunk: ${error}`, true);
    return '';
  }
}

/**
 * Stream response from OpenAI
 * Manages the streaming connection and chunk processing
 * 
 * Process:
 * 1. Initialize connection to OpenAI
 * 2. Stream response chunks
 * 3. Process and accumulate text
 * 4. Send updates to UI
 * 
 * @param {Array<Object>} messages - Array of message objects for OpenAI
 * @returns {Promise<Object>} Object indicating success or failure
 * @throws {Error} If streaming fails
 */
async function streamOpenAIResponse(messages) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      const newlineIndex = buffer.lastIndexOf('\n');
      if (newlineIndex !== -1) {
        const completeChunks = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        
        const processedText = processStreamChunk(completeChunks);
        if (processedText) {
          accumulatedResponse += processedText;
          
          logToBackground(`Sending processed chunk to content: ${processedText}`);
          sendToContent({
            action: 'updateStreamingResponse',
            text: processedText,
            isFinal: false
          });
        }
      }
    }
    
    if (buffer.trim()) {
      const processedText = processStreamChunk(buffer.trim());
      if (processedText) {
        accumulatedResponse += processedText;
        sendToContent({
          action: 'updateStreamingResponse',
          text: processedText,
          isFinal: false
        });
      }
    }
    
    logToBackground('Sending final update');
    sendToContent({
      action: 'updateStreamingResponse',
      isFinal: true
    });
    
    return { success: true };
    
  } catch (error) {
    logToBackground(`Error in OpenAI stream: ${error}`, true);
    return { success: false, error: error.message };
  }
}
