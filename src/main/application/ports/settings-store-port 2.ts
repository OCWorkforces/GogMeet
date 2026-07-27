import type { AppSettings } from "../../../domain/entities/settings.js";
import type { Result } from "../../../domain/entities/result.js";

/** Persistent settings load/get/update. */
export interface SettingsStorePort {
  load(): Promise<Result<AppSettings, string>>;
  get(): AppSettings;
  update(partial: Partial<AppSettings>): Promise<AppSettings>;
}
