let extractedText = '';
let uiComponent = null;
let isUIVisible = false;
let conversationHistory = [];
let hasCheckedPermission = false;
let toggleButton = null;
let lastResponse = ''; // Store the last response

// Add this function to check for PDF and extract text immediately
async function initializeExtraction() {
  // Reset all states
  extractedText = '';
  conversationHistory = [];
  lastResponse = ''; // Clear last response for new page
  isUIVisible = false;

  // Remove existing UI elements
  if (uiComponent) {
    uiComponent.remove();
    uiComponent = null;
  }
  if (toggleButton) {
    toggleButton.remove();
    toggleButton = null;
  }

  const isPDF = document.contentType === 'application/pdf' || 
                window.location.href.toLowerCase().endsWith('.pdf');
  
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
    createToggleButton(); // Create but don't show yet
    showToggleButton();
  } else {
    await extractTextFromWebsite();
    createToggleButton(); // Create but don't show yet
    showToggleButton();
  }
}

// Function to extract text from website
function extractTextFromWebsite() {
  try {
    // Get all text content from the page, excluding scripts and styles
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip if parent is script, style, or hidden
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          if (parent.tagName === 'SCRIPT' || 
              parent.tagName === 'STYLE' || 
              parent.tagName === 'NOSCRIPT' ||
              getComputedStyle(parent).display === 'none' ||
              getComputedStyle(parent).visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Accept if node contains non-whitespace
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let textContent = '';
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text) {
        textContent += text + '\n';
      }
    }

    // Clean up the text
    extractedText = textContent
      .replace(/(\n\s*){3,}/g, '\n\n')  // Replace multiple newlines with double newline
      .trim();

    // Show the UI with extracted text
    showUIComponent('');
  } catch (error) {
    console.error('Error extracting website text:', error);
    showError('Failed to extract text from the website');
  }
}

// Call the function immediately when the script is loaded
initializeExtraction();

// Add event listener for page unload to reinitialize on refresh
window.addEventListener('beforeunload', () => {
  setTimeout(initializeExtraction, 0);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleExtraction") {
    if (isUIVisible) {
      hideUIComponent();
    } else {
      showUIComponent('');
    }
  }
});

