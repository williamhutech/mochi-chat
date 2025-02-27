/**
 * Text extraction module for Mochi Chat Extension
 * 
 * This module handles text extraction from both PDFs and websites.
 * It provides a unified interface for extraction while handling the specifics
 * of each content type internally.
 * 
 * Key Features:
 * - Website text extraction with semantic content selection
 * - PDF text extraction using PDF.js
 * - Duplicate detection and removal
 * - Error handling and logging
 * - Content type-specific optimizations
 */

//=============================================================================
// Module State
//=============================================================================

let initialized = false;
let addExtractedText;

/**
 * Initialize required modules
 * @returns {Promise<void>}
 */
async function initializeModules() {
  if (initialized) return;
  
  try {
    // Import module registry
    const moduleRegistryUrl = chrome.runtime.getURL('module-registry.js');
    const { getModule } = await import(moduleRegistryUrl);
    
    // Load conversation module
    const conversationModule = await getModule('conversation.js', async (module) => {
      await module.initializeModules();
    });
    ({ addExtractedText } = conversationModule);
    
    initialized = true;
    logToBackground('[Mochi-Extract] Modules initialized successfully');
  } catch (error) {
    // Handle extension context invalidation
    if (error.message.includes('Extension context invalidated')) {
      logToBackground('Extension context invalidated, reloading modules', true);
      initialized = false;
      // Retry initialization after a short delay
      await new Promise(resolve => setTimeout(resolve, 100));
      return initializeModules();
    }
    logToBackground('[Mochi-Extract] Error initializing modules: ' + error.message, true);
    throw error;
  }
}

//=============================================================================
// Constants and Types
//=============================================================================

/**
 * Content types enum for specifying extraction method
 * @enum {string}
 */
const CONTENT_TYPES = {
  /** PDF document type */
  PDF: 'PDF',
  /** Website/HTML document type */
  WEBSITE: 'Website'
};

//=============================================================================
// Logging
//=============================================================================

/**
 * Log to background console with module identifier
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
 * @returns {void}
 */
function logToBackground(message, isError = false) {
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message: message,
    source: 'Mochi-Extract',
    isError
  });
}

//=============================================================================
// Website Text Extraction
//=============================================================================

/**
 * Extract text from a website by capturing all visible text content
 * 
 * Process:
 * 1. Content Selection: Select meaningful content using semantic selectors
 * 2. Visibility & Duplicate Prevention: Filter based on visibility,
 *    track processed nodes, skip exact duplicates or code-like content
 * 3. (Optional) Sentence-Level Deduplication
 * 
 * @returns {Promise<string>} A single formatted passage of extracted text
 * @throws {Error} If extraction fails
 */
