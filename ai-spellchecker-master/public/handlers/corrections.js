/**
 * Correction Handlers
 *
 * Higher-order functions for handling error corrections.
 * Demonstrates functional patterns:
 * - Factory function creates specialized handlers (like Clojure's partial)
 * - Pure transformation functions for state updates
 * - Composition of small, focused functions
 */

import { escapeRegex } from '../utils/string.js';
import {
  getState,
  updateState,
  removeErrorAtIndex,
  calculateNextIndex,
} from '../state.js';

// ============================================
// Pure Transformation Functions
// ============================================

/**
 * Apply a correction to text
 * Pure function - returns new text string
 *
 * @param {string} text - Original text
 * @param {string} word - Word to replace
 * @param {string} suggestion - Replacement word
 * @returns {string} Text with correction applied
 */
export const applyCorrection = (text, word, suggestion) => {
  const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
  return text.replace(regex, suggestion);
};

/**
 * Get suggestion from error object
 * Pure function - handles different error formats
 */
export const getSuggestion = (error) =>
  error?.suggestions?.[0] || error?.suggestion || null;

/**
 * Calculate correction result (pure computation)
 * Returns what the new state should be, doesn't apply it
 *
 * @param {Object} state - Current state
 * @param {string} text - Current editor text
 * @param {boolean} shouldApplyFix - Whether to apply the correction
 * @returns {Object} { text, errors, nextIndex }
 */
export const computeCorrectionResult = (state, text, shouldApplyFix) => {
  const { errors, currentErrorIndex } = state;
  const error = errors[currentErrorIndex];

  if (!error) {
    return { text, errors, nextIndex: -1 };
  }

  const suggestion = getSuggestion(error);
  const newText = shouldApplyFix && suggestion
    ? applyCorrection(text, error.word, suggestion)
    : text;

  const newErrors = removeErrorAtIndex(errors, currentErrorIndex);
  const nextIndex = calculateNextIndex(currentErrorIndex, newErrors.length);

  return {
    text: newText,
    errors: newErrors,
    nextIndex,
  };
};

// ============================================
// Higher-Order Handler Factory
// ============================================

/**
 * Create an error handler with specific behavior
 * This is a higher-order function (returns a function)
 * Similar to Clojure's partial application
 *
 * @param {boolean} shouldApplyFix - Whether to apply the correction
 * @returns {Function} Handler function
 *
 * @example
 * const handleAccept = createCorrectionHandler(true);
 * const handleDismiss = createCorrectionHandler(false);
 */
export const createCorrectionHandler = (shouldApplyFix) => {
  /**
   * The returned handler function
   * @param {Function} getText - Function to get current editor text
   * @param {Function} onUpdate - Callback with { text, errors, nextIndex }
   */
  return (getText, onUpdate) => {
    const state = getState();
    const text = getText();

    const result = computeCorrectionResult(state, text, shouldApplyFix);

    // Update state immutably
    updateState({
      errors: result.errors,
      currentErrorIndex: result.nextIndex,
    });

    // Notify caller of the result
    onUpdate(result);
  };
};

// ============================================
// Exported Handlers (Created via Factory)
// ============================================

/**
 * Handle accepting a correction
 * Applies the suggestion and removes the error
 */
export const handleAccept = createCorrectionHandler(true);

/**
 * Handle dismissing an error
 * Removes the error without applying correction
 */
export const handleDismiss = createCorrectionHandler(false);

// ============================================
// Correct All Handler
// ============================================

/**
 * Find all correction positions (pure function)
 * Returns positions sorted from end to start for safe replacement
 *
 * @param {string} text - Text to search
 * @param {Array} errors - Errors to process
 * @returns {Array} Sorted correction descriptors
 */
export const findCorrectionPositions = (text, errors) => {
  const positions = [];

  for (const error of errors) {
    const suggestion = getSuggestion(error);
    if (!suggestion) continue;

    const regex = new RegExp(`\\b${escapeRegex(error.word)}\\b`, 'gi');
    const match = regex.exec(text);
    if (!match) continue;

    positions.push({
      position: match.index,
      word: match[0],
      suggestion,
    });
  }

  // Sort by position descending (end to start)
  // This ensures replacements don't shift positions of remaining words
  return positions.sort((a, b) => b.position - a.position);
};

/**
 * Apply all corrections to text (pure function)
 *
 * @param {string} text - Original text
 * @param {Array} corrections - Sorted correction positions
 * @returns {string} Text with all corrections applied
 */
export const applyAllCorrections = (text, corrections) => {
  let result = text;

  for (const { position, word, suggestion } of corrections) {
    result = result.slice(0, position) + suggestion + result.slice(position + word.length);
  }

  return result;
};

/**
 * Handle correcting all errors at once
 *
 * @param {Function} getText - Function to get current editor text
 * @param {Function} onUpdate - Callback with { text }
 */
export const handleCorrectAll = (getText, onUpdate) => {
  const state = getState();
  if (state.errors.length === 0) return;

  const text = getText();
  const corrections = findCorrectionPositions(text, state.errors);
  const newText = applyAllCorrections(text, corrections);

  // Clear all errors
  updateState({
    errors: [],
    currentErrorIndex: -1,
  });

  onUpdate({ text: newText });
};
