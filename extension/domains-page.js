/**
 * Domains page script for Mochi Chat Extension
 * Handles initialization and event handling for the hidden domains management
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Set up back button
  const backButton = document.getElementById('back-button');
  if (backButton) {
    backButton.addEventListener('click', () => {
      // Navigate back to main popup
      window.location.href = 'extension-popup.html';
    });
  }
  
  // Load and display hidden domains
  loadHiddenDomains();
  
  // Set up clear button event listener
  const clearButton = document.getElementById('clearHiddenDomains');
  if (clearButton) {
    clearButton.addEventListener('click', clearAllHiddenDomains);
  }
});

/**
 * Load hidden domains from storage and display them
 * @returns {Promise<void>}
 */
async function loadHiddenDomains() {
  const container = document.getElementById('hidden-domains-container');
  if (!container) return;
  
  try {
    // Get hidden domains from background script
    chrome.runtime.sendMessage({ action: 'getHiddenDomains' }, response => {
      if (!response || !response.domains) {
        displayErrorMessage(container, 'Could not load hidden domains');
        return;
      }
      
      const domains = response.domains;
      if (domains.length === 0) {
        container.innerHTML = '<div class="empty-message">No hidden domains</div>';
        return;
      }
      
      // Show clear button if domains exist
      const clearButton = document.getElementById('clearHiddenDomains');
      if (clearButton) {
        clearButton.style.display = 'inline-block';
      }
      
      // Create domain list
      container.innerHTML = '';
      domains.forEach(domain => {
        const domainItem = document.createElement('div');
        domainItem.className = 'domain-item';
        domainItem.style.display = 'flex';
        domainItem.style.justifyContent = 'space-between';
        domainItem.style.alignItems = 'center';
        domainItem.style.padding = '8px 0';
        domainItem.style.borderBottom = '1px solid var(--border-color)';
        
        const domainText = document.createElement('span');
        domainText.textContent = domain;
        domainText.style.fontSize = '13px';
        
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Re-enable';
        removeButton.style.background = 'none';
        removeButton.style.border = '1px solid var(--primary-color)';
        removeButton.style.borderRadius = '4px';
        removeButton.style.color = 'var(--primary-color)';
        removeButton.style.cursor = 'pointer';
        removeButton.style.fontSize = '12px';
        removeButton.style.padding = '3px 8px';
        removeButton.title = 'Re-enable Mochi Chat for this domain';
        removeButton.onclick = () => removeDomain(domain);
        
        domainItem.appendChild(domainText);
        domainItem.appendChild(removeButton);
        container.appendChild(domainItem);
      });
    });
  } catch (error) {
    console.error('[Mochi-Extension] Error loading hidden domains:', error);
    displayErrorMessage(container, 'Error: ' + error.message);
  }
}

/**
 * Remove a domain from the hidden list
 * @param {string} domain - Domain to remove
 * @returns {Promise<void>}
 */
function removeDomain(domain) {
  if (!domain) return;
  
  chrome.runtime.sendMessage({ 
    action: 'removeDomainFromHidden', 
    domain 
  }, response => {
    if (response && response.success) {
      // Reload domain list
      loadHiddenDomains();
    } else {
      console.error('[Mochi-Extension] Error removing domain:', domain);
    }
  });
}

/**
 * Clear all domains from the hidden list
 * @returns {Promise<void>}
 */
function clearAllHiddenDomains() {
  const clearButton = document.getElementById('clearHiddenDomains');
  if (clearButton) {
    clearButton.textContent = 'Cleared Successfully';
    clearButton.disabled = true;
  }
  
  chrome.runtime.sendMessage({ action: 'clearHiddenDomains' }, response => {
    if (response && response.success) {
      loadHiddenDomains();
    } else {
      console.error('[Mochi-Extension] Error clearing hidden domains');
      if (clearButton) {
        clearButton.textContent = 'Clear All';
        clearButton.disabled = false;
      }
    }
  });
}

/**
 * Display an error message in the container
 * @param {HTMLElement} container - Container element
 * @param {string} message - Error message to display
 */
function displayErrorMessage(container, message) {
  container.innerHTML = `
    <div class="error-message" style="color: #d32f2f; font-size: 12px;">
      ${message}
    </div>
  `;
}
