/**
 * Test script for Mochi Chat API with extension message format
 * Tests various message structures from extension/chat.js
 */

import('node-fetch').then(({ default: fetch }) => {
  require('dotenv').config();

  const API_URL = 'https://mochi-chat-api-v2-ngwr9s4nn-maniifold.vercel.app/api/chat';

  /**
   * Send request to chat API and handle streaming response
   * @param {Object} body - Request body
   * @returns {Promise<void>}
   */
  async function sendRequest(body) {
    try {
      console.log('\nSending request:', JSON.stringify(body, null, 2));
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
      }

      // Handle streaming response
      const text = await response.text();
      console.log('\nRaw response:', text);
      
      const lines = text.split('\n');
      let fullResponse = '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('\nFull response:', fullResponse);
            console.log('\nStream complete');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              console.error('Error:', parsed.error);
            } else if (parsed.content) {
              process.stdout.write(parsed.content);
              fullResponse += parsed.content;
            }
          } catch (e) {
            console.log('Parse error:', e.message);
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  async function runTests() {
    console.log('Starting Mochi Chat API Tests with Extension Message Format\n');

    // Test 1: Basic text prompt
    await sendRequest({
      messages: [
        {
          role: 'user',
          content: 'What is 2+2?'
        }
      ],
      provider: 'openai',
      model: 'gpt-4o-mini'
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Text prompt with history
    await sendRequest({
      messages: [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '2 + 2 = 4' },
        { role: 'user', content: 'What did I just ask you?' }
      ],
      provider: 'openai',
      model: 'gpt-4o-mini'
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Text prompt with image
    await sendRequest({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this screenshot?' },
            { 
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                detail: 'high'
              }
            }
          ]
        }
      ],
      provider: 'openai',
      model: 'gpt-4o'
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: Multi-turn conversation with mixed content
    await sendRequest({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this screenshot?' },
            { 
              type: 'image_url',
              image_url: {
                url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                detail: 'high'
              }
            }
          ]
        },
        {
          role: 'assistant',
          content: 'I see a simple 1x1 pixel black image.'
        },
        {
          role: 'user',
          content: 'What color was the pixel?'
        }
      ],
      provider: 'openai',
      model: 'gpt-4o'
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 5: Error case - empty messages
    await sendRequest({
      messages: [],
      provider: 'openai',
      model: 'gpt-4o-mini'
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 6: Error case - no user message
    await sendRequest({
      messages: [
        { role: 'assistant', content: 'Hello!' }
      ],
      provider: 'openai',
      model: 'gpt-4o-mini'
    });

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 7: Error case - invalid content format
    await sendRequest({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'unknown', data: 'test' }
          ]
        }
      ],
      provider: 'openai',
      model: 'gpt-4o-mini'
    });
  }

  runTests().catch(console.error);
});
