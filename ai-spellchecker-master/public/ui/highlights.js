/**
 * Highlight Management
 *
 * Handles error highlighting in the editor.
 * Pure transformation functions for building highlighted HTML.
 */

import { pipe, sortBy, mapIndexed } from '../utils/fp.js';
import { escapeHtml, escapeRegex } from '../utils/string.js';

// ============================================
// Pure Transformation Functions
// ============================================

/**
 * Get CSS class for error type
 * Pure function - maps error type to class name
 */
export const getErrorTypeClass = (type) => {
  switch (type) {
    case 'terminology': return 'terminology';
    case 'grammar': return 'grammar';
    default: return '';
  }
};

/**
 * Create highlight span HTML
 * Pure function - returns HTML string
 */
export const createHighlightSpan = (word, errorIndex, typeClass) =>
  `<span class="error-highlight ${typeClass}" data-error-index="${errorIndex}">${word}</span>`;

/**
 * Prepare errors for highlighting
 * Adds original index and sorts by word length (longest first)
 * This prevents shorter words from matching inside longer words
 *
 * Pure function using composition:
 * 1. Add original indices
 * 2. Sort by word length descending
 */
export const prepareErrorsForHighlighting = (errors) =>
  pipe(
    mapIndexed((error, originalIndex) => ({ error, originalIndex })),
    sortBy((a, b) => b.error.word.length - a.error.word.length)
  )(errors);

/**
 * Apply highlight to a single word in HTML
 * Pure function - returns new HTML string
 *
 * @param {string} html - Current HTML string
 * @param {Object} errorWithIndex - { error, originalIndex }
 * @returns {string} HTML with highlight applied
 */
export const applyHighlightToHtml = (html, { error, originalIndex }) => {
  const escapedWord = escapeHtml(error.word);
  const typeClass = getErrorTypeClass(error.type);
  const regex = new RegExp(`\\b(${escapeRegex(escapedWord)})\\b`, 'gi');

  return html.replace(regex, (match) =>
    createHighlightSpan(match, originalIndex, typeClass)
  );
};

/**
 * Build highlighted HTML from text and errors
 * Pure function - composes all highlighting steps
 *
 * @param {string} text - Plain text content
 * @param {Array} errors - Array of error objects
 * @returns {string} HTML with error highlights
 */
export const buildHighlightedHtml = (text, errors) => {
  if (!errors.length) {
    return escapeHtml(text);
  }

  const preparedErrors = prepareErrorsForHighlighting(errors);
  let html = escapeHtml(text);

  // Apply each highlight (using reduce for functional style)
  html = preparedErrors.reduce(
    (currentHtml, errorWithIndex) =>
      applyHighlightToHtml(currentHtml, errorWithIndex),
    html
  );

  return html;
};

// ============================================
// Highlight Controller
// ============================================

/**
 * Create highlight controller with DOM binding
 * Factory function - creates controller bound to editor element
 *
 * @param {HTMLElement} editorElement - The contenteditable editor
 * @param {Function} onHighlightClick - Callback when highlight is clicked
 * @returns {Object} Controller with apply method
 */
export const createHighlightController = (editorElement, onHighlightClick) => {
  /**
   * Attach click handlers to all highlights
   */
  const attachClickHandlers = () => {
    const highlights = editorElement.querySelectorAll('.error-highlight');
    highlights.forEach(el => {
      el.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.errorIndex, 10);
        onHighlightClick(index, e.target);
      });
    });
  };

  return {
    /**
     * Apply highlights to editor
     * @param {string} text - Plain text to highlight
     * @param {Array} errors - Errors to highlight
     */
    apply: (text, errors) => {
      const html = buildHighlightedHtml(text, errors);
      editorElement.innerHTML = html;
      attachClickHandlers();
    },

    /**
     * Clear all highlights (show plain text)
     * @param {string} text - Plain text to display
     */
    clear: (text) => {
      editorElement.innerHTML = escapeHtml(text);
    },

    /**
     * Get current text content (normalized)
     */
    getText: () => {
      const text = editorElement.innerText || '';
      return text.replace(/\n{3,}/g, '\n\n').trim();
    },

    /**
     * Set HTML content directly
     */
    setHtml: (html) => {
      editorElement.innerHTML = html;
    },
  };
};
