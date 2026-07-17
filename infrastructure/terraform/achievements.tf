# ==========================================
# COMMUNITY ACHIEVEMENTS (admin-managed cards: image + title + LinkedIn URL)
# ==========================================

# ------------------------------------------
# DYNAMODB TABLE
# ------------------------------------------
resource "aws_dynamodb_table" "achievements" {
  name         = "Achievements_${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = "AWSUGMDU"
  }
}

# ------------------------------------------
# LAMBDA FUNCTION
# ------------------------------------------
data "archive_file" "achievements_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/achievements-crud"
  output_path = "${path.module}/lambda/achievements-crud.zip"
}

resource "aws_lambda_function" "achievements_crud" {
  filename         = data.archive_file.achievements_crud.output_path
  function_name    = "AchievementsCRUD_${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  source_code_hash = data.archive_file.achievements_crud.output_base64sha256

  environment {
    variables = {
      ACHIEVEMENTS_TABLE_NAME = aws_dynamodb_table.achievements.name
    }
  }

  tags = {
    Name = "AchievementsCRUD_${var.environment}"
  }
}

resource "aws_cloudwatch_log_group" "achievements_crud_logs" {
  name              = "/aws/lambda/${aws_lambda_function.achievements_crud.function_name}"
  retention_in_days = 14
}

# ------------------------------------------
# IAM PERMISSIONS
# ------------------------------------------
resource "aws_iam_policy" "achievements_dynamodb_access" {
  name        = "AchievementsDynamoDBAccess_${var.environment}"
  description = "IAM policy for Achievements Lambda to access its DynamoDB table"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          aws_dynamodb_table.achievements.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "achievements_dynamodb_attach" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = aws_iam_policy.achievements_dynamodb_access.arn
}

# ------------------------------------------
# API GATEWAY RESOURCES & METHODS
# ------------------------------------------

# /achievements
resource "aws_api_gateway_resource" "achievements" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "achievements"
}

resource "aws_api_gateway_method" "achievements_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.achievements.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "achievements_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.achievements.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "achievements_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.achievements.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# /achievements/{id}
resource "aws_api_gateway_resource" "achievements_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.achievements.id
  path_part   = "{id}"
}

resource "aws_api_gateway_method" "achievements_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.achievements_id.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "achievements_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.achievements_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "achievements_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.achievements_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# ------------------------------------------
# API GATEWAY INTEGRATIONS
# ------------------------------------------
locals {
  achievements_integrations = [
    {
      resource_id = aws_api_gateway_resource.achievements.id
      http_method = aws_api_gateway_method.achievements_get.http_method
    },
    {
      resource_id = aws_api_gateway_resource.achievements.id
      http_method = aws_api_gateway_method.achievements_post.http_method
    },
    {
      resource_id = aws_api_gateway_resource.achievements_id.id
      http_method = aws_api_gateway_method.achievements_id_put.http_method
    },
    {
      resource_id = aws_api_gateway_resource.achievements_id.id
      http_method = aws_api_gateway_method.achievements_id_delete.http_method
    }
  ]

  achievements_options_integrations = [
    {
      resource_id = aws_api_gateway_resource.achievements.id
      http_method = aws_api_gateway_method.achievements_options.http_method
    },
    {
      resource_id = aws_api_gateway_resource.achievements_id.id
      http_method = aws_api_gateway_method.achievements_id_options.http_method
    }
  ]
}

resource "aws_api_gateway_integration" "achievements_lambda" {
  count                   = length(local.achievements_integrations)
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = local.achievements_integrations[count.index].resource_id
  http_method             = local.achievements_integrations[count.index].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.achievements_crud.invoke_arn
}

resource "aws_api_gateway_integration" "achievements_options" {
  count       = length(local.achievements_options_integrations)
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = local.achievements_options_integrations[count.index].resource_id
  http_method = local.achievements_options_integrations[count.index].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "achievements_options_200" {
  count       = length(local.achievements_options_integrations)
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = local.achievements_options_integrations[count.index].resource_id
  http_method = local.achievements_options_integrations[count.index].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "achievements_options" {
  count       = length(local.achievements_options_integrations)
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = local.achievements_options_integrations[count.index].resource_id
  http_method = local.achievements_options_integrations[count.index].http_method
  status_code = aws_api_gateway_method_response.achievements_options_200[count.index].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT,DELETE'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.achievements_options]
}

resource "aws_lambda_permission" "apigw_achievements" {
  statement_id  = "AllowAPIGatewayInvokeAchievements"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.achievements_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
