# Terraform Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Install Terraform
```bash
# macOS
brew install terraform

# Or download from https://www.terraform.io/downloads
terraform --version  # Verify installation
```

### Step 2: Configure AWS Credentials
```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter your default region (e.g., us-east-1)
```

### Step 3: Install Lambda Dependencies
```bash
cd infrastructure/terraform

# Install dependencies for user-profile-creation
cd lambda/user-profile-creation
npm install
cd ../..

# Install dependencies for meetup-verification
cd lambda/meetup-verification
npm install
cd ../..
```

### Step 4: Configure Variables (Optional)
```bash
# Copy the example file
cp terraform.tfvars.example terraform.tfvars

# Edit terraform.tfvars with your values
# (Defaults work fine for testing)
```

### Step 5: Deploy
```bash
# Initialize Terraform
terraform init

# Preview what will be created
terraform plan

# Deploy everything
terraform apply
# Type 'yes' when prompted
```

### Step 6: Get Your Environment Variables
```bash
# Get all outputs
terraform output

# Or get formatted for .env.local
terraform output -json | jq -r '
  "VITE_AWS_REGION=" + .aws_region.value + "\n" +
  "VITE_COGNITO_USER_POOL_ID=" + .cognito_user_pool_id.value + "\n" +
  "VITE_COGNITO_CLIENT_ID=" + .cognito_user_pool_client_id.value + "\n" +
  "VITE_API_ENDPOINT=" + .api_gateway_url.value + "\n" +
  "VITE_S3_BUCKET_NAME=" + .s3_bucket_name.value
'
```

Copy the output to your `.env.local` file in the project root.

## 🗑️ To Delete Everything
```bash
terraform destroy
# Type 'yes' when prompted
```

## 📝 What Gets Created

- ✅ Cognito User Pool (authentication)
- ✅ Cognito User Pool Client
- ✅ DynamoDB Table (user profiles)
- ✅ S3 Bucket (profile photos)
- ✅ 2 Lambda Functions (backend logic)
- ✅ API Gateway (REST API)
- ✅ IAM Roles & Policies

## ⚠️ Important Notes

1. **Cost**: Most resources are in AWS Free Tier. Estimated cost: $0-5/month for low traffic.

2. **State File**: Terraform creates a `terraform.tfstate` file. Don't delete it! It tracks your infrastructure.

3. **Lambda Dependencies**: Make sure to run `npm install` in both Lambda directories before `terraform apply`.

4. **CORS Origins**: Update `allowed_cors_origins` in `terraform.tfvars` with your actual frontend URLs.

## 🐛 Troubleshooting

**Error: "Provider not found"**
```bash
terraform init  # Run this again
```

**Error: "Lambda zip file not found"**
- Make sure you ran `npm install` in both Lambda directories
- Check that `lambda/user-profile-creation` and `lambda/meetup-verification` exist

**Error: "Access Denied"**
- Check your AWS credentials: `aws sts get-caller-identity`
- Ensure your IAM user has permissions to create these resources

## 📚 Next Steps

After deployment:
1. Copy the outputs to `.env.local`
2. Proceed with frontend implementation
3. Test authentication flow

See `README.md` for more detailed information.
