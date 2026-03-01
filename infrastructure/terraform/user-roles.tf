# User Roles Lambda Function
data "archive_file" "user_roles_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/user-roles-crud"
  output_path = "${path.module}/lambda/user-roles-crud.zip"
  excludes    = ["*.zip", "node_modules"]
}

resource "aws_lambda_function" "user_roles_crud" {
  filename         = data.archive_file.user_roles_crud.output_path
  function_name    = "awsug-user-roles-crud"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.user_roles_crud.output_base64sha256
  runtime         = "nodejs18.x"
  timeout         = 30

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
    }
  }

  tags = {
    Name = "awsug-user-roles-crud"
  }
}

# API Gateway Resources for User Roles

# /users/roles resource
resource "aws_api_gateway_resource" "users_roles" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users.id
  path_part   = "roles"
}

# /users/roles/{roleId} resource
resource "aws_api_gateway_resource" "users_roles_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users_roles.id
  path_part   = "{roleId}"
}

# /users/{userId}/roles resource
resource "aws_api_gateway_resource" "users_id_roles" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.users_id.id
  path_part   = "roles"
}

# API Gateway Methods

# GET /users/roles
resource "aws_api_gateway_method" "users_roles_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_roles.id
  http_method   = "GET"
  authorization = "NONE"
}

# POST /users/roles
resource "aws_api_gateway_method" "users_roles_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_roles.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /users/roles
resource "aws_api_gateway_method" "users_roles_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_roles.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /users/{userId}/roles
resource "aws_api_gateway_method" "users_id_roles_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_id_roles.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS /users/{userId}/roles
resource "aws_api_gateway_method" "users_id_roles_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_id_roles.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# DELETE /users/roles/{roleId}
resource "aws_api_gateway_method" "users_roles_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_roles_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /users/roles/{roleId}
resource "aws_api_gateway_method" "users_roles_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.users_roles_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# API Gateway Integrations

# GET /users/roles integration
resource "aws_api_gateway_integration" "users_roles_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_roles.id
  http_method = aws_api_gateway_method.users_roles_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_roles_crud.invoke_arn
}

# POST /users/roles integration
resource "aws_api_gateway_integration" "users_roles_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_roles.id
  http_method = aws_api_gateway_method.users_roles_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_roles_crud.invoke_arn
}

# OPTIONS /users/roles integration
resource "aws_api_gateway_integration" "users_roles_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_roles.id
  http_method = aws_api_gateway_method.users_roles_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_roles_crud.invoke_arn
}

# GET /users/{userId}/roles integration
resource "aws_api_gateway_integration" "users_id_roles_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_id_roles.id
  http_method = aws_api_gateway_method.users_id_roles_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_roles_crud.invoke_arn
}

# OPTIONS /users/{userId}/roles integration
resource "aws_api_gateway_integration" "users_id_roles_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_id_roles.id
  http_method = aws_api_gateway_method.users_id_roles_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_roles_crud.invoke_arn
}

# DELETE /users/roles/{roleId} integration
resource "aws_api_gateway_integration" "users_roles_id_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_roles_id.id
  http_method = aws_api_gateway_method.users_roles_id_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_roles_crud.invoke_arn
}

# OPTIONS /users/roles/{roleId} integration
resource "aws_api_gateway_integration" "users_roles_id_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.users_roles_id.id
  http_method = aws_api_gateway_method.users_roles_id_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.user_roles_crud.invoke_arn
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "user_roles_crud_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.user_roles_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# Output
output "lambda_user_roles_crud_arn" {
  value       = aws_lambda_function.user_roles_crud.arn
  description = "ARN of the user roles CRUD Lambda function"
}
