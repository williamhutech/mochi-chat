/**
 * Instructions page script for Mochi Chat Extension
 * Handles initialization and event handling for the extension instructions page
 * This script is loaded when the extension is first installed or when accessing
 * the instructions page manually
 */

/**
 * Initialize event listeners and setup page functionality
 * Attaches click handler to the extensions button and sets up message passing
 */
document.addEventListener('DOMContentLoaded', () => {
    // Get reference to the extensions button
    const openExtensionsButton = document.getElementById('openExtensions');
    
    if (openExtensionsButton) {
        // Add click event listener to handle opening extensions page
        openExtensionsButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ 
                action: 'openExtensionsPage',
                source: 'instructions'
            }, response => {
                // Log response from background script
                console.log('[Mochi-Instructions] Response from background:', response);
                
                if (!response) {
                    console.error('[Mochi-Instructions] No response received from background script');
                }
            });
        });
    } else {
        console.error('[Mochi-Instructions] Could not find openExtensions button');
    }
});
