#!/bin/bash
# Keep JARVIS running on this Mac: starts the daemon (briefs, alerts, Telegram, inbox) and the Mac agent at login,
# and restarts them if they crash.   Install: npm run jarvis:autostart     Remove: npm run jarvis:autostart -- remove
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LA="$HOME/Library/LaunchAgents"
LOGS="$HOME/.jarvis"
mkdir -p "$LA" "$LOGS"

plist() { # label, args...
  local label="$1"; shift
  local args=""
  for a in "$@"; do args+="<string>$a</string>"; done
  cat > "$LA/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>$LOGS/$label.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$label.log</string>
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LA/$label.plist"
  echo "✓ $label running (log: $LOGS/$label.log)"
}

if [ "${1:-}" = "remove" ]; then
  for l in com.sanjeev.jarvis com.sanjeev.jarvis-agent; do
    launchctl bootout "gui/$(id -u)/$l" 2>/dev/null || true
    rm -f "$LA/$l.plist"
    echo "✓ removed $l"
  done
  exit 0
fi

plist com.sanjeev.jarvis "$NODE" "$DIR/node_modules/tsx/dist/cli.mjs" --env-file-if-exists=.env.local jarvis/daemon.ts
plist com.sanjeev.jarvis-agent "$NODE" "$DIR/jarvis/agent.mjs"
echo "JARVIS starts automatically at login now. Pairing token for the hub: $(cat "$HOME/.jarvis/token" 2>/dev/null || echo 'see the agent log')"
