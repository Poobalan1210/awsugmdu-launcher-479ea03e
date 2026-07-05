# ==========================================
# KIRONOMICS
# Gamified Kiro usage tracking + leaderboard.
# Merged into the main AWS stack from the standalone Express server.
# One Lambda behind /kironomics/{proxy+} (routes internally) + one DynamoDB table.
# ==========================================

variable "kironomics_admin_key" {
  description = "Admin key for Kironomics admin endpoints (x-admin-key header). Admin endpoints stay DISABLED unless this is set to a real value (blank or 'admin' = disabled). Set via TF_VAR_kironomics_admin_key."
  type        = string
  default     = ""
  sensitive   = true
}

# ------------------------------------------
# DYNAMODB TABLE
# One item per user (PK userId). token-index GSI resolves an API key back to its
# user for the ingestion endpoints (session/prompt/tool).
# ------------------------------------------
resource "aws_dynamodb_table" "kironomics" {
  name         = "${var.project_name}-kironomics"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "token"
    type = "S"
  }

  global_secondary_index {
    name            = "token-index"
    hash_key        = "token"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-kironomics-table"
  }
}

# ------------------------------------------
# IAM: allow the shared lambda role to access the kironomics table
# (follows the per-domain policy pattern used by badges.tf, store.tf, etc.)
# ------------------------------------------
resource "aws_iam_role_policy" "lambda_kironomics_dynamodb" {
  name = "${var.project_name}-lambda-kironomics-dynamodb-policy"
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
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ]
        Resource = [
          aws_dynamodb_table.kironomics.arn,
          "${aws_dynamodb_table.kironomics.arn}/index/*",
        ]
      }
    ]
  })
}

# ------------------------------------------
# LAMBDA FUNCTION
# ------------------------------------------
data "archive_file" "kironomics_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/kironomics-crud"
  output_path = "${path.module}/lambda/kironomics-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

resource "aws_lambda_function" "kironomics_crud" {
  filename         = data.archive_file.kironomics_crud.output_path
  function_name    = "${var.project_name}-kironomics-crud"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.kironomics_crud.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30

  environment {
    variables = {
      KIRONOMICS_TABLE_NAME = aws_dynamodb_table.kironomics.name
      ADMIN_KEY             = var.kironomics_admin_key
    }
  }

  tags = {
    Name = "${var.project_name}-kironomics-crud"
  }
}

resource "aws_cloudwatch_log_group" "kironomics_crud_logs" {
  name              = "/aws/lambda/${aws_lambda_function.kironomics_crud.function_name}"
  retention_in_days = 14
}

# ------------------------------------------
# API GATEWAY: /kironomics and /kironomics/{proxy+}
# A single greedy proxy routes every /kironomics/* request (any method,
# including OPTIONS for CORS) to the lambda, which routes + handles CORS itself.
# ------------------------------------------
resource "aws_api_gateway_resource" "kironomics" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "kironomics"
}

resource "aws_api_gateway_resource" "kironomics_proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.kironomics.id
  path_part   = "{proxy+}"
}

# ANY /kironomics
resource "aws_api_gateway_method" "kironomics_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.kironomics.id
  http_method   = "ANY"
  authorization = "NONE"
}

# ANY /kironomics/{proxy+}
resource "aws_api_gateway_method" "kironomics_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.kironomics_proxy.id
  http_method   = "ANY"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_integration" "kironomics_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.kironomics.id
  http_method             = aws_api_gateway_method.kironomics_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.kironomics_crud.invoke_arn
}

resource "aws_api_gateway_integration" "kironomics_proxy_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.kironomics_proxy.id
  http_method             = aws_api_gateway_method.kironomics_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.kironomics_crud.invoke_arn
}

resource "aws_lambda_permission" "apigw_kironomics" {
  statement_id  = "AllowAPIGatewayInvokeKironomics"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kironomics_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

output "lambda_kironomics_crud_arn" {
  value       = aws_lambda_function.kironomics_crud.arn
  description = "ARN of the Kironomics CRUD Lambda function"
}

output "kironomics_table_name" {
  value       = aws_dynamodb_table.kironomics.name
  description = "Name of the Kironomics DynamoDB table"
}
