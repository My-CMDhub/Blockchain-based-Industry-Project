/**
 * Blockchain Payment Gateway - Interactive User Guide Module
 * 
 * This module provides a guided tour and contextual help functionality
 * for the Blockchain Payment Gateway without affecting business logic.
 */

class PaymentGatewayGuide {
  constructor(options = {}) {
    // Default configuration
    this.config = {
      showOnFirstVisit: true,
      enableTooltips: true,
      startButtonId: 'start-guide-btn',
      skipButtonId: 'skip-guide-btn',
      tourStepClass: 'tour-step',
      activeStepClass: 'tour-step-active',
      tooltipClass: 'pg-tooltip',
      helpButtonClass: 'help-btn',
      storageKey: 'pg_guide_completed',
      ...options
    };
    
    // Tour steps for different pages
    this.tourSteps = {
      // Store/Product page steps
      'product': [
        {
          element: '.product-main',
          title: 'Welcome to the Blockchain Payment Gateway',
          content: 'This demo store allows you to test cryptocurrency payments. Browse products and add them to your cart.',
          position: 'bottom'
        },
        {
          element: '.add-to-cart-btn',
          title: 'Add to Cart',
          content: 'Click here to add products to your shopping cart.',
          position: 'right'
        },
        {
          element: '.checkout-btn',
          title: 'Checkout',
          content: 'Proceed to checkout to test the payment process.',
          position: 'left'
        }
      ],
      
      // Checkout page steps
      'checkout': [
        {
          element: '.payment-options',
          title: 'Payment Options',
          content: 'Choose between cryptocurrency or credit card payment.',
          position: 'top'
        },
        {
          element: '.crypto-option',
          title: 'Cryptocurrency Payment',
          content: 'Select this to pay with Ethereum on the Sepolia testnet.',
          position: 'right'
        },
        {
          element: '.stripe-option',
          title: 'Credit Card Payment',
          content: 'Select this to pay with a credit card via Stripe.',
          position: 'left'
        }
      ],
      
      // Cryptocurrency payment page steps
      'crypto-payment': [
        {
          element: '.payment-address',
          title: 'Payment Address',
          content: 'This is the unique Ethereum address generated for your payment. Send the exact amount shown to this address.',
          position: 'bottom'
        },
        {
          element: '.qr-code',
          title: 'QR Code',
          content: 'Scan this QR code with your mobile wallet app to easily make the payment.',
          position: 'right'
        },
        {
          element: '.payment-details',
          title: 'Payment Details',
          content: 'These are the details of your payment, including the amount to send and time remaining.',
          position: 'top'
        },
        {
          element: '.payment-status',
          title: 'Payment Status',
          content: 'This area will automatically update when your payment is detected and confirmed.',
          position: 'left'
        }
      ],
      
      // Merchant dashboard steps
      'merchant': [
        {
          element: '.dashboard-overview',
          title: 'Dashboard Overview',
          content: 'This is your merchant dashboard where you can monitor all payments and manage your account.',
          position: 'bottom'
        },
        {
          element: '.transaction-history',
          title: 'Transaction History',
          content: 'View all incoming payments, their statuses, and details here.',
          position: 'top'
        },
        {
          element: '.release-funds-section',
          title: 'Release Funds',
          content: 'Use these controls to transfer accumulated cryptocurrency to your merchant wallet.',
          position: 'right'
        },
        {
          element: '.wallet-balance',
          title: 'Wallet Balance',
          content: 'This shows your current balance across all payment addresses.',
          position: 'left'
        }
      ],
      
      // Admin dashboard steps
      'admin': [
        {
          element: '#activities-tab',
          title: 'Activities Tab',
          content: 'Monitor all user and merchant activities in the system.',
          position: 'bottom'
        },
        {
          element: '#hdwallet-tab',
          title: 'HD Wallet Tab',
          content: 'Manage the HD wallet, addresses, and cryptocurrency balances.',
          position: 'bottom'
        },
        {
          element: '#database-tab',
          title: 'Database Management',
          content: 'Monitor database health, create backups, and restore from backups if needed.',
          position: 'bottom'
        }
      ],
      
      // Secrets dashboard steps
      'secrets': [
        {
          element: '#status-content',
          title: 'Secret Manager Status',
          content: 'This shows whether you\'re using local file storage or Google Cloud Secret Manager.',
          position: 'bottom'
        },
        {
          element: '#toggle-backend',
          title: 'Toggle Backend',
          content: 'Switch between local file storage and Google Cloud Secret Manager.',
          position: 'top'
        },
        {
          element: '#create-secret-form',
          title: 'Create Demo Secret',
          content: 'Test creating a secret in the current backend.',
          position: 'right'
        }
      ],
      
      // GCP dashboard steps
      'gcp-dashboard': [
        {
          element: '#project-info',
          title: 'Google Cloud Project',
          content: 'This shows your connected Google Cloud project and secret count.',
          position: 'bottom'
        },
        {
          element: '#secrets-container',
          title: 'Secrets List',
          content: 'These cards show all secrets stored in Google Cloud Secret Manager.',
          position: 'top'
        },
        {
          element: '.console-link',
          title: 'View in Console',
          content: 'These links open the Google Cloud Console so you can verify the secrets are actually stored in GCP.',
          position: 'left'
        }
      ]
    };
    
    // Context-aware help tooltips
    this.helpTooltips = {
      '.payment-address': 'This is the Ethereum address to send your payment to. Copy it exactly.',
      '.qr-code': 'Scan this with your cryptocurrency wallet app to automatically fill in the payment details.',
      '.payment-timer': 'Payment addresses expire after this countdown. Make your payment before time runs out.',
      '.release-funds-btn': 'Transfer cryptocurrency from the payment gateway to your merchant wallet.',
      '.wrong-payment-tab': 'Review payments that didn\'t match the expected amount.',
      '#toggle-backend': 'Switch between local file storage and Google Cloud Secret Manager. Requires server restart.',
      '.view-details-btn': 'View technical details and verify this secret in Google Cloud.'
    };
    
    // Current page and tour state
    this.currentPage = this.detectCurrentPage();
    this.currentStepIndex = 0;
    this.tourActive = false;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the guide module
   */
  init() {
    this.injectStyles();
    this.createGuideTrigger();
    
    // Add help buttons to elements if tooltips are enabled
    if (this.config.enableTooltips) {
      this.initializeTooltips();
    }
    
    // Show guide automatically on first visit if enabled
    if (this.config.showOnFirstVisit && !this.hasCompletedTour()) {
      // Delay to ensure page has fully loaded
      setTimeout(() => this.startTour(), 1000);
    }
    
    // Listen for page navigation to update current page
    window.addEventListener('popstate', () => {
      this.currentPage = this.detectCurrentPage();
    });
  }
  
  /**
   * Inject necessary CSS styles for the guide
   */
  injectStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .${this.config.tourStepClass} {
        display: none;
        position: absolute;
        z-index: 9999;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 20px;
        max-width: 300px;
        transition: all 0.3s ease;
      }
      
      .${this.config.activeStepClass} {
        display: block;
        animation: tourFadeIn 0.5s ease;
      }
      
      .tour-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 9990;
      }
      
