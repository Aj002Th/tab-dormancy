export function defined<T>(value: T | null | undefined, message = 'expected value to be defined'): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
