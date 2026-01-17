#!/bin/bash

# Deployment script for AWS User Group Infrastructure
# This script installs Lambda dependencies and deploys the infrastructure

set -e  # Exit on error

echo "========================================="
echo "AWS User Group Infrastructure Deployment"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "main.tf" ]; then
    print_error "Error: main.tf not found. Please run this script from the infrastructure/terraform directory."
    exit 1
fi

echo "Step 1: Installing Lambda dependencies..."
echo ""

# Array of Lambda functions that need dependencies
LAMBDA_FUNCTIONS=(
    "users-crud"
    "meetups-crud"
    "sprints-crud"
    "s3-upload"
    "user-profile-creation"
)

for func in "${LAMBDA_FUNCTIONS[@]}"; do
    if [ -d "lambda/$func" ]; then
        echo "Installing dependencies for $func..."
        cd "lambda/$func"
        
        if [ -f "package.json" ]; then
            npm install --production
            print_success "Dependencies installed for $func"
        else
            print_warning "No package.json found for $func, skipping..."
        fi
        
        cd ../..
    else
        print_warning "Lambda function directory not found: lambda/$func"
    fi
done

echo ""
print_success "All Lambda dependencies installed!"
echo ""

# Initialize Terraform if needed
if [ ! -d ".terraform" ]; then
    echo "Step 2: Initializing Terraform..."
    terraform init
    print_success "Terraform initialized!"
    echo ""
else
    print_success "Terraform already initialized"
    echo ""
fi

# Validate Terraform configuration
echo "Step 3: Validating Terraform configuration..."
if terraform validate; then
    print_success "Terraform configuration is valid!"
else
    print_error "Terraform validation failed!"
    exit 1
fi
echo ""

# Plan the deployment
echo "Step 4: Planning deployment..."
echo ""
terraform plan -out=tfplan
echo ""
print_success "Terraform plan created!"
echo ""

# Ask for confirmation
echo "========================================="
echo "Ready to deploy!"
echo "========================================="
echo ""
read -p "Do you want to apply these changes? (yes/no): " -r
echo ""

if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Step 5: Applying Terraform changes..."
    echo ""
    terraform apply tfplan
    echo ""
    print_success "Deployment completed successfully!"
    echo ""
    
    # Display outputs
    echo "========================================="
    echo "Deployment Outputs"
    echo "========================================="
    echo ""
    terraform output
    echo ""
    
    # Get API Gateway URL
    API_URL=$(terraform output -raw api_gateway_url 2>/dev/null || echo "")
    
    if [ -n "$API_URL" ]; then
        echo "========================================="
        echo "Next Steps"
        echo "========================================="
        echo ""
        echo "1. Update your frontend .env.local file with:"
        echo ""
        echo "   VITE_API_ENDPOINT=$API_URL"
        echo ""
        echo "2. Restart your development server:"
        echo ""
        echo "   npm run dev"
        echo ""
        echo "3. Test the signup flow with a new user"
        echo ""
        print_success "All done! Your backend is ready."
    fi
else
    print_warning "Deployment cancelled."
    rm -f tfplan
    exit 0
fi
