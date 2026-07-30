import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("lib/ai/http");
fs.mkdirSync(dir, { recursive: true });

function transform(src, outName, exportName) {
  let s = fs.readFileSync(src, "utf8");
  s = s.replace(/import \{ NextRequest, NextResponse \} from ["']next\/server["'];\r?\n/, "");
  s = s.replace(/import \{ NextResponse \} from ["']next\/server["'];\r?\n/, "");
  s = s.replace(/import \{ NextRequest \} from ["']next\/server["'];\r?\n/, "");
  s = s.replace(/export const runtime = ["']nodejs["'];\r?\n/g, "");
  s = s.replace(/\/\/ Agent run[^\n]*\r?\n/g, "");
  s = s.replace(/\/\/ Lovable[^\n]*\r?\n/g, "");
  s = s.replace(/export const maxDuration = \d+;\r?\n/g, "");
  s = s.replace(/NextResponse\.json/g, "Response.json");
  s = s.replace(/NextRequest/g, "Request");
  s = s.replace(
    /export async function POST\(req: Request\)/,
    `export async function ${exportName}(req: Request)`,
  );
  s += `\n/** Thin alias for Next route re-export */\nexport const POST = ${exportName};\n`;
  const out = path.join(dir, outName);
  fs.writeFileSync(out, s);
  console.log("wrote", out, s.length);
}

transform("app/api/ai/fix/route.ts", "fix.ts", "handleAiFix");
transform("app/api/ai/agent/route.ts", "agent.ts", "handleAiAgent");
transform("app/api/ai/chat/route.ts", "chat.ts", "handleAiChat");
