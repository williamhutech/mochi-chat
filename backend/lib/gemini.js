/**
 * Gemini Integration Module for Mochi Chat
 * 
 * This module handles API interactions and response streaming for Google's Gemini AI.
 * It manages real-time response processing and delivery through server-sent events.
 * 
 * Key Features:
 * - Gemini API integration
 * - Real-time response streaming
 * - Error handling and recovery
 * - Message processing and formatting
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Gemini handler class for managing API interactions
 * Provides methods for streaming responses and processing chunks
 */
class GeminiHandler {
  /**
   * Initialize Gemini client with API key
   * Validates API key presence and sets up client instance
   * 
   * @throws {Error} If GEMINI_API_KEY environment variable is not configured
   */
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      console.error('[Mochi-API] Gemini API key not configured');
      throw new Error('Gemini API key not configured');
    }
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('[Mochi-API] Gemini handler initialized');
  }

  /**
   * Stream response from Gemini API
   * Manages the streaming connection and chunk processing
   * 
   * Process:
   * 1. Initialize connection to Gemini
   * 2. Stream response chunks
   * 3. Process and accumulate text
   * 4. Send updates through server-sent events
   * 
   * @param {string} prompt - User input prompt to send to Gemini
   * @param {string} model - Gemini model to use (e.g., 'gemini-pro')
   * @param {object} res - HTTP response object for streaming
   * @returns {Promise<void>} Resolves when streaming is complete
   * @throws {Error} If streaming or API call fails
   */
  async streamResponse(prompt, model, res) {
    console.log('[Mochi-API] Starting Gemini stream with model:', model);
    
    try {
      const geminiModel = this.client.getGenerativeModel({ model: model });
      const result = await geminiModel.generateContentStream(prompt);

      for await (const chunk of result.stream) {
        const content = this.processGeminiChunk(chunk);
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      console.log('[Mochi-API] Gemini stream completed successfully');
      res.write('data: [DONE]\n\n');
    } catch (error) {
      console.error('[Mochi-API] Gemini Stream Error:', error);
      throw error;
    }
  }

  /**
   * Process a chunk of streaming data from Gemini
   * Handles parsing and extraction of content from stream chunks
   * 
   * @param {object} chunk - Raw chunk data from the stream
   * @returns {string} Processed text from the chunk, or empty string if no content
   */
  processGeminiChunk(chunk) {
    try {
      const text = chunk.text();
      return text || '';
    } catch (error) {
      console.error('[Mochi-API] Gemini Chunk Processing Error:', error);
      return '';
    }
  }
}

module.exports = GeminiHandler;
