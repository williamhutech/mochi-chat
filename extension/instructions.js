/**
 * Instructions page script for Mochi Chat Extension
 * Handles initialization and event handling for the extension instructions page
 * This script is loaded when the extension is first installed or when accessing
 * the instructions page manually
 */

/**
 * Slideshow class for managing the onboarding tutorial
 * Controls slide navigation and user interactions
 */
class Slideshow {
    /**
     * Initialize the slideshow with necessary elements and state
     */
    constructor() {
        // Main elements
        this.slidesContainer = document.getElementById('slides');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.nextBtn1 = document.getElementById('nextBtn1');
        this.openExtensionsBtn = document.getElementById('openExtensions');
        
        // State
        this.currentSlide = 0;
        this.totalSlides = 4; // Total number of slides
        
        // Bind event listeners
        this.bindEvents();
        
        // Initialize button states
        this.updateButtonStates();
    }
    
    /**
     * Attach event listeners to slideshow controls
     */
    bindEvents() {
        // Navigation buttons
        this.prevBtn.addEventListener('click', () => this.prevSlide());
        this.nextBtn.addEventListener('click', () => this.nextSlide());
        
        // Slide-specific Next button (now on slide 2)
        if (this.nextBtn1) {
            this.nextBtn1.addEventListener('click', () => this.goToSlide(2));
        }
        
        // Open extensions button
        if (this.openExtensionsBtn) {
            this.openExtensionsBtn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ action: 'openExtensionsPage' });
            });
        }
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') {
                this.nextSlide();
            } else if (e.key === 'ArrowLeft') {
                this.prevSlide();
            }
        });
    }
    
    /**
     * Navigate to the previous slide if available
     */
    prevSlide() {
        if (this.currentSlide > 0) {
            this.goToSlide(this.currentSlide - 1);
        }
    }
    
    /**
     * Navigate to the next slide if available
     */
    nextSlide() {
        if (this.currentSlide < this.totalSlides - 1) {
            this.goToSlide(this.currentSlide + 1);
        }
    }
    
    /**
     * Go to a specific slide by index
     * @param {number} index - The slide index to navigate to
     */
    goToSlide(index) {
        // Validate index
        if (index < 0 || index >= this.totalSlides) return;
        
        // Update current slide
        this.currentSlide = index;
        
        // Update slides position
        this.slidesContainer.style.transform = `translateX(-${index * 100}%)`;
        
        // Update button states
        this.updateButtonStates();
    }
    
    /**
     * Update the navigation button states based on current slide
     */
    updateButtonStates() {
        // Handle Previous button
        this.prevBtn.disabled = this.currentSlide === 0;
        
        // Update Next button text/state
        if (this.currentSlide === this.totalSlides - 1) {
            this.nextBtn.textContent = 'Finish';
            this.nextBtn.disabled = true; // Disable on last slide
        } else {
            this.nextBtn.textContent = 'Next';
            this.nextBtn.disabled = false;
        }
    }
}

/**
 * Initialize the slideshow when the DOM is fully loaded
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the slideshow
    const slideshow = new Slideshow();
    
    // Set up Chrome extension message handling
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // Handle any extension-specific messages here
            return true;
        });
    }
});
