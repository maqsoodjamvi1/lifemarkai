import { createWorker,QUEUES } from "../src/lib/queue/client.ts";
import { processDeployJob } from "../src/lib/queue/deploy-processor.ts";

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is required for the deployment worker");
  process.exit(1);
}
if (process.env.DEPLOY_WORKER_ENABLED !== "true") {
  console.error("DEPLOY_WORKER_ENABLED=true is required for the deployment worker");
  process.exit(1);
}

const worker = createWorker(QUEUES.deploy, processDeployJob);
if (!worker) {
  console.error("Could not initialize the deployment worker");
  process.exit(1);
}

console.log(`[Worker] consuming ${QUEUES.deploy}`);

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[Worker] received ${signal}; draining`);
  const timeout = setTimeout(() => process.exit(1), 30_000);
  timeout.unref();
  await worker.close();
  process.exit(0);
}
process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));
