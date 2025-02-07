/**
 * Gemini Integration Handler
 * Manages streaming chat completions from Google's Gemini API
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiHandler {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  /**
   * Stream chat completion response
   * @param {string} prompt - User input prompt
   * @param {object} res - HTTP response object for streaming
   */
  async streamResponse(prompt, _, res) {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      const result = await model.generateContentStream(prompt);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
    } catch (error) {
      console.error('[Gemini Stream Error]:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
