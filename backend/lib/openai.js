/**
 * OpenAI Integration Module for Mochi Chat
 * 
 * This module handles API interactions and response streaming for OpenAI.
 * It manages real-time response processing and delivery through server-sent events.
 * 
 * Key Features:
 * - OpenAI API integration
 * - Real-time response streaming
 * - Error handling and recovery
 * - Message processing and formatting
 */

const OpenAI = require('openai');

/**
 * OpenAI handler class for managing API interactions
 * Provides methods for streaming responses and processing chunks
 */
class OpenAIHandler {
  /**
   * Initialize OpenAI client with API key
   * Validates API key presence and sets up client instance
   * 
   * @throws {Error} If OPENAI_API_KEY environment variable is not configured
   */
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      console.error('[Mochi-API] OpenAI API key not configured');
      throw new Error('OpenAI API key not configured');
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('[Mochi-API] OpenAI handler initialized');
  }

  /**
   * Stream response from OpenAI API
   * Manages the streaming connection and chunk processing
   * 
   * Process:
   * 1. Initialize connection to OpenAI
   * 2. Stream response chunks
   * 3. Process and accumulate text
   * 4. Send updates through server-sent events
   * 
   * @param {string} prompt - User input prompt to send to OpenAI
   * @param {string} model - OpenAI model to use (e.g., 'gpt-4', 'gpt-3.5-turbo')
   * @param {object} res - HTTP response object for streaming
   * @returns {Promise<void>} Resolves when streaming is complete
   * @throws {Error} If streaming or API call fails
   */
  async streamResponse(prompt, model, res) {
    console.log('[Mochi-API] Starting OpenAI stream with model:', model);
    
    try {
      const messages = [{ role: 'user', content: prompt }];
      const stream = await this.client.chat.completions.create({
        model: model,
        messages: messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = this.processStreamChunk(chunk);
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      console.log('[Mochi-API] OpenAI stream completed successfully');
      res.write('data: [DONE]\n\n');
    } catch (error) {
      console.error('[Mochi-API] OpenAI Stream Error:', error);
      throw error;
    }
  }

  /**
   * Process a chunk of streaming data from OpenAI
   * Handles parsing and extraction of content from stream chunks
   * 
   * @param {object} chunk - Raw chunk data from the stream
   * @returns {string} Processed text from the chunk, or empty string if no content
   */
  processStreamChunk(chunk) {
    try {
      if (chunk.choices && chunk.choices[0]?.delta?.content) {
        return chunk.choices[0].delta.content;
      }
      return '';
    } catch (error) {
      console.error('[Mochi-API] OpenAI Chunk Processing Error:', error);
      return '';
    }
  }
}

module.exports = OpenAIHandler;
