import type { Api } from "../preload/index.js";

declare global {
  interface Window {
    readonly api: Api;
  }
}
