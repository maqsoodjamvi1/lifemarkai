/**
 * Verify preview file signature changes when content changes.
 * Run: npx tsx scripts/verify-files-signature.ts
 */
import { appendFileSync } from "fs";
import { filesContentSignature } from "../lib/preview/files-signature.ts";

const LOG = "debug-148b16.log";

function log(message: string, data: Record<string, unknown>) {
  const entry = {
    sessionId: "148b16",
    timestamp: Date.now(),
    runId: "files-signature-verify",
    location: "verify-files-signature.ts",
    message,
    data,
    hypothesisId: "H-PREVIEW-SYNC",
  };
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  console.log(JSON.stringify(entry));
}

const base = [{ path: "src/App.tsx", content: "export default function App(){return null}" }];
const sig1 = filesContentSignature(base);
const sig2 = filesContentSignature([...base]);
const sig3 = filesContentSignature([{ path: "src/App.tsx", content: "export default function App(){return <Login/>}" }]);
const sig4 = filesContentSignature([...base, { path: "src/pages/Login.tsx", content: "login" }]);

const sameContent = sig1 === sig2;
const contentChange = sig1 !== sig3;
const newFile = sig1 !== sig4;

log("signature checks", { sameContent, contentChange, newFile, ok: sameContent && contentChange && newFile });
process.exit(sameContent && contentChange && newFile ? 0 : 1);
