# =====================================================
# Meetup Feedback (post-event self-service attendance)
# =====================================================
#
# Adds:
#   * DynamoDB table awsug-meetup-feedback (with GSIs by meetupId / userId)
#   * API Gateway routes under existing /meetups/{id}:
#       POST   /meetups/{id}/feedback
#       GET    /meetups/{id}/feedback
#       GET    /meetups/{id}/feedback/me
#       PATCH  /meetups/{id}/feedback-settings
#     plus their OPTIONS (CORS) methods.
#   * IAM permission grant for the existing meetups-crud Lambda to access
#     the new table.
#   * Wires MEETUP_FEEDBACK_TABLE_NAME into the Lambda's environment.
#
# This file is fully additive - it does not modify any existing resource
# structure beyond extending the meetups-crud Lambda environment and
# attaching one new IAM policy. Existing meetups, points, and attendance
# flows are unchanged.

# -----------------------------------------------------
# DynamoDB table
# -----------------------------------------------------
resource "aws_dynamodb_table" "meetup_feedback" {
  name         = "${var.project_name}-meetup-feedback"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "meetupId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "meetupId-index"
    hash_key        = "meetupId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-meetup-feedback-table"
  }
}

# -----------------------------------------------------
# IAM: allow meetups-crud Lambda to access the new table
# (Adds an additional inline policy on the existing role.)
# -----------------------------------------------------
resource "aws_iam_role_policy" "lambda_meetup_feedback" {
  name = "${var.project_name}-lambda-meetup-feedback-policy"
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
          aws_dynamodb_table.meetup_feedback.arn,
          "${aws_dynamodb_table.meetup_feedback.arn}/index/*"
        ]
      }
    ]
  })
}

# -----------------------------------------------------
# API Gateway resources
# -----------------------------------------------------
resource "aws_api_gateway_resource" "meetups_id_feedback" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetups_id.id
  path_part   = "feedback"
}

resource "aws_api_gateway_resource" "meetups_id_feedback_me" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetups_id_feedback.id
  path_part   = "me"
}

resource "aws_api_gateway_resource" "meetups_id_feedback_settings" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetups_id.id
  path_part   = "feedback-settings"
}

# -----------------------------------------------------
# Methods - /meetups/{id}/feedback (POST + GET + OPTIONS)
# -----------------------------------------------------
resource "aws_api_gateway_method" "meetups_id_feedback_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_feedback.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_id_feedback_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_feedback.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_id_feedback_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_feedback.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# -----------------------------------------------------
# Methods - /meetups/{id}/feedback/me (GET + OPTIONS)
# -----------------------------------------------------
resource "aws_api_gateway_method" "meetups_id_feedback_me_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_feedback_me.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_id_feedback_me_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_feedback_me.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# -----------------------------------------------------
# Methods - /meetups/{id}/feedback-settings (PATCH + OPTIONS)
# -----------------------------------------------------
resource "aws_api_gateway_method" "meetups_id_feedback_settings_patch" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_feedback_settings.id
  http_method   = "PATCH"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_id_feedback_settings_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_feedback_settings.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# -----------------------------------------------------
# Integrations - lambda
# -----------------------------------------------------
resource "aws_api_gateway_integration" "meetups_id_feedback_post_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.meetups_id_feedback.id
  http_method             = aws_api_gateway_method.meetups_id_feedback_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

resource "aws_api_gateway_integration" "meetups_id_feedback_get_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.meetups_id_feedback.id
  http_method             = aws_api_gateway_method.meetups_id_feedback_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

resource "aws_api_gateway_integration" "meetups_id_feedback_me_get_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.meetups_id_feedback_me.id
  http_method             = aws_api_gateway_method.meetups_id_feedback_me_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

resource "aws_api_gateway_integration" "meetups_id_feedback_settings_patch_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.meetups_id_feedback_settings.id
  http_method             = aws_api_gateway_method.meetups_id_feedback_settings_patch.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

# -----------------------------------------------------
# Integrations - CORS / OPTIONS (mock)
# -----------------------------------------------------
resource "aws_api_gateway_integration" "meetups_id_feedback_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback.id
  http_method = aws_api_gateway_method.meetups_id_feedback_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "meetups_id_feedback_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback.id
  http_method = aws_api_gateway_method.meetups_id_feedback_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "meetups_id_feedback_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback.id
  http_method = aws_api_gateway_method.meetups_id_feedback_options.http_method
  status_code = aws_api_gateway_method_response.meetups_id_feedback_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.meetups_id_feedback_options_mock]
}

resource "aws_api_gateway_integration" "meetups_id_feedback_me_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback_me.id
  http_method = aws_api_gateway_method.meetups_id_feedback_me_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "meetups_id_feedback_me_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback_me.id
  http_method = aws_api_gateway_method.meetups_id_feedback_me_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "meetups_id_feedback_me_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback_me.id
  http_method = aws_api_gateway_method.meetups_id_feedback_me_options.http_method
  status_code = aws_api_gateway_method_response.meetups_id_feedback_me_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.meetups_id_feedback_me_options_mock]
}

resource "aws_api_gateway_integration" "meetups_id_feedback_settings_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback_settings.id
  http_method = aws_api_gateway_method.meetups_id_feedback_settings_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "meetups_id_feedback_settings_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback_settings.id
  http_method = aws_api_gateway_method.meetups_id_feedback_settings_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "meetups_id_feedback_settings_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_feedback_settings.id
  http_method = aws_api_gateway_method.meetups_id_feedback_settings_options.http_method
  status_code = aws_api_gateway_method_response.meetups_id_feedback_settings_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.meetups_id_feedback_settings_options_mock]
}
