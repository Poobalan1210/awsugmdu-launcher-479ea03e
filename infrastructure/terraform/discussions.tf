# DynamoDB Table for Discussions
resource "aws_dynamodb_table" "discussions" {
  name           = "${var.project_name}-discussions"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "sprintId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name     = "sprintId-index"
    hash_key = "sprintId"
    range_key = "createdAt"
    projection_type = "ALL"
  }

  tags = {
    Name = "${var.project_name}-discussions-table"
  }
}

# Archive Lambda function
data "archive_file" "discussions_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/discussions-crud"
  output_path = "${path.module}/lambda/discussions-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

# Lambda: Discussions CRUD
resource "aws_lambda_function" "discussions_crud" {
  filename         = data.archive_file.discussions_crud.output_path
  function_name    = "${var.project_name}-discussions-crud"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.discussions_crud.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 30

  environment {
    variables = {
      DISCUSSIONS_TABLE_NAME = aws_dynamodb_table.discussions.name
    }
  }

  tags = {
    Name = "${var.project_name}-discussions-crud"
  }
}

# Update IAM Policy for Lambda to access Discussions DynamoDB table
resource "aws_iam_role_policy" "lambda_discussions_dynamodb" {
  name = "${var.project_name}-lambda-discussions-dynamodb-policy"
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
          aws_dynamodb_table.discussions.arn,
          "${aws_dynamodb_table.discussions.arn}/index/*"
        ]
      }
    ]
  })
}

# API Gateway Resources for Discussions
resource "aws_api_gateway_resource" "discussions" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "discussions"
}

resource "aws_api_gateway_resource" "discussions_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.discussions.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "discussions_id_replies" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.discussions_id.id
  path_part   = "replies"
}

resource "aws_api_gateway_resource" "discussions_id_replies_replyid" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.discussions_id_replies.id
  path_part   = "{replyId}"
}

resource "aws_api_gateway_resource" "discussions_id_replies_like" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.discussions_id_replies.id
  path_part   = "like"
}

resource "aws_api_gateway_resource" "discussions_id_like" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.discussions_id.id
  path_part   = "like"
}

# API Gateway Methods for Discussions
# GET /discussions - List discussions by sprint
resource "aws_api_gateway_method" "discussions_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions.id
  http_method   = "GET"
  authorization = "NONE"
}

# POST /discussions - Create discussion
resource "aws_api_gateway_method" "discussions_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /discussions
resource "aws_api_gateway_method" "discussions_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /discussions/{id} - Get single discussion
resource "aws_api_gateway_method" "discussions_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id.id
  http_method   = "GET"
  authorization = "NONE"
}

# PUT /discussions/{id} - Update discussion
resource "aws_api_gateway_method" "discussions_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id.id
  http_method   = "PUT"
  authorization = "NONE"
}

# DELETE /discussions/{id} - Delete discussion
resource "aws_api_gateway_method" "discussions_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /discussions/{id}
resource "aws_api_gateway_method" "discussions_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /discussions/{id}/replies - Add reply
resource "aws_api_gateway_method" "discussions_id_replies_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_replies.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /discussions/{id}/replies
resource "aws_api_gateway_method" "discussions_id_replies_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_replies.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# PUT /discussions/{id}/replies/{replyId} - Update reply
resource "aws_api_gateway_method" "discussions_id_replies_replyid_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method   = "PUT"
  authorization = "NONE"
}

# DELETE /discussions/{id}/replies/{replyId} - Delete reply
resource "aws_api_gateway_method" "discussions_id_replies_replyid_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /discussions/{id}/replies/{replyId}
resource "aws_api_gateway_method" "discussions_id_replies_replyid_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /discussions/{id}/like - Toggle like on discussion
resource "aws_api_gateway_method" "discussions_id_like_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_like.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /discussions/{id}/like
resource "aws_api_gateway_method" "discussions_id_like_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_like.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /discussions/{id}/replies/like - Toggle like on reply
resource "aws_api_gateway_method" "discussions_id_replies_like_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_replies_like.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /discussions/{id}/replies/like
resource "aws_api_gateway_method" "discussions_id_replies_like_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.discussions_id_replies_like.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# API Gateway Integrations for Discussions
resource "aws_api_gateway_integration" "discussions_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions.id
  http_method = aws_api_gateway_method.discussions_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions.id
  http_method = aws_api_gateway_method.discussions_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions.id
  http_method = aws_api_gateway_method.discussions_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "discussions_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions.id
  http_method = aws_api_gateway_method.discussions_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }

  depends_on = [aws_api_gateway_method.discussions_options]
}

resource "aws_api_gateway_integration_response" "discussions_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions.id
  http_method = aws_api_gateway_method.discussions_options.http_method
  status_code = aws_api_gateway_method_response.discussions_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }

  depends_on = [aws_api_gateway_integration.discussions_options_lambda]
}

resource "aws_api_gateway_integration" "discussions_id_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id.id
  http_method = aws_api_gateway_method.discussions_id_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id.id
  http_method = aws_api_gateway_method.discussions_id_put.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id.id
  http_method = aws_api_gateway_method.discussions_id_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id.id
  http_method = aws_api_gateway_method.discussions_id_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "discussions_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id.id
  http_method = aws_api_gateway_method.discussions_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "discussions_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id.id
  http_method = aws_api_gateway_method.discussions_id_options.http_method
  status_code = aws_api_gateway_method_response.discussions_id_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "discussions_id_replies_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies.id
  http_method = aws_api_gateway_method.discussions_id_replies_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_replies_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies.id
  http_method = aws_api_gateway_method.discussions_id_replies_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "discussions_id_replies_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies.id
  http_method = aws_api_gateway_method.discussions_id_replies_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "discussions_id_replies_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies.id
  http_method = aws_api_gateway_method.discussions_id_replies_options.http_method
  status_code = aws_api_gateway_method_response.discussions_id_replies_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "discussions_id_replies_replyid_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method = aws_api_gateway_method.discussions_id_replies_replyid_put.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_replies_replyid_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method = aws_api_gateway_method.discussions_id_replies_replyid_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_replies_replyid_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method = aws_api_gateway_method.discussions_id_replies_replyid_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "discussions_id_replies_replyid_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method = aws_api_gateway_method.discussions_id_replies_replyid_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "discussions_id_replies_replyid_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_replyid.id
  http_method = aws_api_gateway_method.discussions_id_replies_replyid_options.http_method
  status_code = aws_api_gateway_method_response.discussions_id_replies_replyid_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "discussions_id_like_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_like.id
  http_method = aws_api_gateway_method.discussions_id_like_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_like_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_like.id
  http_method = aws_api_gateway_method.discussions_id_like_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "discussions_id_like_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_like.id
  http_method = aws_api_gateway_method.discussions_id_like_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "discussions_id_like_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_like.id
  http_method = aws_api_gateway_method.discussions_id_like_options.http_method
  status_code = aws_api_gateway_method_response.discussions_id_like_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "discussions_id_replies_like_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_like.id
  http_method = aws_api_gateway_method.discussions_id_replies_like_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.discussions_crud.invoke_arn
}

resource "aws_api_gateway_integration" "discussions_id_replies_like_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_like.id
  http_method = aws_api_gateway_method.discussions_id_replies_like_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "discussions_id_replies_like_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_like.id
  http_method = aws_api_gateway_method.discussions_id_replies_like_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "discussions_id_replies_like_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.discussions_id_replies_like.id
  http_method = aws_api_gateway_method.discussions_id_replies_like_options.http_method
  status_code = aws_api_gateway_method_response.discussions_id_replies_like_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "api_discussions_crud" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.discussions_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
