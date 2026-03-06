#!/bin/bash
# Post-build hook: verify build output

if [ ! -f ".next/BUILD_ID" ]; then
  echo "POST-BUILD ERROR: .next/BUILD_ID not found. Build failed."
  exit 1
fi

echo "POST-BUILD: OK (BUILD_ID: $(cat .next/BUILD_ID))"
