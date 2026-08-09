const ts=require('typescript'), fs=require('fs'), path=require('path'), Module=require('module');
const cache=new Map();
function load(rel){
  const p=path.resolve(rel); if(cache.has(p)) return cache.get(p);
  const js=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m=new Module(p); m.filename=p; m.paths=Module._nodeModulePaths(path.dirname(p)); cache.set(p,m.exports);
  const req=(sp)=> sp.startsWith('@/')?load('src/'+sp.slice(2)+'.ts') : sp.startsWith('.')?load(path.join(path.dirname(p),sp)+'.ts') : require(sp);
  new Function('exports','require','module','__filename','__dirname',js)(m.exports,req,m,p,path.dirname(p));
  cache.set(p,m.exports); return m.exports;
}
const out={
  tss: load('src/lib/templates/tanstack-start-scaffold.ts').tanstackStartScaffold({}, "A landing page for a bakery called Rye and Salt"),
  vite: load('src/lib/templates/lovable-vite-scaffold.ts').lovableViteScaffold("Rye and Salt"),
};
const align=load('src/lib/preview/align-package-json.ts').alignGeneratedPackageJson;
for (const k of ['tss','vite']) {
  const r=align(out[k].find(f=>f.path==='package.json').content);
  console.log(k,'align changes:', r.changed.length, r.changed.join(' | '));
}
fs.writeFileSync('scaffold-v2.json', JSON.stringify(out));
console.log('dumped');
