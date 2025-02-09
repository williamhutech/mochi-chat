# Mochi Chat API Test Cases

This document outlines the test cases for both OpenAI and Gemini providers. Run these tests after any significant changes to ensure functionality.

## Test Setup

Base URL: `https://your-api-url.vercel.app/api/chat`
HTTP Method: POST
Content-Type: application/json

## OpenAI Tests (Model: gpt-4o-mini)

### 1. Basic Query
```json
{
  "prompt": "What is 2+2?",
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```
Expected: Simple numerical response

### 2. Conversation History
```json
{
  "prompt": "What did I just ask you?",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "history": [
    {"role": "user", "content": "What is 2+2?"},
    {"role": "assistant", "content": "2 + 2 = 4"}
  ]
}
```
Expected: Reference to previous question

### 3. Multi-turn Conversation
```json
{
  "prompt": "And what was my answer?",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "history": [
    {"role": "user", "content": "What is 2+2?"},
    {"role": "assistant", "content": "2 + 2 = 4"},
    {"role": "user", "content": "What did I just ask you?"},
    {"role": "assistant", "content": "You asked me what 2+2 is."}
  ]
}
```
Expected: Reference to previous answer

### 4. Complex Prompt with Code
```json
{
  "prompt": "Write a simple JavaScript function to calculate factorial of a number",
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```
Expected: Well-formatted code with comments

### 5. Error Handling
```json
{
  "prompt": "What is 2+2?",
  "provider": "openai",
  "model": "invalid-model"
}
```
Expected: Appropriate error message

### 6. Image Processing
```json
{
  "prompt": "What do you see in this image?",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "screenshot": "data:image/png;base64,..."
}
```
Expected: Description of image content

### 7. Image with History
```json
{
  "prompt": "What color did you see in the image?",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "history": [
    {"role": "user", "content": "What do you see in this image?"},
    {"role": "assistant", "content": "I see a solid red square."}
  ]
}
```
Expected: Reference to previously described image

## Gemini Tests (Model: gemini-2.0-flash)

### 1. Basic Query
```json
{
  "prompt": "What is 3+3?",
  "provider": "gemini",
  "model": "gemini-2.0-flash"
}
```
Expected: Simple numerical response

### 2. Conversation History
```json
{
  "prompt": "What did I just ask you?",
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "history": [
    {"role": "user", "content": "What is 3+3?"},
    {"role": "assistant", "content": "3 + 3 = 6"}
  ]
}
```
Expected: Reference to previous question

### 3. Multi-turn Conversation
```json
{
  "prompt": "And what was my answer?",
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "history": [
    {"role": "user", "content": "What is 3+3?"},
    {"role": "assistant", "content": "3 + 3 = 6"},
    {"role": "user", "content": "What did I just ask you?"},
    {"role": "assistant", "content": "You asked me what 3+3 is."}
  ]
}
```
Expected: Reference to previous answer

### 4. Complex Prompt with Code
```json
{
  "prompt": "Write a simple JavaScript function to calculate factorial of a number",
  "provider": "gemini",
  "model": "gemini-2.0-flash"
}
```
Expected: Well-formatted code with comments

### 5. Error Handling
```json
{
  "prompt": "What is 3+3?",
  "provider": "gemini",
  "model": "invalid-model"
}
```
Expected: Appropriate error message

### 6. Image Processing
```json
{
  "prompt": "What do you see in this image?",
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "screenshot": "data:image/png;base64,..."
}
```
Expected: Description of image content

### 7. Image with History
```json
{
  "prompt": "What color did you see in the image?",
  "provider": "gemini",
  "model": "gemini-2.0-flash",
  "history": [
    {"role": "user", "content": "What do you see in this image?"},
    {"role": "assistant", "content": "I see a solid red square."}
  ]
}
```
Expected: Reference to previously described image

## Additional Notes

1. All responses should be streamed using server-sent events (SSE)
2. Each response should end with `data: [DONE]`
3. Error responses should include appropriate HTTP status codes
4. Image data should be base64 encoded and include proper MIME type
5. History should maintain conversation context accurately
6. Both providers should handle role mapping correctly

## Running the Tests

1. Update the base URL to your deployed API endpoint
2. For image tests, use a valid base64 encoded image
3. Run tests in sequence to verify conversation history
4. Check both success and error cases
5. Verify streaming behavior for all responses
6. Ensure proper error handling and status codes
