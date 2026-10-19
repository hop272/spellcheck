/**
 * Modal Management
 *
 * Simple, focused modal controller.
 * Separates visibility logic from content management.
 */

// ============================================
// Modal Controller Factory
// ============================================

/**
 * Create modal controller
 * Factory function - creates controller bound to modal element
 *
 * @param {HTMLElement} modalElement - The modal container element
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.focusElement - Element to focus when opened
 * @returns {Object} Controller with open/close/toggle methods
 */
export const createModalController = (modalElement, options = {}) => {
  const { focusElement = null } = options;

  return {
    /**
     * Open the modal
     */
    open: () => {
      modalElement.classList.remove('hidden');
      if (focusElement) {
        focusElement.focus();
      }
    },

    /**
     * Close the modal
     */
    close: () => {
      modalElement.classList.add('hidden');
    },

    /**
     * Toggle modal visibility
     */
    toggle: () => {
      modalElement.classList.toggle('hidden');
      if (!modalElement.classList.contains('hidden') && focusElement) {
        focusElement.focus();
      }
    },

    /**
     * Check if modal is open
     */
    isOpen: () => !modalElement.classList.contains('hidden'),

    /**
     * Handle escape key (call in keydown handler)
     * @param {KeyboardEvent} event
     * @returns {boolean} True if modal handled the event
     */
    handleEscape: (event) => {
      if (event.key === 'Escape' && !modalElement.classList.contains('hidden')) {
        modalElement.classList.add('hidden');
        return true;
      }
      return false;
    },
  };
};

/**
 * Setup modal with standard event listeners
 * Utility function to wire up common modal behavior
 *
 * @param {Object} config - Configuration
 * @param {HTMLElement} config.modal - Modal element
 * @param {HTMLElement} config.openBtn - Button to open modal
 * @param {HTMLElement} config.closeBtn - Close button inside modal
 * @param {HTMLElement} config.saveBtn - Save/confirm button
 * @param {HTMLElement} config.backdrop - Backdrop element for click-outside
 * @param {HTMLElement} config.focusElement - Element to focus on open
 * @param {Function} config.onSave - Callback when save is clicked
 * @returns {Object} Modal controller
 */
export const setupModal = ({
  modal,
  openBtn,
  closeBtn,
  saveBtn,
  backdrop,
  focusElement,
  onSave,
}) => {
  const controller = createModalController(modal, { focusElement });

  // Wire up event listeners
  if (openBtn) {
    openBtn.addEventListener('click', controller.open);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', controller.close);
  }

  if (backdrop) {
    backdrop.addEventListener('click', controller.close);
  }

  if (saveBtn && onSave) {
    saveBtn.addEventListener('click', () => {
      onSave();
      controller.close();
    });
  }

  return controller;
};
