/**
 * Extension window script for Mochi Chat Extension
 * Handles initialization and event handling for the extension popup window
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Reset notification icon when popup opens
  // Check if there's an unread update
  const { hasUnreadUpdate } = await chrome.storage.local.get('hasUnreadUpdate');
  if (hasUnreadUpdate) {
    // Reset icon to normal and clear notification state
    chrome.action.setIcon({ path: 'logo48.png' });
    await chrome.storage.local.set({ hasUnreadUpdate: false });
  }

  // Open extensions page when button is clicked
  const openExtensionsButton = document.getElementById('openExtensions');
  
  if (openExtensionsButton) {
    openExtensionsButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ 
        action: 'openExtensionsPage',
        source: 'extension'
      }, response => {
        console.log('[Mochi-Extension] Response from background:', response);
        
        if (!response) {
          console.error('[Mochi-Extension] No response received from background script');
        }
      });
    });
  } else {
    console.error('[Mochi-Extension] Could not find extensions button');
  }
  
  // Set up domains link
  const domainsLink = document.getElementById('domains-link');
  if (domainsLink) {
    domainsLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate to domains page
      window.location.href = 'domains-page.html';
    });
  }
});
