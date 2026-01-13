# Terraform Infrastructure Setup

This directory contains Terraform configuration for AWS resources needed for authentication.

## Prerequisites

1. **Install Terraform**
   ```bash
   # macOS
   brew install terraform
   
   # Or download from https://www.terraform.io/downloads
   ```

2. **Configure AWS Credentials**
   ```bash
   aws configure
   # Or set environment variables:
   # export AWS_ACCESS_KEY_ID=your-access-key
   # export AWS_SECRET_ACCESS_KEY=your-secret-key
   # export AWS_DEFAULT_REGION=us-east-1
   ```

## Setup

1. **Navigate to terraform directory**
   ```bash
   cd infrastructure/terraform
   ```

2. **Initialize Terraform**
   ```bash
   terraform init
   ```

3. **Review the plan**
   ```bash
   terraform plan
   ```

4. **Apply the configuration**
   ```bash
   terraform apply
   ```

5. **Get outputs (for .env.local)**
   ```bash
   terraform output -json
   ```

## Lambda Functions

The Lambda function code is already included in the `lambda/` directory. Before running `terraform apply`, you need to install their dependencies:

```bash
# Install dependencies for user-profile-creation Lambda
cd lambda/user-profile-creation
npm install
cd ../..

# Install dependencies for meetup-verification Lambda
cd lambda/meetup-verification
npm install
cd ../..
```

Terraform will automatically zip and deploy them.

## Variables

You can customize variables in `terraform.tfvars`:

```hcl
aws_region = "us-east-1"
environment = "dev"
project_name = "awsug"
allowed_cors_origins = [
  "http://localhost:5173",
  "https://yourdomain.com"
]
```

## Outputs

After applying, Terraform will output:
- Cognito User Pool ID
- Cognito Client ID
- API Gateway URL
- S3 Bucket Name
- DynamoDB Table Name

Use these values in your `.env.local` file.

## Destroy Resources

To tear down all resources:
```bash
terraform destroy
```

## State Management

For production, consider using remote state (S3 backend). Uncomment the backend block in `main.tf`.
