import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureAbsolutePath } from "./fs.mjs";

export const TRANSCRIPT_PATH_ENV = "CODEX_COMPANION_TRANSCRIPT_PATH";
const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";

function resolveUserPath(cwd, value) {
  if (value === "~") {
    return os.homedir();
  }
  if (String(value).startsWith("~/")) {
    return path.join(os.homedir(), String(value).slice(2));
  }
  return ensureAbsolutePath(cwd, value);
}

function defaultClaudeProjectsDir() {
  return path.join(os.homedir(), ".claude", "projects");
}

function configuredClaudeProjectsDir(cwd) {
  const configured = process.env[CLAUDE_CONFIG_DIR_ENV];
  return configured ? path.join(resolveUserPath(cwd, configured), "projects") : null;
}

function allowedClaudeProjectsDirs(cwd) {
  return [...new Set([configuredClaudeProjectsDir(cwd), defaultClaudeProjectsDir()].filter(Boolean))];
}

function realpathIfExists(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return null;
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function findContainingProjectsRoot(cwd, source) {
  for (const configuredPath of allowedClaudeProjectsDirs(cwd)) {
    const realRoot = realpathIfExists(configuredPath);
    if (realRoot && isWithin(realRoot, source)) {
      return { configuredPath, realRoot };
    }
  }
  return null;
}

export function resolveClaudeSessionPath(cwd, options = {}) {
  const requestedPath = options.source || process.env[TRANSCRIPT_PATH_ENV];
  if (!requestedPath) {
    throw new Error("Could not identify the current Claude transcript. Retry with --source <path-to-claude-jsonl>.");
  }

  const sourcePath = resolveUserPath(cwd, requestedPath);
  if (path.extname(sourcePath) !== ".jsonl") {
    throw new Error(`Claude session source must be a JSONL file: ${sourcePath}`);
  }

  let source;
  try {
    source = fs.realpathSync(sourcePath);
  } catch {
    throw new Error(`Claude session file not found: ${sourcePath}`);
  }

  if (!findContainingProjectsRoot(cwd, source)) {
    throw new Error(
      `Codex can import Claude sessions only from ${allowedClaudeProjectsDirs(cwd).join(" or ")}: ${source}`
    );
  }
  return source;
}

export function prepareClaudeSessionImport(cwd, sourcePath) {
  const source = fs.realpathSync(sourcePath);
  const defaultProjects = defaultClaudeProjectsDir();
  const defaultRoot = realpathIfExists(defaultProjects);
  if (defaultRoot && isWithin(defaultRoot, source)) {
    return { sourcePath: source, importPath: source, staged: false, cleanup() {} };
  }

  const sourceRoot = findContainingProjectsRoot(cwd, source);
  if (!sourceRoot) {
    throw new Error(`Claude session is outside the configured projects roots: ${source}`);
  }

  const relative = path.relative(sourceRoot.realRoot, source);
  const importPath = path.join(defaultProjects, relative);
  fs.mkdirSync(path.dirname(importPath), { recursive: true });

  if (fs.existsSync(importPath)) {
    throw new Error(`Cannot stage Claude session for Codex because the destination already exists: ${importPath}`);
  }

  fs.copyFileSync(source, importPath, fs.constants.COPYFILE_EXCL);
  const canonicalImportPath = fs.realpathSync(importPath);
  return {
    sourcePath: source,
    importPath: canonicalImportPath,
    staged: true,
    cleanup() {
      try {
        fs.unlinkSync(canonicalImportPath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
    }
  };
}