async function extractFromWebsite() {
  try {
    logToBackground('[Mochi-Extract] Starting website text extraction');
    
    // Track processed nodes and text segments to prevent duplicates
    const processedNodes = new Set();
    const processedTexts = new Set();  
    const duplicateStats = {
      nodeSkipped: 0,
      textDuplicates: 0,
      totalProcessed: 0
    };
    let extractedText = '';

    // Elements that typically contain meaningful text content
    const CONTENT_SELECTORS = [
      // HTML5 semantic elements
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'article', 'section', 'main',
      'li', 'td', 'th', 'dt', 'dd',
      'time', 'q', 'cite',
      'figcaption', 'blockquote',
      'details', 'summary', 'caption',
      
      // Rich semantic roles
      'header[role="heading"]',
      '[role="article"]',
      '[role="main"]',
      '[role="contentinfo"]',
      '[role="complementary"]',
      
      // Lists and Definition Content
      'dl', 'ol', 'ul',
      'table',
      'caption', 'thead', 'tbody', 'tfoot',
      
      // Web App Specific - Email
      '[role="gridcell"]',
      '[role="row"]',
      '[role="list"]',
      '[role="listitem"]',
      '.message',
      '.conversation',
      '.thread',
      '.email-body',
      '.mail-content',
      '.preview-text',
      '.subject-line',
      '.chat-message',
      '.feed-item',
      '.card-content',
      '.panel-content',
      '.tab-content',
      
      // Web App - Specific Content
      '[role="textbox"]',
      '[contenteditable="true"]',
      '[data-content-editable]',
      '.monaco-editor .view-line',
      '[role="document"]',
      '.dashboard-content',
      '.main-content',
      '.content-area',
      '.text-content',
      '[data-testid*="content"]',
      '[data-testid*="text"]',
      '[aria-label*="content"]',
      '[aria-label*="text"]',

      // Additional modern web app selectors
      'div[role="main"]',
      'div[role="article"]',
      'div[role="contentinfo"]',
      'div[role="complementary"]',
      '.content',
      '#content',
      '#main',
      '.main',
      'div[class*="content"]',
      'div[class*="main"]',
      'div[class*="body"]',
      'div[class*="text"]',
      // Email client specific additions
      'div[role="document"]',
      'div[role="presentation"]',
      'div[role="textbox"]',
      '[aria-label*="message"]',
      '[aria-label*="email"]',
      // Common content containers
      '.container',
      '.wrapper',
      '[class*="container"]',
      '[class*="wrapper"]'
    ];

    // Elements to exclude from text extraction
    const EXCLUDE_SELECTOR = [
      // Technical elements
      'script', 'style', 'noscript', 'iframe',
      'svg', 'code', 'pre', '.highlight',
      'meta', 'link', 'head', '.code',
      'canvas',
      
      // Common code block class names
      '.hljs', '.prism', '.syntax-highlight',
      '.CodeMirror', '.ace_editor',
      
      // Interactive Components
      'button', '[role="button"]',
      '[type="button"]', '[type="submit"]',
      '.btn', '.button',
      '[role="tablist"]', '[role="tab"]',
      '[role="menu"]', '[role="menuitem"]',
      '.dropdown', '.select',
      
      // Navigation and Menu
      'nav', '[role="navigation"]',
      '.menu-item', '.nav-item',
      '.navigation', '.navbar',
      '.breadcrumb', '.pagination',
      
      // Metadata and Info
      '.meta', '.metadata',
      '.article-meta', '.post-meta',
      '.author-info', '.publish-date',
      '.info-box', '.info-panel',
      '.byline', '.dateline',
      '.timestamp', '.time-info',
      
      // Social Media
      '.share-buttons', '.social-links',
      '.follow-us', '.social-media',
      '.twitter-embed', '.facebook-embed',
      
      // Layout elements
      'footer', 'aside',
      '#footer', '#sidebar', '#menu',
      '#ad-banner', '#banner',
      
      // Advertisement and promotional
      '.ad', '.advertisement', '.promotion',
      '.sponsor', '.social-share',
      '.newsletter-signup', '.subscribe',
      '.cta', '.call-to-action',
      '.promo', '.offer',
      
      // UI elements
      '.popup', '.modal', '.overlay',
      '.tooltip', '.popover',
      '[role="alert"]', '[role="dialog"]',
      '.notification', '.toast',
      '.badge', '.label',
      
      // Sidebars and widgets
      '.sidebar', '.widget',
      
      // Loading and Dynamic
      '.loading', '.spinner',
      '.placeholder', '.skeleton',
      '[aria-busy="true"]',
      
      // Tracking and analytics
      '.tracking', '.analytics', '.third-party',
      
      // Utility and Hidden
      '.hidden', '.invisible',
      '.collapsed', '.expanded',
      '.sr-only', '[aria-hidden="true"]',
      '[hidden]',
      
      // Web App Specific Exclusions
      '.toolbar', '.status-bar',
      '.action-bar', '.command-bar',
      '.navigation-bar', '.tab-bar',
      '.toolbar-item', '.menu-bar',
      '.context-menu', '.quick-input',
      '.suggestions', '.hint',
      '.welcome-page', '.getting-started',
      '.activity-bar', '.auxiliary-bar',
      '.panel-header', '.tree-view',
      '.list-view-header', '.status-indicator',
      '.progress-bar', '.search-box',
      '.filter-box', '.drag-handle',
      '.resize-handle', '.scrollbar',
      '.gutter', '.split-view-container',
      '.monaco-editor .cursor',
      '.monaco-editor .line-numbers',
      '.monaco-editor .decorations-overlay',
      '.monaco-editor .overlays',
      '.monaco-editor .margin'
    ].join(',');

    /**
     * Get a human-readable node path for debugging
     */
    function getNodePath(node) {
      const path = [];
      let current = node;
      while (current && current.tagName) {
        path.unshift(
          current.tagName.toLowerCase() +
          (current.id ? `#${current.id}` : '') +
          (current.className ? `.${current.className.replace(/\s+/g, '.')}` : '')
        );
        current = current.parentElement;
      }
      return path.join(' > ');
    }

    /**
     * Check if node or its ancestors have been processed
     */
    function isNodeProcessed(node) {
      let current = node;
      while (current) {
        if (processedNodes.has(current)) {
          duplicateStats.nodeSkipped++;
          return true;
        }
        current = current.parentElement;
      }
      return false;
    }

    /**
     * Check if element should be excluded
     */
    function shouldExclude(element) {
      let current = element;
      while (current) {
        if (current.matches && current.matches(EXCLUDE_SELECTOR)) {
          logToBackground(
            `[Mochi-Extract] Excluding element: ${getNodePath(current)}`
          );
          return true;
        }
        current = current.parentElement;
      }
      return false;
    }

    /**
     * Clean and normalize a text segment
     */
    function cleanTextSegment(text) {
      return text
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/([.!?])\s*(?:\1\s*)+/g, '$1 ')
        .replace(/([.!?])\s*([A-Za-z])/g, '$1 $2');
    }

    /**
     * Check if an element is visible
     */
    function isVisible(element) {
      const style = window.getComputedStyle(element);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        element.offsetWidth > 0 &&
        element.offsetHeight > 0
      );
    }

    /**
     * Simple check: if the text contains certain JSON-like markers,
     * we skip the entire text node.
     */
    function containsJsonMarkers(text) {
      // For the snippet you provided, "contentId" or "annotations" are key markers.
      // Add more if needed.
      const lower = text.toLowerCase();
      return lower.includes('"contentid":') || lower.includes('"annotations":');
    }

    /**
     * Check if text segment is unique (exact match) among processed texts
     */
    function isUniqueText(text, element) {
      duplicateStats.totalProcessed++;

      const cleaned = cleanTextSegment(text);
      if (!cleaned) return false;
      
      if (processedTexts.has(cleaned)) {
        duplicateStats.textDuplicates++;
        logToBackground(
          `[Mochi-Extract] Skipping duplicate text from ${getNodePath(element)}`
        );
        return false;
      }

      processedTexts.add(cleaned);
      return true;
    }

    // Collect text from each selector
    for (const selector of CONTENT_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        logToBackground(
          `[Mochi-Extract] Processing selector: ${selector} (Found ${elements.length} elements)`
        );
        
        for (const element of elements) {
          if (!isNodeProcessed(element) && isVisible(element) && !shouldExclude(element)) {
            const text = element.textContent;
            // 1) Skip if text is too short
            // 2) Skip if it contains JSON markers
            if (
              text && 
              text.trim().length > 20 &&
              !containsJsonMarkers(text) &&
              isUniqueText(text, element)
            ) {
              extractedText += cleanTextSegment(text) + ' ';
              processedNodes.add(element);
            }
          }
        }
      } catch (selectorError) {
        logToBackground(
          `[Mochi-Extract] Error processing selector ${selector}: ${selectorError.message}`,
          true
        );
      }
    }

    // Final trim
    let finalText = extractedText.trim();

    /**
     * Optional: Sentence-level dedup
     */
    function deduplicateSentences(text) {
      // Naive sentence split
      const rawSentences = text.split(/([.?!])\s*/);
      const sentences = [];
      for (let i = 0; i < rawSentences.length; i += 2) {
        const sentence = (rawSentences[i] || '').trim();
        const punctuation = (rawSentences[i + 1] || '').trim();
        if (sentence) {
          sentences.push((sentence + (punctuation || '')).trim());
        }
      }

      const seen = new Set();
      const results = [];
      const MIN_SENT_LEN = 30; // skip dedup if short

      for (const s of sentences) {
        const norm = s.toLowerCase().replace(/\s+/g, ' ').trim();
        if (norm.length < MIN_SENT_LEN) {
          results.push(s);
          continue;
        }
        if (!seen.has(norm)) {
          seen.add(norm);
          results.push(s);
        }
      }

      return results.join(' ');
    }

    // Perform optional sentence-level dedup
    const deduplicatedText = deduplicateSentences(finalText);

    // Log stats
    logToBackground(
      `[Mochi-Extract] Extraction Statistics:
      Total Elements Processed: ${duplicateStats.totalProcessed}
      Duplicate Nodes Skipped: ${duplicateStats.nodeSkipped}
      Exact Text Segments Duplicates: ${duplicateStats.textDuplicates}
      Original Text Length: ${finalText.length} characters
      Final Text Length: ${deduplicatedText.length} characters
      Reduction: ${(
        ((finalText.length - deduplicatedText.length) / finalText.length) * 100
      ).toFixed(2)}%
    `
    );

    // Return final text
    return deduplicatedText;

  } catch (error) {
    logToBackground(`[Mochi-Extract] Error extracting text: ${error}`, true);
    throw error;
  }
}

