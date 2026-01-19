#!/bin/bash

# Script to add codes to a virtual store item
# Usage: ./add-codes-to-item.sh <item-id> <code1> <code2> ...

if [ $# -lt 2 ]; then
  echo "Usage: $0 <item-id> <code1> [code2] [code3] ..."
  echo "Example: $0 item_123_aws AWS-CREDIT-CODE-1 AWS-CREDIT-CODE-2"
  exit 1
fi

ITEM_ID=$1
shift
CODES=("$@")

TABLE_NAME="awsug-store-items"
REGION="us-east-1"

echo "Adding ${#CODES[@]} code(s) to item $ITEM_ID..."

# Get current codes
CURRENT_CODES=$(aws dynamodb get-item \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --key "{\"id\": {\"S\": \"$ITEM_ID\"}}" \
  --query 'Item.availableCodes.L[*].S' \
  --output json)

# Build the new codes list
NEW_CODES_JSON="["
FIRST=true

# Add existing codes
if [ "$CURRENT_CODES" != "null" ] && [ "$CURRENT_CODES" != "[]" ]; then
  for code in $(echo "$CURRENT_CODES" | jq -r '.[]'); do
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      NEW_CODES_JSON+=","
    fi
    NEW_CODES_JSON+="{\"S\":\"$code\"}"
  done
fi

# Add new codes
for code in "${CODES[@]}"; do
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    NEW_CODES_JSON+=","
  fi
  NEW_CODES_JSON+="{\"S\":\"$code\"}"
done

NEW_CODES_JSON+="]"

# Update the item
aws dynamodb update-item \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --key "{\"id\": {\"S\": \"$ITEM_ID\"}}" \
  --update-expression "SET availableCodes = :codes, inStock = :inStock, updatedAt = :updatedAt" \
  --expression-attribute-values "{
    \":codes\": {\"L\": $NEW_CODES_JSON},
    \":inStock\": {\"BOOL\": true},
    \":updatedAt\": {\"S\": \"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")\"}
  }"

if [ $? -eq 0 ]; then
  echo "✓ Successfully added ${#CODES[@]} code(s)"
else
  echo "✗ Failed to add codes"
  exit 1
fi
