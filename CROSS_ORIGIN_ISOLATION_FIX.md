# Cross-Origin Isolation Fix

## Problem
Browser runtime error: `Failed to execute 'postMessage' on 'Worker': SharedArrayBuffer transfer requires self.crossOriginIsolated.`

This error occurred because the app was using WebContainers (which requires shared memory via SharedArrayBuffer) without proper cross-origin isolation headers.

## Root Cause
- Editor route was configured with `Cross-Origin-Embedder-Policy: credentialless` (too permissive for SharedArrayBuffer)
- WebContainer boot was also using `coep: "credentialless"` (mismatch between headers and boot config)
- This caused workers attempting to transfer SharedArrayBuffer to fail

## Solution Applied

### 1. Updated Next.js Configuration Header
**File**: `next.config.js`

Changed `/editor/:path*` route header from:
```js
{ key: "Cross-Origin-Embedder-Policy", value: "credentialless" }
```

To:
```js
{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }
```

This ensures the editor page is served with strict cross-origin isolation required for SharedArrayBuffer/WebContainer workers.

### 2. Updated WebContainer Boot Configuration
**File**: `components/editor/webcontainer-preview.tsx`

Changed WebContainer boot options from:
```ts
WebContainer.boot({ coep: "credentialless" })
```

To:
```ts
WebContainer.boot({ coep: "require-corp" })
```

This aligns the browser-side configuration with the server headers.

### 3. Added Cross-Origin Isolation Detection
**File**: `components/editor/webcontainer-preview.tsx`

Added runtime check before attempting to boot WebContainer:
```ts
if (!window.crossOriginIsolated) {
  throw new Error(
    "Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers are required..."
  );
}
```

This provides clear feedback to users if isolation is not properly configured.

### 4. Enhanced Error Handling
**File**: `components/editor/webcontainer-preview.tsx`

- Detect isolation-related errors specifically
- Provide helpful error messages suggesting page refresh or fallback to Sandpack
- Log isolation checks for debugging

## Verification

The dev server now returns correct headers:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Testing
1. Start dev server: `npm run dev`
2. Navigate to editor page
3. Check browser DevTools Console for any "crossOriginIsolated" errors
4. WebContainer should boot successfully without SharedArrayBuffer errors

## Related Resources
- [MDN: Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy)
- [MDN: Cross-Origin-Embedder-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy)
- [WebContainer Requirements](https://webcontainers.io/docs/environment#cross-origin-isolation)
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
