import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../lib/core/config/load-config.js";
import { resolveConfig } from "../lib/core/config/resolve-config.js";
import { validateMarketplaceMeta } from "../lib/core/validator.js";
import { ConfigError } from "../lib/helpers/config/validate-config.js";

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} positionals
 * @param {string} cwd
 */
export async function publishCommand(flags, positionals, cwd) {
  const checkId = positionals[0];
  if (!checkId) {
    throw new Error("Missing check ID. Usage: chekr publish <check-id>");
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required for publishing.");
  }

  const rawConfig = await loadConfig(/** @type {string} */ (flags.config), cwd);
  const config = resolveConfig(rawConfig, cwd);

  const { marketplace, checksDir } = config;
  if (!marketplace.repository) {
    throw new Error("Marketplace repository not configured in chekr.config.js");
  }

  const publishMeta = marketplace.publish?.[checkId];
  if (!publishMeta) {
    throw new Error(`No publication metadata found for "${checkId}" in chekr.config.js under marketplace.publish`);
  }

  const meta = validateMarketplaceMeta({ ...publishMeta, id: checkId });

  console.log(`Publishing ${meta.name} (v${meta.version}) to ${marketplace.repository}...`);

  const [owner, repo] = marketplace.repository.split("/");
  const branch = marketplace.branch || "main";

  // 1. Fetch current registry.json
  const registryUrl = `https://api.github.com/repos/${owner}/${repo}/contents/registry.json?ref=${branch}`;
  const registryRes = await fetch(registryUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  let registry = [];
  let registrySha = null;

  if (registryRes.status === 200) {
    const data = await registryRes.json();
    const content = Buffer.from(data.content, "base64").toString("utf8");
    registry = JSON.parse(content);
    registrySha = data.sha;
  } else if (registryRes.status !== 404) {
    const err = await registryRes.json();
    throw new Error(`Failed to fetch registry.json: ${err.message}`);
  }

  // 2. Upload files
  for (const fileMap of meta.files) {
    // Files are relative to the config file (cwd)
    const localPath = path.resolve(cwd, fileMap.src);
    const content = await readFile(localPath);
    const remotePath = `rules/${meta.id}/${fileMap.dest}`;

    console.log(`  Uploading ${fileMap.dest}...`);
    await uploadToGitHub(owner, repo, remotePath, content, branch, token, `Publish ${meta.id}: ${fileMap.dest}`);
  }

  // 3. Update registry.json
  const existingIndex = registry.findIndex((e) => e.id === meta.id);
  if (existingIndex !== -1) {
    registry[existingIndex] = meta;
  } else {
    registry.push(meta);
  }

  console.log("  Updating registry.json...");
  const newRegistryContent = JSON.stringify(registry, null, 2);
  await uploadToGitHub(
    owner,
    repo,
    "registry.json",
    Buffer.from(newRegistryContent),
    branch,
    token,
    `Update registry for ${meta.id} v${meta.version}`,
    registrySha
  );

  console.log(`\nSuccessfully published ${meta.id} v${meta.version}`);
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} path
 * @param {Buffer} content
 * @param {string} branch
 * @param {string} token
 * @param {string} message
 * @param {string} [sha]
 */
async function uploadToGitHub(owner, repo, path, content, branch, token, message, sha) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  // First, check if file exists to get SHA if not provided
  let currentSha = sha;
  if (!currentSha) {
    const checkRes = await fetch(`${url}?ref=${branch}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (checkRes.status === 200) {
      const data = await checkRes.json();
      currentSha = data.sha;
    }
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: content.toString("base64"),
      branch,
      sha: currentSha,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to upload ${path} to GitHub: ${err.message}`);
  }
}
