//=============================================================================
// Global State Variables
//=============================================================================
let uiComponent = null;
let toggleButton = null;
let isUIVisible = false;
let extractedText = '';
let conversationHistory = [];
let lastResponse = '';
let hasCheckedPermission = false;
let isTextExtracted = false;

//=============================================================================
// Initialization and Event Listeners
//=============================================================================

// Initialize the chat button as soon as the script loads
createAndShowChatButton();

// Ensure chat button persists across page reloads and dynamic content changes
window.addEventListener('beforeunload', () => {
  setTimeout(() => {
    createAndShowChatButton();
  }, 0);
});

document.addEventListener('DOMContentLoaded', () => {
  createAndShowChatButton();
});

window.addEventListener('load', () => {
  createAndShowChatButton();
});

//=============================================================================
// Message Handling
//=============================================================================

// Handle messages from the extension's background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleExtraction") {
    if (isUIVisible) {
      hideUIComponent();
    } else {
      // Show UI immediately for better user experience
      showUIComponent();
      
      // Extract text if not already done
      if (!isTextExtracted) {
        initializeExtraction().catch(error => {
          console.error('Error during extraction:', error);
          showError('Failed to extract text from the document');
        });
      }
    }
  }
});

// Handle streaming response updates from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateStreamingResponse") {
    console.log('Received streaming update:', request);
    const outputField = document.getElementById('output-field');
    const promptWrapper = document.getElementById('prompt-wrapper');
    const generatingButton = document.getElementById('generating-button');
    const promptInput = document.getElementById('prompt-input');

    if (request.error) {
      console.error('Error:', request.error);
      outputField.innerHTML += `<span class="error">Error: ${request.error}</span>`;
      promptWrapper.classList.remove('hidden');
      generatingButton.classList.add('hidden');
    } else if (request.text) {
      const existingPrompt = outputField.querySelector('strong')?.outerHTML || '';
      const linkedText = createPageLinks(request.text);
      outputField.innerHTML = `${existingPrompt}${DOMPurify.sanitize(renderMarkdown(linkedText))}`;
      outputField.scrollTop = outputField.scrollHeight;

      if (request.isFinal) {
        promptWrapper.classList.remove('hidden');
        generatingButton.classList.add('hidden');
        conversationHistory.push({ role: 'system', content: request.text });
        promptInput.focus();
      }
    }
  }
});

//=============================================================================
// UI Component Management
//=============================================================================

// Function to ensure chat button is always visible
function createAndShowChatButton() {
  if (!toggleButton) {
    createToggleButton();
  }
  if (toggleButton && toggleButton.style.display !== 'flex') {
    toggleButton.style.display = 'flex';
  }
}

// Create toggle button when needed
function createToggleButton() {
  if (!toggleButton) {
    toggleButton = document.createElement('div');
    toggleButton.id = 'chat-toggle-button';
    toggleButton.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    document.body.appendChild(toggleButton);

    toggleButton.addEventListener('click', async () => {
      if (isUIVisible) {
        hideUIComponent();
      } else {
        // Show UI immediately for better user experience
        showUIComponent();
        
        // Extract text if not already done
        if (!isTextExtracted) {
          initializeExtraction().catch(error => {
            console.error('Error during extraction:', error);
            showError('Failed to extract text from the document');
          });
        }
      }
    });

    // Show the button immediately
    toggleButton.style.display = 'flex';
  }
}

