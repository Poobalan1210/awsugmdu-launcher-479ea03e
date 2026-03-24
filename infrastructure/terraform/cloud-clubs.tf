# DynamoDB Table for Cloud Clubs
resource "aws_dynamodb_table" "cloud_clubs" {
  name           = "${var.project_name}-cloud_clubs"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "rank"
    type = "N"
  }

  attribute {
    name = "clubLeadId"
    type = "S"
  }

  global_secondary_index {
    name     = "rank-index"
    hash_key = "rank"
    projection_type = "ALL"
  }

  global_secondary_index {
    name     = "clubLeadId-index"
    hash_key = "clubLeadId"
    projection_type = "ALL"
  }

  # Note: This is a sparse index - only items with clubLeadId will be indexed

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "${var.project_name}-cloud_clubs-table"
  }
}

# Archive Lambda function for cloud_clubs CRUD
data "archive_file" "cloud_clubs_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/cloud-clubs-crud"
  output_path = "${path.module}/lambda/cloud-clubs-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

# Lambda: Colleges CRUD
resource "aws_lambda_function" "cloud_clubs_crud" {
  filename         = data.archive_file.cloud_clubs_crud.output_path
  function_name    = "${var.project_name}-cloud-clubs-crud"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.cloud_clubs_crud.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 30

  environment {
    variables = {
      CLOUD_CLUBS_TABLE_NAME = aws_dynamodb_table.cloud_clubs.name
      USERS_TABLE_NAME    = aws_dynamodb_table.users.name
    }
  }

  tags = {
    Name = "${var.project_name}-cloud-clubs-crud"
  }
}

# Update Lambda DynamoDB policy to include cloud_clubs table
resource "aws_iam_role_policy" "lambda_cloud_clubs_dynamodb" {
  name = "${var.project_name}-lambda-cloud_clubs-dynamodb-policy"
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
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.cloud_clubs.arn,
          "${aws_dynamodb_table.cloud_clubs.arn}/index/*"
        ]
      }
    ]
  })
}

# API Gateway Resources for Colleges
resource "aws_api_gateway_resource" "cloud_clubs" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "cloud-clubs"
}

resource "aws_api_gateway_resource" "cloud_clubs_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "cloud_clubs_id_tasks" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_id.id
  path_part   = "tasks"
}

resource "aws_api_gateway_resource" "cloud_clubs_id_tasks_taskid" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_id_tasks.id
  path_part   = "{taskId}"
}

resource "aws_api_gateway_resource" "cloud_clubs_id_events" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_id.id
  path_part   = "events"
}

resource "aws_api_gateway_resource" "cloud_clubs_id_members" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_id.id
  path_part   = "members"
}

# API Gateway Methods for Colleges
resource "aws_api_gateway_method" "cloud_clubs_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_tasks_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_tasks.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_tasks_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_tasks.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_tasks_taskid_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_tasks_taskid_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_tasks_taskid_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_events_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_events.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_events_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_events.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_members_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_members_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_members_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# API Gateway Integrations for Colleges
resource "aws_api_gateway_integration" "cloud_clubs_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs.id
  http_method = aws_api_gateway_method.cloud_clubs_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs.id
  http_method = aws_api_gateway_method.cloud_clubs_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs.id
  http_method = aws_api_gateway_method.cloud_clubs_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_integration" "cloud_clubs_id_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id.id
  http_method = aws_api_gateway_method.cloud_clubs_id_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id.id
  http_method = aws_api_gateway_method.cloud_clubs_id_put.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id.id
  http_method = aws_api_gateway_method.cloud_clubs_id_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id.id
  http_method = aws_api_gateway_method.cloud_clubs_id_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_integration" "cloud_clubs_id_tasks_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_tasks_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_integration" "cloud_clubs_id_tasks_taskid_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_put.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_tasks_taskid_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_tasks_taskid_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_integration" "cloud_clubs_id_events_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_events.id
  http_method = aws_api_gateway_method.cloud_clubs_id_events_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_events_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_events.id
  http_method = aws_api_gateway_method.cloud_clubs_id_events_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_integration" "cloud_clubs_id_members_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method = aws_api_gateway_method.cloud_clubs_id_members_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_members_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method = aws_api_gateway_method.cloud_clubs_id_members_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_members_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method = aws_api_gateway_method.cloud_clubs_id_members_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Method Responses for CORS
resource "aws_api_gateway_method_response" "cloud_clubs_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs.id
  http_method = aws_api_gateway_method.cloud_clubs_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs.id
  http_method = aws_api_gateway_method.cloud_clubs_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id.id
  http_method = aws_api_gateway_method.cloud_clubs_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id.id
  http_method = aws_api_gateway_method.cloud_clubs_id_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_id_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_id_tasks_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_id_tasks_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_id_tasks_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_id_tasks_taskid_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_id_tasks_taskid_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_id_tasks_taskid_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_id_events_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_events.id
  http_method = aws_api_gateway_method.cloud_clubs_id_events_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_id_events_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_events.id
  http_method = aws_api_gateway_method.cloud_clubs_id_events_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_id_events_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_id_members_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method = aws_api_gateway_method.cloud_clubs_id_members_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_id_members_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_members.id
  http_method = aws_api_gateway_method.cloud_clubs_id_members_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_id_members_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Lambda Permissions