function showUIComponent() {
  const isPDF = document.contentType === 'application/pdf' || 
                window.location.href.toLowerCase().endsWith('.pdf');
  const title = isPDF ? 'Mochi - Chat with PDF' : 'Mochi - Chat with Website';
                
  if (!uiComponent) {
    uiComponent = document.createElement('div');
    uiComponent.id = 'pdf-extractor-ui';
    uiComponent.style.display = 'none'; // Ensure it starts hidden
    
    // Add Noto Sans font
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
    
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
          <button id="generating-button" style="display: none;">
            <span class="loading-dots">Generating</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(uiComponent);
    
    // Add modern styles
    const style = document.createElement('style');
    style.textContent = `
      #chat-toggle-button {
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 44px;
        height: 44px;
        background: #ffffff;
        border-radius: 6px;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        transition: all 0.2s;
        z-index: 10000;
        color: #000000;
        border: 1px solid rgba(0, 0, 0, 0.08);
      }

      #chat-toggle-button svg {
        width: 26px;
        height: 26px;
      }

      #chat-toggle-button:hover {
        background: #f9f9f9;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
      }

      #pdf-extractor-ui {
        position: fixed;
        bottom: 80px;
        left: 20px;
        width: 320px;
        height: 500px;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
        z-index: 10000;
        font-family: 'Noto Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.2s ease;
        display: none;
        overflow: hidden;
        border: 1px solid rgba(0, 0, 0, 0.08);
      }

      #pdf-extractor-ui.expanded {
        width: 416px;  /* 320px + 30% */
        height: 650px; /* 500px + 30% */
      }

      #pdf-extractor-ui.visible {
        opacity: 1;
        transform: translateY(0);
        display: block;
      }

      #chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #ffffff;
      }

      #chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.04);
      }

      .header-buttons {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      #chat-title {
        font-size: 14px;
        font-weight: 500;
        color: #000000;
      }

      #expand-button,
      #close-button {
        background: none;
        border: none;
        width: 24px;
        height: 24px;
        padding: 4px;
        cursor: pointer;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
      }

      #expand-button:hover,
      #close-button:hover {
        background: #f5f5f5;
      }

      #output-field {
        flex: 1;
        overflow-y: auto;
        padding: 14px 16px;
        font-size: 13px;
        line-height: 1.5;
        color: #000000;
        font-family: 'Noto Sans', sans-serif;
        border-bottom: 1px solid rgba(0, 0, 0, 0.03);
      }

      #input-container {
        padding: 14px;
      }

      #prompt-wrapper {
        display: flex;
        gap: 8px;
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        padding: 6px 8px;
        align-items: center;
      }

      #prompt-input {
        flex: 1;
        border: none;
        background: #ffffff;
        padding: 6px 0 6px 4px;
        font-size: 13px;
        color: #000000;
        outline: none;
        font-family: 'Noto Sans', sans-serif;
      }

      #prompt-input:focus {
        outline: none;
        box-shadow: none;
      }

      #prompt-input::placeholder {
        color: #999;
        padding-left: 4px;
      }

      #send-button {
        background: none;
        border: none;
        color: #000;
        width: 26px;
        height: 26px;
        min-width: 26px;
        min-height: 26px;
        padding: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        opacity: 0.8;
      }

      #send-button:hover {
        background: #f5f5f5;
        opacity: 1;
      }

      #generating-button {
        width: 100%;
        padding: 8px;
        background: #ffffff;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 6px;
        color: #666;
        font-size: 13px;
        margin-top: 8px;
        cursor: wait;
        font-family: 'Noto Sans', sans-serif;
      }

      /* Markdown content styling */
      #output-field p {
        margin: 0 0 10px 0;
        font-family: 'Noto Sans', sans-serif;
      }

      #output-field ul, #output-field ol {
        margin: 0 0 10px 0;
        padding-left: 20px;
      }

      #output-field ul li, #output-field ol li {
        margin-bottom: 4px;
        line-height: 1.5;
      }

      #output-field ul {
        list-style-type: disc;
      }

      #output-field ol {
        list-style-type: decimal;
      }

      #output-field code {
        background: rgba(0, 0, 0, 0.03);
        padding: 2px 4px;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace;
        font-size: 12px;
      }

      #output-field pre {
        background: rgba(0, 0, 0, 0.03);
        padding: 10px;
        border-radius: 6px;
        overflow-x: auto;
        margin-bottom: 10px;
      }

      #output-field pre code {
        background: none;
        padding: 0;
      }
    `;
    document.head.appendChild(style);
    
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
  
  // Show the last response if it exists, otherwise initialize empty
  const outputField = document.getElementById('output-field');
  outputField.innerHTML = lastResponse || '';
  
  // Show with animation
  uiComponent.style.display = 'block';
  // Trigger reflow
  uiComponent.offsetHeight;
  uiComponent.classList.add('visible');
  isUIVisible = true;
}

function toggleExpand() {
  if (uiComponent) {
    uiComponent.classList.toggle('expanded');
  }
}

function hideUIComponent() {
  if (uiComponent) {
    // Save the current response before hiding
    lastResponse = document.getElementById('output-field').innerHTML;
    uiComponent.classList.remove('visible');
    setTimeout(() => {
      uiComponent.style.display = 'none';
    }, 200);
    isUIVisible = false;
  }
}

function createToggleButton() {
  if (!toggleButton) {
    toggleButton = document.createElement('div');
    toggleButton.id = 'chat-toggle-button';
    toggleButton.style.display = 'none'; // Ensure it starts hidden
    toggleButton.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    document.body.appendChild(toggleButton);

    toggleButton.addEventListener('click', () => {
      if (isUIVisible) {
        hideUIComponent();
      } else {
        showUIComponent();
      }
    });
  }
}

function showToggleButton() {
  if (toggleButton) {
    toggleButton.style.display = 'flex';
  }
}

function checkForPDFAndExtract() {
  const isPDF = document.contentType === 'application/pdf' || 
                window.location.href.toLowerCase().endsWith('.pdf');
  if (isPDF) {
    extractTextFromPDF();
  } else {
    showError('This page is not a PDF file.');
  }
}

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

async function showFileAccessInstructions() {
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
    <p>PDF Text Extractor needs permission to access local PDF files.</p>
    <ol style="margin-bottom: 20px;">
      <li>Click the button below to open Extensions page</li>
      <li>Find "PDF Text Extractor"</li>
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
  });
  
  document.getElementById('close-instructions').addEventListener('click', () => {
    instructionsDiv.remove();
  });
}

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
        showUIComponent('');
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
    
    showUIComponent('');
  } catch (error) {
    showError('Error extracting text: ' + error.message);
  }
}

function showError(message) {
  showUIComponent(`<p class="error">${message}</p>`);
}