// Main function to create and display the chat interface
function showUIComponent() {
  // Determine if we're on a PDF file or regular website
  const isPDF = document.contentType === 'application/pdf' || 
                window.location.href.toLowerCase().endsWith('.pdf');
  const title = isPDF ? 'Mochi Chat - PDF' : 'Mochi Chat - Website';
                
  if (!uiComponent) {
    // Create the main chat UI container if it doesn't exist
    uiComponent = document.createElement('div');
    uiComponent.id = 'pdf-extractor-ui';
    uiComponent.classList.add('hidden');
    
    // Load Noto Sans font for consistent typography
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
    
    // Load our custom styles
    const styleLink = document.createElement('link');
    styleLink.href = chrome.runtime.getURL('styles.css');
    styleLink.rel = 'stylesheet';
    document.head.appendChild(styleLink);
    
    // Create chat interface HTML structure
    uiComponent.innerHTML = `
      <div id="chat-container">
        <div id="chat-header">
          <div id="chat-title">${title}</div>
          <div class="header-buttons">
            <button id="expand-button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6"></path>
                <path d="M9 21H3v-6"></path>
                <path d="M21 3l-7 7"></path>
                <path d="M3 21l7-7"></path>
              </svg>
            </button>
            <button id="close-button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        <div id="output-field"></div>
        <div id="input-container">
          <div id="prompt-wrapper">
            <input type="text" id="prompt-input" placeholder="What would you like to ask?">
            <button id="send-button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
          <button id="generating-button" class="hidden">
            <span class="loading-dots">Thinking</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(uiComponent);

    // Add event listeners
    document.getElementById('send-button').addEventListener('click', sendPrompt);
    document.getElementById('prompt-input').addEventListener('keypress', function(event) {
      if (event.key === 'Enter') {
        sendPrompt();
      }
    });
    document.getElementById('close-button').addEventListener('click', hideUIComponent);
    document.getElementById('expand-button').addEventListener('click', toggleExpand);
  } else {
    // Update the title if UI already exists
    document.getElementById('chat-title').textContent = title;
  }

  // Show UI and restore last response if any
  const outputField = document.getElementById('output-field');
  outputField.innerHTML = lastResponse || '';
  
  // Show or hide UI component
  if (isUIVisible) {
    uiComponent.classList.remove('visible');
    setTimeout(() => {
      uiComponent.classList.add('hidden');
    }, 200);
  } else {
    uiComponent.classList.remove('hidden');
    requestAnimationFrame(() => {
      uiComponent.classList.add('visible');
      // Focus on input field after UI is visible
      document.getElementById('prompt-input').focus();
    });
    isUIVisible = true;
  }
}

// Function to toggle expand/collapse of chat interface
function toggleExpand() {
  if (uiComponent) {
    uiComponent.classList.toggle('expanded');
  }
}

// Function to hide the chat interface
function hideUIComponent() {
  if (uiComponent) {
    // Save the current response before hiding
    lastResponse = document.getElementById('output-field').innerHTML;
    uiComponent.classList.remove('visible');
    setTimeout(() => {
      uiComponent.classList.add('hidden');
      // Remove expanded class when hiding
      uiComponent.classList.remove('expanded');
    }, 200);
    isUIVisible = false;
  }
}

//=============================================================================
// Text Extraction and Processing
//=============================================================================

// Initialize text extraction for PDF or website
async function initializeExtraction() {
  // Only extract text if not already done
  if (isTextExtracted) return;

  // Reset conversation states
  extractedText = '';
  conversationHistory = [];
  
  const isPDF = document.contentType === 'application/pdf' || 
                window.location.href.toLowerCase().endsWith('.pdf');
  
  try {
    if (isPDF) {
      if (window.location.href.startsWith('file://') && !hasCheckedPermission) {
        const hasPermission = await checkFileAccessPermission();
        hasCheckedPermission = true;
        if (!hasPermission) {
          showFileAccessInstructions();
          return;
        }
      }
      await extractTextFromPDF();
    } else {
      await extractTextFromWebsite();
    }
    isTextExtracted = true;
  } catch (error) {
    console.error('Error extracting text:', error);
    throw error; // Let the caller handle the error
  }
}

// Function to check for PDF and extract text
async function checkForPDFAndExtract() {
  const isPDF = document.contentType === 'application/pdf' || 
                window.location.href.toLowerCase().endsWith('.pdf');
  if (isPDF) {
    extractTextFromPDF();
  } else {
    showError('This page is not a PDF file.');
  }
}

// Function to check file access permission
async function checkFileAccessPermission() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { action: "checkFilePermission" },
        (response) => {
          console.log('Permission check response:', response);
          if (chrome.runtime.lastError) {
            console.error('Permission check error:', chrome.runtime.lastError);
            showFileAccessInstructions();
            resolve(false);
          } else if (!response || !response.hasPermission) {
            console.log('No file access permission');
            showFileAccessInstructions();
            resolve(false);
          } else {
            console.log('File access permission granted');
            resolve(true);
          }
        }
      );
    } catch (error) {
      console.error('Permission check exception:', error);
      showFileAccessInstructions();
      resolve(false);
    }
  });
}

// Function to show file access permission instructions
function showFileAccessInstructions() {
  return new Promise((resolve) => {
    const instructionsDiv = document.createElement('div');
    instructionsDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 25px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 450px;
      font-family: 'Noto Sans', sans-serif;
    `;
    
    instructionsDiv.innerHTML = `
      <h3 style="margin-top: 0; color: #2c3e50;">Permission Required</h3>
      <p>Mochi Chat needs permission to access local PDF files.</p>
      <ol style="margin-bottom: 20px;">
        <li>Click the button below to open Extensions page</li>
        <li>Find "Mochi Chat"</li>
        <li>Click "Details"</li>
        <li>Toggle on "Allow access to file URLs"</li>
        <li>Refresh this page</li>
      </ol>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <button id="open-extensions" style="
          padding: 8px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Open Extensions Page</button>
        <button id="close-instructions" style="
          padding: 8px 16px;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          cursor: pointer;
        ">Close</button>
      </div>
    `;
    
    document.body.appendChild(instructionsDiv);
    
    document.getElementById('open-extensions').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "openExtensionsPage" });
      instructionsDiv.remove();
      resolve();
    });
    
    document.getElementById('close-instructions').addEventListener('click', () => {
      instructionsDiv.remove();
      resolve();
    });
  });
}

