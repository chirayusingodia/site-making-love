// Loader hook so plain `node` can run scratch/*.ts against src/: maps
// the "@/..." alias to src/ and retries extensionless relative imports
// with .ts/.tsx/index — everything Vite resolves for the app itself.
//
// Usage:  node --import ./scratch/ts-aliases.mjs scratch/<script>.ts

import { registerHooks } from "node:module";

const srcBase = new URL("../src/", import.meta.url);

function tryNext(nextResolve, specifier, context) {
  try {
    return nextResolve(specifier, context);
  } catch (err) {
    const resolvable =
      err?.code === "ERR_MODULE_NOT_FOUND" && (/^[./]/.test(specifier) || specifier.startsWith("file:"));
    if (!resolvable) throw err;
    for (const suffix of [".ts", ".tsx", "/index.ts"]) {
      try {
        return nextResolve(`${specifier}${suffix}`, context);
      } catch {
        /* keep trying */
      }
    }
    throw err;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return tryNext(nextResolve, new URL(specifier.slice(2), srcBase).href, context);
    }
    return tryNext(nextResolve, specifier, context);
  },
});
