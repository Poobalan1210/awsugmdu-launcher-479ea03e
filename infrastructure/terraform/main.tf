terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
  
  # Optional: Use S3 backend for state management
  # backend "s3" {
  #   bucket = "awsug-terraform-state"
  #   key    = "awsug-infrastructure/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "AWS-UG-Madurai"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Variables
variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "awsug"
}

variable "allowed_cors_origins" {
  description = "Allowed CORS origins for API and S3"
  type        = list(string)
  default     = ["http://localhost:5173", "https://yourdomain.com"]
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# DynamoDB Table for User Profiles
resource "aws_dynamodb_table" "users" {
  name           = "${var.project_name}-users"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  global_secondary_index {
    name     = "email-index"
    hash_key = "email"
    projection_type = "ALL"
  }

  tags = {
    Name = "${var.project_name}-users-table"
  }
}

# S3 Bucket for Profile Photos
resource "aws_s3_bucket" "profile_photos" {
  bucket = "${var.project_name}-profile-photos-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.project_name}-profile-photos"
  }
}

resource "aws_s3_bucket_public_access_block" "profile_photos" {
  bucket = aws_s3_bucket.profile_photos.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls       = false
  restrict_public_buckets  = false
}

resource "aws_s3_bucket_cors_configuration" "profile_photos" {
  bucket = aws_s3_bucket.profile_photos.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.allowed_cors_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_policy" "profile_photos" {
  bucket = aws_s3_bucket.profile_photos.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.profile_photos.arn}/*"
      }
    ]
  })
}

# IAM Role for Lambda Functions
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Policy for Lambda to access DynamoDB
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.project_name}-lambda-dynamodb-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          "${aws_dynamodb_table.users.arn}/index/*"
        ]
      }
    ]
  })
}

# IAM Policy for Lambda basic execution
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Archive Lambda functions
data "archive_file" "user_profile_creation" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/user-profile-creation"
  output_path = "${path.module}/lambda/user-profile-creation.zip"
  excludes    = ["node_modules", "*.zip"]
}

data "archive_file" "meetup_verification" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/meetup-verification"
  output_path = "${path.module}/lambda/meetup-verification.zip"
  excludes    = ["node_modules", "*.zip"]
}

# Lambda: User Profile Creation
resource "aws_lambda_function" "user_profile_creation" {
  filename         = data.archive_file.user_profile_creation.output_path
  function_name    = "${var.project_name}-user-profile-creation"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.user_profile_creation.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 30

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
      # AWS_REGION is automatically provided by Lambda runtime
    }
  }

  tags = {
    Name = "${var.project_name}-user-profile-creation"
  }
}

# Lambda: Meetup Verification
resource "aws_lambda_function" "meetup_verification" {
  filename         = data.archive_file.meetup_verification.output_path
  function_name    = "${var.project_name}-meetup-verification"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.meetup_verification.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 30

  tags = {
    Name = "${var.project_name}-meetup-verification"
  }
}


# API Gateway
resource "aws_api_gateway_rest_api" "api" {
  name        = "${var.project_name}-api"
  description = "API for AWS User Group Madurai"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "users" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "users"
}

resource "aws_api_gateway_resource" "meetup" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "meetup"
}

resource "aws_api_gateway_resource" "meetup_verify" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetup.id
  path_part   = "verify"
}

# API Gateway Methods
resource "aws_api_gateway_method" "users_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetup_verify_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetup_verify.id
  http_method   = "POST"
  authorization = "NONE"
}

# API Gateway Integration
resource "aws_api_gateway_integration" "users_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users.id
  http_method = aws_api_gateway_method.users_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_profile_creation.invoke_arn
}

resource "aws_api_gateway_integration" "meetup_verify_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetup_verify.id
  http_method = aws_api_gateway_method.meetup_verify_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetup_verification.invoke_arn
}

# Lambda Permissions for API Gateway
resource "aws_lambda_permission" "api_users" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.user_profile_creation.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "api_meetup" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.meetup_verification.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "api" {
  depends_on = [
    aws_api_gateway_integration.users_lambda,
    aws_api_gateway_integration.meetup_verify_lambda,
  ]

  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = var.environment
}

# Cognito User Pool
resource "aws_cognito_user_pool" "user_pool" {
  name = "${var.project_name}-user-pool"

  # Sign-in configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  # Schema attributes
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Tags
  tags = {
    Name = "${var.project_name}-user-pool"
  }
}

# Cognito User Pool Client
resource "aws_cognito_user_pool_client" "web_client" {
  name         = "${var.project_name}-web-client"
  user_pool_id = aws_cognito_user_pool.user_pool.id

  generate_secret = false

  # OAuth settings
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  allowed_oauth_flows_user_pool_client = true

  callback_urls = var.allowed_cors_origins
  logout_urls   = var.allowed_cors_origins

  # Token validity - using Cognito defaults (1 hour for access/id tokens, 30 days for refresh)
  # If you need custom values, uncomment and use duration format like "60m" or "1h"
  # access_token_validity  = "60m"
  # id_token_validity      = "60m"
  # refresh_token_validity = "720h"  # 30 days

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"
}

# Outputs
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.user_pool.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.web_client.id
}

output "dynamodb_table_name" {
  description = "DynamoDB Table Name"
  value       = aws_dynamodb_table.users.name
}

output "s3_bucket_name" {
  description = "S3 Bucket Name for Profile Photos"
  value       = aws_s3_bucket.profile_photos.id
}

output "api_gateway_url" {
  description = "API Gateway URL"
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}"
}

output "lambda_user_profile_creation_arn" {
  description = "User Profile Creation Lambda ARN"
  value       = aws_lambda_function.user_profile_creation.arn
}

output "lambda_meetup_verification_arn" {
  description = "Meetup Verification Lambda ARN"
  value       = aws_lambda_function.meetup_verification.arn
}
