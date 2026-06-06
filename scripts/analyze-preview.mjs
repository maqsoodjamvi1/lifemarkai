const projectId = "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9";
const res = await fetch(`http://localhost:3000/preview/${projectId}`);
const html = await res.text();
console.log("len", html.length);

const scripts = [...html.matchAll(/<script type="text\/lifemark-module" data-file="([^"]+)">\s*([\s\S]*?)<\/script>/g)];
console.log("files:", scripts.map((m) => m[1]).join(", "));

for (const [, path, code] of scripts) {
  console.log("\n=== " + path + " (first 20 lines) ===");
  console.log(code.split("\n").slice(0, 20).join("\n"));
}

// Find risky patterns
for (const [, path, code] of scripts) {
  if (path.includes("Contact") || path.includes("App")) {
    console.log("\n--- FULL " + path + " ---\n" + code);
  }
}
