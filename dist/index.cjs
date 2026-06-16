#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  buildResult: () => buildResult,
  extractPackageNames: () => extractPackageNames,
  formatGitHubActions: () => formatGitHubActions,
  formatJson: () => formatJson,
  formatText: () => formatText,
  scanPaths: () => scanPaths,
  validatePackages: () => validatePackages
});
module.exports = __toCommonJS(index_exports);

// src/scanner.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);

// src/extractor.ts
var COMMAND_WORDS = /* @__PURE__ */ new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "bunx",
  "install",
  "i",
  "add",
  "dlx"
]);
var FLAG_LIKE = /^-/;
var STOP_TOKENS = /* @__PURE__ */ new Set(["|", "&&", ";", ">", ">>", "--"]);
var SHELL_OPERATORS = /[|;&>]/;
function stripVersion(name) {
  if (name.startsWith("@") && name.includes("/")) {
    const slashIdx = name.indexOf("/");
    const afterSlash = name.slice(slashIdx + 1);
    const atIdx2 = afterSlash.indexOf("@");
    if (atIdx2 !== -1) {
      return name.slice(0, slashIdx + 1 + atIdx2);
    }
    return name;
  }
  const atIdx = name.indexOf("@");
  if (atIdx > 0) {
    return name.slice(0, atIdx);
  }
  return name;
}
var VALID_PKG_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
var VALID_SCOPED_PKG = /^@[a-zA-Z0-9._-]+\/[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^@[a-zA-Z0-9._-]+\/[a-zA-Z0-9]$/;
var PROSE_WORDS = /* @__PURE__ */ new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "do",
  "for",
  "from",
  "get",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "let",
  "may",
  "me",
  "my",
  "no",
  "nor",
  "not",
  "of",
  "on",
  "or",
  "our",
  "out",
  "own",
  "run",
  "say",
  "set",
  "she",
  "so",
  "the",
  "then",
  "this",
  "to",
  "up",
  "us",
  "use",
  "was",
  "way",
  "we",
  "were",
  "what",
  "when",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your",
  "after",
  "before",
  "below",
  "between",
  "both",
  "each",
  "every",
  "following",
  "here",
  "just",
  "like",
  "make",
  "more",
  "most",
  "need",
  "new",
  "now",
  "only",
  "other",
  "over",
  "should",
  "some",
  "such",
  "take",
  "than",
  "that",
  "them",
  "these",
  "they",
  "those",
  "through",
  "under",
  "very",
  "want",
  "which",
  "while",
  "would",
  "setup",
  "using",
  "started",
  "getting",
  "running",
  "file",
  "project"
]);
function isPackageName(token) {
  if (!token || token.length === 0) return false;
  if (FLAG_LIKE.test(token)) return false;
  if (COMMAND_WORDS.has(token)) return false;
  if (STOP_TOKENS.has(token)) return false;
  if (SHELL_OPERATORS.test(token.charAt(0))) return false;
  if (PROSE_WORDS.has(token.toLowerCase())) return false;
  if (token.startsWith("@")) {
    return VALID_SCOPED_PKG.test(token);
  }
  return VALID_PKG_NAME.test(token);
}
function tokenize(command) {
  const tokens = [];
  let current = "";
  let inQuote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === " " || ch === "	") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    if (ch === "`") {
      break;
    }
    if (ch === "|" || ch === ";" || ch === ">") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      if (ch === ">" && command[i + 1] === ">") {
        tokens.push(">>");
        i++;
      } else {
        tokens.push(ch);
      }
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push("&&");
      i++;
      continue;
    }
    current += ch;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