function sendPrompt() {
  const promptInput = document.getElementById('prompt-input');
  const prompt = promptInput.value;
  let fullPrompt;

  if (conversationHistory.length === 0) {
    const prePrompt = `
Based on the extracted PDF text above:
- **Provide a straightforward, concise response**
- Use bullet points or numbering when appropriate
- Only when asked about a specific page, provide a response based on the page text alone.
- Only when asked about which page, answer the page numbers from the PDF text and in relevance to the query or most recent conversation.
- When asked about a question involving some calculation, simply provide the answer/end result, and one line of work in human language (i.e. Profit Margin = Net Income / Revenue)

Main instruction/ask: `;
    fullPrompt = extractedText + '\n\n' + prePrompt + prompt;
    
    // Add PDF text and pre-prompt to conversation history, but don't display them
    conversationHistory.push({ role: 'system', content: extractedText });
    conversationHistory.push({ role: 'system', content: prePrompt });
  } else {
    fullPrompt = `user: ${prompt}`;
  }

  // Only display the user's prompt in the UI
  const outputField = document.getElementById('output-field');
  outputField.innerHTML += `${DOMPurify.sanitize(prompt)}<br><br>`;
  
  // Clear input after sending
  promptInput.value = '';
  
  console.log('Sending prompt to background script:', fullPrompt);
  
  chrome.runtime.sendMessage({
    action: "generateResponse",
    prompt: fullPrompt,
    history: conversationHistory
  }, response => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message:', chrome.runtime.lastError);
      outputField.innerHTML += `<span class="error">Error: ${chrome.runtime.lastError.message}</span>`;
    } else {
      console.log('Message sent successfully, response:', response);
    }
  });
  
  promptInput.value = '';
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateStreamingResponse") {
    console.log('Received streaming update:', request);
    const outputField = document.getElementById('output-field');
    const promptWrapper = document.getElementById('prompt-wrapper');
    const generatingButton = document.getElementById('generating-button');
    const promptInput = document.getElementById('prompt-input');

    if (!request.isFinal) {
      // Hide input and show generating button while streaming
      promptWrapper.style.display = 'none';
      generatingButton.style.display = 'block';
      generatingButton.textContent = 'Generating...';
    }

    if (request.error) {
      console.error('Error:', request.error);
      outputField.innerHTML += `<span style="color: red;">Error: ${request.error}</span>`;
      promptWrapper.style.display = 'flex';
      generatingButton.style.display = 'none';
    } else if (request.text) {
      const existingPrompt = outputField.querySelector('strong')?.outerHTML || '';
      const linkedText = createPageLinks(request.text);
      outputField.innerHTML = `${existingPrompt}${DOMPurify.sanitize(renderMarkdown(linkedText))}`;
      outputField.scrollTop = outputField.scrollHeight;

      if (request.isFinal) {
        promptWrapper.style.display = 'flex';
        generatingButton.style.display = 'none';
        conversationHistory.push({ role: 'system', content: request.text });
        
        // Focus on the input field and clear its value
        promptInput.value = '';
        promptInput.focus();
        
        // Add click handlers for page links with immediate execution
        outputField.querySelectorAll('.page-link').forEach(link => {
          link.addEventListener('click', async (e) => {
            e.preventDefault();
            const pageNum = parseInt(e.target.dataset.page);
            console.log('Page link clicked:', pageNum);
            
            try {
              // For Chrome/Brave built-in viewer
              const viewer = document.querySelector('embed[type="application/pdf"]');
              if (viewer) {
                // Try to get the viewer's parent window
                const viewerParent = viewer.closest('html');
                if (viewerParent && viewerParent.PDFViewerApplication) {
                  viewerParent.PDFViewerApplication.pdfViewer.scrollPageIntoView({ pageNumber: pageNum });
                  return;
                }
              }

              // Try accessing the viewer directly
              if (PDFViewerApplication) {
                PDFViewerApplication.pdfViewer.scrollPageIntoView({ pageNumber: pageNum });
                return;
              }

              // Fallback to URL hash
              const currentUrl = window.location.href.split('#')[0];
              window.location.href = `${currentUrl}#page=${pageNum}`;
              
            } catch (error) {
              console.error('Error navigating to page:', error);
              // Final fallback - reload with hash
              const currentUrl = window.location.href.split('#')[0];
              window.location.href = `${currentUrl}#page=${pageNum}`;
            }
          });
        });
      }
    }
  }
});

function renderMarkdown(text) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false
  });
  return marked.parse(text);
}

// Add this new function to handle page number links
function createPageLinks(text) {
  console.log('Creating page links for text:', text);
  const linkedText = text.replace(/Page\s+(\d+)/gi, (match, pageNum) => {
    console.log('Found page reference:', pageNum);
    // Add data attributes for both page number and navigation
    return `<a href="#page=${pageNum}" class="page-link" data-page="${pageNum}" data-nav="page" style="color: black; text-decoration: underline; cursor: pointer;">Page ${pageNum}</a>`;
  });
  console.log('Text with links:', linkedText);
  return linkedText;
}

// Create toggle button when needed
function createToggleButton() {
  if (!toggleButton) {
    toggleButton = document.createElement('div');
    toggleButton.id = 'chat-toggle-button';
    toggleButton.style.display = 'none'; // Ensure it starts hidden
    toggleButton.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    document.body.appendChild(toggleButton);

    toggleButton.addEventListener('click', () => {
      if (isUIVisible) {
        hideUIComponent();
      } else {
        showUIComponent();
      }
    });
  }
}

function showToggleButton() {
  if (toggleButton) {
    toggleButton.style.display = 'flex';
  }
}
