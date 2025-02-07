/**
 * Main Chat API Endpoint
 * Handles chat requests and streams responses from various AI providers
 */

import { OpenAIHandler } from '../lib/openai';
import { GeminiHandler } from '../lib/gemini';

export const config = {
  api: {
    bodyParser: true,
  },
};

/**
 * Chat API endpoint that handles streaming responses from OpenAI and Gemini
 * Includes authentication bypass for Vercel deployment
 * 
 * @param {object} req - HTTP request object
 * @param {object} res - HTTP response object
 */
export default async function handler(req, res) {
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
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Debug logging
    console.log('[Mochi-API] Environment:', {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      openAIKeyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 5) : 'none'
    });

    // Log request for debugging
    console.log('[Mochi-API] Received chat request:', {
      method: req.method,
      headers: req.headers,
      url: req.url
    });

    const { prompt, provider, model } = req.body;

    // Validate required fields
    if (!prompt || !provider || !model) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Validate API keys
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Handle different providers
    if (provider === 'openai') {
      const handler = new OpenAIHandler();
      await handler.streamResponse(prompt, model, res);
    } else if (provider === 'gemini') {
      const handler = new GeminiHandler();
      await handler.streamResponse(prompt, model, res);
    } else {
      throw new Error('Invalid provider');
    }

    res.write('data: [DONE]\n\n');
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
