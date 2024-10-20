let extractedText = '';
let uiComponent = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleExtraction") {
    if (uiComponent) {
      removeUIComponent();
    } else {
      checkForPDFAndExtract();
    }
  }
});

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
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    extractedText = text;
    showUIComponent(extractedText);
  } catch (error) {
    showError('Error extracting text: ' + error.message);
  }
}

function showUIComponent(text) {
  uiComponent = document.createElement('div');
  uiComponent.id = 'pdf-extractor-ui';
  uiComponent.innerHTML = `
    <h2>Extracted Text</h2>
    <div id="extracted-text">${text}</div>
  `;
  document.body.appendChild(uiComponent);
}

function removeUIComponent() {
  if (uiComponent) {
    uiComponent.remove();
    uiComponent = null;
  }
}

function showError(message) {
  showUIComponent(`<p class="error">${message}</p>`);
}
