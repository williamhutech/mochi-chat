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
const ContentType = {
  TEXT: 'text',
  IMAGE_URL: 'image_url'
};

/**
 * Message roles in the conversation
 * @constant {Object}
 */
const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system'
};

/**
 * Validates if the given content matches the TextContent type
 * @param {any} content - Content to validate
 * @returns {boolean} True if content is valid TextContent
 */
function isTextContent(content) {
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
function isImageUrlContent(content) {
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
function isValidRole(role) {
  return Object.values(MessageRole).includes(role);
}

/**
 * Validates if the given content is valid message content
 * @param {any} content - Content to validate
 * @returns {boolean} True if content is valid
 */
function isValidContent(content) {
  if (typeof content === 'string') {
    return true;
  }
  
  if (Array.isArray(content)) {
    return content.every(item => isTextContent(item) || isImageUrlContent(item));
  }
  
  return false;
}

/**
 * Creates a text content object
 * @param {string} text - The text content
 * @returns {Object} Text content object
 */
function createTextContent(text) {
  return {
    type: ContentType.TEXT,
    text
  };
}

/**
 * Creates an image URL content object
 * @param {string} url - The image URL
 * @returns {Object} Image URL content object
 */
function createImageUrlContent(url) {
  return {
    type: ContentType.IMAGE_URL,
    image_url: {
      url,
      detail: 'high'
    }
  };
}

module.exports = {
  ContentType,
  MessageRole,
  isTextContent,
  isImageUrlContent,
  isValidRole,
  isValidContent,
  createTextContent,
  createImageUrlContent
};
