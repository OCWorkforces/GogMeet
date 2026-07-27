import type { AppSettings } from "../../domain/entities/settings.js";
import type { Result } from "../../domain/entities/result.js";
import type { SettingsStorePort } from "../application/ports/settings-store-port.js";
import { createLoadSettings, type LoadSettings } from "../application/use-cases/load-settings.js";
import {
  createUpdateSettings,
  type UpdateSettings,
} from "../application/use-cases/update-settings.js";
import { createGetSettings, type GetSettings } from "../application/use-cases/get-settings.js";
import {
  createJsonSettingsStore,
  type JsonSettingsStore,
} from "../infrastructure/settings/json-settings-store.js";

let defaultStore: JsonSettingsStore = createJsonSettingsStore();

let _load: LoadSettings = createLoadSettings(defaultStore);
let _update: UpdateSettings = createUpdateSettings(defaultStore);
let _get: GetSettings = createGetSettings(defaultStore);

/** Test / composition override. */
export function bindSettingsUseCases(bindings: {
  load?: LoadSettings;
  update?: UpdateSettings;
  get?: GetSettings;
  store?: SettingsStorePort;
}): void {
  if (bindings.store) {
    _load = createLoadSettings(bindings.store);
    _update = createUpdateSettings(bindings.store);
    _get = createGetSettings(bindings.store);
    if ("save" in bindings.store) {
      defaultStore = bindings.store as JsonSettingsStore;
    }
    return;
  }
  if (bindings.load) _load = bindings.load;
  if (bindings.update) _update = bindings.update;
  if (bindings.get) _get = bindings.get;
}

export function rebindSettingsDefaults(): void {
  defaultStore = createJsonSettingsStore();
  _load = createLoadSettings(defaultStore);
  _update = createUpdateSettings(defaultStore);
  _get = createGetSettings(defaultStore);
}

export async function loadSettings(): Promise<Result<AppSettings, string>> {
  return _load.execute();
}

/** Persist settings blob (tests and migration). Prefer updateSettings for partials. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await defaultStore.save(settings);
}

export function getSettings(): AppSettings {
  return _get.execute();
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  return _update.execute(partial);
}
