let extractedText = '';
let uiComponent = null;
let isUIVisible = false;
let conversationHistory = [];

// Add this function to check for PDF and extract text immediately
function initializeExtraction() {
  // Clear previous chat history
  extractedText = '';
  conversationHistory = [];
  if (uiComponent) {
    uiComponent.remove();
    uiComponent = null;
  }
  isUIVisible = false;

  if (document.contentType === 'application/pdf') {
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
        <input type="text" id="prompt-input" placeholder="Enter your prompt...">
        <button id="send-button">Send</button>
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
  const outputField = document.getElementById('output-field');
  outputField.innerHTML = DOMPurify.sanitize(renderMarkdown(text));
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
  if (document.contentType === 'application/pdf') {
    extractTextFromPDF();
  } else {
    showError('This page is not a PDF file.');
  }
}

async function extractTextFromPDF() {
  try {
    const pdfjsLib = await import(chrome.runtime.getURL('pdf.mjs'));
    
    if (!pdfjsLib || !pdfjsLib.getDocument) {
      throw new Error('PDF.js library not loaded correctly');
    }

    // Set the worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');

    const loadingTask = pdfjsLib.getDocument(window.location.href);
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
    showUIComponent(extractedText);
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
    
    // Add PDF text to conversation history
    conversationHistory.push({ role: 'system', content: extractedText });
    
    // Add pre-prompt to conversation history
    conversationHistory.push({ role: 'system', content: prePrompt });
  } else {
    fullPrompt = `user: ${prompt}`;
  }

  conversationHistory.push({ role: 'user', content: prompt });
  
  const outputField = document.getElementById('output-field');
  outputField.innerHTML += `<strong>Response:</strong> ${DOMPurify.sanitize(prompt)}<br><br>`;
  
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

    if (request.error) {
      console.error('Error:', request.error);
      outputField.innerHTML += `<span style="color: red;">Error: ${request.error}</span>`;
    } else if (request.text) {
      // Get the existing prompt
      const existingPrompt = outputField.querySelector('strong')?.outerHTML || '';
      
      // Update the output field with the accumulated response
      outputField.innerHTML = `${existingPrompt}${DOMPurify.sanitize(renderMarkdown(request.text))}`;
      
      // Scroll to the bottom of the output field
      outputField.scrollTop = outputField.scrollHeight;

      if (request.isFinal) {
        conversationHistory.push({ role: 'system', content: request.text });
      }
    }
  }
});

function renderMarkdown(text) {
  return marked.parse(text);
}
