import readline from "node:readline";

let _progressActive = false;
let _lastRenderTime = 0;

/**
 * Render or clear a throttled progress line (verbose mode only).
 * @param {number} done
 * @param {number} total
 * @param {string} [stepName]
 */
export function renderProgress(done, total, stepName = "") {
  const now = Date.now();
  if (done < total && now - _lastRenderTime < 100) return;
  _lastRenderTime = now;

  _progressActive = true;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);
  const filled = Math.round((done / total) * 20);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(20 - filled);

  let shortName = stepName;
  if (shortName.length > 12) {
    shortName = shortName.replace(/^check_/, "").substring(0, 12);
  }
  const stepPrefix = shortName ? `[${shortName}] ` : "";

  let line = `  \u21b3 ${stepPrefix}${bar} ${String(percent).padStart(3)}% | ${done}/${total}`;
  if (line.length > 75) {
    line = line.substring(0, 75);
  }

  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(line);
}

export function clearProgress() {
  if (_progressActive) {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    _progressActive = false;
  }
}
