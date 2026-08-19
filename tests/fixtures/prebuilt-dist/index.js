#!/usr/bin/env node
// Pre-built slopcheck action — ported from TypeScript source for CI testing
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================
// EXTRACTOR
// ============================================================

const COMMAND_WORDS = new Set([
  'npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx',
  'install', 'i', 'add', 'dlx',
]);

const FLAG_LIKE = /^-/;
const STOP_TOKENS = new Set(['|', '&&', ';', '>', '>>', '--']);
const SHELL_OPERATORS = /[|;&>]/;

function stripVersion(name) {
  if (name.startsWith('@') && name.includes('/')) {
    const slashIdx = name.indexOf('/');
    const afterSlash = name.slice(slashIdx + 1);
    const atIdx = afterSlash.indexOf('@');
    if (atIdx !== -1) return name.slice(0, slashIdx + 1 + atIdx);
    return name;
  }
  const atIdx = name.indexOf('@');
  if (atIdx > 0) return name.slice(0, atIdx);
  return name;
}

const VALID_PKG_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
const VALID_SCOPED_PKG = /^@[a-zA-Z0-9._-]+\/[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^@[a-zA-Z0-9._-]+\/[a-zA-Z0-9]$/;

const PROSE_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do',
  'for', 'from', 'get', 'has', 'have', 'he', 'her', 'him', 'his',
  'how', 'if', 'in', 'into', 'is', 'it', 'its', 'let', 'may', 'me',
  'my', 'no', 'nor', 'not', 'of', 'on', 'or', 'our', 'out', 'own',
  'run', 'say', 'set', 'she', 'so', 'the', 'then', 'this', 'to',
  'up', 'us', 'use', 'was', 'way', 'we', 'were', 'what', 'when',
  'who', 'why', 'will', 'with', 'you', 'your',
  'after', 'before', 'below', 'between', 'both', 'each', 'every',
  'following', 'here', 'just', 'like', 'make', 'more', 'most',
  'need', 'new', 'now', 'only', 'other', 'over', 'should', 'some',
  'such', 'take', 'than', 'that', 'them', 'these', 'they', 'those',
  'through', 'under', 'very', 'want', 'which', 'while', 'would',
  'setup', 'using', 'started', 'getting', 'running', 'file', 'project',
]);

function isPackageName(token) {
  if (!token || token.length === 0) return false;
  if (FLAG_LIKE.test(token)) return false;
  if (COMMAND_WORDS.has(token)) return false;
  if (STOP_TOKENS.has(token)) return false;
  if (SHELL_OPERATORS.test(token.charAt(0))) return false;
  if (PROSE_WORDS.has(token.toLowerCase())) return false;
  if (token.startsWith('@')) return VALID_SCOPED_PKG.test(token);
  return VALID_PKG_NAME.test(token);
}

function tokenize(command) {
  const tokens = [];
  let current = '';
  let inQuote = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      else current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }

    if (ch === '`') break;

    if (ch === '|' || ch === ';' || ch === '>') {
      if (current) { tokens.push(current); current = ''; }
      if (ch === '>' && command[i + 1] === '>') { tokens.push('>>'); i++; }
      else tokens.push(ch);
      continue;
    }

    if (ch === '&' && command[i + 1] === '&') {
      if (current) { tokens.push(current); current = ''; }
      tokens.push('&&');
      i++;
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}

function extractNpxPackages(tokens, startIdx) {
  const packages = [];
  let i = startIdx;

  while (i < tokens.length) {
    const token = tokens[i];
    if (STOP_TOKENS.has(token) || SHELL_OPERATORS.test(token.charAt(0))) break;

    if (token.startsWith('--package=')) {
      const val = token.slice('--package='.length);
      if (val) packages.push(stripVersion(val));
      i++;
      continue;
    }

    if (token === '-p' || token === '--package') {
      i++;
      if (i < tokens.length && !STOP_TOKENS.has(tokens[i])) {
        packages.push(stripVersion(tokens[i]));
      }
      i++;
      continue;
    }

    if (FLAG_LIKE.test(token)) { i++; continue; }

    const stripped = stripVersion(token);
    if (isPackageName(stripped)) packages.push(stripped);
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
    if (isPackageName(stripped)) packages.push(stripped);
  }

  return packages;
}

function extractPackageNames(command) {
  const tokens = tokenize(command.trim());
  if (tokens.length === 0) return [];

  const first = tokens[0];
  const isNpx = first === 'npx' || first === 'bunx' || (first === 'pnpm' && tokens[1] === 'dlx');

  if (isNpx) return extractNpxPackages(tokens, first === 'pnpm' ? 2 : 1);
  return extractInstallPackages(tokens);
}

// ============================================================
// SCANNER
// ============================================================

const INSTALL_PATTERN = /(?:npm\s+(?:install|i|add)|npx|pnpm\s+(?:add|install|i|dlx)|yarn\s+add|bun\s+(?:add|install|i)|bunx)\s/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const SCANNABLE_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.json', '.cursorrules']);

