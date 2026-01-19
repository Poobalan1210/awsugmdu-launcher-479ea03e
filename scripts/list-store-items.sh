#!/bin/bash

# List all store items with their IDs

TABLE_NAME="awsug-store-items"
REGION="us-east-1"

echo "Store Items:"
echo "============"
echo ""

aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --query 'Items[*].[id.S, name.S, itemType.S, points.N, inStock.BOOL, length(availableCodes.L)]' \
  --output text | while read -r id name type points inStock codes; do
    echo "ID: $id"
    echo "Name: $name"
    echo "Type: $type"
    echo "Points: $points"
    echo "In Stock: $inStock"
    if [ "$type" = "virtual" ]; then
      echo "Available Codes: $codes"
    fi
    echo "---"
done
