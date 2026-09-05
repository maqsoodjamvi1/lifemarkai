import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("host GC preserves active and recently stopped previews regardless of creation age", () => {
  const setup = readFileSync(new URL("../../../scripts/setup-sandbox-host.sh", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const gc = setup.split("<<'GC'\n")[1]?.split("\nGC\n")[0];
  assert.ok(gc, "extract actual installed GC program");
  const mock = `
docker() {
  case "$1" in
    ps)
      case "$*" in
        *--format*) return 0 ;;
        *status=exited*) return 0 ;;
        *) printf 'active\\nrecent\\nstale\\nresumed\\nunreadable\\nidle\\n' ;;
      esac ;;
    inspect)
      case "$3" in
        *Created*) echo '@1' ;;
        *Running*) case "$4" in recent|stale) echo false;; *) echo true;; esac ;;
        *StartedAt*) if [ "$4" = resumed ]; then echo "@$now"; else echo '@1'; fi ;;
        *FinishedAt*) if [ "$4" = recent ]; then echo "@$now"; else echo '@1'; fi ;;
      esac ;;
    exec) case "$2" in unreadable) return 1;; resumed|idle) echo 1;; *) echo "$now";; esac ;;
    rm|stop) echo "MUTATION $*" >> "$GC_TEST_LOG" ;;
  esac
}
`;
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const dir = mkdtempSync(join(tmpdir(), "lifemark-gc-test-"));
  const log = join(dir, "actions.log");
  const result = spawnSync(bash, ["-c", mock + gc], { encoding: "utf8", env: { ...process.env, GC_TEST_LOG: log.replaceAll("\\", "/") } });
  try {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(log, "utf8").trim(), "MUTATION rm stale\nMUTATION stop -t 5 idle");
  assert.match(result.stdout, /removed stale/);
  } finally {
    try { unlinkSync(log); } finally { rmdirSync(dir); }
  }
});
