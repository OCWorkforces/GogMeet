/**
 * Cross-platform IPC sender fixtures.
 *
 * Hardcoded `file:///app/lib/renderer/...` URLs break on Windows: Node's
 * `fileURLToPath` requires a drive-letter absolute path, so validation rejects
 * the sender as unauthorized while macOS stays green.
 *
 * Build file URLs from `app.getAppPath()` via `pathToFileURL` so they match
 * `isAllowedRendererFile` on every platform.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";

export type RendererPage = "index" | "settings" | "alert";

/** Absolute file URL for a packaged renderer page under the mock app path. */
export function rendererFileUrl(page: RendererPage = "index"): string {
  return pathToFileURL(path.join(app.getAppPath(), "lib", "renderer", `${page}.html`)).href;
}

/** Invoke-event shape accepted by validateSender / typedHandle tests. */
export function authorizedInvokeEvent(page: RendererPage = "index"): {
  readonly senderFrame: { readonly url: string };
} {
  return { senderFrame: { url: rendererFileUrl(page) } };
}

/** Fire-and-forget event shape accepted by validateOnSender tests. */
export function authorizedOnEvent(page: RendererPage = "index"): {
  readonly senderFrame: { readonly url: string };
} {
  return { senderFrame: { url: rendererFileUrl(page) } };
}
