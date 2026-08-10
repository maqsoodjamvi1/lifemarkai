/**
 * LifemarkData — the default data layer for generated apps (improvement #3).
 *
 * A tiny SDK injected into every static-runtime app. When the app is
 * published it talks to /api/public/app-data/<slug> (shared cloud storage for
 * every visitor); otherwise it transparently falls back to localStorage so
 * editor previews keep working. Apps that enable Lifemark Cloud get a real
 * Supabase backend instead — this is the zero-setup default, not the ceiling.
 */

export const APP_DATA_MAX_ROWS_PER_COLLECTION = 1000;
export const APP_DATA_MAX_RECORD_BYTES = 32_000;

export interface LifemarkDataOptions {
  /** Published app slug — enables the hosted backend. */
  slug?: string | null;
  /** Absolute origin of the LifemarkAI deployment (needed inside srcdoc frames). */
  apiBase?: string | null;
}

/** Endpoint the SDK should call, or null for localStorage-only mode. */
export function appDataEndpoint(options: LifemarkDataOptions): string | null {
  if (!options.slug || !options.apiBase) return null;
  return `${options.apiBase.replace(/\/$/, "")}/api/public/app-data/${options.slug}`;
}

/** The <script> tag to inject into a generated app's <head>. */
export function lifemarkDataSdkScript(options: LifemarkDataOptions = {}): string {
  const endpoint = JSON.stringify(appDataEndpoint(options));
  return `<script data-lifemark-data-sdk>(function(){
var E=${endpoint};
function key(c){return "lifemarkdata:"+c;}
function skey(c){return "lifemarkdata:__schema__:"+c;}
function local(c){try{return JSON.parse(localStorage.getItem(key(c))||"[]");}catch(e){return [];}}
function save(c,r){localStorage.setItem(key(c),JSON.stringify(r));}
function schema(c){try{return JSON.parse(localStorage.getItem(skey(c))||"null");}catch(e){return null;}}
function uid(){return (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));}
function typeOk(v,t){
if(t==="string")return typeof v==="string";
if(t==="number")return typeof v==="number"&&isFinite(v);
if(t==="boolean")return typeof v==="boolean";
if(t==="string[]")return Array.isArray(v)&&v.every(function(x){return typeof x==="string";});
if(t==="number[]")return Array.isArray(v)&&v.every(function(x){return typeof x==="number";});
if(t==="object")return typeof v==="object"&&v!==null;
return false;}
function check(c,d){var s=schema(c);if(!s||!s.fields)return;var errs=[],f=s.fields,n;
for(n in f){var v=d[n];
if(v===undefined||v===null){if(f[n].required)errs.push('Missing required field "'+n+'"');continue;}
if(!typeOk(v,f[n].type)){errs.push('Field "'+n+'" must be of type '+f[n].type);continue;}
if(f[n]["enum"]&&f[n]["enum"].indexOf(v)<0)errs.push('Field "'+n+'" must be one of: '+f[n]["enum"].join(", "));}
for(n in d){if(!(n in f))errs.push('Unknown field "'+n+'" — declare it in the schema or remove it');}
if(errs.length)throw new Error("LifemarkData schema validation failed ("+c+"): "+errs.join("; "));}
async function req(m,p,b){var r=await fetch(E+p,{method:m,headers:{"Content-Type":"application/json"},body:b?JSON.stringify(b):undefined});var j=await r.json().catch(function(){return {};});if(!r.ok)throw new Error(j.error||("Request failed "+r.status));return j;}
window.LifemarkData={
  hosted:!!E,
  async defineSchema(c,fields){var s={fields:fields};localStorage.setItem(skey(c),JSON.stringify(s));if(E)await req("POST","",{collection:c,schema:s});},
  async list(c){if(!E)return local(c);var j=await req("GET","?collection="+encodeURIComponent(c));return j.records||[];},
  async create(c,d){check(c,d);if(!E){var rs=local(c);var rec={id:uid(),data:d,created_at:new Date().toISOString()};rs.unshift(rec);save(c,rs);return rec;}var j=await req("POST","",{collection:c,data:d});return j.record;},
  async update(c,id,d){check(c,d);if(!E){var rs=local(c).map(function(x){return x.id===id?{id:x.id,data:d,created_at:x.created_at}:x;});save(c,rs);return rs.find(function(x){return x.id===id;});}var j=await req("PATCH","",{id:id,collection:c,data:d});return j.record;},
  async remove(c,id){if(!E){save(c,local(c).filter(function(x){return x.id!==id;}));return {ok:true};}return req("DELETE","?id="+encodeURIComponent(id));}
};
})();</script>`;
}

/** Inject the SDK into an HTML document's <head> (idempotent). */
export function injectLifemarkDataSdk(html: string, options: LifemarkDataOptions = {}): string {
  if (html.includes("data-lifemark-data-sdk")) return html;
  const sdk = lifemarkDataSdkScript(options);
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (tag) => `${tag}\n${sdk}`);
  }
  return `${sdk}\n${html}`;
}

/** System-prompt block teaching the AI to persist through LifemarkData. */
export const LIFEMARK_DATA_PROMPT_BLOCK = `
## Data persistence — LifemarkData (always available)
A global \`window.LifemarkData\` is injected into the app at runtime. Use it as the persistence layer — it is shared cloud storage for every visitor when the app is published (\`LifemarkData.hosted === true\`) and silently falls back to localStorage otherwise, so ALWAYS use it instead of raw localStorage.
API (collection names are lowercase slugs like "customers"):
- \`await LifemarkData.defineSchema(collection, fields)\` — declare the shape FIRST (see below)
- \`await LifemarkData.list(collection)\` -> \`[{id, data, created_at}]\`
- \`await LifemarkData.create(collection, obj)\` -> record
- \`await LifemarkData.update(collection, id, obj)\` -> record
- \`await LifemarkData.remove(collection, id)\`

SCHEMA-FIRST (required workflow):
1. Before any UI code, decide every collection's fields and call \`defineSchema\` once at app startup, e.g.:
   \`await LifemarkData.defineSchema("customers", { name: {type:"string", required:true}, email: {type:"string"}, status: {type:"string", enum:["lead","active","churned"]}, ltv: {type:"number"} })\`
   Field types: "string" | "number" | "boolean" | "string[]" | "number[]" | "object". \`defineSchema\` is idempotent — always call it on startup, before seeding.
2. Every create/update is validated against the schema (client-side in preview, server-side when published). Writes with missing required fields, wrong types, out-of-enum values, or UNDECLARED field names are rejected with a descriptive error — never work around this by renaming fields ad hoc; update the schema instead.
3. Also write a \`lifemark-data.d.ts\` file in the app containing one exported interface per collection matching the schemas exactly (e.g. \`export interface Customer { name: string; email?: string; status?: "lead"|"active"|"churned"; ltv?: number; }\`), and keep it in sync whenever a schema changes. Consult this file before reading or writing records in later edits.

Seed a collection with realistic demo rows on first load ONLY when \`list\` returns empty (after defineSchema). Do not build your own backend or auth unless the project has Lifemark Cloud enabled.`;
