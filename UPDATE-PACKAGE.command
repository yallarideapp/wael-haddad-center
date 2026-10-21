#!/bin/bash
# Rebuilds Demo/, the ZIPs and the delivery folder from Source/.
cd "$(dirname "$0")"
bash "Source/tools/package-store.sh"
status=$?
if [ $status -ne 0 ]; then echo; read -n 1 -s -r -p "Something failed (see above). Press any key to close."; fi
exit $status
