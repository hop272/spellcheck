/**
 * Spell Check Handler
 *
 * Orchestrates the spell checking pipeline using functional composition.
 * Demonstrates pipe() for data transformations and Result type for errors.
 */

import { pipe, sortBy, uniqueBy, map, filter } from '../utils/fp.js';
import { findWordPosition } from '../utils/string.js';
import { getState, updateState, sortErrorsByPosition } from '../state.js';
import { api } from '../api.js';

// ============================================
// Error Transformation Pipeline
// ============================================

/**
 * Enrich traditional error with metadata
 * Pure function
 */
export const enrichTraditionalError = (error) => ({
  ...error,
  reason: error.reason || 'Possible misspelling',
  source: 'traditional',
});

/**
 * Process traditional check results
 * Composed pipeline: extract -> enrich -> sort
 *
 * @param {Object} result - API response
 * @param {string} text - Original text for position calculation
 * @returns {Array} Processed errors
 */
export const processTraditionalErrors = (result, text) =>
  pipe(
    (r) => r.errors || [],
    map(enrichTraditionalError),
    (errors) => sortErrorsByPosition(errors, text)
  )(result);

/**
 * Check if AI error should replace traditional error
 * Pure predicate function
 */
export const shouldReplaceTraditional = (aiError, seenWords) => {
  const wordLower = aiError.word.toLowerCase();
  if (!seenWords.has(wordLower)) return false;
  return aiError.type === 'terminology' || aiError.type === 'grammar';
};

/**
 * Merge AI error into existing errors
 * Pure function - returns new errors array
 *
 * @param {Array} errors - Current errors
 * @param {Object} aiError - New AI error
 * @param {Set} seenWords - Set of words already seen
 * @returns {{ errors: Array, seenWords: Set }} Updated errors and seen set
 */
export const mergeAiError = (errors, aiError, seenWords) => {
  const wordLower = aiError.word.toLowerCase();

  // Skip if already seen and not a replacement case
  if (seenWords.has(wordLower)) {
    if (aiError.type !== 'terminology' && aiError.type !== 'grammar') {
      return { errors, seenWords };
    }
    // Replace traditional with AI error for terminology/grammar
    const filtered = errors.filter(e => e.word.toLowerCase() !== wordLower);
    const newSeen = new Set(seenWords);
    newSeen.delete(wordLower);
    return {
      errors: [...filtered, aiError],
      seenWords: new Set([...newSeen, wordLower]),
    };
  }

  // Add new error
  return {
    errors: [...errors, aiError],
    seenWords: new Set([...seenWords, wordLower]),
  };
};

// ============================================
// Check Handler Factory
// ============================================

/**
 * Create spell check handler
 * Factory function - creates handler with injected dependencies
 *
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getText - Get editor text
 * @param {Function} deps.onUpdate - Update UI callback
 * @param {Function} deps.onStatusChange - Status change callback
 * @returns {Function} Check handler
 */
export const createCheckHandler = ({ getText, onUpdate, onStatusChange }) => {
  return async (useAI) => {
    const text = getText();
    if (!text.trim()) return;

    const state = getState();

    // Reset state for new check
    updateState({
      errors: [],
      originalText: text,
      isChecking: true,
    });

    onStatusChange({ phase: 'start' });

    try {
      // Step 1: Traditional check (fast)
      const traditionalResult = await api.traditionalCheck(text, state.extractedTerms);
      const traditionalErrors = processTraditionalErrors(traditionalResult, text);

      updateState({ errors: traditionalErrors });
      onUpdate({ errors: traditionalErrors, text });

      // Step 2: AI check with streaming (if enabled)
      if (useAI && state.aiConfigured) {
        onStatusChange({ phase: 'ai-start' });

        let seenWords = new Set(traditionalErrors.map(e => e.word.toLowerCase()));
        let currentErrors = [...traditionalErrors];
        let aiErrorCount = 0;

        // Stream AI results
        for await (const event of api.aiCheckStream(text, state.slideContext, state.extractedTerms)) {
          if (event.type === 'finding' && event.issue) {
            const merged = mergeAiError(currentErrors, event.issue, seenWords);
            currentErrors = merged.errors;
            seenWords = merged.seenWords;
            aiErrorCount++;

            // Sort and update
            const sortedErrors = sortErrorsByPosition(currentErrors, text);
            updateState({ errors: sortedErrors });
            onUpdate({ errors: sortedErrors, text });
            onStatusChange({ phase: 'ai-progress', count: aiErrorCount });
          }
        }

        onStatusChange({ phase: 'done', aiUsed: true });
      } else {
        onStatusChange({ phase: 'done', aiUsed: false });
      }
    } catch (error) {
      console.error('Check failed:', error);
      onStatusChange({ phase: 'error', error: error.message });
    } finally {
      updateState({ isChecking: false });
    }
  };
};

// ============================================
// Status Message Builders
// ============================================

/**
 * Get status message for check phase
 * Pure function
 */
export const getStatusMessage = (status) => {
  switch (status.phase) {
    case 'start':
      return null;
    case 'ai-start':
      return 'AI analyzing your notes...';
    case 'ai-progress':
      return `Found ${status.count} AI issue${status.count > 1 ? 's' : ''}...`;
    case 'done':
      return status.aiUsed ? 'Done! Click underlined words to review.' : null;
    case 'error':
      return `Error: ${status.error}`;
    default:
      return null;
  }
};
