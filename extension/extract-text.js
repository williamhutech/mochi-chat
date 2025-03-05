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
 * - Shadow DOM content extraction
 * - Dynamic content detection and extraction
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
 * 2. Shadow DOM traversal: Extract text from Shadow DOM components
 * 3. Dynamic Content Detection: Multiple passes with delays to capture dynamically loaded content
 * 4. Visibility & Duplicate Prevention: Filter based on visibility,
 *    track processed nodes, skip exact duplicates or code-like content
 * 5. Sentence-Level Deduplication
 * 
 * @returns {Promise<string>} A single formatted passage of extracted text
 * @throws {Error} If extraction fails
 */
async function extractFromWebsite() {
  try {
    logToBackground('[Mochi-Extract] Starting website text extraction with dynamic content support');
    
    // Track processed nodes and text segments to prevent duplicates
    const processedNodes = new Set();
    const processedTexts = new Set();  
    
    // Track extraction statistics
    const stats = {
      nodeSkipped: 0,
      textDuplicates: 0,
      totalProcessed: 0,
      shadowDomNodes: 0,
      initialContentSize: 0,
      finalContentSize: 0,
      dynamicContentGain: 0,
      iterationCount: 0
    };
    
    // Combined extracted text from all passes
    let allExtractedText = '';

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
      '[class*="wrapper"]',
      
      // E-commerce specific selectors
      '.product-description',
      '.product-details',
      '.product-overview',
      '.product-features',
      '.product-specs',
      '.product-info',
      '.item-description',
      '.item-details',
      '.product-content',
      '.product-title',
      '.product-subtitle',
      '.product-price',
      '.product-rating',
      '.product-review',
      '.product-summary',
      '.product-about',
      '.product-highlights',
      '.product-specifications',
      '.listing-description',
      '.item-properties',
      '.item-specifics',
      '.item-attributes',
      '.benefits-list',
      '.features-list',
      '.specifications-list',
      '.data-sheet',
      '.tech-specs',
      
      // Social/professional network selectors
      '.feed-shared-update',
      '.feed-shared-text',
      '.post-content',
      '.post-text',
      '.profile-section',
      '.profile-summary',
      '.profile-info',
      '.bio-container',
      '.experience-section',
      '.education-section',
      '.skills-section',
      '.recommendation-container',
      '.endorsement-info',
      '.timeline-item',
      '.timeline-content',
      '.activity-feed',
      '.user-content',
      '.user-post',
      '.status-update',
      '.comment-content',
      '.description-container',
      
      // Common interactive content areas
      '[aria-label*="description"]',
      '[aria-label*="details"]',
      '[aria-label*="about"]',
      '[aria-label*="overview"]',
      '[aria-describedby]',
      '[data-component*="description"]',
      '[data-component*="details"]',
      '[data-component*="text"]',
      '[data-testid*="description"]',
      '[data-testid*="details"]',
      '[data-section*="description"]',
      '[data-section*="details"]'
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
          stats.nodeSkipped++;
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
      stats.totalProcessed++;

      const cleaned = cleanTextSegment(text);
      if (!cleaned) return false;
      
      if (processedTexts.has(cleaned)) {
        stats.textDuplicates++;
        return false;
      }

      processedTexts.add(cleaned);
      return true;
    }

    /**
     * Extract text from Shadow DOM elements
     * @param {Element} rootElement - The shadow host element
     * @returns {string} - Extracted text from shadow DOM
     */
    function extractFromShadowDOM(rootElement) {
      let shadowText = '';
      
      // Process a shadow host and its shadow tree
      function processShadowHost(host) {
        if (host.shadowRoot) {
          stats.shadowDomNodes++;          
          // Extract text from shadow root using similar criteria as main DOM
          const shadowContentElements = Array.from(
            host.shadowRoot.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6, li, td, article, section')
          ).filter(el => isVisible(el) && !shouldExclude(el));
          
          for (const element of shadowContentElements) {
            const text = element.textContent;
            if (text && text.trim().length > 20 && !containsJsonMarkers(text) && isUniqueText(text, element)) {
              shadowText += cleanTextSegment(text) + ' ';
            }
          }
          
          // Process any nested shadow roots
          const nestedHosts = Array.from(host.shadowRoot.querySelectorAll('*'));
          for (const nestedHost of nestedHosts) {
            processShadowHost(nestedHost);
          }
        }
      }
      
      processShadowHost(rootElement);
      return shadowText;
    }

    /**
     * Core extraction logic - can be called multiple times
     * @returns {string} Text extracted in this pass
     */
    function performExtraction() {
      let extractedText = '';
      stats.iterationCount++;
      
      logToBackground(`[Mochi-Extract] Performing extraction pass #${stats.iterationCount}`);
      
      // Collect text from each selector
      for (const selector of CONTENT_SELECTORS) {
        try {
          const elements = document.querySelectorAll(selector);
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
              
              // Check for shadow DOM content
              if (element.shadowRoot) {
                const shadowText = extractFromShadowDOM(element);
                if (shadowText) {
                  extractedText += shadowText + ' ';
                }
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
      
      // Process potential shadow DOM hosts that might not match our selectors
      try {
        const potentialShadowHosts = Array.from(document.querySelectorAll('*')).filter(
          el => el.shadowRoot && !processedNodes.has(el)
        );
        
        if (potentialShadowHosts.length > 0) {
          logToBackground(`[Mochi-Extract] Found ${potentialShadowHosts.length} additional shadow hosts`);
          
          for (const host of potentialShadowHosts) {
            if (!processedNodes.has(host)) {
              const shadowText = extractFromShadowDOM(host);
              if (shadowText) {
                extractedText += shadowText + ' ';
                processedNodes.add(host);
              }
            }
          }
        }
      } catch (shadowError) {
        logToBackground(`[Mochi-Extract] Error processing shadow DOM: ${shadowError.message}`, true);
      }
      
      return extractedText.trim();
    }

    /**
     * Wait for network activity to settle and dynamic content to load
     * @returns {Promise<void>}
     */
    async function waitForContentToLoad() {
      logToBackground('[Mochi-Extract] Waiting for dynamic content to load');
      
      // We can't directly observe network activity in content scripts
      // Use DOM mutations as a proxy for dynamic content loading
      return new Promise(resolve => {
        let timer = null;
        let mutationCount = 0;
        
        // Set up mutation observer
        const observer = new MutationObserver((mutations) => {
          mutationCount += mutations.length;
          
          if (mutationCount % 10 === 0) {
            logToBackground(`[Mochi-Extract] Detected ${mutationCount} DOM mutations`);
          }
          
          // Clear existing timer
          if (timer) clearTimeout(timer);
          
          // Set new timer - if no mutations for 1s, consider network idle
          timer = setTimeout(() => {
            observer.disconnect();
            logToBackground('[Mochi-Extract] Content appears to be stable, proceeding with extraction');
            resolve();
          }, 1000);
        });
        
        // Observe DOM changes
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false,
          characterData: false
        });
        
        // Fallback timeout - resolve after 3s max wait
        setTimeout(() => {
          if (observer) {
            observer.disconnect();
            logToBackground('[Mochi-Extract] Maximum wait time reached, proceeding with extraction');
            resolve();
          }
        }, 3000);
      });
    }
    
    /**
     * Optional: Sentence-level dedup
     */
    function deduplicateSentences(text) {
      // Naive sentence split
      const rawSentences = text.split(/([.!?])\s*/);
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

    // PHASE 1: First extraction - capture initial content
    allExtractedText = performExtraction();
    stats.initialContentSize = allExtractedText.length;
    
    // PHASE 2: Wait for any dynamic content to load naturally
    logToBackground('[Mochi-Extract] Waiting for any dynamic content to load naturally');
    await waitForContentToLoad();
    
    // PHASE 3: Second extraction - capture any newly loaded content
    const additionalText = performExtraction();
    
    // Check if we got meaningful new content (at least 10% more or 1000 chars)
    const newContentThreshold = Math.max(stats.initialContentSize * 0.1, 1000);
    if (additionalText.length > newContentThreshold) {
      logToBackground(`[Mochi-Extract] Found significant new content: ${additionalText.length} chars`);
      
      // Add to total extracted text
      allExtractedText += ' ' + additionalText;
      
      // One more extraction after a longer delay for any remaining dynamic content
      logToBackground('[Mochi-Extract] Waiting for additional dynamic content...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const finalPassText = performExtraction();
      
      // Add any final content
      if (finalPassText.length > 100) {
        logToBackground(`[Mochi-Extract] Final pass found ${finalPassText.length} additional chars`);
        allExtractedText += ' ' + finalPassText;
      }
    } else {
      logToBackground('[Mochi-Extract] No significant new content found after waiting');
    }
    
    // PHASE 4: Final deduplication and formatting
    logToBackground(`[Mochi-Extract] Performing final deduplication on ${allExtractedText.length} chars`);
    const deduplicatedText = deduplicateSentences(allExtractedText);
    
    // Calculate dynamic content statistics
    stats.finalContentSize = deduplicatedText.length;
    stats.dynamicContentGain = stats.initialContentSize > 0 ? 
      ((stats.finalContentSize - stats.initialContentSize) / stats.initialContentSize * 100).toFixed(2) : 0;
    
    // Will be re-used in the future; keep as it is.
    // Log extraction statistics
    // logToBackground(
    //   `[Mochi-Extract] Extraction Statistics:
    //   Total Elements Processed: ${stats.totalProcessed}
    //   Duplicate Nodes Skipped: ${stats.nodeSkipped}
    //   Exact Text Segments Duplicates: ${stats.textDuplicates}
    //   Shadow DOM Nodes Processed: ${stats.shadowDomNodes}
    //   Extraction Passes: ${stats.iterationCount}
    //   Initial Content Size: ${stats.initialContentSize} characters
    //   Final Content Size: ${stats.finalContentSize} characters
    //   Content Size Increase: ${stats.dynamicContentGain}%
    // `
    // );

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
      // We will use this later; do not delete.
      //logToBackground('=== Extracted Text ===');
      //logToBackground(extractedText);
      //logToBackground('=== End Extracted Text ===');
      //logToBackground(`Total characters extracted: ${extractedText.length}`);
      
      await addExtractedText(extractedText);
      
      // Get conversation history to verify
      const { getHistory } = await import(chrome.runtime.getURL('./conversation.js'));
      const history = await getHistory();
      // To re-use in the future; do not delete.
      //logToBackground('=== Conversation History After Extraction ===');
      //history.forEach((msg, i) => {
        //logToBackground(`Message ${i + 1}:`);
        //logToBackground(`Role: ${msg.role}`);
        //logToBackground(`Content: ${JSON.stringify(msg.content, null, 2)}`);
        //logToBackground('---');
      //});
      //logToBackground('=== End Conversation History ===');
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
