document.addEventListener('DOMContentLoaded', () => {
  const openExtensionsButton = document.getElementById('openExtensions');
  if (openExtensionsButton) {
    openExtensionsButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    });
  }
});
