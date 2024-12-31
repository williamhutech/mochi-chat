/**
 * Text extraction module for Mochi Chat
 * This module handles text extraction from both PDFs and websites.
 * It provides a unified interface for extraction while handling the specifics
 * of each content type internally.
 */

import { addExtractedText } from './conversation.js';

// Content types enum for specifying extraction method
export const CONTENT_TYPES = {
  PDF: 'pdf',
  WEBSITE: 'website'
};

/**
 * Log to background console with module identifier
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
 */
function logToBackground(message, isError = false) {
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message: message,
    source: 'Mochi-Extract',
    isError
  });
}

/**
 * Extract text from a PDF file using PDF.js
 * Handles PDF parsing, text extraction, and error cases like password protection
 */
async function extractFromPDF(file) {
  try {
    const pdfjsLib = await import(chrome.runtime.getURL('pdf.mjs'));
    
    if (!pdfjsLib || !pdfjsLib.getDocument) {
      throw new Error('PDF.js library not loaded correctly');
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');
    
    const loadingTask = pdfjsLib.getDocument({
      data: file,
      cMapUrl: chrome.runtime.getURL('cmaps/'),
      cMapPacked: true,
    });

    loadingTask.onPassword = function(updatePassword, reason) {
      logToBackground('PDF is password-protected', true);
      throw new Error('This PDF is password-protected and cannot be processed');
    };

    const pdf = await loadingTask.promise;
    let formattedText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      formattedText += `Page ${i}: "${pageText}"\n\n`;
    }
    
    logToBackground(`Successfully extracted ${formattedText.length} characters from PDF`);
    logToBackground(`Extracted text as follows:\n${formattedText}`);
    
    return formattedText.trim();
  } catch (error) {
    logToBackground(`PDF extraction error: ${error}`, true);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Extract text from a website by focusing on main content
 * Filters out boilerplate, scripts, and non-content elements
 */
async function extractFromWebsite() {
  try {
    // Important content selectors
    const contentSelectors = [
      'article',
      'main',
      '.content',
      '.main-content',
      '#content',
      '#main-content',
      '.post-content',
      '.article-content'
    ];

    // Elements to exclude
    const excludeSelectors = [
      'script',
      'style',
      'noscript',
      'header',
      'footer',
      'nav',
      '#header',
      '#footer',
      '#nav',
      '.header',
      '.footer',
      '.nav',
      '.advertisement',
      '.ads',
      '.cookie-notice',
      '.popup',
      'iframe',
      'button',
      '[role="button"]',
      '.btn',
      '.button',
      'input[type="button"]',
      'input[type="submit"]',
      '[class*="button"]',
      '[class*="btn-"]'
    ].join(',');

    // Try to find main content first
    let mainContent = '';
    for (const selector of contentSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(element => {
          // Clone the element to avoid modifying the original
          const clone = element.cloneNode(true);
          
          // Remove excluded elements from clone
          const excludedElements = clone.querySelectorAll(excludeSelectors);
          excludedElements.forEach(el => el.remove());
          
          mainContent += clone.textContent + '\n\n';
        });
        break; // Use first matching content container
      }
    }

    // If no main content found, fall back to body but with careful filtering
    if (!mainContent.trim()) {
      logToBackground('No main content container found, using filtered body content');
      
      // Remove all excluded elements first
      const tempBody = document.body.cloneNode(true);
      const excludedElements = tempBody.querySelectorAll(excludeSelectors);
      excludedElements.forEach(el => el.remove());

      // Get remaining text nodes with meaningful content
      const walker = document.createTreeWalker(
        tempBody,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            // Skip if parent is hidden
            if (node.parentElement && 
                (window.getComputedStyle(node.parentElement).display === 'none' ||
                 window.getComputedStyle(node.parentElement).visibility === 'hidden')) {
              return NodeFilter.FILTER_REJECT;
            }
            
            const text = node.textContent.trim();
            // Accept if text has reasonable length and contains actual sentences
            if (text.length > 20 && /[.!?]/.test(text)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          }
        },
        false
      );

      let node;
      let paragraphs = [];
      while (node = walker.nextNode()) {
        const text = node.textContent.trim();
        if (text) {
          paragraphs.push(text);
        }
      }

      mainContent = paragraphs.join('\n\n');
    }

    // Clean up the extracted text
    const cleanText = mainContent
      .replace(/[\s\n]+/g, ' ')           // Normalize whitespace
      .replace(/\s+([.,!?])/g, '$1')      // Fix punctuation spacing
      .replace(/\s+/g, ' ')               // Remove extra spaces
      .split(/[.!?]+/)                    // Split into sentences
      .filter(sentence => {
        const trimmed = sentence.trim();
        // Keep sentences that are reasonable length and don't look like code/scripts
        return trimmed.length > 20 && 
               trimmed.length < 500 &&
               !trimmed.includes('{') &&
               !trimmed.includes('function') &&
               !trimmed.includes('var ') &&
               !trimmed.includes('console.') &&
               !/^[0-9a-f]{8,}$/i.test(trimmed);
      })
      .join('. ')
      .trim();

    if (cleanText) {
      logToBackground(`Successfully extracted ${cleanText.length} characters of meaningful content`);
      logToBackground(`Extracted text as follows:\n${cleanText}`);
      return cleanText;
    } else {
      throw new Error('No meaningful content found on page');
    }
  } catch (error) {
    logToBackground(`Website extraction error: ${error}`, true);
    throw new Error('Failed to extract text from website');
  }
}

/**
 * Main extraction function that handles both PDF and website text extraction
 * Provides a unified interface for the rest of the extension
 */
export async function extractText(options) {
  try {
    let extractedText = '';
    
    if (options.type === CONTENT_TYPES.PDF) {
      if (!options.file) {
        throw new Error('PDF file is required for PDF extraction');
      }
      extractedText = await extractFromPDF(options.file);
    } else if (options.type === CONTENT_TYPES.WEBSITE) {
      extractedText = await extractFromWebsite();
    } else {
      throw new Error('Invalid content type specified');
    }
    
    // Add to conversation history
    addExtractedText(extractedText);
    
    logToBackground(`Extracted ${extractedText.length} characters`);
    return extractedText;
    
  } catch (error) {
    logToBackground(`Error extracting text: ${error}`, true);
    throw error;
  }
}
