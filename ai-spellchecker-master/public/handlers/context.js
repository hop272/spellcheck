/**
 * Context Handler
 *
 * Handles slide context and terminology extraction.
 * Manages the flow: save context -> extract terms -> update UI
 */

import { getState, updateState } from '../state.js';
import { api } from '../api.js';
import { wordCount } from '../utils/string.js';

// ============================================
// Pure Functions
// ============================================

/**
 * Build context button label
 * Pure function - computes label from state
 *
 * @param {Object} state - Current state
 * @param {string} status - Optional status override
 * @returns {string} Button label HTML
 */
export const buildContextLabel = (state, status = null) => {
  if (status) {
    return `<span class="step-num">1</span> ${status}`;
  }

  if (state.slideContext) {
    const words = wordCount(state.slideContext);
    const termInfo = state.extractedTerms.length
      ? ` (${state.extractedTerms.length} terms)`
      : '';
    return `<span class="step-num">1</span> ${words} words${termInfo}`;
  }

  return '<span class="step-num">1</span> Add slide context';
};

/**
 * Check if button should have active class
 * Pure function
 */
export const shouldHaveContextClass = (state, status = null) =>
  Boolean(status || state.slideContext);

// ============================================
// Context Controller Factory
// ============================================

/**
 * Create context controller
 * Factory function - creates controller with DOM bindings
 *
 * @param {Object} elements - DOM elements
 * @param {HTMLElement} elements.slideContent - Textarea for slide content
 * @param {HTMLElement} elements.slideContextBtn - Context button
 * @returns {Object} Controller with save method
 */
export const createContextController = ({ slideContent, slideContextBtn }) => {
  /**
   * Update button display
   */
  const updateButton = (status = null) => {
    const state = getState();
    slideContextBtn.innerHTML = buildContextLabel(state, status);

    if (shouldHaveContextClass(state, status)) {
      slideContextBtn.classList.add('has-context');
    } else {
      slideContextBtn.classList.remove('has-context');
    }
  };

  return {
    /**
     * Save slide context and extract terminology
     * @returns {Promise<void>}
     */
    save: async () => {
      const content = slideContent.value.trim();

      // Update state with new context
      updateState({
        slideContext: content,
        extractedTerms: [],
      });

      updateButton();

      // Extract terminology if AI is available
      const state = getState();
      if (content && state.aiConfigured) {
        updateButton('Extracting...');

        try {
          const result = await api.extractTerminology(content);
          if (result.terminology) {
            updateState({ extractedTerms: result.terminology });
            console.log('Extracted terms:', result.terminology);
          }
        } catch (err) {
          console.error('Terminology extraction failed:', err);
        }

        updateButton();
      }
    },

    /**
     * Update button display (for external state changes)
     */
    updateButton,

    /**
     * Get current slide content value
     */
    getContent: () => slideContent.value.trim(),

    /**
     * Set slide content value
     */
    setContent: (content) => {
      slideContent.value = content;
    },
  };
};
