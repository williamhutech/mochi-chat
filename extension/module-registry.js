/**
 * Module Registry for Mochi Chat Extension
 * 
 * Provides centralized module management to prevent redundant loading
 * and enable efficient access to shared modules across the extension.
 * 
 * Key Features:
 * - Lazy loading of modules on first request
 * - Module caching to prevent duplicate initialization
 * - Debug logging for module loading events
 * - Support for Manifest V3 service worker lifecycle
 * 
 * @module module-registry
 */

// Track loaded modules and their instances
const loadedModules = new Map();

// Track module loading promises to prevent duplicate loading requests
const loadingPromises = new Map();

/**
 * Get or load a module
 * 
 * @param {string} moduleName - Name/path of the module relative to extension root
 * @param {Function} [initializerFn] - Optional function to run after loading
 * @returns {Promise<any>} - The loaded module
 */
export async function getModule(moduleName, initializerFn) {
  // Check if module is already loaded
  if (loadedModules.has(moduleName)) {
    return loadedModules.get(moduleName);
  }
  
  // Check if module is currently being loaded
  if (loadingPromises.has(moduleName)) {
    return loadingPromises.get(moduleName);
  }
  
  // Create loading promise and store it
  const loadPromise = (async () => {
    try {
      // Log the loading attempt
      console.log(`[Mochi-Registry] Loading module: ${moduleName}`);
      
      // Load the module
      const moduleUrl = chrome.runtime.getURL(moduleName);
      const module = await import(moduleUrl);
      
      // If initializer provided, run it
      if (initializerFn && typeof initializerFn === 'function') {
        await initializerFn(module);
      }
      
      // Store loaded module
      loadedModules.set(moduleName, module);
      console.log(`[Mochi-Registry] Module loaded: ${moduleName}`);
      
      return module;
    } catch (error) {
      console.error(`[Mochi-Registry] Failed to load module ${moduleName}:`, error);
      throw error;
    } finally {
      // Remove loading promise when done
      loadingPromises.delete(moduleName);
    }
  })();
  
  // Store the loading promise
  loadingPromises.set(moduleName, loadPromise);
  
  return loadPromise;
}

/**
 * Reset registry (useful for testing or specific scenarios)
 */
export function resetRegistry() {
  loadedModules.clear();
  loadingPromises.clear();
}

/**
 * Check if a module is loaded
 * 
 * @param {string} moduleName - The name of the module to check
 * @returns {boolean} - Whether the module is loaded
 */
export function isModuleLoaded(moduleName) {
  return loadedModules.has(moduleName);
}

/**
 * Log to background script with module identifier
 * 
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message
 */
function logToBackground(message, isError = false) {
  chrome.runtime.sendMessage({
    action: 'logFromContent',
    message: message,
    source: 'Mochi-Registry',
    isError: isError
  }).catch(err => {
    // Fallback to console if message sending fails
    const logMethod = isError ? console.error : console.log;
    logMethod(`[Mochi-Registry] ${message}`);
  });
}
