#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# AWS User Group Infrastructure — Deploy & Rollback Script
#
# Usage:
#   ./deploy.sh              — full deploy (install deps → plan → apply)
#   ./deploy.sh --plan-only  — show what would change, don't apply
#   ./deploy.sh --rollback   — restore the last saved state snapshot
#   ./deploy.sh --snapshot   — save a manual state snapshot right now
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ─── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; }
info() { echo -e "${CYAN}→ $1${NC}"; }

# ─── Sanity check ─────────────────────────────────────────────────────────────
if [ ! -f "main.tf" ]; then
  err "Run this script from the infrastructure/terraform directory."
  exit 1
fi

# ─── State snapshot helpers ───────────────────────────────────────────────────
SNAPSHOTS_DIR=".state-snapshots"
mkdir -p "$SNAPSHOTS_DIR"

save_snapshot() {
  local label="${1:-manual}"
  if [ ! -f "terraform.tfstate" ]; then
    warn "No terraform.tfstate found — nothing to snapshot."
    return 0
  fi
  local ts
  ts=$(date +%Y%m%d-%H%M%S)
  local snap="$SNAPSHOTS_DIR/tfstate-${label}-${ts}.json"
  cp terraform.tfstate "$snap"
  # Keep only the 10 most recent snapshots to avoid disk bloat
  ls -t "$SNAPSHOTS_DIR"/tfstate-*.json 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
  ok "State snapshot saved → $snap"
  echo "$snap"
}

list_snapshots() {
  echo ""
  info "Available state snapshots:"
  local i=1
  while IFS= read -r f; do
    echo "  [$i] $f"
    i=$((i+1))
  done < <(ls -t "$SNAPSHOTS_DIR"/tfstate-*.json 2>/dev/null)
  echo ""
}

# ─── --snapshot flag ──────────────────────────────────────────────────────────
if [[ "$1" == "--snapshot" ]]; then
  echo "════════════════════════════════════════"
  echo " Manual State Snapshot"
  echo "════════════════════════════════════════"
  save_snapshot "manual"
  exit 0
fi