//=============================================================================
// PDF Text Extraction
//=============================================================================

/**
 * Extract text from a PDF file using PDF.js
 * Handles PDF parsing, text extraction, and error cases
 * 
 * Features:
 * - Automatic password detection
 * - Page-by-page extraction
 * - Error handling for corrupted files
 * - Progress tracking
 * 
 * @param {ArrayBuffer} file - The PDF file data
 * @returns {Promise<string>} The extracted text
 * @throws {Error} If PDF is password protected or corrupted
 */
async function extractFromPDF(file) {
  try {
    logToBackground('[Mochi-Extract] Starting PDF text extraction');
    
    const pdfjsLib = await import(chrome.runtime.getURL('pdf.mjs'));
    logToBackground('[Mochi-Extract] PDF.js library loaded');
    
    // Configure worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: file });
    loadingTask.onPassword = (updatePassword, reason) => {
      logToBackground('[Mochi-Extract] PDF requires password', true);
      throw new Error('PDF is password protected');
    };

    const pdfDoc = await loadingTask.promise;
    logToBackground(`[Mochi-Extract] PDF loaded successfully. Total pages: ${pdfDoc.numPages}`);
    
    let extractedText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      logToBackground(`[Mochi-Extract] Processing page ${i}/${pdfDoc.numPages}`);
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ')
        .trim();
      
      // Format as specified: Page X: 'content'
      extractedText += `Page ${i}: '${pageText}'${i < pdfDoc.numPages ? '\n' : ''}`;
    }

    const finalText = extractedText.trim();    
    return finalText;
  } catch (error) {
    logToBackground(`[Mochi-Extract] Error extracting PDF text: ${error}`, true);
    throw error;
  }
}

