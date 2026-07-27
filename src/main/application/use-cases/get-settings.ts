import type { AppSettings } from "../../../domain/entities/settings.js";
import type { SettingsStorePort } from "../ports/settings-store-port.js";

export interface GetSettings {
  execute(): AppSettings;
}

export function createGetSettings(store: SettingsStorePort): GetSettings {
  return {
    execute(): AppSettings {
      return store.get();
    },
  };
}
