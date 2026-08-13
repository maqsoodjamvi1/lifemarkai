import { createHash } from "node:crypto";
import { createReadStream,createWriteStream,mkdirSync,statSync,writeFileSync } from "node:fs";
import { resolve,join } from "node:path";
import { spawn } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const directory = resolve(process.env.BACKUP_DIRECTORY ?? "backups");
mkdirSync(directory, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = join(directory, `lifemarkai-${stamp}.dump`);

await new Promise((resolvePromise, reject) => {
  const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", output, databaseUrl], { stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`pg_dump failed (${signal ?? code})`)));
});
if (statSync(output).size === 0) throw new Error("pg_dump produced an empty backup");

const hash = createHash("sha256");
await new Promise((resolvePromise, reject) => {
  createReadStream(output).on("data", (chunk) => hash.update(chunk)).once("error", reject).once("end", resolvePromise);
});
const digest = hash.digest("hex");
writeFileSync(`${output}.sha256`, `${digest}  ${output.split("/").pop()}\n`, { flag: "wx" });
console.log(JSON.stringify({ backup: output, sha256: digest, bytes: statSync(output).size }));
