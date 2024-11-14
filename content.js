let extractedText = '';
let uiComponent = null;
let isUIVisible = false;
let conversationHistory = [];
let hasCheckedPermission = false;

// Add this function to check for PDF and extract text immediately
async function initializeExtraction() {
  // Clear previous chat history
  extractedText = '';
  conversationHistory = [];
  if (uiComponent) {
    uiComponent.remove();
    uiComponent = null;
  }
  isUIVisible = false;

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
    extractTextFromPDF();
  } else {
    console.log('This page is not a PDF file.');
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
      showUIComponent(extractedText);
    }
  }
});

function showUIComponent(text) {
  if (!uiComponent) {
    uiComponent = document.createElement('div');
    uiComponent.id = 'pdf-extractor-ui';
    uiComponent.innerHTML = `
      <div id="output-field"></div>
      <div id="input-container">
        <div id="prompt-wrapper">
          <input type="text" id="prompt-input" placeholder="Enter your prompt...">
          <button id="send-button">Send</button>
        </div>
        <button id="generating-button" style="display: none;">Generating...</button>
      </div>
    `;
    document.body.appendChild(uiComponent);
    
    document.getElementById('send-button').addEventListener('click', sendPrompt);
    document.getElementById('prompt-input').addEventListener('keypress', function(event) {
      if (event.key === 'Enter') {
        sendPrompt();
      }
    });
  }
  
  // Initialize empty output field instead of showing extracted text
  const outputField = document.getElementById('output-field');
  outputField.innerHTML = '';
  
  uiComponent.style.display = 'block';
  isUIVisible = true;
}

function hideUIComponent() {
  if (uiComponent) {
    uiComponent.style.display = 'none';
    isUIVisible = false;
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
    font-family: 'Inter', sans-serif;
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
  outputField.innerHTML += `<strong>ChatPDF:</strong> ${DOMPurify.sanitize(prompt)}<br><br>`;
  
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