# ─── --rollback flag ──────────────────────────────────────────────────────────
if [[ "$1" == "--rollback" ]]; then
  echo "════════════════════════════════════════"
  echo " Rollback — Restore Previous State"
  echo "════════════════════════════════════════"
  echo ""
  warn "This restores a previous Terraform state file."
  warn "It does NOT automatically destroy resources created since the snapshot."
  warn "After restoring, run  terraform plan  to see the drift, then apply to reconcile."
  echo ""

  # List available snapshots
  mapfile -t SNAPS < <(ls -t "$SNAPSHOTS_DIR"/tfstate-*.json 2>/dev/null)
  if [ ${#SNAPS[@]} -eq 0 ]; then
    err "No snapshots found in $SNAPSHOTS_DIR"
    echo "Run  ./deploy.sh --snapshot  before deploying to create one."
    exit 1
  fi

  list_snapshots

  read -rp "Enter snapshot number to restore (or 'q' to quit): " choice
  if [[ "$choice" == "q" ]]; then
    warn "Rollback cancelled."
    exit 0
  fi

  idx=$((choice - 1))
  if [ "$idx" -lt 0 ] || [ "$idx" -ge "${#SNAPS[@]}" ]; then
    err "Invalid selection."
    exit 1
  fi

  SELECTED="${SNAPS[$idx]}"
  echo ""
  info "Selected: $SELECTED"
  echo ""
  read -rp "Restore this snapshot? This will overwrite terraform.tfstate. (yes/no): " confirm
  if [[ ! "$confirm" =~ ^[Yy][Ee][Ss]$ ]]; then
    warn "Rollback cancelled."
    exit 0
  fi

  # Back up current state before overwriting
  if [ -f "terraform.tfstate" ]; then
    save_snapshot "pre-rollback"
  fi

  cp "$SELECTED" terraform.tfstate
  ok "State restored from $SELECTED"
  echo ""
  info "Next steps:"
  echo "  1. Run  terraform plan  to see what will change"
  echo "  2. Run  terraform apply  to reconcile AWS with the restored state"
  echo "  3. If resources need to be destroyed, Terraform will show them in the plan"
  echo ""
  warn "Remember: restoring state does not automatically destroy new AWS resources."
  warn "Review the plan carefully before applying."
  exit 0
fi

# ─── Lambda functions to install ──────────────────────────────────────────────
LAMBDA_FUNCTIONS=(
  "users-crud"
  "meetups-crud"
  "sprints-crud"
  "s3-upload"
  "user-profile-creation"
  "badges-crud"          # Open Badges v2.0
  "circles-crud"
  "circle-digest"
  "discussions-crud"
  "cloud-clubs-crud"
  "colleges-crud"
  "meetups-crud"
  "points-crud"
  "meetup-reminder"
  "stats-crud"
)

# ─── Header ───────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo " AWS User Group Infrastructure Deploy"
echo "════════════════════════════════════════"
echo ""

# ─── Step 1: Save pre-deploy snapshot ────────────────────────────────────────
echo "Step 1: Saving pre-deploy state snapshot..."
SNAPSHOT_PATH=$(save_snapshot "pre-deploy")
echo ""

# ─── Step 2: Sync shared modules + install Lambda dependencies ───────────────
echo "Step 2: Syncing shared modules and installing Lambda dependencies..."
echo ""

# Lambdas that consume the master lambda/shared/email.js helper. Keep the master
# copy in lambda/shared/email.js and let deploy sync it in so they never drift.
EMAIL_SHARED_CONSUMERS=(
  "meetups-crud"
  "meetup-reminder"
)

if [ -f "lambda/shared/email.js" ]; then
  for func in "${EMAIL_SHARED_CONSUMERS[@]}"; do
    if [ -d "lambda/$func" ]; then
      mkdir -p "lambda/$func/shared"
      cp "lambda/shared/email.js" "lambda/$func/shared/email.js"
      ok "Synced shared/email.js → $func"
    fi
  done
  echo ""
fi

# Derive the agent-type whitelist from the circle-digest agent modules (the
# single source of truth) and bake it into circles-crud so the API validation
# stays in sync automatically when agents are added/removed.
if [ -d "lambda/circle-digest/agents" ] && [ -d "lambda/circles-crud" ]; then
  AGENT_IDS=$(cd lambda/circle-digest && node -e "const _l=console.log;console.log=()=>{};const {AGENTS}=require('./agents');console.log=_l;process.stdout.write(JSON.stringify(Object.keys(AGENTS)))" 2>/dev/null)
  if [ -n "$AGENT_IDS" ] && [ "$AGENT_IDS" != "[]" ]; then
    echo "$AGENT_IDS" > lambda/circles-crud/agent-types.generated.json
    ok "Synced agent whitelist → circles-crud ($AGENT_IDS)"
  else
    info "Could not derive agent whitelist; keeping existing agent-types.generated.json"
  fi
  echo ""
fi

for func in "${LAMBDA_FUNCTIONS[@]}"; do
  # Deduplicate (meetups-crud appears twice in the list above)
  if [ -d "lambda/$func" ] && [ -f "lambda/$func/package.json" ]; then
    info "Installing deps for $func..."
    (cd "lambda/$func" && npm install --production --silent)
    ok "$func"
  fi
done

echo ""
ok "Lambda dependencies ready."
echo ""

# ─── Step 3: Terraform init ───────────────────────────────────────────────────
echo "Step 3: Terraform init..."
if [ ! -d ".terraform" ]; then
  terraform init
  ok "Terraform initialised."
else
  # Upgrade providers if lock file changed
  terraform init -upgrade -reconfigure 2>/dev/null || terraform init
  ok "Terraform already initialised."
fi
echo ""

# ─── Step 4: Validate ─────────────────────────────────────────────────────────
echo "Step 4: Validating configuration..."
if terraform validate; then
  ok "Configuration valid."
else
  err "Validation failed — aborting."
  exit 1
fi
echo ""

# ─── Step 5: Plan ─────────────────────────────────────────────────────────────
echo "Step 5: Planning changes..."
echo ""
terraform plan -out=tfplan
echo ""
ok "Plan saved to tfplan."
echo ""

# ─── --plan-only flag ─────────────────────────────────────────────────────────
if [[ "$1" == "--plan-only" ]]; then
  warn "Plan-only mode — not applying."
  rm -f tfplan
  exit 0
fi

# ─── Step 6: Confirm & apply ──────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo " Ready to deploy"
echo "════════════════════════════════════════"
echo ""
warn "A pre-deploy snapshot was saved at:"
echo "  $SNAPSHOT_PATH"
echo ""
warn "To roll back after deploying, run:"
echo "  ./deploy.sh --rollback"
echo ""
read -rp "Apply these changes? (yes/no): " reply
echo ""

if [[ ! "$reply" =~ ^[Yy][Ee][Ss]$ ]]; then
  warn "Deployment cancelled."
  rm -f tfplan
  exit 0
fi

echo "Step 6: Applying changes..."
echo ""
if terraform apply tfplan; then
  echo ""
  ok "Deployment complete!"
  echo ""

  # Save a post-deploy snapshot so rollback always has a clean baseline
  save_snapshot "post-deploy"
  echo ""

  echo "════════════════════════════════════════"
  echo " Outputs"
  echo "════════════════════════════════════════"
  echo ""
  terraform output
  echo ""

  API_URL=$(terraform output -raw api_gateway_url 2>/dev/null || echo "")
  if [ -n "$API_URL" ]; then
    echo "════════════════════════════════════════"
    echo " Next Steps"
    echo "════════════════════════════════════════"
    echo ""
    echo "1. Update .env.local:"
    echo "   VITE_API_ENDPOINT=$API_URL"
    echo ""
    echo "2. Restart dev server:  npm run dev"
    echo ""
    echo "3. If something breaks, roll back with:"
    echo "   ./deploy.sh --rollback"
    echo ""
    ok "All done."
  fi
else
  echo ""
  err "Apply failed!"
  echo ""
  warn "Your pre-deploy snapshot is at:"
  echo "  $SNAPSHOT_PATH"
  echo ""
  warn "To restore it, run:"
  echo "  ./deploy.sh --rollback"
  echo ""
  exit 1
fi

rm -f tfplan