function extractPackageNames(command) {
  const tokens = tokenize(command.trim());
  if (tokens.length === 0) return [];
  const first = tokens[0];
  const isNpx = first === "npx" || first === "bunx" || first === "pnpm" && tokens[1] === "dlx";
  const isBunx = first === "bunx";
  if (isNpx) {
    return extractNpxPackages(tokens, first === "pnpm" ? 2 : 1);
  }
  return extractInstallPackages(tokens);
}
function extractNpxPackages(tokens, startIdx) {
  const packages = [];
  let i = startIdx;
  while (i < tokens.length) {
    const token = tokens[i];
    if (STOP_TOKENS.has(token) || SHELL_OPERATORS.test(token.charAt(0))) break;
    if (token.startsWith("--package=")) {
      const val = token.slice("--package=".length);
      if (val) packages.push(stripVersion(val));
      i++;
      continue;
    }
    if (token === "-p" || token === "--package") {
      i++;
      if (i < tokens.length && !STOP_TOKENS.has(tokens[i])) {
        packages.push(stripVersion(tokens[i]));
      }
      i++;
      continue;
    }
    if (FLAG_LIKE.test(token)) {
      i++;
      continue;
    }
    const stripped = stripVersion(token);
    if (isPackageName(stripped)) {
      packages.push(stripped);
    }
    break;
  }
  return packages;
}
function extractInstallPackages(tokens) {
  const packages = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (STOP_TOKENS.has(token) || SHELL_OPERATORS.test(token.charAt(0))) break;
    if (COMMAND_WORDS.has(token)) continue;
    if (FLAG_LIKE.test(token)) continue;
    const stripped = stripVersion(token);
    if (isPackageName(stripped)) {
      packages.push(stripped);
    }
  }
  return packages;
}

// src/scanner.ts
var INSTALL_PATTERN = /(?:npm\s+(?:install|i|add)|npx|pnpm\s+(?:add|install|i|dlx)|yarn\s+add|bun\s+(?:add|install|i)|bunx)\s/i;
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build"]);
var SCANNABLE_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".yaml", ".yml", ".json", ".cursorrules"]);
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (ext === ".md" || base === ".cursorrules") return "markdown";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  if (ext === ".json") return "json";
  return "text";
}
var CMD_ARGS = /(?:\s+(?:@[\w.-]+\/[\w.-]+(?:@[\w.*^~<>=|-]+)?|[\w.-]+(?:@[\w.*^~<>=|-]+)?|--?[\w-]+(?:=\S+)?|[|;&>]+))+/;
function extractCommandsFromLine(line) {
  const commands = [];
  const patterns = [
    new RegExp(`npm\\s+(?:install|i|add)${CMD_ARGS.source}`, "gi"),
    new RegExp(`npx${CMD_ARGS.source}`, "gi"),
    new RegExp(`pnpm\\s+(?:add|install|i|dlx)${CMD_ARGS.source}`, "gi"),
    new RegExp(`yarn\\s+add${CMD_ARGS.source}`, "gi"),
    new RegExp(`bun\\s+(?:add|install|i)${CMD_ARGS.source}`, "gi"),
    new RegExp(`bunx${CMD_ARGS.source}`, "gi")
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      commands.push(match[0].trim());
    }
  }
  return commands;
}
function scanContent(content, filePath) {
  const results = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!INSTALL_PATTERN.test(line)) continue;
    const commands = extractCommandsFromLine(line);
    for (const command of commands) {
      const packages = extractPackageNames(command);
      if (packages.length > 0) {
        results.push({
          file: filePath,
          line: i + 1,
          command,
          packages
        });
      }
    }
  }
  return results;
}
function scanJsonContent(content, filePath) {
  const results = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!INSTALL_PATTERN.test(line)) continue;
    const stringMatches = line.matchAll(/"([^"]*(?:npm|npx|pnpm|yarn|bun|bunx)[^"]*)"/gi);
    for (const match of stringMatches) {
      const value = match[1];
      const commands = extractCommandsFromLine(value);
      for (const command of commands) {
        const packages = extractPackageNames(command);
        if (packages.length > 0) {
          results.push({
            file: filePath,
            line: i + 1,
            command,
            packages
          });
        }
      }
    }
  }
  return results;
}
function scanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const fileType = getFileType(filePath);
  switch (fileType) {
    case "json":
      return scanJsonContent(content, filePath);
    case "markdown":
    case "yaml":
    case "text":
    default:
      return scanContent(content, filePath);
  }
}
function findFiles(dir) {
  const files = [];
  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(currentDir, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const name = entry.name.toLowerCase();
        if (SCANNABLE_EXTENSIONS.has(ext) || name === ".cursorrules") {
          files.push(path.join(currentDir, entry.name));
        }
      }
    }
  }
  walk(dir);
  return files;
}
function scanPaths(paths) {
  const results = [];
  const seenFiles = /* @__PURE__ */ new Set();
  for (const p of paths) {
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const files = findFiles(p);
      for (const file of files) {
        const resolved = path.resolve(file);
        if (!seenFiles.has(resolved)) {
          seenFiles.add(resolved);
          results.push(...scanFile(file));
        }
      }
    } else if (stat.isFile()) {
      const resolved = path.resolve(p);
      if (!seenFiles.has(resolved)) {
        seenFiles.add(resolved);
        results.push(...scanFile(p));
      }
    }
  }
  return results;
}

