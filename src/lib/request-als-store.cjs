/**
 * Zero-dependency ALS store shared by Vite SSR and any secondary loaders.
 * CommonJS so both import systems resolve the same global instance.
 */
"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const KEY = "__lifemark_request_als_store__";
if (!globalThis[KEY]) {
  globalThis[KEY] = new AsyncLocalStorage();
}
module.exports = { als: globalThis[KEY] };
