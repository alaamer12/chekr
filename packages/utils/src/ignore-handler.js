/**
 * Parses ignore block directives and returns a Set of suppressed line numbers.
 *
 * Block form only — no single-line form exists.
 * Formatters can reformat single statements across multiple lines,
 * breaking single-line directives. The block form is immune.
 *
 * Supports both JavaScript and JSX comment styles:
 *   // @checkr-ignore-start
 *   {/* @checkr-ignore-start *\/}
 *
 * Edge cases handled:
 *   - Directives inline with code (line is suppressed)
 *   - Both directives on same line (line is suppressed if has code)
 *   - Directive-only lines (NOT suppressed)
 *   - Whitespace variations
 */

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a line contains code beyond just the directive comment.
 *
 * @param {string} line - The trimmed line to check
 * @param {string} startMarker - Full start directive marker
 * @param {string} endMarker - Full end directive marker
 * @returns {boolean} True if line has code beyond the directive
 */
function hasCodeBeyondDirective(line, startMarker, endMarker) {
	const markers = [startMarker, endMarker].map(escapeRegex).join("|");
	const cleaned = line
		.replace(new RegExp(`\\{\\s*\\/\\*\\s*-*\\s*(${markers})\\s*-*.*?\\*\\/\\s*\\}`, "g"), "")
		.replace(new RegExp(`(?<!\\{)\\s*\\/\\*\\s*-*\\s*(${markers})\\s*-*.*?\\*\\/\\s*(?!\\})`, "g"), "")
		.replace(new RegExp(`\\/\\/\\s*-*\\s*(${markers})\\s*-*.*$`, "g"), "")
		.trim();

	return cleaned.length > 0;
}

/**
 * Build a Set of suppressed line numbers from ignore blocks.
 *
 * @param {string[]} lines - Source file split by '\n'
 * @param {{ marker?: string }} [options]
 * @returns {Set<number>} 1-indexed line numbers that are suppressed
 */
export function buildIgnoredLines(lines, { marker = "@checkr-ignore" } = {}) {
	const startMarker = `${marker}-start`;
	const endMarker = `${marker}-end`;
	const ignored = new Set();
	let inBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		const lineNum = i + 1;

		const hasStart = trimmed.includes(startMarker);
		const hasEnd = trimmed.includes(endMarker);

		if (hasStart) {
			if (hasCodeBeyondDirective(trimmed, startMarker, endMarker)) {
				ignored.add(lineNum);
			}
			inBlock = true;

			if (hasEnd) {
				inBlock = false;
			}
			continue;
		}

		if (hasEnd) {
			if (inBlock && hasCodeBeyondDirective(trimmed, startMarker, endMarker)) {
				ignored.add(lineNum);
			}
			inBlock = false;
			continue;
		}

		if (inBlock) {
			ignored.add(lineNum);
		}
	}

	return ignored;
}
