import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const oneFlow = fileURLToPath(
  new URL("./verify-core-loop-one-flow.mjs", import.meta.url),
);

function runNode(args, env) {
  const child = spawn(process.execPath, args, {
    env,
    stdio: "inherit",
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`core-loop phase stopped by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function main() {
  console.log("Core-loop release phase 1/3: deterministic generation-contract gate");
  const contractCode = await runNode(
    ["--import", "tsx", fileURLToPath(new URL("./generation-contract-experiment.ts", import.meta.url)), "--check"],
    process.env,
  );
  if (contractCode !== 0) {
    process.exitCode = contractCode;
    console.error("Generation-contract gate failed; smoke and 50-run gates were not started.");
    return;
  }

  console.log("Core-loop release phase 2/3: one complete Docker smoke run");
  const smokeCode = await runNode(
    [oneFlow, "--smoke"],
    { ...process.env, CORE_LOOP_ATTEMPTS: "1" },
  );
  if (smokeCode !== 0) {
    throw new Error("Smoke run failed; the 50-run gate was not started.");
  }

  console.log("Core-loop release phase 3/3: authenticated 50-run gate");
  const gateCode = await runNode(
    [oneFlow],
    { ...process.env, CORE_LOOP_ATTEMPTS: "50" },
  );
  if (gateCode !== 0) process.exitCode = gateCode;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
