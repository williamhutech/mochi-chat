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
 *    - Manage conversation history with typed messages
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
 * Module references
 * Will be initialized when needed
 */
let initialized = false;
let conversationModule;
let messageTypes;
let MessageRole;
let ContentType;
let createTextContent;
let getHistory;
let addToHistory;
let isRequestInProgress = false;
let accumulatedResponse = '';

/**
 * Initialize required modules
 * @returns {Promise<void>}
 */
export async function initializeModules() {
  if (initialized) return;
  
  try {
    // Load message types
    messageTypes = await import(chrome.runtime.getURL('./types/message.js'));
    ({ MessageRole, ContentType, createTextContent } = messageTypes);
    
    // Load conversation module
    conversationModule = await import(chrome.runtime.getURL('./conversation.js'));
    ({ getHistory, addToHistory } = conversationModule);
    await conversationModule.initializeModules();
    
    initialized = true;
    logToBackground('[Mochi-Chat] Modules initialized successfully');
  } catch (error) {
    logToBackground('[Mochi-Chat] Error initializing modules: ' + error.message, true);
    throw error;
  }
}

/**
 * AI Provider Configuration
 * Defines available AI providers and their models
 */
export const AI_PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai'
};

/**
 * Model Configuration
 * Maps providers to their default models
 */
export const AI_MODELS = {
  [AI_PROVIDERS.OPENAI]: {
    default: 'gpt-4o-mini',
    webApp: 'gpt-4o'
  },
  [AI_PROVIDERS.GEMINI]: 'gemini-2.0-flash'
};

/**
 * Current selected AI provider
 * @type {string}
 */
const CURRENT_PROVIDER = AI_PROVIDERS.OPENAI;

/**
 * API endpoint for chat requests
 * @constant {string}
 */
const API_ENDPOINT = 'https://mochi-chat-api-v2-87qjyr33a-maniifold.vercel.app/api/chat';

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
 * @param {import('./types/message.js').Message} userMessage - User message with proper structure
 * @param {Object} config - AI configuration
 * @param {string} config.provider - AI provider to use
 * @param {string} config.model - Model to use for this request
 * @returns {Promise<void>}
 */
