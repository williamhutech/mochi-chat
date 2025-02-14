/**
 * OpenAI Integration Module for Mochi Chat
 * 
 * This module handles API interactions and response streaming for OpenAI.
 * It manages real-time response processing and delivery through server-sent events.
 * 
 * Key Features:
 * - OpenAI API integration with GPT-4o and GPT-4o-mini
 * - Real-time response streaming with standardized message types
 * - Support for text and image inputs with content validation
 * - Message history processing with type safety
 */

const OpenAI = require('openai');
const { 
  MessageRole, 
  ContentType,
  isValidRole,
  isValidContent,
  isTextContent,
  isImageUrlContent,
  createTextContent
} = require('../types/message');

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
   * Manages the streaming connection and chunk processing with type validation
   * 
   * Process:
   * 1. Initialize connection to OpenAI
   * 2. Stream response chunks
   * 3. Process and accumulate text
   * 4. Send updates through server-sent events
   * 
   * @param {string} prompt - User input prompt to send to OpenAI
   * @param {string} model - OpenAI model to use (e.g., 'gpt-4o', 'gpt-4o-mini')
   * @param {object} res - HTTP response object for streaming
   * @param {object} [options] - Additional options
   * @param {string} [options.screenshot] - Base64 image data for vision models
   * @param {Array<object>} [options.history] - Previous conversation history
   * @returns {Promise<void>} Resolves when streaming is complete
   * @throws {Error} If streaming or API call fails or validation fails
   */
  async streamResponse(prompt, model, res, options = {}) {
    console.log('[Mochi-API] Starting OpenAI stream with model:', model);
    
    try {
      // Validate history if provided
      const messages = [];
      if (options.history) {
        options.history.forEach((msg, index) => {
          if (!isValidRole(msg.role)) {
            throw new Error(`Invalid role in history message at index ${index}`);
          }
          if (!isValidContent(msg.content)) {
            throw new Error(`Invalid content in history message at index ${index}`);
          }
          messages.push(msg);
        });
      }
      
      // Create user message with proper content structure
      const userMessage = {
        role: MessageRole.USER,
        content: options.screenshot ? [
          createTextContent(prompt),
          {
            type: ContentType.IMAGE_URL,
            image_url: {
              url: options.screenshot,
              detail: 'high'
            }
          }
        ] : createTextContent(prompt)
      };
      
      messages.push(userMessage);

      // Create stream with validated messages
      const stream = await this.client.chat.completions.create({
        model: model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: Array.isArray(msg.content) 
            ? msg.content 
            : msg.content.text || msg.content
        })),
        stream: true,
      });

      // Process stream chunks
      let accumulatedResponse = '';
      let currentChunk = '';
      
      for await (const chunk of stream) {
        const content = this.processStreamChunk(chunk);
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

      console.log('[Mochi-API] OpenAI stream completed successfully');
      res.write('data: [DONE]\n\n');
      
      // Return accumulated response for history
      return accumulatedResponse;
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
}

module.exports = OpenAIHandler;
