/**
 * Semantic color helpers using manual ANSI escape codes.
 * Respects NO_COLOR and TTY — never uses chalk.
 */

const colorEnabled = process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

/**
 * @param {string} codes - SGR parameter(s), e.g. "32" or "1;36"
 * @param {string} text
 * @returns {string}
 */
function stylize(codes, text) {
  if (!colorEnabled) {
    return text;
  }
  return `\x1b[${codes}m${text}\x1b[0m`;
}

export const pass = (text) => stylize("32", text);
export const fail = (text) => stylize("31", text);
export const warn = (text) => stylize("33", text);
export const info = (text) => stylize("36", text);
export const bold = (text) => stylize("1", text);
export const dim = (text) => stylize("2", text);
export const file = (text) => stylize("4;36", text);
export const lineNum = (text) => dim(`[${text}]`);
