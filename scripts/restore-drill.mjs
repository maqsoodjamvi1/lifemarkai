import { createHash } from "node:crypto";
import { createReadStream,readFileSync,statSync,writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const backup = process.argv[2] ? resolve(process.argv[2]) : null;
const target = process.env.RECOVERY_DATABASE_URL;
if (!backup) throw new Error("Usage: npm run recovery:drill -- /absolute/path/to/backup.dump");
if (!target) throw new Error("RECOVERY_DATABASE_URL is required");
if (target === process.env.DATABASE_URL) throw new Error("Refusing to restore into DATABASE_URL; use an isolated recovery database");
if (statSync(backup).size === 0) throw new Error("Backup is empty");

const checksumPath = `${backup}.sha256`;
const expected = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
const hash = createHash("sha256");
await new Promise((resolvePromise, reject) => {
  createReadStream(backup).on("data", (chunk) => hash.update(chunk)).once("error", reject).once("end", resolvePromise);
});
if (hash.digest("hex") !== expected) throw new Error("Backup checksum verification failed");

async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`${command} failed (${signal ?? code})`)));
  });
}
const startedAt = new Date();
await run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--dbname", target, backup]);
await run("psql", [target, "--no-psqlrc", "--tuples-only", "--command", "SELECT current_database(), count(*) FROM information_schema.tables WHERE table_schema='public';"]);
const record = { backup, target: new URL(target).host, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), result: "passed" };
const recordPath = resolve(process.env.RECOVERY_DRILL_RECORD ?? `recovery-drill-${Date.now()}.json`);
writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...record, recordPath }));
