/**
 * Chat API Module for Mochi Chat
 * 
 * This module serves as the main API endpoint for the Mochi Chat extension.
 * It handles incoming chat requests and manages responses from multiple AI providers.
 * 
 * Key Features:
 * - Multiple AI provider support (Gemini, OpenAI)
 * - Real-time response streaming
 * - Error handling and recovery
 * - CORS and HTTP method handling
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
  GEMINI: 'gemini',
  OPENAI: 'openai'
};

/**
 * Default AI Models for each provider
 * @constant {Object}
 */
const AI_MODELS = {
  [AI_PROVIDERS.OPENAI]: 'gpt-4',
  [AI_PROVIDERS.GEMINI]: 'gemini-pro'
};

/**
 * Chat API request handler
 * Processes incoming requests and manages AI provider responses
 * 
 * @param {object} req - HTTP request object
 * @param {object} req.body - Request body containing prompt and configuration
 * @param {string} req.body.prompt - User input prompt
 * @param {string} [req.body.provider] - AI provider to use (default: 'openai')
 * @param {string} [req.body.model] - Model to use for the selected provider
 * @param {object} res - HTTP response object
 * @returns {Promise<void>} Resolves when response is complete
 */
module.exports = async function handler(req, res) {
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
    const { prompt, provider = AI_PROVIDERS.OPENAI, model } = req.body;

    console.log('[Mochi-API] Processing request:', {
      provider,
      model: model || AI_MODELS[provider],
      promptLength: prompt?.length
    });

    // Validate required fields
    if (!prompt) {
      console.log('[Mochi-API] Missing prompt in request');
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    // Use default model if not specified
    const selectedModel = model || AI_MODELS[provider];
    if (!selectedModel) {
      throw new Error('Invalid provider or model not found');
    }

    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initialize appropriate handler and stream response
    let handler;
    if (provider === AI_PROVIDERS.OPENAI) {
      handler = new OpenAIHandler();
    } else if (provider === AI_PROVIDERS.GEMINI) {
      handler = new GeminiHandler();
    } else {
      throw new Error('Invalid provider');
    }

    await handler.streamResponse(prompt, selectedModel, res);
    res.end();
  } catch (error) {
    console.error('[Mochi-API] Chat API Error:', error);
    
    // If headers haven't been sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // If streaming has started, send error in stream format
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}
