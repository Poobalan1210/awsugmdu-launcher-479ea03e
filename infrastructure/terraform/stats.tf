# ==========================================
# STATS ENDPOINT
# Lightweight aggregate counts for the public home page hero.
# Avoids the full-table /users scan just to show member/badge/meetup counts.
# ==========================================

# ------------------------------------------
# LAMBDA FUNCTION
# ------------------------------------------

data "archive_file" "stats_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/stats-crud"
  output_path = "${path.module}/lambda/stats-crud.zip"
  excludes    = ["*.zip"]
}

resource "aws_lambda_function" "stats_crud" {
  filename         = data.archive_file.stats_crud.output_path
  function_name    = "${var.project_name}-stats-crud"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.stats_crud.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      USERS_TABLE_NAME   = aws_dynamodb_table.users.name
      MEETUPS_TABLE_NAME = aws_dynamodb_table.meetups.name
      SPRINTS_TABLE_NAME = aws_dynamodb_table.sprints.name
    }
  }

  tags = {
    Name = "${var.project_name}-stats-crud"
  }
}

resource "aws_cloudwatch_log_group" "stats_crud_logs" {
  name              = "/aws/lambda/${aws_lambda_function.stats_crud.function_name}"
  retention_in_days = 14
}

# The shared lambda_execution role already grants Scan/Query on the users,
# meetups and sprints tables (see aws_iam_role_policy.lambda_dynamodb in main.tf),
# so no extra IAM policy is required here.

# ------------------------------------------
# API GATEWAY: /stats
# ------------------------------------------

resource "aws_api_gateway_resource" "stats" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "stats"
}

resource "aws_api_gateway_method" "stats_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.stats.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "stats_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.stats.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# ------------------------------------------
# INTEGRATIONS
# ------------------------------------------

resource "aws_api_gateway_integration" "stats_get_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.stats.id
  http_method             = aws_api_gateway_method.stats_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.stats_crud.invoke_arn
}

# CORS preflight via MOCK integration
resource "aws_api_gateway_integration" "stats_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.stats.id
  http_method = aws_api_gateway_method.stats_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "stats_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.stats.id
  http_method = aws_api_gateway_method.stats_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "stats_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.stats.id
  http_method = aws_api_gateway_method.stats_options.http_method
  status_code = aws_api_gateway_method_response.stats_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.stats_options]
}

resource "aws_lambda_permission" "apigw_stats" {
  statement_id  = "AllowAPIGatewayInvokeStats"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stats_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
