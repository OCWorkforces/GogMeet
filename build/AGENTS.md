# Build Hooks and Packaging Assets

Electron Builder resources and packaging hooks. Operational packaging code, not app runtime.

## Files

| File | Role |
| --- | --- |
| `after-pack.cjs` | Post-package optimizations on **darwin only**; no-ops for win32/linux |
| `entitlements.mac.plist` | Main app entitlements (mac signing) |
| `entitlements.mac.inherit.plist` | Inherited helper/framework entitlements |
| `icon.icns` | macOS app icon (`generate-calendar-tray-icons.mjs` + iconutil) |
| `icon.ico` | Windows app icon multi-size (same script via sharp, any OS) |
| `notarize.cjs` | Optional Apple notarization helper; already returns early if not darwin |

## Where to Look

| Task | Location | Notes |
| --- | --- | --- |
| Packaged file set / targets | `../electron-builder.yml` | mac DMG/ZIP; win NSIS+portable; `asarUnpack` Swift |
| Shrink mac bundle | `after-pack.cjs` | Gate: `electronPlatformName === "darwin"` |
| App / tray icons | `../scripts/generate-calendar-tray-icons.mjs` | icns, ico, mac 18/36 tray, win 16/32 tray |
| Local DMG helper | `../build-macOS-dmg.sh` | Apple Silicon ad-hoc re-sign workaround |

## Packaging rules

- `afterPack` / `afterSign` wired from root `electron-builder.yml`.
- Official Windows artifacts: separate `--x64` and `--arm64` invocations (not dual-arch single NSIS).
- Swift source must stay `asarUnpack` for mac packaged builds.
- Do not hand-edit generated `icon.icns` / `icon.ico` / tray PNGs.

## Anti-patterns

- Assuming `.app` layout on non-darwin after-pack paths.
- Removing `en.lproj` when pruning locales.
- Claiming Windows Authenticode is always required (unsigned dogfood allowed when `WIN_CSC_*` absent).