export async function generateChatGPTResponse(userMessage, config) {
  if (isRequestInProgress) {
    logToBackground('Request already in progress, skipping');
    return false;
  }
  
  try {
    isRequestInProgress = true;
    accumulatedResponse = '';
    
    // Log the incoming request details
    logToBackground('[Mochi-Chat] === Generating Chat Response ===');
    logToBackground(`[Mochi-Chat] User Message:\n${JSON.stringify(userMessage, null, 2)}`);
    logToBackground(`[Mochi-Chat] Config:\n${JSON.stringify(config, null, 2)}`);
    
    // Get conversation history
    const history = await getHistory();
    logToBackground(`[Mochi-Chat] History Length: ${history.length}`);

    // Add user message to history first
    await addToHistory(userMessage);
    
    // Prepare messages array for API request
    const messages = [...history, userMessage];
    
    // Enhanced logging for request details
    logToBackground('[Mochi-Chat] === Request Details ===');
    logToBackground(`[Mochi-Chat] Provider: ${config.provider}`);
    logToBackground(`[Mochi-Chat] Model: ${config.model}`);
    logToBackground('[Mochi-Chat] Message Content Types:');
    userMessage.content.forEach((content, i) => {
      logToBackground(`[Mochi-Chat] Content ${i + 1}: ${content.type}`);
    });
    
    let success = false;
    if (config.provider === AI_PROVIDERS.OPENAI) {
      const model = typeof config.model === 'object' ? config.model.default : config.model;
      logToBackground(`[Mochi-Chat] Using OpenAI model: ${model}`);
      success = await streamOpenAIResponse(messages, model);
    } else if (config.provider === AI_PROVIDERS.GEMINI) {
      logToBackground(`[Mochi-Chat] Using Gemini model: ${config.model}`);
      success = await streamGeminiResponse(messages, config.model);
    }
    
    // Only add assistant response if we got a successful response
    if (success && accumulatedResponse) {
      // Add assistant response to history with proper structure
      await addToHistory({ 
        role: MessageRole.ASSISTANT,
        content: createTextContent(accumulatedResponse)
      });
    }
    
    return success;
  } catch (error) {
    logToBackground('Error generating response: ' + error.message, true);
    throw error;
  } finally {
    isRequestInProgress = false;
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
 * @returns {Promise<boolean>} True if streaming was successful, false otherwise
 * @throws {Error} If streaming fails
 */
async function streamOpenAIResponse(messages, model) {
  try {
    logToBackground('[Mochi-Chat] Starting OpenAI stream...');
    const requestBody = {
      messages: messages.map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content) ? msg.content : [msg.content]
      })),
      provider: AI_PROVIDERS.OPENAI,
      model
    };
    
    // Enhanced request logging
    logToBackground('[Mochi-Chat] === API Request Details ===');
    logToBackground(`[Mochi-Chat] Selected Model: ${model}`);
    logToBackground(`[Mochi-Chat] Message Count: ${messages.length}`);
    logToBackground(`[Mochi-Chat] Last Message Content Types: ${JSON.stringify(messages[messages.length - 1].content.map(c => c.type))}`);
    logToBackground(`[Mochi-Chat] Full Request:\n${JSON.stringify(requestBody, null, 2)}`);
    
    logToBackground('[Mochi-Chat] Sending request to API endpoint');
    logToBackground(`[Mochi-Chat] Request Body:\n${JSON.stringify(requestBody, null, 2)}`);
    
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    logToBackground(`[Mochi-Chat] API Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      logToBackground('[Mochi-Chat] API Error Response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        logToBackground('[Mochi-Chat] Stream complete');
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
              throw new Error(parsed.error.message || 'Unknown API error');
            }
            
            // Handle different response formats
            const content = parsed.choices?.[0]?.delta?.content || // OpenAI format
                          parsed.content || // Custom API format
                          parsed.text || ''; // Generic format
            
            if (content) {
              accumulatedResponse += content;
              logToBackground(`[Mochi-Chat] Streaming Chunk: "${content}"`);
              sendToContent({
                action: 'updateStreamingResponse',
                text: content,
                isFinal: false
              });
            }
          } catch (e) {
            logToBackground(`[Mochi-Chat] Parse error: ${e.message}, data: ${data}`, true);
          }
        }
      }
    }
    
    logToBackground('[Mochi-Chat] Sending final update');
    sendToContent({
      action: 'updateStreamingResponse',
      isFinal: true
    });
    
    return true;
    
  } catch (error) {
    logToBackground(`[Mochi-Chat] Error in OpenAI stream: ${error}`, true);
    sendToContent({
      action: 'updateStreamingResponse',
      error: error.message,
      isFinal: true
    });
    return false;
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
 * @param {string} model - The model to use
 * @returns {Promise<Object>} Object indicating success or failure
 * @throws {Error} If streaming fails
 */
async function streamGeminiResponse(messages, model) {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages,
        provider: AI_PROVIDERS.GEMINI,
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
              logToBackground(`[Mochi-Chat] Sending processed chunk to content: ${parsed.content}`);
              sendToContent({
                action: 'updateStreamingResponse',
                text: parsed.content,
                isFinal: false
              });
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
            logToBackground(`[Mochi-Chat] Parse error: ${e.message}`);
          }
        }
      }
    }
    
    logToBackground('[Mochi-Chat] Sending final update');
    sendToContent({
      action: 'updateStreamingResponse',
      isFinal: true
    });
    
    return { success: true };
    
  } catch (error) {
    logToBackground(`[Mochi-Chat] Error in Gemini stream: ${error}`, true);
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
        logToBackground(`[Mochi-Chat] Error parsing Gemini chunk JSON: ${e}`, true);
      }
    }
    
    return processedText;
  } catch (error) {
    logToBackground(`[Mochi-Chat] Error processing Gemini chunk: ${error}`, true);
    return '';
  }
}
