# ─── Open Badges v2.0 Infrastructure ─────────────────────────────────────────
#
# Public OB v2 endpoints (no auth required):
#   GET  /ob2/issuer.json
#   GET  /ob2/badges/{badgeFile}.json
#   GET  /ob2/badge-images/{badgeFile}.svg
#   GET  /ob2/assertions/{assertionFile}.json
#   GET  /ob2/verify?url=...
#   POST /ob2/assertions   (internal — called when a badge is awarded)
#
# S3 bucket for uploaded badge images:
#   badge-images/{timestamp}-{filename}

# ─── S3 bucket for badge images ──────────────────────────────────────────────
resource "aws_s3_bucket" "badge_images" {
  bucket = "${var.project_name}-badge-images-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "${var.project_name}-badge-images" }
}

resource "aws_s3_bucket_versioning" "badge_images" {
  bucket = aws_s3_bucket.badge_images.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "badge_images" {
  bucket                  = aws_s3_bucket.badge_images.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_cors_configuration" "badge_images" {
  bucket = aws_s3_bucket.badge_images.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_policy" "badge_images" {
  bucket     = aws_s3_bucket.badge_images.id
  depends_on = [aws_s3_bucket_public_access_block.badge_images]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.badge_images.arn}/*"
    }]
  })
}

# Allow the upload Lambda to write to the badge-images bucket
resource "aws_iam_role_policy" "upload_badge_images_s3" {
  name = "${var.project_name}-upload-badge-images-s3"
  role = aws_iam_role.lambda_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.badge_images.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.badge_images.arn
      }
    ]
  })
}

# ─── DynamoDB table for badge definitions ────────────────────────────────────
resource "aws_dynamodb_table" "badges" {
  name         = "${var.project_name}-badges"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery      { enabled = true }
  deletion_protection_enabled = false   # allow deletes from admin

  tags = { Name = "${var.project_name}-badges-table" }
}

# ─── DynamoDB table for OB v2 assertions ─────────────────────────────────────
resource "aws_dynamodb_table" "ob2_assertions" {
  name         = "${var.project_name}-ob2-assertions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "assertionId"

  attribute {
    name = "assertionId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  point_in_time_recovery      { enabled = true }
  deletion_protection_enabled = true
  lifecycle                   { prevent_destroy = true }

  tags = { Name = "${var.project_name}-ob2-assertions-table" }
}

# ─── Lambda package ───────────────────────────────────────────────────────────
data "archive_file" "badges_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/badges-crud"
  output_path = "${path.module}/lambda/badges-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

# ─── Lambda function ──────────────────────────────────────────────────────────
resource "aws_lambda_function" "badges_crud" {
  filename         = data.archive_file.badges_crud.output_path
  function_name    = "${var.project_name}-badges-crud"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.badges_crud.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      ASSERTIONS_TABLE    = aws_dynamodb_table.ob2_assertions.name
      BADGES_TABLE        = aws_dynamodb_table.badges.name
      BADGE_IMAGES_BUCKET = aws_s3_bucket.badge_images.id
      BASE_URL            = "https://www.awsugmdu.in"
    }
  }

  tags = { Name = "${var.project_name}-badges-crud" }
}

resource "aws_lambda_permission" "api_badges_crud" {
  statement_id  = "AllowExecutionFromAPIGateway-badges"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.badges_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ─── IAM: Lambda → DynamoDB assertions table ─────────────────────────────────
resource "aws_iam_role_policy" "badges_dynamodb" {
  name = "${var.project_name}-badges-dynamodb"
  role = aws_iam_role.lambda_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
      ]
      Resource = [
        aws_dynamodb_table.ob2_assertions.arn,
        "${aws_dynamodb_table.ob2_assertions.arn}/index/*",
        aws_dynamodb_table.badges.arn,
        "${aws_dynamodb_table.badges.arn}/index/*",
      ]
    }]
  })
}

# ─── API Gateway resources ────────────────────────────────────────────────────

# /ob2
resource "aws_api_gateway_resource" "ob2" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "ob2"
}

# /ob2/issuer.json
resource "aws_api_gateway_resource" "ob2_issuer" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2.id
  path_part   = "issuer.json"
}

# /ob2/badges
resource "aws_api_gateway_resource" "ob2_badges" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2.id
  path_part   = "badges"
}

# /ob2/badges/{badgeFile}
resource "aws_api_gateway_resource" "ob2_badges_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2_badges.id
  path_part   = "{badgeFile}"
}

# /ob2/badge-images
resource "aws_api_gateway_resource" "ob2_badge_images" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2.id
  path_part   = "badge-images"
}

# /ob2/badge-images/{badgeFile}
resource "aws_api_gateway_resource" "ob2_badge_images_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2_badge_images.id
  path_part   = "{badgeFile}"
}

# /ob2/assertions
resource "aws_api_gateway_resource" "ob2_assertions" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2.id
  path_part   = "assertions"
}

# /ob2/assertions/{assertionFile}
resource "aws_api_gateway_resource" "ob2_assertions_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2_assertions.id
  path_part   = "{assertionFile}"
}

# /ob2/verify
resource "aws_api_gateway_resource" "ob2_verify" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.ob2.id
  path_part   = "verify"
}

# ─── Helper locals ────────────────────────────────────────────────────────────
locals {
  cors_headers = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  cors_response_params = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

# ─── GET /ob2/issuer.json ─────────────────────────────────────────────────────
resource "aws_api_gateway_method" "ob2_issuer_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_issuer.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_issuer_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.ob2_issuer.id
  http_method             = aws_api_gateway_method.ob2_issuer_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}
resource "aws_api_gateway_method" "ob2_issuer_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_issuer.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_issuer_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.ob2_issuer.id
  http_method = aws_api_gateway_method.ob2_issuer_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "ob2_issuer_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_issuer.id
  http_method         = aws_api_gateway_method.ob2_issuer_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "ob2_issuer_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_issuer.id
  http_method         = aws_api_gateway_method.ob2_issuer_options.http_method
  status_code         = aws_api_gateway_method_response.ob2_issuer_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.ob2_issuer_options]
}

# ─── GET /ob2/badges/{badgeFile} ─────────────────────────────────────────────
resource "aws_api_gateway_method" "ob2_badges_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_badges_id.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_badges_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.ob2_badges_id.id
  http_method             = aws_api_gateway_method.ob2_badges_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}
resource "aws_api_gateway_method" "ob2_badges_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_badges_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_badges_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.ob2_badges_id.id
  http_method = aws_api_gateway_method.ob2_badges_id_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "ob2_badges_id_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_badges_id.id
  http_method         = aws_api_gateway_method.ob2_badges_id_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "ob2_badges_id_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_badges_id.id
  http_method         = aws_api_gateway_method.ob2_badges_id_options.http_method
  status_code         = aws_api_gateway_method_response.ob2_badges_id_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.ob2_badges_id_options]
}

# ─── GET /ob2/badge-images/{badgeFile} ───────────────────────────────────────
resource "aws_api_gateway_method" "ob2_images_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_badge_images_id.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_images_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.ob2_badge_images_id.id
  http_method             = aws_api_gateway_method.ob2_images_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}
resource "aws_api_gateway_method" "ob2_images_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_badge_images_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_images_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.ob2_badge_images_id.id
  http_method = aws_api_gateway_method.ob2_images_id_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "ob2_images_id_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_badge_images_id.id
  http_method         = aws_api_gateway_method.ob2_images_id_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "ob2_images_id_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_badge_images_id.id
  http_method         = aws_api_gateway_method.ob2_images_id_options.http_method
  status_code         = aws_api_gateway_method_response.ob2_images_id_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.ob2_images_id_options]
}

# ─── GET + POST /ob2/assertions ──────────────────────────────────────────────
resource "aws_api_gateway_method" "ob2_assertions_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_assertions.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_assertions_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.ob2_assertions.id
  http_method             = aws_api_gateway_method.ob2_assertions_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}
# POST uses NONE auth — the Lambda validates the Cognito JWT from the Authorization header
resource "aws_api_gateway_method" "ob2_assertions_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_assertions.id
  http_method   = "POST"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_assertions_post" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.ob2_assertions.id
  http_method             = aws_api_gateway_method.ob2_assertions_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}
resource "aws_api_gateway_method" "ob2_assertions_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_assertions.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_assertions_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.ob2_assertions.id
  http_method = aws_api_gateway_method.ob2_assertions_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "ob2_assertions_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_assertions.id
  http_method         = aws_api_gateway_method.ob2_assertions_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "ob2_assertions_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_assertions.id
  http_method         = aws_api_gateway_method.ob2_assertions_options.http_method
  status_code         = aws_api_gateway_method_response.ob2_assertions_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.ob2_assertions_options]
}

# ─── GET /ob2/assertions/{assertionFile} ─────────────────────────────────────
resource "aws_api_gateway_method" "ob2_assert_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_assertions_id.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_assert_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.ob2_assertions_id.id
  http_method             = aws_api_gateway_method.ob2_assert_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}
resource "aws_api_gateway_method" "ob2_assert_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_assertions_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_assert_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.ob2_assertions_id.id
  http_method = aws_api_gateway_method.ob2_assert_id_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "ob2_assert_id_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_assertions_id.id
  http_method         = aws_api_gateway_method.ob2_assert_id_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "ob2_assert_id_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_assertions_id.id
  http_method         = aws_api_gateway_method.ob2_assert_id_options.http_method
  status_code         = aws_api_gateway_method_response.ob2_assert_id_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.ob2_assert_id_options]
}

# ─── GET /ob2/verify ─────────────────────────────────────────────────────────
resource "aws_api_gateway_method" "ob2_verify_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_verify.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_verify_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.ob2_verify.id
  http_method             = aws_api_gateway_method.ob2_verify_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}
resource "aws_api_gateway_method" "ob2_verify_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.ob2_verify.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "ob2_verify_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.ob2_verify.id
  http_method = aws_api_gateway_method.ob2_verify_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "ob2_verify_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_verify.id
  http_method         = aws_api_gateway_method.ob2_verify_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "ob2_verify_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.ob2_verify.id
  http_method         = aws_api_gateway_method.ob2_verify_options.http_method
  status_code         = aws_api_gateway_method_response.ob2_verify_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.ob2_verify_options]
}

# ─── OG Proxy: /og/badge/{badgeId}/{userSlug} ────────────────────────────────
# Social crawlers (LinkedIn, Twitter, WhatsApp, Slack, Telegram) hit this URL.
# It returns server-rendered HTML with correct OG meta tags, then redirects
# human visitors to the real React badge page at /badges/{badgeId}/{userSlug}.

resource "aws_api_gateway_resource" "og" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "og"
}

resource "aws_api_gateway_resource" "og_badge" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.og.id
  path_part   = "badge"
}

resource "aws_api_gateway_resource" "og_badge_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.og_badge.id
  path_part   = "{badgeId}"
}

resource "aws_api_gateway_resource" "og_badge_id_slug" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.og_badge_id.id
  path_part   = "{userSlug}"
}

resource "aws_api_gateway_method" "og_badge_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.og_badge_id_slug.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "og_badge_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.og_badge_id_slug.id
  http_method             = aws_api_gateway_method.og_badge_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}

resource "aws_api_gateway_method" "og_badge_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.og_badge_id_slug.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "og_badge_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.og_badge_id_slug.id
  http_method = aws_api_gateway_method.og_badge_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}

resource "aws_api_gateway_method_response" "og_badge_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.og_badge_id_slug.id
  http_method         = aws_api_gateway_method.og_badge_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}

resource "aws_api_gateway_integration_response" "og_badge_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.og_badge_id_slug.id
  http_method         = aws_api_gateway_method.og_badge_options.http_method
  status_code         = aws_api_gateway_method_response.og_badge_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.og_badge_options]
}

# ─── Badge definitions CRUD: /badges and /badges/{id} ────────────────────────

resource "aws_api_gateway_resource" "badges_resource" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "badges"
}

resource "aws_api_gateway_resource" "badges_id_resource" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.badges_resource.id
  path_part   = "{id}"
}

# GET /badges
resource "aws_api_gateway_method" "badges_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.badges_resource.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "badges_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.badges_resource.id
  http_method             = aws_api_gateway_method.badges_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}

# POST /badges
resource "aws_api_gateway_method" "badges_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.badges_resource.id
  http_method   = "POST"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "badges_post" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.badges_resource.id
  http_method             = aws_api_gateway_method.badges_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}

# OPTIONS /badges
resource "aws_api_gateway_method" "badges_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.badges_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "badges_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.badges_resource.id
  http_method = aws_api_gateway_method.badges_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "badges_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.badges_resource.id
  http_method         = aws_api_gateway_method.badges_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "badges_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.badges_resource.id
  http_method         = aws_api_gateway_method.badges_options.http_method
  status_code         = aws_api_gateway_method_response.badges_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.badges_options]
}

# GET /badges/{id}
resource "aws_api_gateway_method" "badges_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.badges_id_resource.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "badges_id_get" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.badges_id_resource.id
  http_method             = aws_api_gateway_method.badges_id_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}

# PUT /badges/{id}
resource "aws_api_gateway_method" "badges_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.badges_id_resource.id
  http_method   = "PUT"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "badges_id_put" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.badges_id_resource.id
  http_method             = aws_api_gateway_method.badges_id_put.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}

# DELETE /badges/{id}
resource "aws_api_gateway_method" "badges_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.badges_id_resource.id
  http_method   = "DELETE"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "badges_id_delete" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.badges_id_resource.id
  http_method             = aws_api_gateway_method.badges_id_delete.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.badges_crud.invoke_arn
}

# OPTIONS /badges/{id}
resource "aws_api_gateway_method" "badges_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.badges_id_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "badges_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.badges_id_resource.id
  http_method = aws_api_gateway_method.badges_id_options.http_method
  type        = "MOCK"
  request_templates = { "application/json" = "{\"statusCode\": 200}" }
}
resource "aws_api_gateway_method_response" "badges_id_options_200" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.badges_id_resource.id
  http_method         = aws_api_gateway_method.badges_id_options.http_method
  status_code         = "200"
  response_parameters = local.cors_response_params
}
resource "aws_api_gateway_integration_response" "badges_id_options" {
  rest_api_id         = aws_api_gateway_rest_api.api.id
  resource_id         = aws_api_gateway_resource.badges_id_resource.id
  http_method         = aws_api_gateway_method.badges_id_options.http_method
  status_code         = aws_api_gateway_method_response.badges_id_options_200.status_code
  response_parameters = local.cors_headers
  depends_on          = [aws_api_gateway_integration.badges_id_options]
}

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "badge_images_bucket_name" {
  description = "S3 bucket for uploaded badge images"
  value       = aws_s3_bucket.badge_images.id
}

output "ob2_assertions_table_name" {
  description = "DynamoDB table for OB v2 assertions"
  value       = aws_dynamodb_table.ob2_assertions.name
}