const CMD_ARGS = /(?:\s+(?:@[\w.-]+\/[\w.-]+(?:@[\w.*^~<>=|-]+)?|[\w.-]+(?:@[\w.*^~<>=|-]+)?|--?[\w-]+(?:=\S+)?|[|;&>]+))+/;

function extractCommandsFromLine(line) {
  const commands = [];
  const patterns = [
    new RegExp(`npm\\s+(?:install|i|add)${CMD_ARGS.source}`, 'gi'),
    new RegExp(`npx${CMD_ARGS.source}`, 'gi'),
    new RegExp(`pnpm\\s+(?:add|install|i|dlx)${CMD_ARGS.source}`, 'gi'),
    new RegExp(`yarn\\s+add${CMD_ARGS.source}`, 'gi'),
    new RegExp(`bun\\s+(?:add|install|i)${CMD_ARGS.source}`, 'gi'),
    new RegExp(`bunx${CMD_ARGS.source}`, 'gi'),
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
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!INSTALL_PATTERN.test(line)) continue;

    const commands = extractCommandsFromLine(line);
    for (const command of commands) {
      const packages = extractPackageNames(command);
      if (packages.length > 0) {
        results.push({ file: filePath, line: i + 1, command, packages });
      }
    }
  }

  return results;
}

function scanJsonContent(content, filePath) {
  const results = [];
  const lines = content.split('\n');

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
          results.push({ file: filePath, line: i + 1, command, packages });
        }
      }
    }
  }

  return results;
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (ext === '.md' || base === '.cursorrules') return 'markdown';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.json') return 'json';
  return 'text';
}

function scanFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch { return []; }
  const fileType = getFileType(filePath);
  if (fileType === 'json') return scanJsonContent(content, filePath);
  return scanContent(content, filePath);
}

