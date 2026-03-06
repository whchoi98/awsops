#!/bin/bash
# Pre-commit hook: validate critical rules before commit

ERRORS=0

# 1. Check no fetch URLs without /awsops prefix
BAD_FETCH=$(grep -r "'/api/steampipe" src/app/ 2>/dev/null | grep -v "/awsops/api" | wc -l)
if [ "$BAD_FETCH" -gt 0 ]; then
  echo "ERROR: $BAD_FETCH files have fetch() without /awsops prefix"
  ERRORS=$((ERRORS+1))
fi

# 2. Check no named imports of default-export components
BAD_IMPORTS=$(grep -r "{ Header }\|{ StatsCard }\|{ StatusBadge }\|{ Sidebar }" src/app/ 2>/dev/null | wc -l)
if [ "$BAD_IMPORTS" -gt 0 ]; then
  echo "ERROR: $BAD_IMPORTS files use named imports for default-export components"
  ERRORS=$((ERRORS+1))
fi

# 3. Check basePath
if ! grep -q "basePath.*awsops" next.config.mjs 2>/dev/null; then
  echo "ERROR: basePath not set to /awsops in next.config.mjs"
  ERRORS=$((ERRORS+1))
fi

# 4. Check no trivy_vulnerability (should be trivy_scan_vulnerability)
BAD_TRIVY=$(grep -r "trivy_vulnerability" src/lib/queries/ 2>/dev/null | grep -v "trivy_scan_vulnerability" | wc -l)
if [ "$BAD_TRIVY" -gt 0 ]; then
  echo "ERROR: Use trivy_scan_vulnerability, not trivy_vulnerability"
  ERRORS=$((ERRORS+1))
fi

if [ $ERRORS -gt 0 ]; then
  echo "Pre-commit: $ERRORS errors found. Fix before committing."
  exit 1
fi

echo "Pre-commit: All checks passed."
