#!/bin/bash
# Opens the portable demo (Demo/), or the source if the demo has not been built yet.
cd "$(dirname "$0")"
if [ -f "Demo/Open-demo.html" ]; then open "Demo/Open-demo.html"; else open "Source/index.html"; fi