// Function to extract text from PDF
async function extractTextFromPDF() {
  try {
    const pdfjsLib = await import(chrome.runtime.getURL('pdf.mjs'));
    
    if (!pdfjsLib || !pdfjsLib.getDocument) {
      throw new Error('PDF.js library not loaded correctly');
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');

    let pdfUrl = window.location.href;
    
    // Check permission for local files
    if (pdfUrl.startsWith('file://')) {
      const hasPermission = await checkFileAccessPermission();
      if (!hasPermission) {
        await showFileAccessInstructions();
        return;
      }
    }

    // Handle local files
    if (pdfUrl.startsWith('file://')) {
      try {
        const response = await fetch(pdfUrl, {
          mode: 'same-origin',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/pdf'
          }
        });

        if (!response.ok && response.status !== 0) { // Status 0 is valid for local files
          throw new Error(`HTTP Status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('No data received from PDF file');
        }

        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: chrome.runtime.getURL('cmaps/'),
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        let formattedText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(' ');
          formattedText += `Page ${i}: "${pageText}"\n\n`;
        }
        
        extractedText = formattedText.trim();
        return;
      } catch (error) {
        console.error('Local file error:', error);
        showError(`Error reading local file: ${error.message}`);
        return;
      }
    }

    // Handle online PDFs
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    loadingTask.onPassword = function(updatePassword, reason) {
      showError('This PDF is password-protected and cannot be processed.');
    };

    const pdf = await loadingTask.promise;
    let formattedText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      formattedText += `Page ${i}: "${pageText}"\n\n`;
    }
    extractedText = formattedText.trim();
    
  } catch (error) {
    showError('Error extracting text: ' + error.message);
  }
}

// Function to show error message
function showError(message) {
  showUIComponent(`<p class="error">${message}</p>`);
}

// Function to extract text from website
async function extractTextFromWebsite() {
  try {
    // Get all visible text from the webpage
    const bodyText = document.body.innerText;
    
    // Remove any script content
    const cleanText = bodyText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Store the extracted text
    extractedText = cleanText;
    
    // Set flag to indicate successful extraction
    isTextExtracted = true;
    
  } catch (error) {
    console.error('Error extracting text from website:', error);
    showError('Failed to extract text from the website');
  }
}

//=============================================================================
// Chat and Response Handling
//=============================================================================

// Function to handle sending prompts to the AI
function sendPrompt() {
  const promptInput = document.getElementById('prompt-input');
  const prompt = promptInput.value.trim();  // Add trim() to remove whitespace
  
  // Check if prompt is empty or only whitespace
  if (!prompt) {
    return;  // Don't send empty prompts
  }

  let fullPrompt;

  if (conversationHistory.length === 0) {
    const prePrompt = `
Based on the extracted text above:
- **Provide a straightforward, concise response**
- Use bullet points or numbering when appropriate
- Only when asked about a specific page, provide a response based on the page text alone.
- Only when asked about which page, answer the page numbers from the PDF text and in relevance to the query or most recent conversation.
- When asked about a question involving some calculation, simply provide the answer/end result, and one line of work in human language (i.e. Profit Margin = Net Income / Revenue)

Main instruction/ask: `;
    fullPrompt = extractedText + '\n\n' + prePrompt + prompt;
    
    // Add text and pre-prompt to conversation history, but don't display them
    conversationHistory.push({ role: 'system', content: extractedText });
    conversationHistory.push({ role: 'system', content: prePrompt });
  } else {
    fullPrompt = `user: ${prompt}`;
  }

  // Clear input and hide prompt wrapper immediately
  promptInput.value = '';
  document.getElementById('prompt-wrapper').classList.add('hidden');
  document.getElementById('generating-button').classList.remove('hidden');
  document.getElementById('generating-button').textContent = 'Munching...';

  // Add user message to conversation history
  conversationHistory.push({ role: 'user', content: prompt });

  chrome.runtime.sendMessage({
    action: "generateResponse",
    prompt: fullPrompt,
    history: conversationHistory
  }, response => {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError);
      document.getElementById('prompt-wrapper').classList.remove('hidden');
      document.getElementById('generating-button').classList.add('hidden');
    }
  });
}

//=============================================================================
// Markdown and Link Processing
//=============================================================================

// Function to render markdown text with specific options
function renderMarkdown(text) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false
  });
  return marked.parse(text);
}

// Function to create clickable page number links in the text
function createPageLinks(text) {
  console.log('Creating page links for text:', text);
  const linkedText = text.replace(/Page\s+(\d+)/gi, (match, pageNum) => {
    console.log('Found page reference:', pageNum);
    return `<a href="#" class="page-link" data-page="${pageNum}" style="color: black; text-decoration: underline; cursor: pointer;">Page ${pageNum}</a>`;
  });
  
  // Add click event listener using event delegation
  setTimeout(() => {
    const outputField = document.getElementById('output-field');
    if (outputField) {
      outputField.addEventListener('click', (e) => {
        if (e.target.classList.contains('page-link')) {
          e.preventDefault();
          const pageNum = parseInt(e.target.dataset.page, 10);
          
          // Check if we're in a PDF context
          const isPDF = document.contentType === 'application/pdf' || 
                       window.location.href.toLowerCase().endsWith('.pdf');
          
          if (isPDF) {
            // Get the current URL and update it with the new page number
            const currentUrl = window.location.href;
            const baseUrl = currentUrl.split('#')[0]; // Remove any existing hash
            const newUrl = `${baseUrl}#page=${pageNum}`;
            
            // First update the hash
            window.location.hash = `page=${pageNum}`;
            
            // Then force a reload after a small delay
            setTimeout(() => {
              window.location.reload();
            }, 100);
          } else {
            // Fallback to hash-based navigation for non-PDF pages
            window.location.hash = `page=${pageNum}`;
          }
        }
      });
    }
  }, 0);
  
  return linkedText;
}
