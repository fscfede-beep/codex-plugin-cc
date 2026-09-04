import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { saveState } from "../plugins/codex/scripts/lib/state.mjs";

import {
  buildStatusSnapshot,
  reconcileJobLiveness,
  resolveCancelableJob,
  resolveResultJob
} from "../plugins/codex/scripts/lib/job-control.mjs";

function activeJob(overrides = {}) {
  return {
    id: "task-dead-worker",
    status: "running",
    phase: "editing",
    pid: 999999,
    ...overrides
  };
}

test("reconcileJobLiveness marks an absent worker as terminated-unknown", () => {
  const job = reconcileJobLiveness(activeJob(), {
    killImpl() {
      const error = new Error("no such process");
      error.code = "ESRCH";
      throw error;
    }
  });

  assert.equal(job.status, "terminated-unknown");
  assert.equal(job.phase, "worker-exited");
  assert.equal(job.pid, 999999);
});

test("reconcileJobLiveness treats EPERM as alive", () => {
  const original = activeJob();
  const job = reconcileJobLiveness(original, {
    killImpl() {
      const error = new Error("not permitted");
      error.code = "EPERM";
      throw error;
    }
  });
  assert.deepEqual(job, original);
});

test("reconcileJobLiveness leaves terminal and pid-less jobs untouched", () => {
  let calls = 0;
  const killImpl = () => { calls += 1; };
  const completed = activeJob({ status: "completed" });
  const noPid = activeJob({ pid: null });

  assert.deepEqual(reconcileJobLiveness(completed, { killImpl }), completed);
  assert.deepEqual(reconcileJobLiveness(noPid, { killImpl }), noPid);
  assert.equal(calls, 0);
});

test("buildStatusSnapshot moves a dead worker out of the active queue", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-job-control-"));
  const workspace = path.join(root, "workspace");
  const previousPluginData = process.env.CLAUDE_PLUGIN_DATA;
  fs.mkdirSync(workspace, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = path.join(root, "plugin-data");

  try {
    saveState(workspace, {
      config: { stopReviewGate: false },
      jobs: [{
        id: "task-dead-worker",
        status: "running",
        phase: "editing",
        pid: 999999,
        createdAt: "2026-09-04T10:00:00.000Z",
        updatedAt: "2026-09-04T10:01:00.000Z"
      }]
    });
    const reportKill = () => {
      const error = new Error("no such process");
      error.code = "ESRCH";
      throw error;
    };
    const report = buildStatusSnapshot(workspace, { env: {}, killImpl: reportKill });
    assert.equal(report.running.length, 0);
    assert.equal(report.latestFinished.status, "terminated-unknown");
    assert.equal(report.latestFinished.phase, "worker-exited");
    assert.equal(
      resolveResultJob(workspace, "task-dead-worker", { killImpl: reportKill }).job.status,
      "terminated-unknown"
    );
    assert.throws(
      () => resolveCancelableJob(workspace, "task-dead-worker", { killImpl: reportKill }),
      /No job found|No active job/
    );
  } finally {
    if (previousPluginData === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
    else process.env.CLAUDE_PLUGIN_DATA = previousPluginData;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
