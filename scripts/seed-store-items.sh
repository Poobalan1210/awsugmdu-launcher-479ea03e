#!/bin/bash

# Seed initial store items into DynamoDB

TABLE_NAME="awsug-store-items"
REGION="us-east-1"

echo "Seeding store items..."

# AWS Credits $25
ITEM1_ID="item_$(date +%s)_aws"
aws dynamodb put-item \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --item '{
    "id": {"S": "'"$ITEM1_ID"'"},
    "name": {"S": "AWS Credits $25"},
    "description": {"S": "$25 AWS promotional credits for your cloud projects"},
    "points": {"N": "1000"},
    "image": {"S": "💳"},
    "inStock": {"BOOL": true},
    "category": {"S": "cloud"},
    "itemType": {"S": "virtual"},
    "availableCodes": {"L": []},
    "createdAt": {"S": "'"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"'"},
    "updatedAt": {"S": "'"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"'"}
  }'

if [ $? -eq 0 ]; then
  echo "✓ Created: AWS Credits \$25"
else
  echo "✗ Failed to create AWS Credits \$25"
fi

sleep 1

# Community T-Shirt
ITEM2_ID="item_$(date +%s)_tshirt"
aws dynamodb put-item \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --item '{
    "id": {"S": "'"$ITEM2_ID"'"},
    "name": {"S": "Community T-Shirt"},
    "description": {"S": "Exclusive community branded t-shirt"},
    "points": {"N": "1500"},
    "image": {"S": "👕"},
    "inStock": {"BOOL": true},
    "category": {"S": "merchandise"},
    "itemType": {"S": "physical"},
    "availableCodes": {"L": []},
    "createdAt": {"S": "'"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"'"},
    "updatedAt": {"S": "'"$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"'"}
  }'

if [ $? -eq 0 ]; then
  echo "✓ Created: Community T-Shirt"
else
  echo "✗ Failed to create Community T-Shirt"
fi

echo ""
echo "Seeding complete!"
