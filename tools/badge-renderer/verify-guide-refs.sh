#!/bin/bash
# Confirms every code reference cited in docs/badge-baking-merge-guide.md still
# matches the working tree. Run after any refactor of badges-crud.
# Resolve the repo root via git rather than a relative hop, so this keeps working
# if the tool is moved again.
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)" || exit 1
B=infrastructure/terraform/lambda/badges-crud/index.js
P=src/components/auth/ProtectedRoute.tsx

pass=0; fail=0
check() {
  local label="$1" file="$2" line="$3" pattern="$4"
  if sed -n "${line}p" "$file" | grep -q -- "$pattern"; then
    printf '  OK        %s\n' "$label"; pass=$((pass+1))
  else
    printf '  MISMATCH  %s\n' "$label"
    printf '            got: %s\n' "$(sed -n "${line}p" "$file" | sed 's/^ *//' | cut -c1-70)"
    fail=$((fail+1))
  fi
}

echo "verifying guide code references"
check "ProtectedRoute.tsx:8  ENABLE_AUTH_CHECK = false" "$P" 8   'ENABLE_AUTH_CHECK = false'
check "badges-crud:107      buildBadgeClass returns null" "$B" 107 'return null'
check "badges-crud:191      XML namespace is w3id (wrong)" "$B" 191 'w3id.org'
check "badges-crud:238      verifier requires HostedBadge" "$B" 238 'HostedBadge'
check "badges-crud:359      buildSvg(badgeId, null)"      "$B" 359 'buildSvg(badgeId, null)'
check "badges-crud:405      assertion looks up BADGE_DEFINITIONS" "$B" 405 'BADGE_DEFINITIONS'
check "badges-crud:31       region default ap-south-1"    "$B" 31  'ap-south-1'

# The renderer must stay committed. If a broad ignore rule reappears, the
# handover source silently vanishes from the repo again.
printf '  %-9s %s\n' "$(git check-ignore -q tools/badge-renderer/badge-template.js \
  && { echo IGNORED; fail=$((fail+1)); } || { echo OK; pass=$((pass+1)); })" \
  "tools/badge-renderer/ is tracked (not gitignored)"

echo
printf '  %d ok, %d mismatched\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
