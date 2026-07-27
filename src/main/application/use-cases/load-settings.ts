import type { AppSettings } from "../../../domain/entities/settings.js";
import type { Result } from "../../../domain/entities/result.js";
import type { SettingsStorePort } from "../ports/settings-store-port.js";

export interface LoadSettings {
  execute(): Promise<Result<AppSettings, string>>;
}

export function createLoadSettings(store: SettingsStorePort): LoadSettings {
  return {
    execute(): Promise<Result<AppSettings, string>> {
      return store.load();
    },
  };
}
