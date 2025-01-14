/**
 * Chat Module for Mochi Chat Extension
 * 
 * This module handles API interactions and response streaming for multiple AI providers.
 * It manages communication with AI models (Gemini and OpenAI) and handles
 * real-time response processing and delivery.
 * 
 * Key Features:
 * - Multiple AI provider support (Gemini, OpenAI)
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
 * AI Provider Configuration
 * Currently supports Gemini and OpenAI
 */
const AI_PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai'
};

const CURRENT_PROVIDER = AI_PROVIDERS.GEMINI;

/**
 * API Keys for different providers
 */
const API_KEYS = {
  [AI_PROVIDERS.OPENAI]: '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',
  [AI_PROVIDERS.GEMINI]: 'AIzaSyDrjcE-XasBhvv38xr8ra7hGHcG7DpwMA8' // Replace with actual key
};

/**
 * Model configuration for different providers
 */
const AI_MODELS = {
  [AI_PROVIDERS.OPENAI]: 'gpt-4o-mini',
  [AI_PROVIDERS.GEMINI]: 'gemini-2.0-flash-exp'
};

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
 * Generate chat response using selected AI provider
 * Main entry point for chat functionality
 * 
 * Process:
 * 1. Reset accumulated response
 * 2. Get conversation history
 * 3. Stream response from selected provider
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
    
    let response;
    if (CURRENT_PROVIDER === AI_PROVIDERS.GEMINI) {
      logToBackground('Starting Gemini stream');
      response = await streamGeminiResponse(messages);
    } else {
      logToBackground('Starting OpenAI stream');
      response = await streamOpenAIResponse(messages);
    }
    
    if (response.success) {
      logToBackground('Stream completed, adding to history');
      await addToHistory([
        { role: 'user', content: prompt },
        { role: 'assistant', content: accumulatedResponse }
      ]);
    } else {
      throw new Error(response.error || `Failed to get response from ${CURRENT_PROVIDER}`);
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
        'Authorization': `Bearer ${API_KEYS[AI_PROVIDERS.OPENAI]}`
      },
      body: JSON.stringify({
        model: AI_MODELS[AI_PROVIDERS.OPENAI],
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

/**
 * Stream response from Gemini
 * Manages the streaming connection and chunk processing for Gemini
 * 
 * Process:
 * 1. Initialize connection to Gemini
 * 2. Stream response chunks
 * 3. Process and accumulate text
 * 4. Send updates to UI
 * 
 * @param {Array<Object>} messages - Array of message objects for Gemini
 * @returns {Promise<Object>} Object indicating success or failure
 * @throws {Error} If streaming fails
 */
async function streamGeminiResponse(messages) {
  try {
    logToBackground('Initializing Gemini stream');
    
    // Format the conversation history for Gemini
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Combine all messages into a single context string
    let contextString = formattedMessages.map(msg => 
      `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.parts[0].text}`
    ).join('\n\n');
    
    // Add the final instruction
    contextString += '\n\nHuman: ' + messages[messages.length - 1].content + '\n\nAssistant: ';
    
    logToBackground('Sending request with context');
    
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEYS[AI_PROVIDERS.GEMINI]
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: contextString
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let isInJson = false;
    let jsonDepth = 0;

    while (true) {
      const { value, done } = await reader.read();
      
      if (done) {
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      logToBackground(`Raw Gemini chunk: ${chunk}`);
      
      // Process the chunk character by character to properly handle JSON boundaries
      for (let char of chunk) {
        if (char === '{') {
          if (!isInJson) {
            isInJson = true;
          }
          jsonDepth++;
          buffer += char;
        } else if (char === '}') {
          jsonDepth--;
          buffer += char;
          if (jsonDepth === 0 && isInJson) {
            try {
              const parsed = JSON.parse(buffer);
              if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                const text = parsed.candidates[0].content.parts[0].text;
                accumulatedResponse += text;
                logToBackground(`Processed Gemini text: ${text}`);
                sendToContent({
                  action: 'updateStreamingResponse',
                  text: text,
                  isFinal: false
                });
              }
            } catch (e) {
              logToBackground(`Error parsing complete JSON: ${e.message}`, true);
            }
            buffer = '';
            isInJson = false;
          }
        } else if (isInJson) {
          buffer += char;
        }
      }
    }
    
    logToBackground('Sending final update');
    sendToContent({
      action: 'updateStreamingResponse',
      isFinal: true
    });
    
    return { success: true };
    
  } catch (error) {
    logToBackground(`Error in Gemini stream: ${error}`, true);
    return { success: false, error: error.message };
  }
}

/**
 * Process a chunk of streaming data from Gemini
 * Handles parsing and extraction of content from stream chunks
 * 
 * @param {string} chunk - Raw chunk data from the stream
 * @returns {string} Processed text from the chunk
 */
function processGeminiChunk(chunk) {
  try {
    const lines = chunk.split('\n').filter(line => line.trim() !== '');
    
    let processedText = '';
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          processedText += text;
        }
      } catch (e) {
        logToBackground(`Error parsing Gemini chunk JSON: ${e}`, true);
      }
    }
    
    return processedText;
  } catch (error) {
    logToBackground(`Error processing Gemini chunk: ${error}`, true);
    return '';
  }
}
