const fs = require("fs");
const lines = fs.readFileSync("components/editor/editor-layout.tsx", "utf8").split("\n");

let open = 0;
for (let i = 647; i < 1348; i++) {
  const opens = (lines[i].match(/<div\b/g) || []).length;
  const closes = (lines[i].match(/<\/div>/g) || []).length;
  open += opens - closes;
  if ((i >= 759 && i <= 774) || (i >= 1339 && i <= 1349)) {
    console.log(`${i + 1}: o=${opens} c=${closes} bal=${open} | ${lines[i].substring(0, 80)}`);
  }
}
console.log("Final balance:", open);
