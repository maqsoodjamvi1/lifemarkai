const ts=require('typescript'), fs=require('fs'), path=require('path'), Module=require('module');
const src=fs.readFileSync('src/lib/preview/diagnose-imports.ts','utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m=new Module('di'); m._compile(js,'di.js');
const { diagnoseBrokenImports } = m.exports;

let pass=0,fail=0;
const t=(n,c,d='')=>{c?(pass++,console.log('  PASS',n)):(fail++,console.log('  FAIL',n,d));};
const F=(path,content)=>({path,content});

// 1. TanStack scaffold's own files must be clean
const scaffold=[
 F('src/routes/__root.tsx','import appCss from "../styles.css?url";\nimport { Header } from "../components/layout/Header";\nexport const x=1;'),
 F('src/router.tsx','import { routeTree } from "./routeTree.gen";\nexport const y=1;'),
 F('src/styles.css','@tailwind base;'),
 F('src/components/layout/Header.tsx','export function Header(){return null}'),
];
let issues=diagnoseBrokenImports(scaffold);
t('scaffold clean', issues.length===0, JSON.stringify(issues));

// 2. asset imports
issues=diagnoseBrokenImports([
 F('src/App.tsx','import logo from "./assets/logo.svg";\nimport data from "@/data/seed.json";\nimport css from "./App.module.css";\nimport w from "./w?worker";\nexport default 1;'),
 F('src/assets/logo.svg','<svg/>'), F('src/data/seed.json','{}'), F('src/App.module.css','.a{}'), F('src/w.ts','export default 1'),
]);
t('asset imports clean', issues.length===0, JSON.stringify(issues));

// 3. comment inside import braces
issues=diagnoseBrokenImports([
 F('src/Page.tsx','import {\n  Button, // primary\n  Card,\n} from "./ui/kit";\nexport default 1;'),
 F('src/ui/kit.tsx','export function Button(){return null}\nexport function Card(){return null}'),
]);
t('comment in braces clean', issues.length===0, JSON.stringify(issues));

// 4. REGRESSION: a genuinely broken import must still be reported
issues=diagnoseBrokenImports([ F('src/A.tsx','import { Missing } from "./B";\nexport default 1;'), F('src/B.tsx','export function Other(){return null}') ]);
t('real missing named export still reported', issues.length===1 && /Missing/.test(issues[0]), JSON.stringify(issues));
issues=diagnoseBrokenImports([ F('src/A.tsx','import Thing from "./Nope";\nexport default 1;') ]);
t('real missing file still reported', issues.length===1 && /file not found/.test(issues[0]), JSON.stringify(issues));
issues=diagnoseBrokenImports([ F('src/A.tsx','import Def from "./B";\nexport default 1;'), F('src/B.tsx','export const Def = 1;') ]);
t('default-vs-named mismatch still reported', issues.length===1 && /named export|default export/.test(issues[0]), JSON.stringify(issues));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail?1:0);
