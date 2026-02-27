#!/usr/bin/env bash
# build-macOS-dmg.sh — Build macOS arm64 DMG and place it in dist/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }
error()   { echo -e "${RED}✘ $*${RESET}" >&2; exit 1; }

# ── Prerequisite checks ───────────────────────────────────────────────────────
[[ "$(uname -s)" == "Darwin" ]] || error "This script must run on macOS."
[[ "$(uname -m)" == "arm64"  ]] || error "This script requires an Apple Silicon (arm64) Mac."

command -v bun              >/dev/null 2>&1 || error "'bun' is not installed."
command -v codesign         >/dev/null 2>&1 || error "'codesign' not found — install Xcode Command Line Tools."
command -v electron-builder >/dev/null 2>&1 || \
  bun x electron-builder --version >/dev/null 2>&1 || \
  error "'electron-builder' is not available. Run 'bun install' first."

# Detect whether a Developer ID Application certificate is available
DEVELOPER_ID=$(security find-identity -v -p codesigning 2>/dev/null \
  | grep -o '"Developer ID Application:[^"]*"' | head -1 | tr -d '"' || true)

if [[ -n "$DEVELOPER_ID" ]]; then
  SIGN_MODE="developer-id"
  info "Signing identity found: ${DEVELOPER_ID}"
else
  SIGN_MODE="adhoc"
  echo -e "${BOLD}WARNING${RESET}: No 'Developer ID Application' certificate found in keychain."
  echo    "         The app will be signed ad-hoc and WILL be blocked by Gatekeeper."
  echo    "         After installing, run the quarantine-strip command shown at the end."
  echo
fi

# ── 1. Clean dist/ ────────────────────────────────────────────────────────────
info "Cleaning dist/ directory…"
rm -rf dist/
success "dist/ cleaned."

# ── 2. TypeScript / source build ──────────────────────────────────────────────
info "Building TypeScript sources (main + preload + renderer)…"
bun run build
success "Source build complete."

# ── 3. Package → DMG (arm64 only) ────────────────────────────────────────────
info "Packaging macOS arm64 DMG…"

if [[ "$SIGN_MODE" == "developer-id" ]]; then
  # Full Developer ID signing — Gatekeeper will accept the app
  CSC_NAME="$DEVELOPER_ID" bun x electron-builder --mac dmg --arm64
else
  # Ad-hoc signing — usable on the same machine after quarantine removal
  CSC_IDENTITY_AUTO_DISCOVERY=false bun x electron-builder --mac dmg --arm64
fi

success "DMG build complete."

# ── 4. Re-sign all nested helpers (deep ad-hoc) ──────────────────────────────
# electron-builder signs the outer bundle but nested .app helpers may be missed.
# A deep re-sign ensures every executable inside carries a valid signature.
if [[ "$SIGN_MODE" == "adhoc" ]]; then
  APP_BUNDLE=$(find dist/mac-arm64 -maxdepth 1 -name '*.app' | head -1)
  if [[ -n "$APP_BUNDLE" ]]; then
    info "Re-signing bundle deeply (ad-hoc)…"
    codesign --force --deep --sign - \
      --entitlements build/entitlements.mac.plist \
      --options runtime \
      "$APP_BUNDLE" 2>&1
    success "Deep ad-hoc re-sign complete."
  fi
fi

# ── 5. Report artefacts ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Artefacts in dist/${RESET}"
find dist -maxdepth 2 \( -name "*.dmg" \) | sort | while read -r f; do
  size=$(du -sh "$f" 2>/dev/null | cut -f1)
  echo -e "  ${GREEN}${f}${RESET}  (${size})"
done
echo ""

# ── 6. Post-install instructions ─────────────────────────────────────────────
if [[ "$SIGN_MODE" == "adhoc" ]]; then
  echo -e "${BOLD}To run the app after copying to /Applications:${RESET}"
  echo    "  sudo xattr -rd com.apple.quarantine \"/Applications/Google Meet.app\""
  echo
  echo    "  Or, open System Settings → Privacy & Security → scroll down and click 'Open Anyway'."
  echo
fi

success "Done."
