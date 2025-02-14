/**
 * Message Types Module
 * 
 * This module defines the standard message structure and content types used
 * throughout the Mochi Chat application. It provides consistent typing and
 * validation for message content across both frontend and backend.
 */

/**
 * Content types supported in messages
 * @constant {Object}
 */
export const ContentType = {
  TEXT: 'text',
  IMAGE_URL: 'image_url'
};

/**
 * Message roles in the conversation
 * @constant {Object}
 */
export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system'
};

/**
 * @typedef {Object} TextContent
 * @property {string} type - Must be 'text'
 * @property {string} text - The text content
 */

/**
 * @typedef {Object} ImageUrlContent
 * @property {string} type - Must be 'image_url'
 * @property {Object} image_url - Image URL object
 * @property {string} image_url.url - URL of the image
 * @property {'high'} image_url.detail - Image detail level, always 'high'
 */

/**
 * @typedef {Object} Message
 * @property {string} role - Role of the message sender (user, assistant, system)
 * @property {(string|Array<TextContent|ImageUrlContent>)} content - Message content
 */

/**
 * @typedef {Object} ChatRequest
 * @property {Array<Message>} messages - Array of messages in the conversation
 * @property {string} [provider] - AI provider to use (defaults to 'openai')
 */

/**
 * Validates if the given content matches the TextContent type
 * @param {any} content - Content to validate
 * @returns {boolean} True if content is valid TextContent
 */
export function isTextContent(content) {
  return (
    typeof content === 'object' &&
    content !== null &&
    content.type === ContentType.TEXT &&
    typeof content.text === 'string'
  );
}

/**
 * Validates if the given content matches the ImageUrlContent type
 * @param {any} content - Content to validate
 * @returns {boolean} True if content is valid ImageUrlContent
 */
export function isImageUrlContent(content) {
  return (
    typeof content === 'object' &&
    content !== null &&
    content.type === ContentType.IMAGE_URL &&
    typeof content.image_url === 'object' &&
    typeof content.image_url.url === 'string' &&
    content.image_url.detail === 'high'
  );
}

/**
 * Validates if the given role is a valid MessageRole
 * @param {string} role - Role to validate
 * @returns {boolean} True if role is valid
 */
export function isValidRole(role) {
  return Object.values(MessageRole).includes(role);
}

/**
 * Validates if the given content is valid message content
 * @param {any} content - Content to validate
 * @returns {boolean} True if content is valid
 */
export function isValidContent(content) {
  // Handle string content
  if (typeof content === 'string') {
    return true;
  }
  
  // Handle array of content objects
  if (Array.isArray(content)) {
    return content.every(item => isTextContent(item) || isImageUrlContent(item));
  }
  
  // Handle single content object
  if (typeof content === 'object' && content !== null) {
    return isTextContent(content) || isImageUrlContent(content);
  }
  
  return false;
}

/**
 * Creates a text content object
 * @param {string} text - The text content
 * @returns {TextContent} Text content object
 */
export function createTextContent(text) {
  return {
    type: ContentType.TEXT,
    text
  };
}

/**
 * Creates an image URL content object
 * @param {string} url - The image URL
 * @returns {ImageUrlContent} Image URL content object
 */
export function createImageUrlContent(url) {
  return {
    type: ContentType.IMAGE_URL,
    image_url: {
      url,
      detail: 'high'
    }
  };
}