// src/validator.ts
var REGISTRY_BASE = "https://registry.npmjs.org";
var REQUEST_TIMEOUT = 1e4;
var MAX_RETRIES = 3;
function packageUrl(name) {
  if (name.startsWith("@")) {
    return `${REGISTRY_BASE}/${name.replace("/", "%2f")}`;
  }
  return `${REGISTRY_BASE}/${name}`;
}
async function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function checkPackage(name) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      const response = await fetch(packageUrl(name), {
        method: "HEAD",
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (response.status === 200) {
        return { name, exists: true, httpStatus: 200 };
      }
      if (response.status === 404) {
        return { name, exists: false, httpStatus: 404 };
      }
      if (response.status === 451) {
        return { name, exists: true, httpStatus: 451, isSecurityHold: true };
      }
      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1e3;
        await sleep(delay);
        lastError = `Rate limited (429)`;
        continue;
      }
      return { name, exists: false, httpStatus: response.status, error: `HTTP ${response.status}` };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1e3;
        await sleep(delay);
      }
    }
  }
  return { name, exists: false, error: lastError };
}
async function validatePackages(names, options) {
  const concurrency = options?.concurrency ?? 10;
  const unique = [...new Set(names)];
  const results = /* @__PURE__ */ new Map();
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((name) => checkPackage(name)));
    for (const result of batchResults) {
      results.set(result.name, result);
    }
  }
  return unique.map((name) => results.get(name));
}

