const ts=require('typescript'), fs=require('fs'), path=require('path'), Module=require('module');
const cache=new Map();
function load(rel){
  const p=path.resolve(rel);
  if(cache.has(p)) return cache.get(p);
  const js=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.Preserve}}).outputText;
  const m=new Module(p); m.filename=p; m.paths=Module._nodeModulePaths(path.dirname(p));
  cache.set(p,m.exports);
  const req=(spec)=>{
    if(spec.startsWith('@/')) return load('src/'+spec.slice(2)+'.ts');
    if(spec.startsWith('.')) return load(path.join(path.dirname(p),spec)+'.ts');
    return require(spec);
  };
  const fn=new Function('exports','require','module','__filename','__dirname',js);
  fn(m.exports,req,m,p,path.dirname(p));
  cache.set(p,m.exports);
  return m.exports;
}
const tss=load('src/lib/templates/tanstack-start-scaffold.ts');
const vite=load('src/lib/templates/lovable-vite-scaffold.ts');
const sc=load('src/lib/templates/site-chrome.ts');
const out={
  tss: tss.tanstackStartScaffold({}, "A landing page for a bakery called Rye and Salt"),
  vite: vite.lovableViteScaffold("Rye and Salt"),
  brands: ["A landing page for a bakery called Rye and Salt","A landing page for a coffee shop called BrewHaus with a hero","Lotus Flow","","Todo {app}"].map(n=>[n,sc.deriveBrand(n)]),
};
fs.writeFileSync('scaffold-out.json', JSON.stringify(out));
console.log('brands:', JSON.stringify(out.brands));
console.log('tss:', out.tss.map(f=>f.path).join(' '));
console.log('vite:', out.vite.map(f=>f.path).join(' '));
const root=out.tss.find(f=>f.path==='src/routes/__root.tsx').content;
const app=out.vite.find(f=>f.path==='src/App.tsx').content;
console.log('tss mounts:', /<Header \/>/.test(root), /<Footer \/>/.test(root));
console.log('vite mounts:', /<Header \/>/.test(app), /<Footer \/>/.test(app));
console.log('bytes:', JSON.stringify(out).length);
