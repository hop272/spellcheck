/**
 * API Client
 *
 * All API calls wrapped with Result type for explicit error handling.
 * No exceptions thrown - errors are returned as values.
 *
 * This follows functional programming principles:
 * - Errors as values (not exceptions)
 * - Composable with Result.map/flatMap
 * - Pure data transformations
 */

import { Result } from './utils/fp.js';

// ============================================
// Core Fetch Wrapper
// ============================================

/**
 * Fetch JSON with Result wrapper
 * Converts HTTP errors and exceptions to Result.err
 *
 * @param {string} url - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Result>} Result.ok(data) or Result.err(message)
 */
const fetchJson = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      return Result.err(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return Result.ok(data);
  } catch (error) {
    return Result.err(error.message || 'Network error');
  }
};

/**
 * POST JSON helper
 */
const postJson = (url, body) =>
  fetchJson(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });

// ============================================
// API Endpoints
// ============================================

/**
 * Check API health and AI configuration
 * @returns {Promise<Result<{aiConfigured: boolean}>>}
 */
export const checkHealth = () =>
  fetchJson('/api/health').then(result =>
    result.ok ? result : Result.ok({ aiConfigured: false })
  );

/**
 * Extract terminology from slide content
 * @param {string} slideContent - Slide text content
 * @returns {Promise<Result<{terminology: string[]}>>}
 */
export const extractTerminology = (slideContent) =>
  postJson('/api/terminology/extract', { slideContent });

/**
 * Run traditional (dictionary) spell check
 * @param {string} text - Text to check
 * @param {string[]} terminology - Known terms to skip
 * @returns {Promise<Result<{errors: Array}>>}
 */
export const traditionalCheck = (text, terminology = []) =>
  postJson('/api/check/quick', { text, terminology });

// ============================================
// Streaming API (Async Generator)
// ============================================

/**
 * Stream AI spell check results
 * Uses Server-Sent Events for progressive results
 *
 * Event types:
 * - { type: 'finding', issue: {...} } - Spelling/grammar issue found (success)
 * - { type: 'complete', issues: [...] } - Stream finished successfully
 * - { type: 'error', message: '...' } - Actual failure
 *
 * @param {string} speakerNotes - Notes to check
 * @param {string} slideContent - Context for terminology
 * @param {string[]} terminology - Pre-extracted terms
 * @yields {{type: 'finding'|'complete'|'error', issue?: Object, issues?: Array, message?: string}}
 *
 * @example
 * for await (const event of aiCheckStream(notes, slides, terms)) {
 *   if (event.type === 'finding') {
 *     displayIssue(event.issue);
 *   } else if (event.type === 'error') {
 *     showError(event.message);
 *   }
 * }
 */
export async function* aiCheckStream(speakerNotes, slideContent, terminology = []) {
  try {
    const response = await fetch('/api/check/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakerNotes, slideContent, terminology }),
    });

    if (!response.ok) {
      yield { type: 'error', error: { message: `HTTP ${response.status}` } };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    yield { type: 'done' };
  } catch (error) {
    yield { type: 'error', error: { message: error.message } };
  }
}

// ============================================
// API Object (Legacy Compatibility)
// ============================================

/**
 * Legacy API object for backward compatibility during migration
 * New code should import functions directly
 */
export const api = {
  checkHealth: async () => {
    const result = await checkHealth();
    return result.ok ? result.value : { aiConfigured: false };
  },

  extractTerminology: async (slideContent) => {
    const result = await extractTerminology(slideContent);
    return result.ok ? result.value : { terminology: [] };
  },

  traditionalCheck: async (text, terminology) => {
    const result = await traditionalCheck(text, terminology);
    return result.ok ? result.value : { errors: [] };
  },

  aiCheckStream,
};