// src/reporter.ts
var VERSION = "0.1.1";
function buildResult(scanResults, validationResults, scannedFileCount, options = {}) {
  const validationMap = /* @__PURE__ */ new Map();
  for (const vr of validationResults) {
    validationMap.set(vr.name, vr);
  }
  const findingsMap = /* @__PURE__ */ new Map();
  for (const scan of scanResults) {
    for (const pkg of scan.packages) {
      const validation = validationMap.get(pkg);
      if (!validation) continue;
      let status = null;
      if (!validation.exists && !validation.error) {
        status = "not_found";
      } else if (validation.isSecurityHold && !options.noSecurityHold) {
        status = "security_hold";
      } else if (validation.error) {
        status = "error";
      }
      if (!status) continue;
      if (!findingsMap.has(pkg)) {
        findingsMap.set(pkg, { package: pkg, status, locations: [] });
      }
      const finding = findingsMap.get(pkg);
      const locKey = `${scan.file}:${scan.line}`;
      if (!finding.locations.some((l) => `${l.file}:${l.line}` === locKey)) {
        finding.locations.push({
          file: scan.file,
          line: scan.line,
          command: scan.command
        });
      }
    }
  }
  const findings = [...findingsMap.values()];
  const allPackages = /* @__PURE__ */ new Set();
  for (const scan of scanResults) {
    for (const pkg of scan.packages) {
      allPackages.add(pkg);
    }
  }
  const notFoundCount = findings.filter((f) => f.status === "not_found").length;
  const securityHoldCount = findings.filter((f) => f.status === "security_hold").length;
  const errorCount = findings.filter((f) => f.status === "error").length;
  return {
    version: VERSION,
    scanned: scannedFileCount,
    packages: {
      total: allPackages.size,
      valid: allPackages.size - notFoundCount - securityHoldCount - errorCount,
      notFound: notFoundCount,
      securityHold: securityHoldCount,
      errors: errorCount
    },
    findings
  };
}
function formatText(result) {
  const lines = [];
  lines.push(`slopcheck v${result.version} \u2014 scanning ${result.scanned} file${result.scanned !== 1 ? "s" : ""} for phantom packages`);
  lines.push("");
  for (const finding of result.findings.filter((f) => f.status === "not_found")) {
    lines.push(`\u2717 ${finding.package} \u2014 not found on npm`);
    for (const loc of finding.locations) {
      lines.push(`  \u2514\u2500 ${loc.file}:${loc.line}  ${loc.command}`);
    }
    lines.push("");
  }
  for (const finding of result.findings.filter((f) => f.status === "security_hold")) {
    lines.push(`\u26A0 ${finding.package} \u2014 security hold (HTTP 451)`);
    for (const loc of finding.locations) {
      lines.push(`  \u2514\u2500 ${loc.file}:${loc.line}  ${loc.command}`);
    }
    lines.push("");
  }
  for (const finding of result.findings.filter((f) => f.status === "error")) {
    lines.push(`? ${finding.package} \u2014 validation error`);
    for (const loc of finding.locations) {
      lines.push(`  \u2514\u2500 ${loc.file}:${loc.line}  ${loc.command}`);
    }
    lines.push("");
  }
  const parts = [];
  parts.push(`${result.packages.valid} packages verified`);
  if (result.packages.notFound > 0) parts.push(`${result.packages.notFound} not found`);
  if (result.packages.securityHold > 0) parts.push(`${result.packages.securityHold} security hold`);
  if (result.packages.errors > 0) parts.push(`${result.packages.errors} errors`);
  lines.push(`\u2713 ${parts.join(", ")}`);
  if (result.packages.notFound > 0) {
    lines.push("");
    lines.push(`Found ${result.packages.notFound} phantom package${result.packages.notFound !== 1 ? "s" : ""}. Exit code 1.`);
  }
  return lines.join("\n");
}
function formatJson(result) {
  return JSON.stringify(result, null, 2);
}
function formatGitHubActions(result) {
  const lines = [];
  for (const finding of result.findings) {
    for (const loc of finding.locations) {
      const level = finding.status === "not_found" ? "error" : "warning";
      const msg = finding.status === "not_found" ? `Package "${finding.package}" not found on npm (possible slopsquatting target)` : finding.status === "security_hold" ? `Package "${finding.package}" is under security hold (HTTP 451)` : `Package "${finding.package}" validation error`;
      lines.push(`::${level} file=${loc.file},line=${loc.line}::${msg}`);
    }
  }
  return lines.join("\n");
}

