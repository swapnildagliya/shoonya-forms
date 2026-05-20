#!/bin/bash
# Double-click this file to start a local web server for testing the forms.
# It opens http://localhost:8765/ in your default browser.
# Press Ctrl-C (or close this Terminal window) to stop the server.

cd "$(dirname "$0")"
echo "==============================================="
echo " Shoonya — Local Test Server"
echo "==============================================="
echo " Serving: $(pwd)"
echo " URL:     http://localhost:8765/"
echo ""
echo " Pages:"
echo "   Main form:  http://localhost:8765/"
echo "   Admin:      http://localhost:8765/admin/"
echo "   Profile:    http://localhost:8765/profile.html"
echo "   Register:   http://localhost:8765/register.html"
echo "   Festival:   http://localhost:8765/Festival/"
echo ""
echo " Press Ctrl-C (or close this window) to stop."
echo "==============================================="

# Open the browser after a short delay
(sleep 1 && open "http://localhost:8765/") &

# Start the server (Python 3 is built into macOS)
python3 -m http.server 8765
