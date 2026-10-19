/**
 * String Utilities
 *
 * Pure functions for string manipulation.
 * Each function is deterministic: same input always produces same output.
 */

/**
 * Escape HTML special characters to prevent XSS
 * Pure function - no side effects
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // => '&lt;script&gt;alert("xss")&lt;/script&gt;'
 */
export const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * Escape special regex characters
 * Pure function - enables safe dynamic regex creation
 * @example
 * const pattern = new RegExp(`\\b${escapeRegex(userInput)}\\b`, 'gi');
 */
export const escapeRegex = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Normalize text by collapsing excessive newlines
 * Pure function - preserves paragraph breaks while removing extras
 * @example
 * normalizeText('Hello\n\n\n\nWorld') // => 'Hello\n\nWorld'
 */
export const normalizeText = (text) =>
  text.replace(/\n{3,}/g, '\n\n').trim();

/**
 * Count words in text
 * Pure function
 * @example
 * wordCount('Hello world') // => 2
 */
export const wordCount = (text) =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

/**
 * Extract context around a word (for showing in UI)
 * Pure function
 * @example
 * extractContext('The quick brown fox', 'brown', 5)
 * // => '...quick brown fox...'
 */
export const extractContext = (text, word, padding = 30) => {
  const lowerText = text.toLowerCase();
  const lowerWord = word.toLowerCase();
  const index = lowerText.indexOf(lowerWord);

  if (index === -1) return text.slice(0, padding * 2);

  const start = Math.max(0, index - padding);
  const end = Math.min(text.length, index + word.length + padding);

  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';

  return prefix + text.slice(start, end) + suffix;
};

/**
 * Create word boundary regex for a word
 * Pure function - returns regex pattern string
 */
export const wordBoundaryPattern = (word) =>
  `\\b${escapeRegex(word)}\\b`;

/**
 * Find word position in text (case-insensitive)
 * Pure function
 * @returns {number} Position or -1 if not found
 */
export const findWordPosition = (text, word) =>
  text.toLowerCase().indexOf(word.toLowerCase());
