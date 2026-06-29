/**
 * Semantic color helpers built on Chalk v5.
 * All terminal output goes through these — never raw ANSI codes,
 * never direct chalk.* calls outside this file.
 */

import chalk from "chalk";

export const pass = text => chalk.green(text);
export const fail = text => chalk.red(text);
export const warn = text => chalk.yellow(text);
export const info = text => chalk.cyan(text);
export const bold = text => chalk.bold(text);
export const dim = text => chalk.dim(text);
export const file = text => chalk.underline.cyan(text);
export const lineNum = text => chalk.dim(`[${text}]`);