// src/index.ts
var VERSION2 = "0.1.1";
function printHelp() {
  console.log(`slopcheck v${VERSION2} \u2014 Catch hallucinated npm packages before they catch you.

Usage: slopcheck [options] [files/directories...]

Options:
  -V, --version        output version
  --json               output JSON instead of text
  --concurrency <n>    max concurrent registry checks (default: 10)
  --ignore <packages>  comma-separated list of packages to skip
  --no-security-hold   don't flag security holds as warnings
  -h, --help           display help

Arguments:
  files/directories    files or directories to scan (default: current directory)
                       directories are scanned recursively for .md, .yml, .yaml, .json, .cursorrules files
                       node_modules, .git, dist, build directories are always excluded`);
}
function parseArgs(argv) {
  const options = {
    paths: [],
    json: false,
    concurrency: 10,
    ignore: [],
    noSecurityHold: false
  };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case "-V":
      case "--version":
        console.log(VERSION2);
        process.exit(0);
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      case "--json":
        options.json = true;
        break;
      case "--concurrency":
        i++;
        options.concurrency = parseInt(argv[i], 10);
        if (isNaN(options.concurrency) || options.concurrency < 1) {
          console.error("Error: --concurrency must be a positive integer");
          process.exit(2);
        }
        break;
      case "--ignore":
        i++;
        if (argv[i]) {
          options.ignore = argv[i].split(",").map((s) => s.trim()).filter(Boolean);
        }
        break;
      case "--no-security-hold":
        options.noSecurityHold = true;
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(2);
        }
        options.paths.push(arg);
        break;
    }
    i++;
  }
  if (options.paths.length === 0) {
    options.paths = ["."];
  }
  return options;
}
function getGitHubActionInputs() {
  const githubActions = process.env.GITHUB_ACTIONS === "true";
  if (!githubActions) return null;
  const inputs = {};
  const paths = process.env.INPUT_PATHS;
  if (paths) {
    inputs.paths = paths.split(/\s+/).filter(Boolean);
  }
  const ignore = process.env.INPUT_IGNORE;
  if (ignore) {
    inputs.ignore = ignore.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const concurrency = process.env.INPUT_CONCURRENCY;
  if (concurrency) {
    const n = parseInt(concurrency, 10);
    if (!isNaN(n) && n > 0) {
      inputs.concurrency = n;
    }
  }
  return inputs;
}
async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));
  const actionInputs = getGitHubActionInputs();
  if (actionInputs) {
    if (actionInputs.paths && cliOptions.paths.length === 1 && cliOptions.paths[0] === ".") {
      cliOptions.paths = actionInputs.paths;
    }
    if (actionInputs.ignore && cliOptions.ignore.length === 0) {
      cliOptions.ignore = actionInputs.ignore;
    }
    if (actionInputs.concurrency !== void 0) {
      cliOptions.concurrency = actionInputs.concurrency;
    }
  }
  const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
  const scanResults = scanPaths(cliOptions.paths);
  const allPackages = /* @__PURE__ */ new Set();
  for (const scan of scanResults) {
    for (const pkg of scan.packages) {
      allPackages.add(pkg);
    }
  }
  const packagesToCheck = [...allPackages].filter(
    (pkg) => !cliOptions.ignore.includes(pkg)
  );
  const filteredScanResults = scanResults.map((sr) => ({
    ...sr,
    packages: sr.packages.filter((pkg) => !cliOptions.ignore.includes(pkg))
  })).filter((sr) => sr.packages.length > 0);
  const scannedFiles = new Set(scanResults.map((sr) => sr.file));
  const validationResults = await validatePackages(packagesToCheck, {
    concurrency: cliOptions.concurrency
  });
  const result = buildResult(
    filteredScanResults,
    validationResults,
    scannedFiles.size || cliOptions.paths.length,
    { noSecurityHold: cliOptions.noSecurityHold }
  );
  if (cliOptions.json) {
    console.log(formatJson(result));
  } else {
    console.log(formatText(result));
  }
  if (isGitHubActions && result.findings.length > 0) {
    console.log(formatGitHubActions(result));
  }
  if (result.packages.notFound > 0) {
    process.exit(1);
  }
  process.exit(0);
}
main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(2);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildResult,
  extractPackageNames,
  formatGitHubActions,
  formatJson,
  formatText,
  scanPaths,
  validatePackages
});
//# sourceMappingURL=index.cjs.map