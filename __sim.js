const {parse}=require('@babel/parser'); const fs=require('fs');
function transform(file){
  let src=file.content;
  src=src.replace(/^\s*```[\w-]*\s*\n/,'').replace(/\n```\s*$/m,'');
  src=src.replace(/import\s+['"][^'"]+\.css['"]\s*;?\n?/g,'');
  src=src.replace(/import\s+type\s+[^\n;]+;?\n?/g,'');
  src=src.replace(/import\s+React\s*,?\s*(?:\{([^}]*)\})?\s*from\s+['"]react['"]\s*;?\n?/g,(_,n)=>n&&n.trim()?`const { ${n.trim()} } = React;\n`:'');
  src=src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react['"]\s*;?\n?/g,(_,n)=>`const { ${n.trim()} } = React;\n`);
  src=src.replace(/import\s+(\w+)\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,(_,n)=>`const ${n} = ReactDOM;\n`);
  src=src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react-dom(?:\/client)?['"]\s*;?\n?/g,(_,n)=>`const { ${n.trim()} } = ReactDOM;\n`);
  src=src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]react-hook-form['"]\s*;?\n?/g,(_,n)=>`const { ${n.trim()} } = window.__reactHookForm || {};\n`);
  src=src.replace(/import\s+\{([^}]+)\}\s+from\s+['"]zod['"]\s*;?\n?/g,(_,n)=>`const { ${n.trim()} } = window.__zod ? Object.assign({ z: window.__zod }, window.__zod) : {};\n`);
  // generic
  const gen=s=>`window.__Mrequire('${s.replace(/'/g,"\\'")}')`;
  const de=n=>n.trim().replace(/\s+as\s+/g,': ');
  src=src.replace(/import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,(_,n,s)=>`const ${n} = ${gen(s)};\n`);
  src=src.replace(/import\s+([\w$]+)\s*,\s*\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,(_,d,n,s)=>{const v='__g_'+s.replace(/[^a-zA-Z0-9]/g,'_');return `var ${v} = ${gen(s)};\nconst ${d} = ${v}.default ?? ${v};\nconst { ${de(n)} } = ${v};\n`;});
  src=src.replace(/import\s+\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,(_,n,s)=>`const { ${de(n)} } = ${gen(s)};\n`);
  src=src.replace(/import\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,(_,d,s)=>{const v='__g_'+s.replace(/[^a-zA-Z0-9]/g,'_');return `var ${v} = ${gen(s)};\nconst ${d} = ${v}.default ?? ${v};\n`;});
  src=src.replace(/import\s+['"][^'"]+['"]\s*;?\n?/g,'');
  let dxn=null;
  src=src.replace(/export\s+default\s+(async\s+)?(function|class)(\s+[\w$]+)?/g,(_,a,k,n)=>{if(n&&n.trim()){dxn=n.trim();return `${a||''}${k}${n}`;}dxn='__default_export';return `const __default_export = ${a||''}${k}`;});
  src=src.replace(/^export\s+default\s+([\w$]+)\s*;?\s*$/m,(_,n)=>{dxn=n;return `/* dx ${n} */`;});
  src=src.replace(/^([ \t]*)export\s+default\s+/m,(_,i)=>{if(!dxn)dxn='__default_export';return dxn==='__default_export'?`${i}const __default_export = `:`${i}const __default_export_extra = `;});
  src=src.replace(/export\s+type\s+/g,'type ');
  src=src.replace(/export\s+(interface|enum|declare)\s+/g,'$1 ');
  src=src.replace(/export\s+\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"]\s*;?\n?/g,'/* reexport */\n');
  src=src.replace(/export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?\n?/g,'/* exportstar */\n');
  src=src.replace(/export\s+(async\s+)?(const|let|var|function|class)\s+([\w$]+)/g,(_,a,k,n)=>`${a||''}${k} ${n}`);
  src=src.replace(/export\s+\{([^}]+)\}\s*;?\n?/g,'/* named */\n');
  src=src.replace(/^[ \t]*(import|export)\b[^\n]*$/gm,l=>`/* skipped: ${l.replace(/\*\//g,'* /')} */`);
  return src;
}
for(const fn of fs.readdirSync('/tmp/pf')){
  const out=transform({content:fs.readFileSync('/tmp/pf/'+fn,'utf8')});
  for(const st of ['script','module']){
    try{ parse(out,{sourceType:st,plugins:['typescript','jsx']}); console.log('OK  ',st,fn);}
    catch(e){ console.log('FAIL',st,fn,'::',e.message.split('\n')[0]); if(st==='script'){const ln=(e.loc&&e.loc.line)||0;console.log('     >>>',(out.split('\n')[ln-1]||'').trim().slice(0,90));}}
  }
}