resource "aws_lambda_permission" "cloud_clubs_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cloud_clubs_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# Outputs
output "cloud_clubs_table_name" {
  description = "Name of the Colleges DynamoDB table"
  value       = aws_dynamodb_table.cloud_clubs.name
}

output "cloud_clubs_lambda_function_name" {
  description = "Name of the Colleges CRUD Lambda function"
  value       = aws_lambda_function.cloud_clubs_crud.function_name
}

# API Gateway Resource for assign-tasks
resource "aws_api_gateway_resource" "cloud_clubs_id_assign_tasks" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_id.id
  path_part   = "assign-tasks"
}

# API Gateway Methods for assign-tasks
resource "aws_api_gateway_method" "cloud_clubs_id_assign_tasks_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_assign_tasks.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_assign_tasks_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_assign_tasks.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# API Gateway Integrations for assign-tasks
resource "aws_api_gateway_integration" "cloud_clubs_id_assign_tasks_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_assign_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_assign_tasks_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_assign_tasks_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_assign_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_assign_tasks_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

# Method Responses for CORS
resource "aws_api_gateway_method_response" "cloud_clubs_id_assign_tasks_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_assign_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_assign_tasks_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_id_assign_tasks_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_assign_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_id_assign_tasks_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_id_assign_tasks_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ==================== TASK SUBMISSIONS ====================

# /cloud_clubs/{id}/tasks/{taskId}/submit
resource "aws_api_gateway_resource" "cloud_clubs_id_tasks_taskid_submit" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid.id
  path_part   = "submit"
}

resource "aws_api_gateway_method" "cloud_clubs_id_tasks_taskid_submit_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid_submit.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_id_tasks_taskid_submit_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid_submit.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cloud_clubs_id_tasks_taskid_submit_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid_submit.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_submit_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_id_tasks_taskid_submit_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid_submit.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_submit_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_id_tasks_taskid_submit_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid_submit.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_submit_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_id_tasks_taskid_submit_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_id_tasks_taskid_submit.id
  http_method = aws_api_gateway_method.cloud_clubs_id_tasks_taskid_submit_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_id_tasks_taskid_submit_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# /cloud_clubs/submissions (GET all submissions)
resource "aws_api_gateway_resource" "cloud_clubs_submissions" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs.id
  path_part   = "submissions"
}

resource "aws_api_gateway_method" "cloud_clubs_submissions_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_submissions.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_submissions_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_submissions.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cloud_clubs_submissions_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_submissions_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_submissions_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_submissions_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_submissions_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# /cloud_clubs/submissions/{submissionId}/review
resource "aws_api_gateway_resource" "cloud_clubs_submissions_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_submissions.id
  path_part   = "{submissionId}"
}

resource "aws_api_gateway_resource" "cloud_clubs_submissions_id_review" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_submissions_id.id
  path_part   = "review"
}

resource "aws_api_gateway_method" "cloud_clubs_submissions_id_review_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_submissions_id_review.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_submissions_id_review_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_submissions_id_review.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cloud_clubs_submissions_id_review_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions_id_review.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_id_review_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_submissions_id_review_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions_id_review.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_id_review_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_submissions_id_review_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions_id_review.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_id_review_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_submissions_id_review_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_submissions_id_review.id
  http_method = aws_api_gateway_method.cloud_clubs_submissions_id_review_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_submissions_id_review_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}


# ==================== GLOBAL TASKS MANAGEMENT ====================

# /cloud_clubs/tasks (global tasks)
resource "aws_api_gateway_resource" "cloud_clubs_tasks" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs.id
  path_part   = "tasks"
}

resource "aws_api_gateway_method" "cloud_clubs_tasks_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_tasks_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_tasks_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cloud_clubs_tasks_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_tasks_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_tasks_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_tasks_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_tasks_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_tasks_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# /cloud_clubs/tasks/{taskId}
resource "aws_api_gateway_resource" "cloud_clubs_tasks_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.cloud_clubs_tasks.id
  path_part   = "{taskId}"
}

resource "aws_api_gateway_method" "cloud_clubs_tasks_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_tasks_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "cloud_clubs_tasks_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "cloud_clubs_tasks_id_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_id_put.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_tasks_id_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_id_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.cloud_clubs_crud.invoke_arn
}

resource "aws_api_gateway_integration" "cloud_clubs_tasks_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_id_options.http_method

  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "cloud_clubs_tasks_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "cloud_clubs_tasks_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.cloud_clubs_tasks_id.id
  http_method = aws_api_gateway_method.cloud_clubs_tasks_id_options.http_method
  status_code = aws_api_gateway_method_response.cloud_clubs_tasks_id_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}
