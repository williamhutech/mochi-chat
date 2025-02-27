/**
 * Module Registry Test
 * 
 * This file contains tests for the module registry to verify that it works correctly.
 * It can be run in the browser console to check if the module registry is functioning as expected.
 */

// Import the module registry
import { getModule, resetRegistry, isModuleLoaded } from './module-registry.js';

/**
 * Run tests for the module registry
 * @returns {Promise<void>}
 */
async function runTests() {
  console.log('[Mochi-Test] Starting module registry tests...');
  
  try {
    // Test 1: Load a module
    console.log('[Mochi-Test] Test 1: Loading a module...');
    const messageTypes = await getModule('types/message.js');
    console.assert(messageTypes !== null, 'Module should be loaded');
    console.assert(isModuleLoaded('types/message.js'), 'Module should be marked as loaded');
    console.log('[Mochi-Test] Test 1: Passed ✅');
    
    // Test 2: Load the same module again (should use cached version)
    console.log('[Mochi-Test] Test 2: Loading the same module again...');
    const startTime = performance.now();
    const messageTypesAgain = await getModule('types/message.js');
    const endTime = performance.now();
    console.assert(endTime - startTime < 10, 'Cached module should load very quickly');
    console.assert(messageTypesAgain === messageTypes, 'Should return the same module instance');
    console.log('[Mochi-Test] Test 2: Passed ✅');
    
    // Test 3: Reset registry and load again
    console.log('[Mochi-Test] Test 3: Resetting registry and loading again...');
    resetRegistry();
    console.assert(!isModuleLoaded('types/message.js'), 'Module should not be marked as loaded after reset');
    const messageTypesAfterReset = await getModule('types/message.js');
    console.assert(messageTypesAfterReset !== null, 'Module should be loaded after reset');
    console.assert(isModuleLoaded('types/message.js'), 'Module should be marked as loaded after reset');
    console.log('[Mochi-Test] Test 3: Passed ✅');
    
    // Test 4: Load multiple modules
    console.log('[Mochi-Test] Test 4: Loading multiple modules...');
    resetRegistry();
    const [messageTypesMulti, conversationModule] = await Promise.all([
      getModule('types/message.js'),
      getModule('conversation.js', async (module) => {
        await module.initializeModules();
      })
    ]);
    console.assert(messageTypesMulti !== null, 'First module should be loaded');
    console.assert(conversationModule !== null, 'Second module should be loaded');
    console.assert(isModuleLoaded('types/message.js'), 'First module should be marked as loaded');
    console.assert(isModuleLoaded('conversation.js'), 'Second module should be marked as loaded');
    console.log('[Mochi-Test] Test 4: Passed ✅');
    
    console.log('[Mochi-Test] All tests passed! ✅');
  } catch (error) {
    console.error('[Mochi-Test] Test failed:', error);
  }
}

// Run tests when this file is loaded
runTests();
