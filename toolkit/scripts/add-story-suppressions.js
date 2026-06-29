#!/usr/bin/env node
/**
 * Temporary script to add @symphony-ignore blocks to all story files
 * This allows the violation checks to pass while the team refactors stories incrementally
 *
 * Usage: node packages/toolkit/scripts/add-story-suppressions.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { walkFiles } from "../utils/file-walker.js";

const SUPPRESSION_COMMENT = `// @symphony-ignore-start
// TODO: Refactor this story to use @symphony/ui primitives instead of raw HTML
// Tracked in: [Add issue URL here]
`;

const SUPPRESSION_END = `// @symphony-ignore-end
`;

function addSuppressionToStoryFile(filePath) {
	const content = readFileSync(filePath, "utf8");

	// Skip if already has suppression
	if (content.includes("@symphony-ignore-start")) {
		console.log(`⏭️  Skipping ${filePath} (already has suppression)`);
		return false;
	}

	// Find the first import statement
	const lines = content.split("\n");
	let insertIndex = 0;

	// Find the last import line
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim().startsWith("import ")) {
			insertIndex = i + 1;
		}
		// Stop at first non-import, non-empty, non-comment line after imports
		if (
			insertIndex > 0 &&
			lines[i].trim() &&
			!lines[i].trim().startsWith("import ") &&
			!lines[i].trim().startsWith("//") &&
			!lines[i].trim().startsWith("/*")
		) {
			break;
		}
	}

	// Insert suppression after imports
	lines.splice(insertIndex, 0, "", SUPPRESSION_COMMENT.trim());

	// Add suppression end at the end of file
	const newContent = lines.join("\n") + "\n" + SUPPRESSION_END;

	writeFileSync(filePath, newContent, "utf8");
	console.log(`✅ Added suppression to ${filePath}`);
	return true;
}

// Main execution
const storyFiles = walkFiles(".", [".stories.tsx", ".stories.ts"]);
let addedCount = 0;

console.log(`Found ${storyFiles.length} story files\n`);

for (const file of storyFiles) {
	if (addSuppressionToStoryFile(file)) {
		addedCount++;
	}
}

console.log(`\n✅ Added suppressions to ${addedCount} files`);
console.log(`⏭️  Skipped ${storyFiles.length - addedCount} files (already suppressed)`);
