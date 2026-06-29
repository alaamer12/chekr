/**
 * Parse a comma-separated list with quoted tokens (commas inside quotes are preserved).
 * @param {string | undefined | null} str
 * @returns {string[]}
 */
export function parseArgsArrayString(str) {
  if (str === undefined || str === null || str === "") {
    return [];
  }

  const tokens = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inQuotes && char === "\\" && i + 1 < str.length) {
      current += str[i + 1];
      i++;
      continue;
    }

    if (char === '"') {
      if (inQuotes && str[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        tokens.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    tokens.push(trimmed);
  }

  return tokens;
}
