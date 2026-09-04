import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { initGitRepo, makeTempDir } from "./helpers.mjs";
import {
  markJobCancellationRequested,
  readJobFile,
  resolveJobFile
} from "../plugins/codex/scripts/lib/state.mjs";
import { runTrackedJob } from "../plugins/codex/scripts/lib/tracked-jobs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRACKED_JOBS_SOURCE = path.join(ROOT, "plugins", "codex", "scripts", "lib", "tracked-jobs.mjs");

test("runTrackedJob honors a durable cancellation request before invoking the runner", async () => {
  const repo = makeTempDir();
  initGitRepo(repo);
  const jobId = "task-cancel-handoff";
  markJobCancellationRequested(repo, jobId);
  let runnerCalled = false;
  const execution = await runTrackedJob(
    { id: jobId, workspaceRoot: repo, title: "Codex Task", status: "queued" },
    async () => {
      runnerCalled = true;
      return { exitStatus: 0, payload: {}, rendered: "ran\n", summary: "ran" };
    }
  );
  assert.equal(runnerCalled, false);
  assert.equal(execution.payload.status, "cancelled");
  const stored = readJobFile(resolveJobFile(repo, jobId));
  assert.equal(stored.status, "cancelled");
  assert.equal(stored.pid, null);
});

test("runTrackedJob checks cancellation after publishing running state and before the runner", () => {
  const source = fs.readFileSync(TRACKED_JOBS_SOURCE, "utf8");
  const start = source.indexOf("export async function runTrackedJob");
  const end = source.indexOf("\n}", start) + 2;
  const body = source.slice(start, end);
  const runningWrite = body.indexOf("upsertJob(job.workspaceRoot, runningRecord)");
  const cancelCheck = body.indexOf("isJobCancellationRequested(job.workspaceRoot, job.id)");
  const runnerCall = body.indexOf("await runner()");
  assert.ok(runningWrite >= 0 && runningWrite < cancelCheck);
  assert.ok(cancelCheck < runnerCall);
});