function findFiles(dir) {
  const files = [];

  function walk(currentDir) {
    let entries;
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(currentDir, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const name = entry.name.toLowerCase();
        if (SCANNABLE_EXTENSIONS.has(ext) || name === '.cursorrules') {
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
  const seenFiles = new Set();

  for (const p of paths) {
    let stat;
    try { stat = fs.statSync(p); } catch { continue; }

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

// ============================================================
// VALIDATOR
// ============================================================

const REGISTRY_BASE = 'https://registry.npmjs.org';
const REQUEST_TIMEOUT = 10000;
const MAX_RETRIES = 3;

function packageUrl(name) {
  if (name.startsWith('@')) return `${REGISTRY_BASE}/${name.replace('/', '%2f')}`;
  return `${REGISTRY_BASE}/${name}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkPackage(name) {
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(packageUrl(name), {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 200) return { name, exists: true, httpStatus: 200 };
      if (response.status === 404) return { name, exists: false, httpStatus: 404 };
      if (response.status === 451) return { name, exists: true, httpStatus: 451, isSecurityHold: true };

      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        lastError = 'Rate limited (429)';
        continue;
      }

      return { name, exists: false, httpStatus: response.status, error: `HTTP ${response.status}` };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }

  return { name, exists: false, error: lastError };
}

async function validatePackages(names, options) {
  const concurrency = options?.concurrency ?? 10;
  const unique = [...new Set(names)];
  const results = new Map();

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(name => checkPackage(name)));
    for (const result of batchResults) results.set(result.name, result);
  }

  return unique.map(name => results.get(name));
}

// ============================================================
// REPORTER
// ============================================================

function buildResult(scanResults, validationResults, scannedFileCount, options = {}) {
  const validationMap = new Map();
  for (const vr of validationResults) validationMap.set(vr.name, vr);

  const findingsMap = new Map();

  for (const scan of scanResults) {
    for (const pkg of scan.packages) {
      const validation = validationMap.get(pkg);
      if (!validation) continue;

      let status = null;
      if (!validation.exists && !validation.error) status = 'not_found';
      else if (validation.isSecurityHold && !options.noSecurityHold) status = 'security_hold';
      else if (validation.error) status = 'error';

      if (!status) continue;

      if (!findingsMap.has(pkg)) findingsMap.set(pkg, { package: pkg, status, locations: [] });

      const finding = findingsMap.get(pkg);
      const locKey = `${scan.file}:${scan.line}`;
      if (!finding.locations.some(l => `${l.file}:${l.line}` === locKey)) {
        finding.locations.push({ file: scan.file, line: scan.line, command: scan.command });
      }
    }
  }

  const findings = [...findingsMap.values()];
  const allPackages = new Set();
  for (const scan of scanResults) for (const pkg of scan.packages) allPackages.add(pkg);

  const notFoundCount = findings.filter(f => f.status === 'not_found').length;
  const securityHoldCount = findings.filter(f => f.status === 'security_hold').length;
  const errorCount = findings.filter(f => f.status === 'error').length;

  return {
    version: '0.1.2',
    scanned: scannedFileCount,
    packages: {
      total: allPackages.size,
      valid: allPackages.size - notFoundCount - securityHoldCount - errorCount,
      notFound: notFoundCount,
      securityHold: securityHoldCount,
      errors: errorCount,
    },
    findings,
  };
}

function formatText(result) {
  const lines = [];
  lines.push(`slopcheck v${result.version} — scanning ${result.scanned} file${result.scanned !== 1 ? 's' : ''} for phantom packages`);
  lines.push('');

  for (const finding of result.findings.filter(f => f.status === 'not_found')) {
    lines.push(`✗ ${finding.package} — not found on npm`);
    for (const loc of finding.locations) lines.push(`  └─ ${loc.file}:${loc.line}  ${loc.command}`);
    lines.push('');
  }

  for (const finding of result.findings.filter(f => f.status === 'security_hold')) {
    lines.push(`⚠ ${finding.package} — security hold (HTTP 451)`);
    for (const loc of finding.locations) lines.push(`  └─ ${loc.file}:${loc.line}  ${loc.command}`);
    lines.push('');
  }

  for (const finding of result.findings.filter(f => f.status === 'error')) {
    lines.push(`? ${finding.package} — validation error`);
    for (const loc of finding.locations) lines.push(`  └─ ${loc.file}:${loc.line}  ${loc.command}`);
    lines.push('');
  }

  const parts = [];
  parts.push(`${result.packages.valid} packages verified`);
  if (result.packages.notFound > 0) parts.push(`${result.packages.notFound} not found`);
  if (result.packages.securityHold > 0) parts.push(`${result.packages.securityHold} security hold`);
  if (result.packages.errors > 0) parts.push(`${result.packages.errors} errors`);
  lines.push(`✓ ${parts.join(', ')}`);

  if (result.packages.notFound > 0) {
    lines.push('');
    lines.push(`Found ${result.packages.notFound} phantom package${result.packages.notFound !== 1 ? 's' : ''}. Exit code 1.`);
  }

  return lines.join('\n');
}

function formatGitHubActions(result) {
  const lines = [];
  for (const finding of result.findings) {
    for (const loc of finding.locations) {
      const level = finding.status === 'not_found' ? 'error' : 'warning';
      const msg = finding.status === 'not_found'
        ? `Package "${finding.package}" not found on npm (possible slopsquatting target)`
        : finding.status === 'security_hold'
          ? `Package "${finding.package}" is under security hold (HTTP 451)`
          : `Package "${finding.package}" validation error`;
      lines.push(`::${level} file=${loc.file},line=${loc.line}::${msg}`);
    }
  }
  return lines.join('\n');
}

// ============================================================
// MAIN
// ============================================================

function getGitHubActionInputs() {
  const githubActions = process.env.GITHUB_ACTIONS === 'true';
  if (!githubActions) return null;

  const inputs = {};

  const paths = process.env.INPUT_PATHS;
  if (paths) inputs.paths = paths.split(/\s+/).filter(Boolean);

  const ignore = process.env.INPUT_IGNORE;
  if (ignore) inputs.ignore = ignore.split(',').map(s => s.trim()).filter(Boolean);

  const concurrency = process.env.INPUT_CONCURRENCY;
  if (concurrency) {
    const n = parseInt(concurrency, 10);
    if (!isNaN(n) && n > 0) inputs.concurrency = n;
  }

  return inputs;
}

async function main() {
  const options = {
    paths: ['.'],
    concurrency: 10,
    ignore: [],
    noSecurityHold: false,
  };

  const actionInputs = getGitHubActionInputs();
  if (actionInputs) {
    if (actionInputs.paths) options.paths = actionInputs.paths;
    if (actionInputs.ignore) options.ignore = actionInputs.ignore;
    if (actionInputs.concurrency !== undefined) options.concurrency = actionInputs.concurrency;
  }

  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  const scanResults = scanPaths(options.paths);

  const allPackages = new Set();
  for (const scan of scanResults) for (const pkg of scan.packages) allPackages.add(pkg);

  const packagesToCheck = [...allPackages].filter(pkg => !options.ignore.includes(pkg));

  const filteredScanResults = scanResults
    .map(sr => ({ ...sr, packages: sr.packages.filter(pkg => !options.ignore.includes(pkg)) }))
    .filter(sr => sr.packages.length > 0);

  const scannedFiles = new Set(scanResults.map(sr => sr.file));

  const validationResults = await validatePackages(packagesToCheck, { concurrency: options.concurrency });

  const result = buildResult(
    filteredScanResults,
    validationResults,
    scannedFiles.size || options.paths.length,
    { noSecurityHold: options.noSecurityHold },
  );

  console.log(formatText(result));

  if (isGitHubActions && result.findings.length > 0) {
    console.log(formatGitHubActions(result));
  }

  if (result.packages.notFound > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(2);
});
