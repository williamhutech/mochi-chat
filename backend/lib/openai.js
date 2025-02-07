/**
 * OpenAI Integration Handler
 * Manages streaming chat completions from OpenAI
 */

import OpenAI from 'openai';

export class OpenAIHandler {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Stream chat completion response
   * @param {string} prompt - User input prompt
   * @param {string} model - OpenAI model to use
   * @param {object} res - HTTP response object for streaming
   */
  async streamResponse(prompt, model, res) {
    try {
      const messages = [{ role: 'user', content: prompt }];
      
      const stream = await this.openai.chat.completions.create({
        model: model || 'gpt-3.5-turbo',
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
    } catch (error) {
      console.error('[OpenAI Stream Error]:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
