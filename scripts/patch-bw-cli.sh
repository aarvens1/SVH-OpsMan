#!/usr/bin/env bash
# patch-bw-cli.sh — Apply the SVH-OpsMan fix for the Bitwarden CLI unlock-via-sdk bug.
#
# WHY THIS EXISTS:
#   Bitwarden's server enabled the "unlock-via-sdk" feature flag, which changes
#   bw unlock --raw to unlock via WASM SDK (in-process only). The SDK path never
#   writes the auto key back to data.json, so every subsequent bw get item call
#   (a separate process) cannot decrypt the stored key and returns "Vault is locked."
#
#   The patch forces the legacy unlock path, which properly writes the auto key to
#   data.json so subsequent bw get item calls work across processes.
#
# WHEN TO RUN:
#   - After installing or upgrading the bw CLI:
#       sudo npm install -g @bitwarden/cli
#       patch-bw  (alias for this script)
#   - If bw get item starts returning "Vault is locked" again after a bw update.
#
# WHAT IT DOES:
#   1. Copies the system bw CLI build to ~/.local/lib/bw-cli-full/
#   2. Applies the one-line patch (if (false) instead of if (UnlockViaSDK flag))
#   3. Creates/updates the ~/.local/bin/bw wrapper
#   4. Verifies the patched bw responds to --version

set -euo pipefail

BW_SYSTEM_BUILD="/usr/lib/node_modules/@bitwarden/cli/build"
BW_LOCAL_BUILD="$HOME/.local/lib/bw-cli-full"
BW_WRAPPER="$HOME/.local/bin/bw"

if [ ! -d "$BW_SYSTEM_BUILD" ]; then
  echo "✗ System bw CLI not found at $BW_SYSTEM_BUILD"
  echo "  Install with: sudo npm install -g @bitwarden/cli"
  exit 1
fi

BW_VERSION=$(node "$BW_SYSTEM_BUILD/bw.js" --version 2>/dev/null || echo "unknown")
echo "Patching bw CLI $BW_VERSION..."

# Copy full build directory (includes bw.js, 113.js, *.wasm, locales/)
echo "  Copying build directory..."
rm -rf "$BW_LOCAL_BUILD"
cp -r "$BW_SYSTEM_BUILD" "$BW_LOCAL_BUILD"

# Check if the SDK unlock branch exists in this version
OLD='if (yield this.configService.getFeatureFlag(feature_flag_enum_FeatureFlag.UnlockViaSDK)) {\n                    yield this.unlockService.unlockWithMasterPassword(userId, password);\n                }\n                else {'
COUNT=$(grep -c "UnlockViaSDK" "$BW_LOCAL_BUILD/bw.js" || true)

if [ "$COUNT" -eq 0 ]; then
  echo "  ⚠  UnlockViaSDK not found in this version — patch may not be needed."
  echo "  Wrapper still created pointing to local copy."
else
  echo "  Applying patch..."
  python3 - "$BW_LOCAL_BUILD/bw.js" <<'EOF'
import sys

bw_js = sys.argv[1]

old = ('if (yield this.configService.getFeatureFlag(feature_flag_enum_FeatureFlag.UnlockViaSDK)) {\n'
       '                    yield this.unlockService.unlockWithMasterPassword(userId, password);\n'
       '                }\n'
       '                else {')

new = ('/* SVH-OpsMan patch: force legacy unlock path — unlock-via-sdk breaks auto key storage */\n'
       '                if (false) {\n'
       '                    yield this.unlockService.unlockWithMasterPassword(userId, password);\n'
       '                }\n'
       '                else {')

with open(bw_js, 'r') as f:
    content = f.read()

count = content.count(old)
if count == 0:
    print(f"  ✗ Patch target not found — the bw.js structure may have changed.")
    print(f"    Check the unlock command in {bw_js} manually.")
    sys.exit(1)

patched = content.replace(old, new)
with open(bw_js, 'w') as f:
    f.write(patched)

print(f"  ✓ Applied patch ({count} replacement(s))")
EOF
fi

# Write the wrapper script
mkdir -p "$(dirname "$BW_WRAPPER")"
cat > "$BW_WRAPPER" <<WRAPPER
#!/bin/bash
# SVH-OpsMan wrapper: runs patched bw CLI that bypasses the unlock-via-sdk bug.
# The Bitwarden server enabled unlock-via-sdk which breaks auto key storage,
# causing bw get item to fail after bw unlock in separate processes.
# Patch: force legacy unlock path in bw.js so auto key is properly stored.
# Re-apply after bw CLI updates: patch-bw  (alias in bashrc.sh)
NODE_PATH=/usr/lib/node_modules/@bitwarden/cli/node_modules:/usr/lib/node_modules \\
  node $BW_LOCAL_BUILD/bw.js "\$@"
WRAPPER
chmod +x "$BW_WRAPPER"
echo "  ✓ Wrapper written to $BW_WRAPPER"

# Verify
PATCHED_VERSION=$("$BW_WRAPPER" --version 2>&1)
if [[ "$PATCHED_VERSION" == "$BW_VERSION" ]]; then
  echo "✓ Patched bw CLI $PATCHED_VERSION is working"
else
  echo "✗ Wrapper sanity check failed: expected $BW_VERSION, got $PATCHED_VERSION"
  exit 1
fi

echo ""
echo "Done. After the next bw update, run:  patch-bw"
