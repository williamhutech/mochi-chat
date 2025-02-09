/**
 * Gemini Integration Module for Mochi Chat
 * 
 * This module handles API interactions and response streaming for Google's Gemini AI.
 * It manages real-time response processing and delivery through server-sent events.
 * 
 * Key Features:
 * - Gemini API integration with gemini-2.0-flash
 * - Real-time response streaming
 * - Support for text and image inputs (multi-modal)
 * - Message history processing
 * 
 * Image Handling Process:
 * 1. Images are received as base64 data URLs
 * 2. The data URL is parsed to extract:
 *    - MIME type (e.g., image/png, image/jpeg)
 *    - Base64 data (without the data URL prefix)
 * 3. For Gemini API:
 *    - Images are sent as inline_data in the parts array
 *    - Each part can be either text or image data
 *    - Images require mime_type and base64 data
 * 4. Both chat and single message modes support images
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Role mapping from OpenAI format to Gemini format
 * Gemini only accepts 'user' and 'model' roles
 * @constant {Object}
 */
const ROLE_MAPPING = {
  'user': 'user',
  'assistant': 'model',
  'system': 'model'
};

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
   * Extract MIME type and base64 data from data URL
   * 
   * @param {string} dataUrl - Data URL string
   * @returns {Object} Object containing MIME type and base64 data
   */
  parseDataUrl(dataUrl) {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }
    return {
      mimeType: matches[1],
      data: matches[2]
    };
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
   * @param {string} model - Gemini model to use (e.g., 'gemini-2.0-flash')
   * @param {object} res - HTTP response object for streaming
   * @param {object} [options] - Additional options
   * @param {string} [options.screenshot] - Base64 image data
   * @param {Array<object>} [options.history] - Previous conversation history
   * @returns {Promise<void>} Resolves when streaming is complete
   * @throws {Error} If streaming or API call fails
   */
  async streamResponse(prompt, model, res, options = {}) {
    console.log('[Mochi-API] Starting Gemini stream with model:', model);
    
    try {
      const geminiModel = this.client.getGenerativeModel({ model: model });
      
      // If we have history, use chat mode
      if (options.history && options.history.length > 0) {
        const chat = geminiModel.startChat({
          history: this.formatHistoryForGemini(options.history)
        });

        // If screenshot is provided, include it in the message
        if (options.screenshot) {
          const { mimeType, data } = this.parseDataUrl(options.screenshot);
          const result = await chat.sendMessageStream({
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: data
                  }
                }
              ]
            }]
          });
          await this.processStream(result, res);
        } else {
          const result = await chat.sendMessageStream(prompt);
          await this.processStream(result, res);
        }
      } else {
        // For single messages
        if (options.screenshot) {
          const { mimeType, data } = this.parseDataUrl(options.screenshot);
          const result = await geminiModel.generateContentStream({
            contents: [{
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: data
                  }
                }
              ]
            }]
          });
          await this.processStream(result, res);
        } else {
          const result = await geminiModel.generateContentStream(prompt);
          await this.processStream(result, res);
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
   * Process the Gemini response stream
   * Handles chunk processing and response accumulation
   * 
   * @param {object} result - Gemini response stream
   * @param {object} res - HTTP response object
   * @returns {Promise<string>} Accumulated response
   */
  async processStream(result, res) {
    let accumulatedResponse = '';
    let currentChunk = '';
    
    for await (const chunk of result.stream) {
      const content = this.processGeminiChunk(chunk);
      if (content) {
        currentChunk += content;
        
        // Process chunk when it reaches optimal size or contains sentence ending
        if (currentChunk.length >= 4 || /[.!?]\s*$/.test(currentChunk)) {
          await this.streamTextChunk(currentChunk, res);
          accumulatedResponse += currentChunk;
          currentChunk = '';
        }
      }
    }
    
    // Send any remaining text
    if (currentChunk) {
      await this.streamTextChunk(currentChunk, res);
      accumulatedResponse += currentChunk;
    }
    
    return accumulatedResponse;
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

  /**
   * Stream a chunk of text to the client
   * Handles the actual sending of text through server-sent events
   * 
   * @param {string} text - Text chunk to stream
   * @param {object} res - HTTP response object
   * @returns {Promise<void>}
   */
  async streamTextChunk(text, res) {
    return new Promise((resolve) => {
      res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      resolve();
    });
  }

  /**
   * Format conversation history for Gemini API
   * Converts OpenAI-style history to Gemini format
   * Maps roles from OpenAI format to Gemini format
   * 
   * @param {Array<object>} history - Conversation history in OpenAI format
   * @returns {Array<object>} History formatted for Gemini
   */
  formatHistoryForGemini(history) {
    return history.map(msg => ({
      role: ROLE_MAPPING[msg.role] || 'user',
      parts: [{ text: msg.content }]
    }));
  }
}

module.exports = GeminiHandler;
