# Points Management Lambda Function
data "archive_file" "points_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/points-crud"
  output_path = "${path.module}/lambda/points-crud.zip"
  excludes    = ["*.zip", "node_modules"]
}

resource "aws_lambda_function" "points_crud" {
  filename         = data.archive_file.points_crud.output_path
  function_name    = "awsug-points-crud"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.points_crud.output_base64sha256
  runtime         = "nodejs18.x"
  timeout         = 30

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
    }
  }

  tags = {
    Name = "awsug-points-crud"
  }
}

# API Gateway Resources for Points

# /users/points resource
resource "aws_api_gateway_resource" "users_points" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users.id
  path_part   = "points"
}

# /users/points/activities resource
resource "aws_api_gateway_resource" "users_points_activities" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users_points.id
  path_part   = "activities"
}

# /users/points/award resource
resource "aws_api_gateway_resource" "users_points_award" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users_points.id
  path_part   = "award"
}

# /users/{userId}/points resource
resource "aws_api_gateway_resource" "users_id_points" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users_id.id
  path_part   = "points"
}

# /users/{userId}/points/activities resource
resource "aws_api_gateway_resource" "users_id_points_activities" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users_id_points.id
  path_part   = "activities"
}

# API Gateway Methods

# GET /users/points/activities
resource "aws_api_gateway_method" "users_points_activities_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_points_activities.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS /users/points/activities
resource "aws_api_gateway_method" "users_points_activities_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_points_activities.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /users/points/award
resource "aws_api_gateway_method" "users_points_award_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_points_award.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /users/points/award
resource "aws_api_gateway_method" "users_points_award_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_points_award.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /users/{userId}/points
resource "aws_api_gateway_method" "users_id_points_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_id_points.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS /users/{userId}/points
resource "aws_api_gateway_method" "users_id_points_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_id_points.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /users/{userId}/points/activities
resource "aws_api_gateway_method" "users_id_points_activities_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_id_points_activities.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS /users/{userId}/points/activities
resource "aws_api_gateway_method" "users_id_points_activities_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_id_points_activities.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# API Gateway Integrations

# GET /users/points/activities integration
resource "aws_api_gateway_integration" "users_points_activities_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_points_activities.id
  http_method = aws_api_gateway_method.users_points_activities_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# OPTIONS /users/points/activities integration
resource "aws_api_gateway_integration" "users_points_activities_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_points_activities.id
  http_method = aws_api_gateway_method.users_points_activities_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# POST /users/points/award integration
resource "aws_api_gateway_integration" "users_points_award_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_points_award.id
  http_method = aws_api_gateway_method.users_points_award_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# OPTIONS /users/points/award integration
resource "aws_api_gateway_integration" "users_points_award_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_points_award.id
  http_method = aws_api_gateway_method.users_points_award_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# GET /users/{userId}/points integration
resource "aws_api_gateway_integration" "users_id_points_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_id_points.id
  http_method = aws_api_gateway_method.users_id_points_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# OPTIONS /users/{userId}/points integration
resource "aws_api_gateway_integration" "users_id_points_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_id_points.id
  http_method = aws_api_gateway_method.users_id_points_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# GET /users/{userId}/points/activities integration
resource "aws_api_gateway_integration" "users_id_points_activities_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_id_points_activities.id
  http_method = aws_api_gateway_method.users_id_points_activities_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# OPTIONS /users/{userId}/points/activities integration
resource "aws_api_gateway_integration" "users_id_points_activities_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_id_points_activities.id
  http_method = aws_api_gateway_method.users_id_points_activities_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.points_crud.invoke_arn
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "points_crud_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.points_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# Output
output "lambda_points_crud_arn" {
  value       = aws_lambda_function.points_crud.arn
  description = "ARN of the points CRUD Lambda function"
}