//=============================================================================
// Main Interface
//=============================================================================

/**
 * Main extraction function that handles both websites and PDFs
 * Provides a unified interface while handling type-specific logic internally
 * 
 * @param {object} options - Extraction options
 * @param {CONTENT_TYPES} options.type - Type of content to extract
 * @param {ArrayBuffer} [options.file] - PDF file data (required for PDF extraction)
 * @returns {Promise<string>} The extracted text
 * @throws {Error} If extraction fails or invalid options provided
 */
export async function extractText(options) {
  try {
    await initializeModules();
    
    logToBackground(`Starting extraction for ${options.type}`);
    
    // Validate options
    if (!options || !options.type) {
      throw new Error('Invalid options: type is required');
    }
    
    if (!Object.values(CONTENT_TYPES).includes(options.type)) {
      throw new Error(`Invalid content type: ${options.type}`);
    }
    
    // Extract based on type
    let extractedText;
    if (options.type === CONTENT_TYPES.PDF) {
      if (!options.file) {
        throw new Error('PDF extraction requires file data');
      }
      extractedText = await extractFromPDF(options.file);
    } else {
      extractedText = await extractFromWebsite();
    }
    
    // Add extracted text to conversation history
    if (extractedText) {
      logToBackground('=== Extracted Text ===');
      logToBackground(extractedText);
      logToBackground('=== End Extracted Text ===');
      logToBackground(`Total characters extracted: ${extractedText.length}`);
      
      await addExtractedText(extractedText);
      
      // Get conversation history to verify
      const { getHistory } = await import(chrome.runtime.getURL('./conversation.js'));
      const history = await getHistory();
      logToBackground('=== Conversation History After Extraction ===');
      history.forEach((msg, i) => {
        logToBackground(`Message ${i + 1}:`);
        logToBackground(`Role: ${msg.role}`);
        logToBackground(`Content: ${JSON.stringify(msg.content, null, 2)}`);
        logToBackground('---');
      });
      logToBackground('=== End Conversation History ===');
    }
    
    return extractedText;
    
  } catch (error) {
    // Handle extension context invalidation
    if (error.message.includes('Extension context invalidated')) {
      logToBackground('Extension context invalidated during extraction, retrying', true);
      initialized = false;
      // Retry after a short delay
      await new Promise(resolve => setTimeout(resolve, 100));
      return extractText(options);
    }
    
    logToBackground(`Error during extraction: ${error.message}`, true);
    throw error;
  }
}

export { CONTENT_TYPES };
