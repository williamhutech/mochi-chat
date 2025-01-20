/**
 * Extension window script for Mochi Chat Extension
 * Handles initialization and event handling for the extension popup window
 */

document.addEventListener('DOMContentLoaded', () => {
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
});
