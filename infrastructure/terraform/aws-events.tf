# ==========================================
# DYNAMODB TABLES
# ==========================================

resource "aws_dynamodb_table" "aws_events" {
  name         = "AWSEvents_${var.environment}"
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

resource "aws_dynamodb_table" "aws_event_submissions" {
  name         = "AWSEventSubmissions_${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "eventId"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name               = "EventIdIndex"
    hash_key           = "eventId"
    projection_type    = "ALL"
  }

  global_secondary_index {
    name               = "StatusIndex"
    hash_key           = "status"
    projection_type    = "ALL"
  }

  tags = {
    Environment = var.environment
    Project     = "AWSUGMDU"
  }
}

# ==========================================
# LAMBDA FUNCTION
# ==========================================

data "archive_file" "aws_events_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/aws-events-crud"
  output_path = "${path.module}/lambda/aws-events-crud.zip"
}

resource "aws_lambda_function" "aws_events_crud" {
  filename         = data.archive_file.aws_events_crud.output_path
  function_name    = "AWSEventsCRUD_${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  source_code_hash = data.archive_file.aws_events_crud.output_base64sha256

  environment {
    variables = {
      AWS_EVENTS_TABLE_NAME           = aws_dynamodb_table.aws_events.name
      AWS_EVENT_SUBMISSIONS_TABLE_NAME = aws_dynamodb_table.aws_event_submissions.name
      USERS_TABLE_NAME                = aws_dynamodb_table.users.name
    }
  }
}

resource "aws_cloudwatch_log_group" "aws_events_crud_logs" {
  name              = "/aws/lambda/${aws_lambda_function.aws_events_crud.function_name}"
  retention_in_days = 14
}

# ==========================================
# IAM PERMISSIONS
# ==========================================

resource "aws_iam_policy" "aws_events_dynamodb_access" {
  name        = "AWSEventsDynamoDBAccess_${var.environment}"
  description = "IAM policy for AWS Events Lambda to access DynamoDB tables"

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
          aws_dynamodb_table.aws_events.arn,
          aws_dynamodb_table.aws_event_submissions.arn,
          "${aws_dynamodb_table.aws_event_submissions.arn}/index/*",
          aws_dynamodb_table.users.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "aws_events_dynamodb_attach" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = aws_iam_policy.aws_events_dynamodb_access.arn
}

# ==========================================
# API GATEWAY RESOURCES & METHODS
# ==========================================

# /aws-events
resource "aws_api_gateway_resource" "aws_events" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "aws-events"
}

resource "aws_api_gateway_method" "aws_events_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "aws_events_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events.id
  http_method   = "POST"
  authorization = "NONE"
}

# CORS for /aws-events
resource "aws_api_gateway_method" "aws_events_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# /aws-events/{id}
resource "aws_api_gateway_resource" "aws_events_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.aws_events.id
  path_part   = "{id}"
}

resource "aws_api_gateway_method" "aws_events_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_id.id
  http_method   = "PUT"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "aws_events_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# CORS for /aws-events/{id}
resource "aws_api_gateway_method" "aws_events_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# /aws-events/{id}/submissions
resource "aws_api_gateway_resource" "aws_events_id_submissions" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.aws_events_id.id
  path_part   = "submissions"
}

resource "aws_api_gateway_method" "aws_events_id_submissions_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_id_submissions.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "aws_events_id_submissions_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_id_submissions.id
  http_method   = "POST"
  authorization = "NONE"
}

# CORS for /aws-events/{id}/submissions
resource "aws_api_gateway_method" "aws_events_id_submissions_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_id_submissions.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# /aws-events/submissions
resource "aws_api_gateway_resource" "aws_events_submissions_root" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.aws_events.id
  path_part   = "submissions"
}

# /aws-events/submissions/pending
resource "aws_api_gateway_resource" "aws_events_submissions_pending" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.aws_events_submissions_root.id
  path_part   = "pending"
}

resource "aws_api_gateway_method" "aws_events_submissions_pending_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_submissions_pending.id
  http_method   = "GET"
  authorization = "NONE"
}

# CORS for /aws-events/submissions/pending
resource "aws_api_gateway_method" "aws_events_submissions_pending_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_submissions_pending.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# /aws-events/submissions/{id}
resource "aws_api_gateway_resource" "aws_events_submissions_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.aws_events_submissions_root.id
  path_part   = "{id}"
}

# /aws-events/submissions/{id}/review
resource "aws_api_gateway_resource" "aws_events_submissions_review" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.aws_events_submissions_id.id
  path_part   = "review"
}

resource "aws_api_gateway_method" "aws_events_submissions_review_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_submissions_review.id
  http_method   = "POST"
  authorization = "NONE"
}

# CORS for /aws-events/submissions/{id}/review
resource "aws_api_gateway_method" "aws_events_submissions_review_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.aws_events_submissions_review.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# ==========================================
# API GATEWAY INTEGRATIONS
# ==========================================

# Macros for defining integrations easily
locals {
  aws_events_integrations = [
    {
      resource_id = aws_api_gateway_resource.aws_events.id
      http_method = aws_api_gateway_method.aws_events_get.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events.id
      http_method = aws_api_gateway_method.aws_events_post.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_id.id
      http_method = aws_api_gateway_method.aws_events_id_put.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_id.id
      http_method = aws_api_gateway_method.aws_events_id_delete.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_id_submissions.id
      http_method = aws_api_gateway_method.aws_events_id_submissions_get.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_id_submissions.id
      http_method = aws_api_gateway_method.aws_events_id_submissions_post.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_submissions_pending.id
      http_method = aws_api_gateway_method.aws_events_submissions_pending_get.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_submissions_review.id
      http_method = aws_api_gateway_method.aws_events_submissions_review_post.http_method
    }
  ]

  aws_events_options_integrations = [
    {
      resource_id = aws_api_gateway_resource.aws_events.id
      http_method = aws_api_gateway_method.aws_events_options.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_id.id
      http_method = aws_api_gateway_method.aws_events_id_options.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_id_submissions.id
      http_method = aws_api_gateway_method.aws_events_id_submissions_options.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_submissions_pending.id
      http_method = aws_api_gateway_method.aws_events_submissions_pending_options.http_method
    },
    {
      resource_id = aws_api_gateway_resource.aws_events_submissions_review.id
      http_method = aws_api_gateway_method.aws_events_submissions_review_options.http_method
    }
  ]
}

resource "aws_api_gateway_integration" "aws_events_lambda" {
  count                   = length(local.aws_events_integrations)
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = local.aws_events_integrations[count.index].resource_id
  http_method             = local.aws_events_integrations[count.index].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.aws_events_crud.invoke_arn
}

resource "aws_api_gateway_integration" "aws_events_options" {
  count       = length(local.aws_events_options_integrations)
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = local.aws_events_options_integrations[count.index].resource_id
  http_method = local.aws_events_options_integrations[count.index].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "aws_events_options_200" {
  count       = length(local.aws_events_options_integrations)
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = local.aws_events_options_integrations[count.index].resource_id
  http_method = local.aws_events_options_integrations[count.index].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "aws_events_options" {
  count       = length(local.aws_events_options_integrations)
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = local.aws_events_options_integrations[count.index].resource_id
  http_method = local.aws_events_options_integrations[count.index].http_method
  status_code = aws_api_gateway_method_response.aws_events_options_200[count.index].status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS,POST,PUT,DELETE'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
  
  depends_on = [aws_api_gateway_integration.aws_events_options]
}

resource "aws_lambda_permission" "apigw_aws_events" {
  statement_id  = "AllowAPIGatewayInvokeAWSEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.aws_events_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
