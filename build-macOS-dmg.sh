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

# ── Argument parsing ──────────────────────────────────────────────────────────
ENVIRONMENT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      if [[ -z "${2:-}" ]]; then
        error "--environment requires a value (e.g., stable, beta, dev)"
      fi
      ENVIRONMENT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --environment <name>  Append environment name to DMG filename (e.g., stable, beta)"
      echo "  -h, --help            Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                              # Build DMG with default name"
      echo "  $0 --environment stable         # Build DMG: GogMeet-1.0.0-arm64-stable.dmg"
      exit 0
      ;;
    *)
      error "Unknown option: $1. Use --help for usage."
      ;;
  esac
done

if [[ -n "$ENVIRONMENT" ]]; then
  info "Environment suffix: ${ENVIRONMENT}"
fi

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

# ── 1. Install dependencies ──────────────────────────────────────────────────
info "Installing dependencies…"
bun install
success "Dependencies installed."

# ── 2. Clean dist/ ────────────────────────────────────────────────────────────
info "Cleaning dist/ directory…"
rm -rf dist/
success "dist/ cleaned."

# ── 3. TypeScript / source build ──────────────────────────────────────────────
info "Building TypeScript sources (main + preload + renderer)…"
bun run build
success "Source build complete."

# ── 4. Package → DMG (arm64 only) ────────────────────────────────────────────
info "Packaging macOS arm64 DMG…"

if [[ "$SIGN_MODE" == "developer-id" ]]; then
  # Full Developer ID signing — Gatekeeper will accept the app
  CSC_NAME="$DEVELOPER_ID" bun x electron-builder --mac dmg --arm64
else
  # Ad-hoc signing — usable on the same machine after quarantine removal
  CSC_IDENTITY_AUTO_DISCOVERY=false bun x electron-builder --mac dmg --arm64
fi

success "DMG build complete."

# ── 5. Re-sign .app (ad-hoc deep) + sign the DMG ────────────────────────────
# electron-builder signs with --runtime (hardened runtime) which causes macOS
# to enforce Team ID consistency between the process and loaded frameworks.
# With ad-hoc signing (TeamIdentifier=not set) this triggers a dyld error:
#   "mapping process and mapped file (non-platform) have different Team IDs"
# Fix: deep-re-sign the whole .app *without* --runtime so all components are
# consistently plain-adhoc, then sign the DMG for quarantine compatibility.
if [[ "$SIGN_MODE" == "adhoc" ]]; then
  APP_BUNDLE=$(find dist/mac-arm64 -maxdepth 1 -name '*.app' | head -1)
  if [[ -n "$APP_BUNDLE" ]]; then
    info "Re-signing app bundle (deep, ad-hoc, no hardened runtime): ${APP_BUNDLE}…"
    codesign --force --deep --sign - "$APP_BUNDLE"
    success "App bundle re-signed."
  fi

  DMG_FILE=$(find dist -maxdepth 1 -name '*.dmg' | head -1)
  if [[ -n "$DMG_FILE" ]]; then
    info "Ad-hoc signing DMG: ${DMG_FILE}…"
    codesign --force --sign - "$DMG_FILE"
    success "DMG signed (ad-hoc)."
  fi
fi

# ── 5.5. Rename DMG with environment suffix ──────────────────────────────────────
if [[ -n "$ENVIRONMENT" ]]; then
  DMG_FILE=$(find dist -maxdepth 1 -name '*.dmg' | head -1)
  if [[ -n "$DMG_FILE" ]]; then
    # Get filename without extension and construct new name
    DMG_DIR=$(dirname "$DMG_FILE")
    DMG_BASE=$(basename "$DMG_FILE" .dmg)
    NEW_DMG="${DMG_DIR}/${DMG_BASE}-${ENVIRONMENT}.dmg"

    info "Renaming DMG with environment suffix: ${NEW_DMG}…"
    mv "$DMG_FILE" "$NEW_DMG"
    success "DMG renamed: ${NEW_DMG}"
  fi
fi

# ── 6. Report artefacts ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Artefacts in dist/${RESET}"
find dist -maxdepth 2 \( -name "*.dmg" \) | sort | while read -r f; do
  size=$(du -sh "$f" 2>/dev/null | cut -f1)
  echo -e "  ${GREEN}${f}${RESET}  (${size})"
done
echo ""

# ── 7. Post-install instructions ─────────────────────────────────────────────
if [[ "$SIGN_MODE" == "adhoc" ]]; then
  echo -e "${BOLD}To run the app after copying to /Applications:${RESET}"
  echo    "  sudo xattr -rd com.apple.quarantine \"/Applications/GogMeet.app\""
  echo
  echo    "  Or, open System Settings → Privacy & Security → scroll down and click 'Open Anyway'."
  echo
fi

success "Done."