      .tour-highlight {
        position: relative;
        z-index: 9995;
        box-shadow: 0 0 0 4px rgba(66, 133, 244, 0.5);
        border-radius: 4px;
      }
      
      .tour-step-title {
        font-weight: bold;
        font-size: 18px;
        margin-bottom: 10px;
        color: #333;
      }
      
      .tour-step-content {
        font-size: 14px;
        line-height: 1.5;
        margin-bottom: 15px;
        color: #555;
      }
      
      .tour-buttons {
        display: flex;
        justify-content: space-between;
      }
      
      .tour-btn {
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      
      .tour-next-btn {
        background: #4285F4;
        color: white;
      }
      
      .tour-prev-btn {
        background: #f1f1f1;
        color: #333;
      }
      
      .tour-close-btn {
        background: #f1f1f1;
        color: #333;
      }
      
      .${this.config.helpButtonClass} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #4285F4;
        color: white;
        font-size: 12px;
        cursor: pointer;
        margin-left: 5px;
      }
      
      .${this.config.tooltipClass} {
        position: absolute;
        z-index: 9999;
        background: white;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        padding: 10px;
        max-width: 250px;
        font-size: 13px;
        color: #555;
        transition: opacity 0.2s ease;
      }
      
      #${this.config.startButtonId} {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4285F4;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.15);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      @keyframes tourFadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(styleElement);
  }
  
  /**
   * Create the guide trigger button
   */
  createGuideTrigger() {
    const existingButton = document.getElementById(this.config.startButtonId);
    if (existingButton) return;
    
    const button = document.createElement('button');
    button.id = this.config.startButtonId;
    button.innerHTML = '<i class="fas fa-question"></i>';
    button.title = 'Start Interactive Guide';
    button.addEventListener('click', () => this.startTour());
    
    document.body.appendChild(button);
  }
  
  /**
   * Initialize help tooltips on key elements
   */
  initializeTooltips() {
    Object.entries(this.helpTooltips).forEach(([selector, content]) => {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(element => {
        // Skip if already has a help button
        if (element.querySelector(`.${this.config.helpButtonClass}`)) {
          return;
        }
        
        // Create help button
        const helpButton = document.createElement('span');
        helpButton.className = this.config.helpButtonClass;
        helpButton.innerHTML = '?';
        helpButton.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showTooltip(element, content);
        });
        
        // Append to element or its parent depending on positioning
        if (element.style.position === 'relative' || element.style.position === 'absolute') {
          element.appendChild(helpButton);
        } else {
          const wrapper = document.createElement('span');
          wrapper.style.position = 'relative';
          wrapper.style.display = 'inline-block';
          element.parentNode.insertBefore(wrapper, element);
          wrapper.appendChild(element);
          wrapper.appendChild(helpButton);
        }
      });
    });
  }
  
  /**
   * Show a tooltip next to an element
   */
  showTooltip(element, content) {
    // Remove any existing tooltips
    this.removeTooltips();
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = this.config.tooltipClass;
    tooltip.textContent = content;
    
    // Position tooltip
    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    
    // Add close behavior
    document.addEventListener('click', this.removeTooltips.bind(this));
    
    // Add to DOM
    document.body.appendChild(tooltip);
  }
  
  /**
   * Remove all tooltips
   */
  removeTooltips() {
    const tooltips = document.querySelectorAll(`.${this.config.tooltipClass}`);
    tooltips.forEach(tooltip => tooltip.remove());
    
    document.removeEventListener('click', this.removeTooltips.bind(this));
  }
  
  /**
   * Detect current page based on URL or content
   */
  detectCurrentPage() {
    const path = window.location.pathname;
    
    if (path.includes('Product.html') || path === '/' || path === '/index.html') {
      return 'product';
    } else if (path.includes('checkout') || document.querySelector('.payment-options')) {
      return 'checkout';
    } else if (path.includes('crypto-payment') || document.querySelector('.payment-address')) {
      return 'crypto-payment';
    } else if (path.includes('merchant-dashboard') || document.querySelector('.merchant-dashboard')) {
      return 'merchant';
    } else if (path.includes('admin-dashboard') || document.querySelector('#adminTabs')) {
      return 'admin';
    } else if (path.includes('secrets-demo') || document.querySelector('#status-content')) {
      return 'secrets';
    } else if (path.includes('gcp-secrets-dashboard') || document.querySelector('#project-info')) {
      return 'gcp-dashboard';
    }
    
    // Default to product page if can't determine
    return 'product';
  }
  
  /**
   * Start the guided tour for the current page
   */
  startTour() {
    // Don't start if already running
    if (this.tourActive) return;
    
    // Get steps for current page
    const steps = this.tourSteps[this.currentPage];
    if (!steps || steps.length === 0) {
      console.warn(`No tour steps defined for page: ${this.currentPage}`);
      return;
    }
    
    this.tourActive = true;
    this.currentStepIndex = 0;
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'tour-backdrop';
    document.body.appendChild(backdrop);
    
    // Show first step
    this.showStep(this.currentStepIndex);
  }
  
  /**
   * Show a specific tour step
   */
  showStep(index) {
    // Get steps for current page
    const steps = this.tourSteps[this.currentPage];
    if (!steps || index >= steps.length) {
      this.endTour();
      return;
    }
    
    const step = steps[index];
    
    // Find target element
    const targetElement = document.querySelector(step.element);
    if (!targetElement) {
      console.warn(`Could not find element ${step.element} for tour step`);
      this.showStep(index + 1);
      return;
    }
    
    // Remove previous steps
    this.removeSteps();
    
    // Highlight target element
    targetElement.classList.add('tour-highlight');
    
    // Create step element
    const stepElement = document.createElement('div');
    stepElement.className = `${this.config.tourStepClass} ${this.config.activeStepClass}`;
    
    // Add content
    stepElement.innerHTML = `
      <div class="tour-step-title">${step.title}</div>
      <div class="tour-step-content">${step.content}</div>
      <div class="tour-buttons">
        ${index > 0 ? '<button class="tour-btn tour-prev-btn">Previous</button>' : ''}
        ${index < steps.length - 1 ? 
          '<button class="tour-btn tour-next-btn">Next</button>' : 
          '<button class="tour-btn tour-next-btn">Finish</button>'}
        <button class="tour-btn tour-close-btn">Skip Tour</button>
      </div>
    `;
    
    // Position the step
    const targetRect = targetElement.getBoundingClientRect();
    const position = step.position || 'bottom';
    
    switch (position) {
      case 'top':
        stepElement.style.bottom = `${window.innerHeight - targetRect.top + window.scrollY + 10}px`;
        stepElement.style.left = `${targetRect.left + window.scrollX + (targetRect.width / 2) - 150}px`;
        break;
      case 'bottom':
        stepElement.style.top = `${targetRect.bottom + window.scrollY + 10}px`;
        stepElement.style.left = `${targetRect.left + window.scrollX + (targetRect.width / 2) - 150}px`;
        break;
      case 'left':
        stepElement.style.top = `${targetRect.top + window.scrollY + (targetRect.height / 2) - 100}px`;
        stepElement.style.right = `${window.innerWidth - targetRect.left + window.scrollX + 10}px`;
        break;
      case 'right':
        stepElement.style.top = `${targetRect.top + window.scrollY + (targetRect.height / 2) - 100}px`;
        stepElement.style.left = `${targetRect.right + window.scrollX + 10}px`;
        break;
    }
    
    // Add event listeners
    const nextBtn = stepElement.querySelector('.tour-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.currentStepIndex++;
        this.showStep(this.currentStepIndex);
      });
    }
    
    const prevBtn = stepElement.querySelector('.tour-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentStepIndex--;
        this.showStep(this.currentStepIndex);
      });
    }
    
    const closeBtn = stepElement.querySelector('.tour-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.endTour();
      });
    }
    
    // Add to DOM
    document.body.appendChild(stepElement);
    
    // Scroll element into view if needed
    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
  
  /**
   * Remove all tour steps
   */
  removeSteps() {
    // Remove highlight classes
    const highlightedElements = document.querySelectorAll('.tour-highlight');
    highlightedElements.forEach(el => el.classList.remove('tour-highlight'));
    
    // Remove step elements
    const stepElements = document.querySelectorAll(`.${this.config.tourStepClass}`);
    stepElements.forEach(el => el.remove());
  }
  
  /**
   * End the guided tour
   */
  endTour() {
    this.removeSteps();
    
    // Remove backdrop
    const backdrop = document.querySelector('.tour-backdrop');
    if (backdrop) backdrop.remove();
    
    this.tourActive = false;
    
    // Mark as completed
    localStorage.setItem(this.config.storageKey, 'true');
  }
  
  /**
   * Check if user has completed the tour before
   */
  hasCompletedTour() {
    return localStorage.getItem(this.config.storageKey) === 'true';
  }
  
  /**
   * Reset tour completion status
   */
  resetTourStatus() {
    localStorage.removeItem(this.config.storageKey);
  }
}

// Initialize the guide when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  window.paymentGuide = new PaymentGatewayGuide();
});

// Export the class for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaymentGatewayGuide;
} 