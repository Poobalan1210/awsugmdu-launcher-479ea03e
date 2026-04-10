# ============================================================
# Community Spotlight Infrastructure
# ============================================================

# DynamoDB Table for Spotlight Submissions
resource "aws_dynamodb_table" "spotlight" {
  name           = "${var.project_name}-spotlight"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name     = "status-index"
    hash_key = "status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name     = "userId-index"
    hash_key = "userId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-spotlight-table"
  }
}

# Archive Lambda function
data "archive_file" "spotlight_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/spotlight-crud"
  output_path = "${path.module}/lambda/spotlight-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

# Lambda: Spotlight CRUD
resource "aws_lambda_function" "spotlight_crud" {
  filename         = data.archive_file.spotlight_crud.output_path
  function_name    = "${var.project_name}-spotlight-crud"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.spotlight_crud.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 30

  environment {
    variables = {
      SPOTLIGHT_TABLE_NAME = aws_dynamodb_table.spotlight.name
      USERS_TABLE_NAME     = aws_dynamodb_table.users.name
    }
  }

  tags = {
    Name = "${var.project_name}-spotlight-crud"
  }
}

# ============================================================
# API Gateway Resources
# ============================================================

resource "aws_api_gateway_resource" "spotlight" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "spotlight"
}

resource "aws_api_gateway_resource" "spotlight_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.spotlight.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "spotlight_id_review" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.spotlight_id.id
  path_part   = "review"
}

# ============================================================
# API Gateway Methods
# ============================================================

# /spotlight GET
resource "aws_api_gateway_method" "spotlight_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight.id
  http_method   = "GET"
  authorization = "NONE"
}

# /spotlight POST
resource "aws_api_gateway_method" "spotlight_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight.id
  http_method   = "POST"
  authorization = "NONE"
}

# /spotlight OPTIONS
resource "aws_api_gateway_method" "spotlight_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# /spotlight/{id} GET
resource "aws_api_gateway_method" "spotlight_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight_id.id
  http_method   = "GET"
  authorization = "NONE"
}

# /spotlight/{id} DELETE
resource "aws_api_gateway_method" "spotlight_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# /spotlight/{id} OPTIONS
resource "aws_api_gateway_method" "spotlight_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# /spotlight/{id}/review POST
resource "aws_api_gateway_method" "spotlight_id_review_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight_id_review.id
  http_method   = "POST"
  authorization = "NONE"
}

# /spotlight/{id}/review OPTIONS
resource "aws_api_gateway_method" "spotlight_id_review_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.spotlight_id_review.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# ============================================================
# API Gateway Integrations
# ============================================================

# /spotlight GET -> Lambda
resource "aws_api_gateway_integration" "spotlight_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight.id
  http_method = aws_api_gateway_method.spotlight_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.spotlight_crud.invoke_arn
}

# /spotlight POST -> Lambda
resource "aws_api_gateway_integration" "spotlight_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight.id
  http_method = aws_api_gateway_method.spotlight_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.spotlight_crud.invoke_arn
}

# /spotlight OPTIONS -> MOCK
resource "aws_api_gateway_integration" "spotlight_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight.id
  http_method = aws_api_gateway_method.spotlight_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "spotlight_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight.id
  http_method = aws_api_gateway_method.spotlight_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "spotlight_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight.id
  http_method = aws_api_gateway_method.spotlight_options.http_method
  status_code = aws_api_gateway_method_response.spotlight_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# /spotlight/{id} GET -> Lambda
resource "aws_api_gateway_integration" "spotlight_id_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id.id
  http_method = aws_api_gateway_method.spotlight_id_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.spotlight_crud.invoke_arn
}

# /spotlight/{id} DELETE -> Lambda
resource "aws_api_gateway_integration" "spotlight_id_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id.id
  http_method = aws_api_gateway_method.spotlight_id_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.spotlight_crud.invoke_arn
}

# /spotlight/{id} OPTIONS -> MOCK
resource "aws_api_gateway_integration" "spotlight_id_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id.id
  http_method = aws_api_gateway_method.spotlight_id_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "spotlight_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id.id
  http_method = aws_api_gateway_method.spotlight_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "spotlight_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id.id
  http_method = aws_api_gateway_method.spotlight_id_options.http_method
  status_code = aws_api_gateway_method_response.spotlight_id_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# /spotlight/{id}/review POST -> Lambda
resource "aws_api_gateway_integration" "spotlight_id_review_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id_review.id
  http_method = aws_api_gateway_method.spotlight_id_review_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.spotlight_crud.invoke_arn
}

# /spotlight/{id}/review OPTIONS -> MOCK
resource "aws_api_gateway_integration" "spotlight_id_review_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id_review.id
  http_method = aws_api_gateway_method.spotlight_id_review_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "spotlight_id_review_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id_review.id
  http_method = aws_api_gateway_method.spotlight_id_review_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "spotlight_id_review_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.spotlight_id_review.id
  http_method = aws_api_gateway_method.spotlight_id_review_options.http_method
  status_code = aws_api_gateway_method_response.spotlight_id_review_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# ============================================================
# Lambda Permissions for API Gateway
# ============================================================

resource "aws_lambda_permission" "spotlight_crud_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.spotlight_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
