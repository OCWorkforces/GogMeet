import type { AppSettings } from "../../../domain/entities/settings.js";
import type { SettingsStorePort } from "../ports/settings-store-port.js";

export interface UpdateSettings {
  execute(partial: Partial<AppSettings>): Promise<AppSettings>;
}

export function createUpdateSettings(store: SettingsStorePort): UpdateSettings {
  return {
    execute(partial: Partial<AppSettings>): Promise<AppSettings> {
      return store.update(partial);
    },
  };
}
