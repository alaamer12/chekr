/**
 * Parse a key=value string.
 * @param {string} str
 * @returns {{ key: string, value: string }}
 */
export function parseKeyValue(str) {
  if (typeof str !== "string") {
    throw new TypeError("parseKeyValue expects a string");
  }

  const index = str.indexOf("=");

  if (index === -1) {
    throw new Error("parseKeyValue expects key=value format");
  }

  const key = str.slice(0, index).trim();
  const value = str.slice(index + 1);

  if (key.length === 0) {
    throw new Error("parseKeyValue key must be non-empty");
  }

  return { key, value };
}
