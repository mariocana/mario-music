#!/usr/bin/env bash
#
# Build iOS locally using EAS CLI and local Xcode without consuming EAS cloud credits.
#
# Usage:
#   npm run build:ios:local               # Compiles with profile 'production'
#   npm run build:ios:local -- preview    # Compiles with profile 'preview'
#   bash scripts/build-ios-local.sh [production|preview]
#
set -euo pipefail

# Ensure we locate repository root and mobile project directory (resolving symlinks)
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
MOBILE_DIR="$REPO_ROOT/mobile"

if [[ ! -d "$MOBILE_DIR" ]]; then
  echo "Error: Directory mobile non trovata in $MOBILE_DIR" >&2
  exit 1
fi

# Default profile
PROFILE="${1:-production}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
OUTPUT_DIR="$REPO_ROOT/builds"
OUTPUT_FILE="$OUTPUT_DIR/MarioMusic-${PROFILE}-${TIMESTAMP}.ipa"

mkdir -p "$OUTPUT_DIR"

echo "================================================="
echo " Mario Music - Local iOS Build (EAS Local)"
echo " Profile: $PROFILE"
echo " Target : $OUTPUT_FILE"
echo "================================================="

# 1. Check OS
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: Local iOS builds require macOS with Xcode." >&2
  exit 1
fi

# 2. Check Xcode developer directory
DEVELOPER_DIR="$(xcode-select -p 2>/dev/null || true)"
if [[ "$DEVELOPER_DIR" != *"/Xcode.app/"* ]]; then
  echo "⚠️  xcode-select punta attualmente a: $DEVELOPER_DIR"
  if [[ -d "/Applications/Xcode.app" ]]; then
    echo "Xcode.app trovato in /Applications/Xcode.app."
    echo "Imposto il percorso sviluppatore attivo (potrebbe richiedere la password di macOS):"
    if ! sudo xcode-select -s /Applications/Xcode.app/Contents/Developer; then
      echo "Impossibile aggiornare xcode-select automaticamente." >&2
      echo "Esegui prima manualmente nel tuo terminale:" >&2
      echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
      exit 1
    fi
    echo "✓ Percorso Xcode configurato correttamente."
  else
    echo "Error: Xcode.app non trovato in /Applications/Xcode.app." >&2
    echo "Installa Xcode dal Mac App Store prima di proseguire." >&2
    exit 1
  fi
fi

# 3. Check CocoaPods
if ! command -v pod >/dev/null 2>&1; then
  echo "⚠️  CocoaPods ('pod') non trovato sul sistema."
  if command -v brew >/dev/null 2>&1; then
    echo "Installazione di CocoaPods tramite Homebrew in corso..."
    brew install cocoapods
  else
    echo "Homebrew non trovato. Installa CocoaPods con:" >&2
    echo "  sudo gem install cocoapods" >&2
    exit 1
  fi
fi

# 4. Check Fastlane (richiesto da eas-cli-local-build-plugin per iOS)
if ! command -v fastlane >/dev/null 2>&1; then
  echo "⚠️  Fastlane non trovato sul sistema (necessario per la build EAS locale iOS)."
  if command -v brew >/dev/null 2>&1; then
    echo "Installazione di Fastlane tramite Homebrew in corso..."
    brew install fastlane
  else
    echo "Homebrew non trovato. Installa Fastlane con:" >&2
    echo "  sudo gem install fastlane" >&2
    exit 1
  fi
fi

# 5. Check Apple Worldwide Developer Relations (WWDR) intermediate CA
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
if [[ -f "$LOGIN_KEYCHAIN" ]]; then
  if ! security find-certificate -c "Apple Worldwide Developer Relations" -a "$LOGIN_KEYCHAIN" 2>/dev/null | grep -q "G3"; then
    echo "Importazione certificato intermedio Apple WWDR G3..."
    curl -fsSL https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer -o /tmp/AppleWWDRCAG3.cer
    security import /tmp/AppleWWDRCAG3.cer -k "$LOGIN_KEYCHAIN" >/dev/null 2>&1 || true
  fi
  if ! security find-certificate -c "Apple Worldwide Developer Relations" -a "$LOGIN_KEYCHAIN" 2>/dev/null | grep -q "G6"; then
    echo "Importazione certificato intermedio Apple WWDR G6..."
    curl -fsSL https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer -o /tmp/AppleWWDRCAG6.cer
    security import /tmp/AppleWWDRCAG6.cer -k "$LOGIN_KEYCHAIN" >/dev/null 2>&1 || true
  fi
fi

# 6. Check EAS CLI
if command -v eas >/dev/null 2>&1; then
  EAS_CMD="eas"
else
  EAS_CMD="npx eas-cli"
fi

echo "✓ Xcode: $(xcodebuild -version | head -n 1)"
echo "✓ CocoaPods: $(pod --version)"
echo "✓ Fastlane: $(fastlane --version | head -n 1)"
echo "✓ EAS CLI: $($EAS_CMD --version)"
echo ""

# 7. Run local build inside mobile directory
echo "🚀 Avvio della build locale con EAS..."
cd "$MOBILE_DIR"
$EAS_CMD build --platform ios --profile "$PROFILE" --local --output "$OUTPUT_FILE"

echo ""
echo "================================================="
echo "✅ Build completata con successo!"
echo "📦 File IPA salvato in: $OUTPUT_FILE"
echo "================================================="
echo ""
echo "Per caricare l'app su App Store / TestFlight puoi eseguire:"
echo "  $EAS_CMD submit --platform ios --path \"$OUTPUT_FILE\""
echo "oppure trascinare il file IPA nell'app 'Transporter' di Apple."
