// OpenAI API Key
const API_KEY = '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';

/**
 * Chat module for Mochi Chat
 * Handles OpenAI interactions and response streaming
 */

import { getHistory, addToHistory } from './conversation.js';

// Track accumulated response
let accumulatedResponse = '';

/**
 * Log to background console with module identifier
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
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
 * @param {Object} message - Message to send
 */
function sendToContent(message) {
  try {
    // Since we're in a content script context, we can dispatch a custom event
    window.dispatchEvent(new CustomEvent('mochiChatUpdate', { detail: message }));
  } catch (error) {
    logToBackground(`Error sending message: ${error}`, true);
  }
}

/**
 * Generate chat response using OpenAI
 * Handles conversation flow, history management, and streaming
 * @param {string} prompt - User's input prompt
 * @returns {Promise<void>} Resolves when response is complete
 */
export async function generateChatGPTResponse(prompt) {
  accumulatedResponse = ''; // Reset at start
  
  try {
    logToBackground('Getting conversation history');
    const history = await getHistory();
    
    // Don't proceed if no history (means no extracted text)
    if (history.length === 0) {
      throw new Error('No conversation context available. Please extract text first.');
    }
    
    // Add user's prompt to messages
    const messages = [
      ...history,
      { role: 'user', content: prompt }
    ];
    
    logToBackground('Starting OpenAI stream');
    const response = await streamOpenAIResponse(messages);
    
    if (response.success) {
      logToBackground('Stream completed, adding to history');
      // Add conversation to history
      await addToHistory([
        { role: 'user', content: prompt },
        { role: 'assistant', content: accumulatedResponse }
      ]);
      
    } else {
      throw new Error(response.error || 'Failed to get response from OpenAI');
    }
    
  } catch (error) {
    logToBackground(`Error generating response: ${error}`, true);
    // Dispatch error event
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
 * @param {string} chunk - Raw chunk data from the stream
 * @returns {string} Processed text from the chunk
 */
function processStreamChunk(chunk) {
  try {
    // Parse the chunk data
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
 * Handles chunk processing and UI updates
 * @param {Array<Object>} messages - Array of message objects for OpenAI
 * @returns {Promise<Object>} Object indicating success or failure
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
      
      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete messages from buffer
      const newlineIndex = buffer.lastIndexOf('\n');
      if (newlineIndex !== -1) {
        const completeChunks = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        
        const processedText = processStreamChunk(completeChunks);
        if (processedText) {
          // Accumulate response
          accumulatedResponse += processedText;
          
          // Send processed update to content script
          logToBackground(`Sending processed chunk to content: ${processedText}`);
          sendToContent({
            action: 'updateStreamingResponse',
            text: processedText,
            isFinal: false
          });
        }
      }
    }
    
    // Process any remaining buffer content
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
    
    // Send final update - just signal completion without resending text
    logToBackground('Sending final update');
    sendToContent({
      action: 'updateStreamingResponse',
      isFinal: true
    });
    
    return { success: true };
  } catch (error) {
    logToBackground(`Error streaming response: ${error}`, true);
    sendToContent({
      action: 'updateStreamingResponse',
      error: error.message
    });
    return { success: false, error: error.message };
  }
}
