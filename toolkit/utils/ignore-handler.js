/**
 * Parses @symphony-ignore-start / @symphony-ignore-end block directives
 * and returns a Set of suppressed line numbers.
 *
 * Block form only — no single-line form exists.
 * Formatters can reformat single statements across multiple lines,
 * breaking single-line directives. The block form is immune.
 *
 * Supports both JavaScript and JSX comment styles:
 *   // @symphony-ignore-start
 *   {/* @symphony-ignore-start *\/}
 *
 * Edge cases handled:
 *   - Directives inline with code (line is suppressed)
 *   - Both directives on same line (line is suppressed if has code)
 *   - Directive-only lines (NOT suppressed)
 *   - Whitespace variations
 */

/**
 * Check if a line contains code beyond just the directive comment.
 *
 * @param {string} line - The trimmed line to check
 * @returns {boolean} True if line has code beyond the directive
 */
function hasCodeBeyondDirective(line) {
	// Remove all variations of the directive comment
	// Order matters: JSX first, then block, then JS single-line
	const cleaned = line
		// JSX comments: {/* @symphony-ignore-start */} or {/*@symphony-ignore-start*/}
		.replace(/\{\s*\/\*\s*-*\s*@symphony-ignore-(start|end)\s*-*.*?\*\/\s*\}/g, "")
		// Block comments: /* @symphony-ignore-start */ (but not JSX)
		.replace(/(?<!\{)\s*\/\*\s*-*\s*@symphony-ignore-(start|end)\s*-*.*?\*\/\s*(?!\})/g, "")
		// JS single-line comments: // @symphony-ignore-start
		.replace(/\/\/\s*-*\s*@symphony-ignore-(start|end)\s*-*.*$/g, "")
		.trim();

	return cleaned.length > 0;
}

/**
 * Build a Set of suppressed line numbers from @symphony-ignore blocks.
 *
 * @param {string[]} lines - Source file split by '\n'
 * @returns {Set<number>} 1-indexed line numbers that are suppressed
 */

export function buildIgnoredLines(lines) {
	const ignored = new Set();
	let inBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		const lineNum = i + 1;

		const hasStart = trimmed.includes("@symphony-ignore-start");
		const hasEnd = trimmed.includes("@symphony-ignore-end");

		// Check for directives FIRST, before checking inBlock status

		// If line has start directive
		if (hasStart) {
			// Only suppress the line if it has code beyond the directive
			if (hasCodeBeyondDirective(trimmed)) {
				ignored.add(lineNum);
			}
			inBlock = true;

			// If both start and end are on same line, exit block immediately
			if (hasEnd) {
				inBlock = false;
			}
			continue;
		}

		// If line has end directive
		if (hasEnd) {
			// If we're in a block, check if this line has code beyond the directive
			// If it does, suppress it. If not, don't suppress (it's just the directive).
			if (inBlock && hasCodeBeyondDirective(trimmed)) {
				ignored.add(lineNum);
			}
			inBlock = false;
			continue;
		}

		// If we're inside a block and no directive on this line, suppress it
		if (inBlock) {
			ignored.add(lineNum);
		}
	}

	return ignored;
}
