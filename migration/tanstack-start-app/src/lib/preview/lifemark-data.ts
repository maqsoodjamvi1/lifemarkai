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
function local(c){try{return JSON.parse(localStorage.getItem(key(c))||"[]");}catch(e){return [];}}
function save(c,r){localStorage.setItem(key(c),JSON.stringify(r));}
function uid(){return (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));}
async function req(m,p,b){var r=await fetch(E+p,{method:m,headers:{"Content-Type":"application/json"},body:b?JSON.stringify(b):undefined});var j=await r.json().catch(function(){return {};});if(!r.ok)throw new Error(j.error||("Request failed "+r.status));return j;}
window.LifemarkData={
  hosted:!!E,
  async list(c){if(!E)return local(c);var j=await req("GET","?collection="+encodeURIComponent(c));return j.records||[];},
  async create(c,d){if(!E){var rs=local(c);var rec={id:uid(),data:d,created_at:new Date().toISOString()};rs.unshift(rec);save(c,rs);return rec;}var j=await req("POST","",{collection:c,data:d});return j.record;},
  async update(c,id,d){if(!E){var rs=local(c).map(function(x){return x.id===id?{id:x.id,data:d,created_at:x.created_at}:x;});save(c,rs);return rs.find(function(x){return x.id===id;});}var j=await req("PATCH","",{id:id,data:d});return j.record;},
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
- \`await LifemarkData.list(collection)\` -> \`[{id, data, created_at}]\`
- \`await LifemarkData.create(collection, obj)\` -> record
- \`await LifemarkData.update(collection, id, obj)\` -> record
- \`await LifemarkData.remove(collection, id)\`
Seed a collection with realistic demo rows on first load ONLY when \`list\` returns empty. Do not build your own backend or auth unless the project has Lifemark Cloud enabled.`;
