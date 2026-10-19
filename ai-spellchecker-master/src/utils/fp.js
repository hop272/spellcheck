// Functional programming utilities

// Function composition (left to right)
export const pipe = (...fns) => (x) =>
  fns.reduce((acc, fn) => fn(acc), x);

// Curry a function
export const curry = (fn) => {
  const arity = fn.length;
  return function curried(...args) {
    if (args.length >= arity) return fn(...args);
    return (...moreArgs) => curried(...args, ...moreArgs);
  };
};

// Partition array into [matches, nonMatches]
export const partition = curry((predicate, arr) =>
  arr.reduce(
    ([pass, fail], item) =>
      predicate(item) ? [[...pass, item], fail] : [pass, [...fail, item]],
    [[], []]
  )
);

// Unique values
export const unique = (arr) => [...new Set(arr)];

// Result type for error handling without exceptions
export const Result = {
  ok: (value) => ({ ok: true, value }),
  err: (error) => ({ ok: false, error }),
};
