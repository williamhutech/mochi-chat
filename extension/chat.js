/**
 * Chat Module for Mochi Chat Extension
 * 
 * This module handles API interactions and response streaming for multiple AI providers.
 * It manages communication with AI models (Gemini and OpenAI) and handles
 * real-time response processing and delivery.
 * 
 * Architectural Responsibilities:
 * 1. User Interaction
 *    - Handle user input and commands
 *    - Process user preferences and settings
 * 
 * 2. UI Updates
 *    - Update chat interface in real-time
 *    - Display streaming responses
 *    - Show loading states and errors
 * 
 * 3. Local Storage
 *    - Manage conversation history
 *    - Store user preferences
 *    - Cache responses when needed
 * 
 * 4. Message Passing
 *    - Communication between content/background scripts
 *    - Event handling for UI updates
 *    - Chrome extension messaging
 * 
 * Note: This module focuses on client-side functionality.
 * API calls and provider-specific logic are handled by the backend.
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

/**
 * Current selected AI provider
 * @type {string}
 */
const CURRENT_PROVIDER = AI_PROVIDERS.OPENAI;

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
  [AI_PROVIDERS.OPENAI]: 'gpt-4o',
  [AI_PROVIDERS.GEMINI]: 'gemini-2.0-flash-exp'
};

/**
 * API Configuration
 * Production endpoint for Mochi Chat API
 */
const API_ENDPOINT = 'https://mochi-chat-gb30ssit2-maniifold.vercel.app/api/chat';

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
 * Generate response using ChatGPT
 * Manages the streaming connection and response handling
 * 
 * @param {string} prompt - User input prompt
 * @param {string} [screenshot] - Optional screenshot data URL
 * @param {Object} config - AI configuration
 * @param {string} config.provider - AI provider to use
 * @param {string} config.model - Model to use for this request
 * @returns {Promise<void>}
 */
export async function generateChatGPTResponse(prompt, screenshot, config) {
  try {
    // Reset accumulated response
    accumulatedResponse = '';
    
    // Get conversation history
    const history = await getHistory();
    const messages = [];
    
    // Add history items
    for (const item of history) {
      messages.push({ role: item.role, content: item.content });
    }
    
    // Add current prompt with screenshot if available
    if (screenshot) {
      messages.push({
        role: 'user',
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: screenshot } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }
    
    // Stream response based on provider
    if (config.provider === AI_PROVIDERS.OPENAI) {
      await streamOpenAIResponse(messages, config.model);
    } else if (config.provider === AI_PROVIDERS.GEMINI) {
      await streamGeminiResponse(messages);
    }
    
    // Add the prompt to history
    if (screenshot) {
      await addToHistory({
        role: 'user',
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: screenshot } }
        ]
      });
    } else {
      await addToHistory({ role: 'user', content: prompt });
    }
    await addToHistory({ role: 'assistant', content: accumulatedResponse });
    
  } catch (error) {
    logToBackground(`Error generating response: ${error}`, true);
    sendToContent({
      action: 'updateStreamingResponse',
      error: error.message,
      isFinal: true
    });
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
 * @param {string} model - The OpenAI model to use
 * @returns {Promise<Object>} Object indicating success or failure
 * @throws {Error} If streaming fails
 */
async function streamOpenAIResponse(messages, model) {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages,
        provider: AI_PROVIDERS.OPENAI,
        model
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
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            } else if (parsed.content) {
              accumulatedResponse += parsed.content;
              logToBackground(`Sending processed chunk to content: ${parsed.content}`);
              sendToContent({
                action: 'updateStreamingResponse',
                text: parsed.content,
                isFinal: false
              });
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
            logToBackground(`Parse error: ${e.message}`);
          }
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
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages,
        provider: AI_PROVIDERS.GEMINI,
        model: 'gemini-pro'
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
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            } else if (parsed.content) {
              accumulatedResponse += parsed.content;
              logToBackground(`Sending processed chunk to content: ${parsed.content}`);
              sendToContent({
                action: 'updateStreamingResponse',
                text: parsed.content,
                isFinal: false
              });
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
            logToBackground(`Parse error: ${e.message}`);
          }
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
 * Process and stream text with optimized chunk handling
 * @param {string} text - Text to be streamed
 * @returns {Promise<void>}
 */
async function streamTextInChunks(text) {
  const CHUNK_SIZE = 3; // Reduced from 6 to 3 characters for smoother streaming
  const DELAY_MS = 2; // Reduced from 5ms to 2ms for more frequent updates
  
  // Split text into chunks while preserving word boundaries
  const words = text.split(/(\s+|\p{P}+)/u);
  let currentChunk = '';
  
  for (const word of words) {
    if (word.length <= CHUNK_SIZE) {
      // Short words, spaces, and punctuation are sent as is
      accumulatedResponse += word;
      sendToContent({
        action: 'updateStreamingResponse',
        text: word,
        isFinal: false
      });
      
      // Only add delay for actual words, not spaces or punctuation
      if (!/^[\s\p{P}]+$/u.test(word)) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    } else {
      // Split longer words into chunks
      for (let i = 0; i < word.length; i += CHUNK_SIZE) {
        const chunk = word.slice(i, Math.min(i + CHUNK_SIZE, word.length));
        accumulatedResponse += chunk;
        sendToContent({
          action: 'updateStreamingResponse',
          text: chunk,
          isFinal: false
        });
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
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
