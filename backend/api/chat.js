/**
 * Chat API Module for Mochi Chat
 * 
 * This module serves as the main API endpoint for the Mochi Chat extension.
 * It handles incoming chat requests and manages responses from multiple AI providers.
 * 
 * Architectural Responsibilities:
 * 1. API Routing
 *    - Handle incoming HTTP requests
 *    - Route requests to appropriate providers
 *    - Manage CORS and HTTP headers
 * 
 * 2. Request Validation
 *    - Validate required parameters
 *    - Check provider and model availability
 *    - Sanitize inputs
 * 
 * 3. Response Streaming
 *    - Stream AI responses in real-time
 *    - Manage server-sent events
 *    - Handle connection lifecycle
 * 
 * 4. Error Handling
 *    - Catch and process errors
 *    - Format error responses
 *    - Provide detailed logs
 * 
 * Note: This module focuses on server-side functionality.
 * UI updates and local storage are handled by the extension.
 * 
 * @module chat
 */

const OpenAIHandler = require('../lib/openai');
const GeminiHandler = require('../lib/gemini');

export const config = {
  api: {
    bodyParser: true,
  },
};

//=============================================================================
// Configuration
//=============================================================================

/**
 * AI Provider Configuration
 * Currently supports Gemini and OpenAI
 * @constant {Object}
 */
const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini'
};

/**
 * Default AI Models for each provider
 * Matches models used in the extension
 * @constant {Object}
 */
const AI_MODELS = {
  [AI_PROVIDERS.OPENAI]: 'gpt-4o',
  [AI_PROVIDERS.GEMINI]: 'gemini-2.0-flash'
};

/**
 * Error messages for different scenarios
 * @constant {Object}
 */
const ERROR_MESSAGES = {
  MISSING_PROMPT: 'Prompt is required',
  INVALID_PROVIDER: 'Invalid provider',
  INVALID_MODEL: 'Invalid provider or model not found',
  STREAM_ERROR: 'Error streaming response',
  PROVIDER_ERROR: 'Provider error',
};

/**
 * Extract text and image content from message
 * @param {Object} message - Message object from extension
 * @returns {Object} Extracted content and screenshot
 */
function extractContent(message) {
  if (!Array.isArray(message.content)) {
    return { text: message.content, screenshot: null };
  }

  const textPart = message.content.find(part => part.type === 'text');
  const imagePart = message.content.find(part => part.type === 'image_url');

  return {
    text: textPart?.text || '',
    screenshot: imagePart?.image_url?.url || null
  };
}

/**
 * Process messages array to extract latest prompt and screenshot
 * @param {Array} messages - Array of message objects
 * @returns {Object} Latest prompt and screenshot
 */
function processMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Invalid messages format');
  }

  // Get the last user message
  const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  return extractContent(lastUserMessage);
}

//=============================================================================
// Request Handler
//=============================================================================

/**
 * Chat API request handler
 * Processes incoming requests and manages AI provider responses
 * 
 * @param {object} req - HTTP request object
 * @param {object} req.body - Request body containing messages and configuration
 * @param {Array<object>} req.body.messages - Array of message objects
 * @param {string} [req.body.provider] - AI provider to use (default: 'openai')
 * @param {string} [req.body.model] - Model to use for the selected provider
 * @param {object} res - HTTP response object
 * @returns {Promise<void>} Resolves when response is complete
 */
module.exports = async (req, res) => {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.log('[Mochi-API] Rejected non-POST request:', req.method);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Log environment state
    console.log('[Mochi-API] Environment:', {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY
    });

    // Extract and validate request parameters
    const { messages, provider = AI_PROVIDERS.OPENAI, model } = req.body;

    // Extract prompt and screenshot from messages
    const { text: prompt, screenshot } = processMessages(messages);

    console.log('[Mochi-API] Processing request:', {
      provider,
      model: model || AI_MODELS[provider],
      promptLength: prompt?.length,
      hasScreenshot: !!screenshot,
      historyLength: messages.length - 1
    });

    // Validate required fields
    if (!prompt) {
      console.log('[Mochi-API] Missing prompt in request');
      res.status(400).json({ error: ERROR_MESSAGES.MISSING_PROMPT });
      return;
    }

    // Validate provider
    if (!Object.values(AI_PROVIDERS).includes(provider)) {
      console.log('[Mochi-API] Invalid provider:', provider);
      res.status(400).json({ error: ERROR_MESSAGES.INVALID_PROVIDER });
      return;
    }

    // Use default model if not specified
    const selectedModel = model || AI_MODELS[provider];
    if (!selectedModel) {
      console.log('[Mochi-API] Invalid model for provider:', provider);
      res.status(400).json({ error: ERROR_MESSAGES.INVALID_MODEL });
      return;
    }

    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initialize appropriate handler and stream response
    let handler;
    let response;
    
    if (provider === AI_PROVIDERS.OPENAI) {
      handler = new OpenAIHandler();
    } else if (provider === AI_PROVIDERS.GEMINI) {
      handler = new GeminiHandler();
    } else {
      throw new Error(ERROR_MESSAGES.INVALID_PROVIDER);
    }

    // Create history array without the latest prompt
    const history = messages.slice(0, -1);

    // Stream response with all options
    response = await handler.streamResponse(prompt, selectedModel, res, {
      screenshot,
      history
    });

    res.end();
  } catch (error) {
    console.error('[Mochi-API] Chat API Error:', error);
    
    // If headers haven't been sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({ 
        error: error.message || ERROR_MESSAGES.STREAM_ERROR,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      // If streaming has started, send error in stream format
      res.write(`data: ${JSON.stringify({ 
        error: error.message || ERROR_MESSAGES.STREAM_ERROR
      })}\n\n`);
      res.end();
    }
  }
};
