/**
 * Functional Programming Utilities
 *
 * These utilities enable a functional style similar to Clojure:
 * - pipe() mirrors Clojure's ->> threading macro
 * - partition() matches Clojure's partition semantics
 * - Result type provides railway-oriented error handling
 * - All functions are pure and composable
 */

// ============================================
// Function Composition
// ============================================

/**
 * Compose functions left-to-right (like Clojure's ->> threading macro)
 * @example
 * const process = pipe(parseErrors, filterValid, sortByPosition);
 * const result = process(rawData);
 */
export const pipe = (...fns) => (x) =>
  fns.reduce((acc, fn) => fn(acc), x);

/**
 * Curry a function for partial application (like Clojure's partial)
 * @example
 * const add = curry((a, b) => a + b);
 * const add5 = add(5);
 * add5(3); // => 8
 */
export const curry = (fn) => {
  const arity = fn.length;
  return function curried(...args) {
    if (args.length >= arity) return fn(...args);
    return (...moreArgs) => curried(...args, ...moreArgs);
  };
};

// ============================================
// Array Transformations
// ============================================

/**
 * Partition array into [matches, nonMatches] (like Clojure's partition)
 * Curried for use in pipe()
 * @example
 * const [spelling, other] = partition(e => e.type === 'spelling')(errors);
 */
export const partition = curry((predicate, arr) => {
  const pass = [];
  const fail = [];
  for (const item of arr) {
    (predicate(item) ? pass : fail).push(item);
  }
  return [pass, fail];
});

/**
 * Deduplicate array by key function
 * Curried for use in pipe()
 * @example
 * const uniqueByWord = uniqueBy(e => e.word.toLowerCase());
 * const deduped = uniqueByWord(errors);
 */
export const uniqueBy = curry((keyFn, arr) => {
  const seen = new Set();
  return arr.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

/**
 * Sort array by comparator (returns new array, doesn't mutate)
 * @example
 * const sortByPosition = sortBy((a, b) => a.position - b.position);
 */
export const sortBy = curry((compareFn, arr) => [...arr].sort(compareFn));

/**
 * Map with index
 * @example
 * const withIds = mapIndexed((item, i) => ({ ...item, id: i }))(items);
 */
export const mapIndexed = curry((fn, arr) => arr.map((item, index) => fn(item, index)));

/**
 * Filter with predicate (curried for pipe)
 */
export const filter = curry((predicate, arr) => arr.filter(predicate));

/**
 * Map transformation (curried for pipe)
 */
export const map = curry((fn, arr) => arr.map(fn));

// ============================================
// Result Type (Railway-Oriented Programming)
// ============================================

/**
 * Result type for explicit error handling without exceptions
 * Similar to Clojure's approach of treating errors as values
 *
 * @example
 * const result = await fetchJson('/api/data');
 * if (!result.ok) return handleError(result.error);
 * process(result.value);
 */
export const Result = {
  ok: (value) => ({ ok: true, value }),
  err: (error) => ({ ok: false, error }),

  /**
   * Transform the value if ok, pass through if error
   * @example
   * Result.map(result, data => data.items)
   */
  map: (result, fn) =>
    result.ok ? Result.ok(fn(result.value)) : result,

  /**
   * Chain operations that return Results
   * @example
   * Result.flatMap(result, data => validateData(data))
   */
  flatMap: (result, fn) =>
    result.ok ? fn(result.value) : result,

  /**
   * Unwrap with default value
   * @example
   * const items = Result.getOrElse(result, []);
   */
  getOrElse: (result, defaultValue) =>
    result.ok ? result.value : defaultValue,

  /**
   * Convert try/catch to Result
   * @example
   * const result = Result.tryCatch(() => JSON.parse(text));
   */
  tryCatch: (fn) => {
    try {
      return Result.ok(fn());
    } catch (e) {
      return Result.err(e.message);
    }
  },
};

// ============================================
// Object Utilities
// ============================================

/**
 * Immutable object update (like Clojure's assoc)
 * @example
 * const updated = assoc(state, 'count', state.count + 1);
 */
export const assoc = (obj, key, value) => ({ ...obj, [key]: value });

/**
 * Immutable nested update (like Clojure's update-in)
 * @example
 * const updated = update(state, 'errors', errors => [...errors, newError]);
 */
export const update = (obj, key, fn) => ({ ...obj, [key]: fn(obj[key]) });

/**
 * Pick specific keys from object
 * @example
 * const subset = pick(['name', 'type'])(error);
 */
export const pick = curry((keys, obj) =>
  keys.reduce((acc, key) => {
    if (key in obj) acc[key] = obj[key];
    return acc;
  }, {})
);

// ============================================
// Predicates
// ============================================

/**
 * Check if value is not null/undefined
 */
export const isPresent = (x) => x != null;

/**
 * Negate a predicate
 * @example
 * const isNotEmpty = complement(isEmpty);
 */
export const complement = (predicate) => (...args) => !predicate(...args);

/**
 * Compose predicates with AND
 * @example
 * const isValidError = allOf(hasWord, hasSuggestion);
 */
export const allOf = (...predicates) => (x) =>
  predicates.every(p => p(x));

/**
 * Compose predicates with OR
 * @example
 * const isHighPriority = anyOf(isSpelling, isGrammar);
 */
export const anyOf = (...predicates) => (x) =>
  predicates.some(p => p(x));
