// Log the extension ID on page load
document.addEventListener('DOMContentLoaded', () => {
    const openExtensionsButton = document.getElementById('openExtensions');
    if (openExtensionsButton) {
        openExtensionsButton.addEventListener('click', () => {
            // Use message passing to open extensions page
            chrome.runtime.sendMessage({ 
                action: 'openExtensionsPage',
                source: 'instructions'
            }, response => {
                console.log('[Mochi-Instructions] Response from background:', response);
            });
        });
    }
});
