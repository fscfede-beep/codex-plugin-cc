import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = path.join(ROOT, "plugins", "codex", "scripts", "run-node.sh");
const BASH = process.env.SHELL || (process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/bash");

function installFakeNode(home, version, supported) {
  const binDir = path.join(home, ".nvm", "versions", "node", version, "bin");
  const nodePath = path.join(binDir, "node");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(nodePath, `#!/bin/sh\nif [ "\${1:-}" = "-e" ]; then exit ${supported ? 0 : 1}; fi\nprintf 'FAKE_NODE_${version}:%s\\n' "$*"\nprintf 'CODEX:%s\\n' "$(command -v codex || true)"\n`, "utf8");
  fs.chmodSync(nodePath, 0o755);
  return binDir;
}

function runWithMinimalPath(home) {
  const emptyBin = path.join(home, "empty-bin");
  fs.mkdirSync(emptyBin, { recursive: true });
  return spawnSync(BASH, [LAUNCHER.replaceAll("\\", "/"), "companion.mjs", "status", "--json"], {
    encoding: "utf8",
    env: { ...process.env, HOME: home.replaceAll("\\", "/"), PATH: emptyBin.replaceAll("\\", "/"), CODEX_COMPANION_NODE: "" }
  });
}

test("portable launcher preserves the selected Node toolchain directory on PATH", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-node-path-"));
  const binDir = installFakeNode(home, "v22.0.0", true);
  const codexPath = path.join(binDir, "codex");
  fs.writeFileSync(codexPath, "#!/bin/sh\nexit 0\n", "utf8");
  fs.chmodSync(codexPath, 0o755);
  try {
    const result = runWithMinimalPath(home);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CODEX:.+[\\/]codex\n$/m);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("portable launcher skips unsupported Node versions", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-node-version-"));
  installFakeNode(home, "v12.22.0", false);
  installFakeNode(home, "v22.0.0", true);
  try {
    const result = runWithMinimalPath(home);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /FAKE_NODE_v22\.0\.0:/);
    assert.doesNotMatch(result.stdout, /FAKE_NODE_v12\.22\.0:/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
