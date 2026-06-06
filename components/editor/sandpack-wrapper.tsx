/**
 * sandpack-wrapper.tsx
 * Thin re-export layer so preview-panel can dynamic-import Sandpack without
 * hitting SSR issues. Loaded lazily; if the peer dep is missing the import
 * will reject and preview-panel falls back to the srcdoc/Babel engine.
 */
export {
  SandpackProvider,
  SandpackPreview,
  SandpackConsole,
} from "@codesandbox/sandpack-react";
