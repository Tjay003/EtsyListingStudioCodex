import type { CopywritingResultDraftV1 } from "../lib/contracts";
import { prepareEvidenceSheet } from "../lib/evidence-sheet";
import { readJson } from "../lib/fs-utils";
import {
  claimNextJob,
  completeJob,
  failJob,
  isCancellationRequested,
  listJobs,
  markJobCancelled,
  readJobSourceContext,
  updateJobProgress,
} from "../lib/job-store";
import { getActiveWorkspace } from "../lib/local-config";
import { readCopywritingSettings } from "../lib/workspace-settings";

function output(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  return {
    commands: [
      "list",
      "claim-next",
      "context <job-id>",
      "prepare-evidence <job-id>",
      "settings <job-id>",
      "progress <job-id> <stage> <percent> <message>",
      "check-cancel <job-id>",
      "complete <job-id> <result-json>",
      "fail <job-id> <message>",
      "cancelled <job-id>",
    ],
  };
}

async function main() {
  const root = await getActiveWorkspace();
  if (!root) throw new Error("No active Etsy Listing Studio workspace.");

  const cliArgs = process.argv.slice(2);
  if (cliArgs[0] === "--") cliArgs.shift();
  const [command, ...args] = cliArgs;
  if (!command || command === "help") {
    output(usage());
    return;
  }

  if (command === "list") {
    output({ root, jobs: await listJobs(root) });
    return;
  }

  if (command === "claim-next") {
    const job = await claimNextJob(root);
    output({ root, job });
    return;
  }

  const jobId = args[0];
  if (!jobId) throw new Error("A job ID is required.");

  if (command === "context") {
    output(await readJobSourceContext(root, jobId));
    return;
  }

  if (command === "prepare-evidence") {
    output(await prepareEvidenceSheet(root, jobId));
    return;
  }

  if (command === "settings") {
    output({ root, settings: await readCopywritingSettings(root) });
    return;
  }

  if (command === "progress") {
    const stage = args[1];
    const percent = Number(args[2]);
    const message = args.slice(3).join(" ");
    if (!stage || !Number.isFinite(percent) || !message) {
      throw new Error("Progress requires a stage, percent, and message.");
    }
    output({
      job: await updateJobProgress(root, jobId, stage, percent, message),
    });
    return;
  }

  if (command === "check-cancel") {
    output({
      job_id: jobId,
      cancel_requested: await isCancellationRequested(root, jobId),
    });
    return;
  }

  if (command === "complete") {
    const resultPath = args[1];
    if (!resultPath) throw new Error("A result JSON path is required.");
    const draft = await readJson<CopywritingResultDraftV1>(resultPath);
    output(await completeJob(root, jobId, draft));
    return;
  }

  if (command === "fail") {
    const message = args.slice(1).join(" ").trim();
    if (!message) throw new Error("A failure message is required.");
    output({ job: await failJob(root, jobId, message) });
    return;
  }

  if (command === "cancelled") {
    output({ job: await markJobCancelled(root, jobId) });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ error: (error as Error).message }, null, 2)}\n`,
  );
  process.exitCode = 1;
});
