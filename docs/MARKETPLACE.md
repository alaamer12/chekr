# Chekr Marketplace

The Chekr Marketplace is a system for distributing and installing custom `chekr` rules. It allows you to package rules with their dependencies and share them across projects via a central GitHub repository.

## Installation

To install a rule from the marketplace, use the `install` command:

```bash
chekr install check_code_duplication
```

### Options

- `--force`: Force overwrite of existing files. By default, `chekr` will prompt you if a rule is already installed.
- `--config <path>`: Specify a custom configuration file.

### How it works

1. `chekr` reads the `marketplace` configuration in your `chekr.config.js`.
2. It fetches the `registry.json` from the configured GitHub repository.
3. It downloads the requested rule and all its mapped files.
4. It tracks installed rules in `.chekr/marketplace.lock.json` to manage versions and updates.

## Publishing

If you are a rule author, you can publish your rules to the marketplace using the `publish` command.

### 1. Configure Marketplace

In your `chekr.config.js`, add the `marketplace` block:

```javascript
export default {
  checksDir: "./.chekr/checks",
  marketplace: {
    repository: "owner/chekr-marketplace",
    branch: "main" // optional, defaults to main
  }
};
```

### 2. Configure Publishing Metadata

Instead of separate metadata files, you define what to publish directly in `chekr.config.js`. For example:

```javascript
export default {
  checksDir: "./.chekr/checks",
  marketplace: {
    repository: "owner/chekr-marketplace",
    branch: "main",
    publish: {
      check_my_rule: {
        name: "My Custom Rule",
        goal: "Detects specific architectural violations.",
        description: "A long description of how the rule works...",
        hasFixes: false,
        tags: ["architecture", "typescript"],
        recommendedLanguages: ["typescript"],
        author: "Your Name",
        version: "1.0.0",
        files: [
          {
            src: "./.chekr/checks/check_my_rule.js",
            dest: "check_my_rule.js"
          },
          {
            src: "./.chekr/support/helper.js",
            dest: "../support/helper.js"
          }
        ]
      }
    }
  }
};
```

- `publish`: An object where keys are the check IDs (must match `check_<name>`).
- `files`: Maps local source paths (relative to project root) to destination paths (relative to the user's `checksDir` when installed).

### 3. Publish

Ensure you have a `GITHUB_TOKEN` environment variable with `repo` permissions.

```bash
export GITHUB_TOKEN=your_token
chekr publish check_my_rule
```

The `publish` command will:
1. Validate your metadata.
2. Upload all files to the GitHub repository under `rules/<id>/`.
3. Update the global `registry.json` in the repository.

## Marketplace Repository Structure

The remote repository should have the following structure:

```
registry.json
rules/
  check_code_duplication/
    check_code_duplication.js
    support/
      jsx-dedup.js
  check_my_rule/
    check_my_rule.js
    support/
      helper.js
```

`registry.json` is an array of all `MarketplaceCheckEntry` objects.
