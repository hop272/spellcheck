/**
 * Immutable State Management
 *
 * Inspired by Clojure atoms: state changes create new values rather than
 * mutating in place. All updates are explicit and traceable.
 *
 * Pattern:
 * - getState() returns current immutable snapshot
 * - updateState() creates new state from old state + changes
 * - Selectors derive values from state (like Clojure's get-in)
 */

// ============================================
// Initial State
// ============================================

const initialState = {
  errors: [],
  currentErrorIndex: -1,
  originalText: '',
  aiConfigured: false,
  isChecking: false,
  slideContext: '',
  extractedTerms: [],
};

// Private mutable reference (like Clojure's atom internals)
let state = { ...initialState };

// Subscribers for state changes (like Clojure's add-watch)
const subscribers = new Set();

// ============================================
// Core State Operations
// ============================================

/**
 * Get current state snapshot (immutable read)
 * Like dereferencing a Clojure atom: @state
 */
export const getState = () => state;

/**
 * Update state immutably (like Clojure's swap!)
 * Creates new state object, never mutates existing
 *
 * @param {Object|Function} updates - Object to merge or function (state) => newState
 * @example
 * // Object merge (like assoc)
 * updateState({ errors: newErrors, currentErrorIndex: 0 });
 *
 * // Function update (like swap!)
 * updateState(s => ({ ...s, errors: [...s.errors, newError] }));
 */
export const updateState = (updates) => {
  const prevState = state;

  if (typeof updates === 'function') {
    state = updates(state);
  } else {
    state = { ...state, ...updates };
  }

  // Notify subscribers of state change
  subscribers.forEach(fn => fn(state, prevState));

  return state;
};

/**
 * Reset state to initial values
 * Like Clojure's reset!
 */
export const resetState = () => {
  const prevState = state;
  state = { ...initialState };
  subscribers.forEach(fn => fn(state, prevState));
  return state;
};

// ============================================
// Subscriptions (like Clojure's add-watch)
// ============================================

/**
 * Subscribe to state changes
 * @param {Function} fn - Callback (newState, prevState) => void
 * @returns {Function} Unsubscribe function
 */
export const subscribe = (fn) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

// ============================================
// Selectors (Pure Functions)
// ============================================

/**
 * Get current error (derived value)
 * Pure function - same state always returns same result
 */
export const getCurrentError = (s = state) =>
  s.currentErrorIndex >= 0 ? s.errors[s.currentErrorIndex] : null;

/**
 * Get error count
 */
export const getErrorCount = (s = state) => s.errors.length;

/**
 * Check if there are errors
 */
export const hasErrors = (s = state) => s.errors.length > 0;

/**
 * Check if currently checking
 */
export const isChecking = (s = state) => s.isChecking;

/**
 * Check if AI is available
 */
export const isAIAvailable = (s = state) => s.aiConfigured;

/**
 * Get slide context word count
 */
export const getContextWordCount = (s = state) =>
  s.slideContext.trim() ? s.slideContext.trim().split(/\s+/).length : 0;

/**
 * Check if has context
 */
export const hasContext = (s = state) => s.slideContext.length > 0;

/**
 * Get extracted terms count
 */
export const getTermsCount = (s = state) => s.extractedTerms.length;

// ============================================
// State Transformers (Pure Functions)
// ============================================

/**
 * Remove error at index (returns new errors array)
 * Pure function - doesn't mutate original
 */
export const removeErrorAtIndex = (errors, index) =>
  errors.filter((_, i) => i !== index);

/**
 * Add error to list (returns new errors array)
 * Pure function
 */
export const addError = (errors, error) => [...errors, error];

/**
 * Calculate next error index after removal
 * Pure function
 */
export const calculateNextIndex = (currentIndex, totalErrors) =>
  totalErrors === 0 ? -1 : Math.min(currentIndex, totalErrors - 1);

/**
 * Sort errors by position in text
 * Pure function - returns new sorted array
 */
export const sortErrorsByPosition = (errors, text) => {
  const lowerText = text.toLowerCase();
  return [...errors].sort((a, b) => {
    const posA = lowerText.indexOf(a.word.toLowerCase());
    const posB = lowerText.indexOf(b.word.toLowerCase());
    return posA - posB;
  });
};
