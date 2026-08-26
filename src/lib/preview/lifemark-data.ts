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
function save(c,r){try{localStorage.setItem(key(c),JSON.stringify(r));}catch(e){}}
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
function prep(c,d,excludeId){var s=schema(c);if(!s||!s.fields)return d;var errs=[],f=s.fields,n,out={},k;
for(k in d)out[k]=d[k];
for(n in f){var v=out[n],df=f[n];
if((v===undefined||v===null)&&df["default"]!==undefined){out[n]=df["default"];continue;}
if(v===undefined||v===null){if(df.required)errs.push('Missing required field "'+n+'"');continue;}
if(df.type==="number"&&typeof v==="string"&&v.trim()!==""&&isFinite(Number(v)))v=Number(v);
else if(df.type==="boolean"&&(v==="true"||v==="false"))v=(v==="true");
else if(df.type==="string"&&typeof v==="number")v=String(v);
out[n]=v;
if(!typeOk(v,df.type)){errs.push('Field "'+n+'" must be of type '+df.type);continue;}
if(df["enum"]&&df["enum"].indexOf(v)<0)errs.push('Field "'+n+'" must be one of: '+df["enum"].join(", "));
var m=df.type==="number"?v:(typeof v==="string"||Array.isArray(v))?v.length:null;
if(m!==null){var w=df.type==="number"?"":" length";
if(typeof df.min==="number"&&m<df.min)errs.push('Field "'+n+'"'+w+' must be >= '+df.min);
if(typeof df.max==="number"&&m>df.max)errs.push('Field "'+n+'"'+w+' must be <= '+df.max);}}
for(n in out){if(!(n in f))errs.push('Unknown field "'+n+'" — declare it in the schema or remove it');}
if(!errs.length&&!E){for(n in f){if(f[n].unique&&out[n]!==undefined&&out[n]!==null){var taken=local(c).some(function(r){return r.id!==excludeId&&r.data&&String(r.data[n])===String(out[n]);});if(taken)errs.push('Field "'+n+'" must be unique — "'+String(out[n])+'" is already taken');}}}
if(errs.length)throw new Error("LifemarkData schema validation failed ("+c+"): "+errs.join("; "));
return out;}
async function req(m,p,b){var r=await fetch(E+p,{method:m,headers:{"Content-Type":"application/json"},body:b?JSON.stringify(b):undefined});var j=await r.json().catch(function(){return {};});if(!r.ok)throw new Error(j.error||("Request failed "+r.status));return j;}
window.LifemarkData={
  hosted:!!E,
  async defineSchema(c,fields){var s={fields:fields};try{localStorage.setItem(skey(c),JSON.stringify(s));}catch(e){}if(E)await req("POST","",{collection:c,schema:s});},
  async getSchema(c){var s=schema(c);if(s)return s;if(!E)return null;var j=await req("GET","?collection=__schema__");var m=(j.records||[]).map(function(r){return r.data;}).filter(function(d){return d&&d.collection===c;})[0];return m?{fields:m.fields}:null;},
  async list(c,o){o=o||{};if(!E){var rs=local(c);if(o.where){rs=rs.filter(function(r){for(var k in o.where){if(String((r.data||{})[k])!==String(o.where[k]))return false;}return true;});}if(o.limit)rs=rs.slice(0,o.limit);return rs;}var q="?collection="+encodeURIComponent(c);if(o.where){var wk=Object.keys(o.where)[0];if(wk)q+="&where="+encodeURIComponent(wk+":"+String(o.where[wk]));}if(o.limit)q+="&limit="+encodeURIComponent(o.limit);var j=await req("GET",q);return j.records||[];},
  // The "already seeded" short-circuit MUST come before prep(). prep() runs the
  // unique-field check against the rows already in local(c), so validating first
  // meant the second boot of any app that seeds a collection with a unique field
  // threw "must be unique — X is already taken" against its OWN seed row, before
  // the no-op return could be reached. The app then white-screened on reload
  // while rendering perfectly on a fresh store — and self-verify only ever renders
  // once, into empty storage, so it never saw it. The documented contract ("inserts
  // ONLY if the collection is empty", "a no-op when data already exists, so never
  // guard it with a manual list check") was always the intended behaviour; only the
  // ordering was wrong. Hosted mode is unaffected: prep() skips the unique check
  // when E is set, and the server owns seed idempotency there.
  async seed(c,rows){if(!E&&local(c).length)return {seeded:0};var prepped=rows.map(function(r){return prep(c,r);});if(!E){save(c,prepped.map(function(d){return {id:uid(),data:d,created_at:new Date().toISOString()};}));return {seeded:prepped.length};}var j=await req("POST","",{collection:c,seed:prepped});return {seeded:j.seeded||0};},
  async create(c,d){d=prep(c,d);if(!E){var rs=local(c);var rec={id:uid(),data:d,created_at:new Date().toISOString()};rs.unshift(rec);save(c,rs);return rec;}var j=await req("POST","",{collection:c,data:d});return j.record;},
  async update(c,id,d){d=prep(c,d,id);if(!E){var rs=local(c).map(function(x){return x.id===id?{id:x.id,data:d,created_at:x.created_at}:x;});save(c,rs);return rs.find(function(x){return x.id===id;});}var j=await req("PATCH","",{id:id,collection:c,data:d});return j.record;},
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

/**
 * Inject the SDK into a plain static project's index.html on its way into the
 * live Modal sandbox — both at initial container boot and on every mid-session
 * file sync.
 *
 * WHY THIS EXISTS: `build-static-preview.ts` (the editor's embedded srcdoc
 * iframe) and `build-deploy-files.ts` (published apps) both call
 * injectLifemarkDataSdk before serving index.html. The live sandbox preview —
 * the `*.preview.lifemarkai.com` subdomain visitors actually hit — never did:
 * neither `patchSandboxPreviewFiles` (container creation) nor `push-to-sandbox`
 * (mid-session sync) referenced this injector at all. Every generated app is
 * told by the system prompt that `window.LifemarkData` is "always available"
 * and to call `defineSchema` first thing on startup — so on this one serving
 * path the very first line of every ERP/dashboard-style app threw
 * "LifemarkData is not defined" and the whole app died before rendering
 * anything. Confirmed live on two independently generated projects.
 *
 * Scoped to plain static (no package.json) projects only, matching the same
 * "flat scaffold" signal `detectSandboxStart` uses in sandbox/shared.ts —
 * Vite/React projects boot through a different pipeline and are out of scope
 * here.
 */
export function ensureLifemarkDataSdkInFiles<T extends { path: string; content?: string | null }>(
  files: T[],
): T[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  const hasPackageJson = files.some((f) => norm(f.path) === "package.json");
  if (hasPackageJson) return files;

  const idx = files.findIndex((f) => norm(f.path) === "index.html");
  if (idx < 0 || files[idx].content == null) return files;

  const content = files[idx].content as string;
  const withSdk = injectLifemarkDataSdk(content);
  if (withSdk === content) return files;

  const out = [...files];
  out[idx] = { ...files[idx], content: withSdk } as T;
  return out;
}

/** System-prompt block teaching the AI to persist through LifemarkData. */
export const LIFEMARK_DATA_PROMPT_BLOCK = `
## Data persistence — LifemarkData (always available)
A global \`window.LifemarkData\` is injected into the app at runtime. Use it as the persistence layer — it is shared cloud storage for every visitor when the app is published (\`LifemarkData.hosted === true\`) and silently falls back to localStorage otherwise, so ALWAYS use it instead of raw localStorage.
API (collection names are lowercase slugs like "customers"):
- \`await LifemarkData.defineSchema(collection, fields)\` — declare the shape FIRST (see below)
- \`await LifemarkData.getSchema(collection)\` -> \`{fields} | null\`
- \`await LifemarkData.list(collection, opts?)\` -> \`[{id, data, created_at}]\` — \`opts.where\` is a single-field equality filter (\`{where: {status: "active"}}\`), \`opts.limit\` caps results (max 500)
- \`await LifemarkData.seed(collection, rows)\` -> \`{seeded}\` — bulk demo seeding; inserts ONLY if the collection is empty (race-safe), each row validated
- \`await LifemarkData.create(collection, obj)\` -> record
- \`await LifemarkData.update(collection, id, obj)\` -> record
- \`await LifemarkData.remove(collection, id)\`

IMPORTANT — the \`{id, data, created_at}\` wrapper applies ONLY to LifemarkData records (values you got back from \`list\`/\`create\`/\`update\`, or a single item pulled out of one of those arrays). It does NOT apply to any other in-app state: a local \`store.js\`/\`state.js\` you write yourself for things like the current session's profile, cart, or UI preferences is a plain object you designed — access its fields directly (e.g. \`profile.plan\`, never \`profile.data.plan\`) unless you chose to shape it with a \`.data\` wrapper yourself. Before writing \`x.data.y\` anywhere, confirm \`x\` actually came from a LifemarkData call — confirmed live bug: a generated \`sidebar.js\` read \`profile.data.plan\` from a hand-written local store whose \`getProfile()\` returned \`{id, name, plan}\` directly, crashing the whole app on load with "Cannot read properties of undefined".

SCHEMA-FIRST (required workflow):
1. Before any UI code, decide every collection's fields and call \`defineSchema\` once at app startup, e.g.:
   \`await LifemarkData.defineSchema("customers", { name: {type:"string", required:true}, email: {type:"string"}, status: {type:"string", enum:["lead","active","churned"]}, ltv: {type:"number"} })\`
   Field types: "string" | "number" | "boolean" | "string[]" | "number[]" | "object". \`defineSchema\` is idempotent — always call it on startup, before seeding.
   Field options: \`required\`, \`enum\`, \`default\` (used when the field is missing), \`min\`/\`max\` (value range for numbers, length for strings/arrays), \`unique: true\` (string/number — e.g. emails, slugs; duplicates are rejected).
   Form inputs are auto-coerced: "42" -> 42 for number fields, "true"/"false" -> boolean — so binding an <input> value directly is safe.
2. Every create/update is validated against the schema (client-side in preview, server-side when published). Writes with missing required fields, wrong types, out-of-enum values, or UNDECLARED field names are rejected with a descriptive error — never work around this by renaming fields ad hoc; update the schema instead.
3. Also write a \`lifemark-data.d.ts\` file in the app containing one exported interface per collection matching the schemas exactly (e.g. \`export interface Customer { name: string; email?: string; status?: "lead"|"active"|"churned"; ltv?: number; }\`), and keep it in sync whenever a schema changes. Consult this file before reading or writing records in later edits.

4. Changing a schema over existing data: \`defineSchema\` responds with \`warnings.nonconforming\` when existing records no longer fit (e.g. a field became required). When that happens, migrate the old records with \`update\` before relying on the new shape.

Seed demo data with \`await LifemarkData.seed(collection, rows)\` right after \`defineSchema\` on startup — it is a no-op when data already exists, so never guard it with a manual \`list\` check. Do not build your own backend or auth unless the project has Lifemark Cloud enabled.`;
