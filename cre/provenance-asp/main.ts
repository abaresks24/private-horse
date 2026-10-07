import { Runner } from "@chainlink/cre-sdk";
import { initWorkflow, type Config } from "./workflow";

// CRE entry point. The runner loads the workflow config (config.json, validated by the
// zod schema in workflow.ts) and registers the cron-triggered handler.
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
