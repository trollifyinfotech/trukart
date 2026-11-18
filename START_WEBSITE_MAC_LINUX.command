#!/bin/sh
# Mac/Linux launcher (needs Python 3). Double-click or run: sh START_WEBSITE_MAC_LINUX.command
cd "$(dirname "$0")"
echo "Starting website at http://localhost:8090/ - press Ctrl+C to stop"
(sleep 2; (open http://localhost:8090/index.html || xdg-open http://localhost:8090/index.html) >/dev/null 2>&1) &
python3 server.py 8090
