/**
 * Popup Management
 *
 * Handles suggestion popup positioning and display.
 * Pure positioning calculations separated from DOM updates.
 */

import { getState, updateState } from '../state.js';
import { extractContext } from '../utils/string.js';

// ============================================
// Pure Positioning Calculations
// ============================================

/**
 * Calculate optimal popup position
 * Pure function - takes measurements, returns coordinates
 *
 * @param {DOMRect} anchorRect - Bounding rect of anchor element
 * @param {Object} popupSize - { width, height } of popup
 * @param {Object} viewport - { width, height } of viewport
 * @param {Object} options - { gap, margin } spacing options
 * @returns {Object} { top, left } position
 */
export const calculatePopupPosition = (anchorRect, popupSize, viewport, options = {}) => {
  const { gap = 12, margin = 16 } = options;
  const { width: popupWidth, height: popupHeight } = popupSize;
  const { width: viewportWidth, height: viewportHeight } = viewport;

  // Calculate available space above and below anchor
  const spaceBelow = viewportHeight - anchorRect.bottom - gap - margin;
  const spaceAbove = anchorRect.top - gap - margin;

  let top;
  let left;

  // Vertical positioning: prefer below, fallback to above
  if (spaceBelow >= popupHeight || spaceBelow >= spaceAbove) {
    top = anchorRect.bottom + gap;
    // Clamp to viewport
    if (top + popupHeight > viewportHeight - margin) {
      top = viewportHeight - popupHeight - margin;
    }
  } else {
    top = anchorRect.top - popupHeight - gap;
    // Clamp to viewport
    if (top < margin) {
      top = margin;
    }
  }

  // Horizontal positioning: center on anchor
  left = anchorRect.left + (anchorRect.width / 2) - (popupWidth / 2);

  // Clamp to viewport horizontally
  if (left < margin) {
    left = margin;
  } else if (left + popupWidth > viewportWidth - margin) {
    left = viewportWidth - popupWidth - margin;
  }

  return { top, left };
};

/**
 * Check if element is visible in viewport
 * Pure function
 */
export const isElementVisible = (rect, margin = 16) =>
  rect.top >= margin && rect.bottom <= window.innerHeight - margin;

/**
 * Calculate scroll position to make element visible
 * Pure function
 */
export const calculateScrollPosition = (element, container, offset = 100) => {
  const targetTop = element.offsetTop - container.offsetTop - offset;
  return Math.max(0, targetTop);
};

// ============================================
// Popup Content Helpers
// ============================================

/**
 * Build popup content data from error
 * Pure function - extracts all display data
 *
 * @param {Object} error - Error object
 * @param {string} text - Full text for context extraction
 * @param {number} errorIndex - Current error index
 * @param {number} totalErrors - Total error count
 * @returns {Object} Content data for popup
 */
export const buildPopupContent = (error, text, errorIndex, totalErrors) => ({
  context: extractContext(text, error.word),
  wrongWord: error.word,
  correctWord: error.suggestions?.[0] || error.suggestion || '?',
  reason: error.reason || 'Potential issue',
  currentIndex: errorIndex + 1,
  totalCount: totalErrors,
  canNavigatePrev: errorIndex > 0,
  canNavigateNext: errorIndex < totalErrors - 1,
});

// ============================================
// Popup Controller
// ============================================

/**
 * Create popup controller with DOM element references
 * Factory function - creates controller bound to specific elements
 *
 * @param {Object} elements - DOM element references
 * @returns {Object} Controller with show/hide/navigate methods
 */
export const createPopupController = (elements) => {
  const {
    popup,
    popupContext,
    wrongWord,
    correctWord,
    popupReason,
    currentIndex,
    totalCount,
    navPrev,
    navNext,
  } = elements;

  /**
   * Update popup DOM with content
   */
  const updateContent = (content) => {
    popupContext.textContent = content.context;
    wrongWord.textContent = content.wrongWord;
    correctWord.textContent = content.correctWord;
    popupReason.textContent = content.reason;
    currentIndex.textContent = content.currentIndex;
    totalCount.textContent = content.totalCount;
    navPrev.disabled = !content.canNavigatePrev;
    navNext.disabled = !content.canNavigateNext;
  };

  /**
   * Position and show popup
   */
  const positionAndShow = (anchorElement) => {
    // Measure popup off-screen first
    popup.style.visibility = 'hidden';
    popup.classList.remove('hidden');

    const popupRect = popup.getBoundingClientRect();
    let anchorRect = anchorElement.getBoundingClientRect();

    // Scroll anchor into view if needed
    if (!isElementVisible(anchorRect)) {
      const editorContent = document.getElementById('editorContent');
      const scrollPos = calculateScrollPosition(anchorElement, editorContent);
      editorContent.scrollTop = scrollPos;
      anchorRect = anchorElement.getBoundingClientRect();
    }

    // Calculate position
    const position = calculatePopupPosition(
      anchorRect,
      { width: popupRect.width, height: popupRect.height },
      { width: window.innerWidth, height: window.innerHeight }
    );

    // Apply position and show
    popup.style.top = `${position.top}px`;
    popup.style.left = `${position.left}px`;
    popup.style.visibility = 'visible';
  };

  return {
    /**
     * Show popup for specific error
     */
    show: (errorIndex, anchorElement, getText) => {
      const state = getState();
      const error = state.errors[errorIndex];
      if (!error) return;

      updateState({ currentErrorIndex: errorIndex });

      const text = getText();
      const content = buildPopupContent(error, text, errorIndex, state.errors.length);

      updateContent(content);
      positionAndShow(anchorElement);
    },

    /**
     * Hide popup
     */
    hide: () => {
      popup.classList.add('hidden');
      updateState({ currentErrorIndex: -1 });
    },

    /**
     * Navigate to adjacent error
     */
    navigate: (direction, getText) => {
      const state = getState();
      const newIndex = state.currentErrorIndex + direction;

      if (newIndex >= 0 && newIndex < state.errors.length) {
        const highlight = document.querySelector(
          `.error-highlight[data-error-index="${newIndex}"]`
        );
        if (highlight) {
          updateState({ currentErrorIndex: newIndex });

          const text = getText();
          const error = state.errors[newIndex];
          const content = buildPopupContent(error, text, newIndex, state.errors.length);

          updateContent(content);
          positionAndShow(highlight);
        }
      }
    },

    /**
     * Check if popup is currently visible
     */
    isVisible: () => !popup.classList.contains('hidden'),
  };
};
