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

test("portable launcher finds an nvm Node when PATH does not contain node", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-node-launcher-"));
  const nodePath = path.join(home, ".nvm", "versions", "node", "v22.0.0", "bin", "node");
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(nodePath, "#!/bin/sh\nprintf 'FAKE_NODE:%s\\n' \"$*\"\n", "utf8");
  fs.chmodSync(nodePath, 0o755);

  const emptyBin = path.join(home, "empty-bin");
  fs.mkdirSync(emptyBin);

  try {
    const result = spawnSync(BASH, [LAUNCHER.replaceAll("\\", "/"), "companion.mjs", "status", "--json"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home.replaceAll("\\", "/"), PATH: emptyBin.replaceAll("\\", "/"), CODEX_COMPANION_NODE: "" }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /FAKE_NODE:.*[\\/]companion\.mjs status --json\n$/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
