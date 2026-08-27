# ==========================================
# HACKATHONS
# Standalone recurring program: teams, mentors, resources and submissions.
# Optionally linked to a sprint (hackathon.sprintId) and to meetups
# (meetup.hackathonId + the 'hackathon' meetup type).
#
# One Lambda behind /hackathons/{proxy+} (routes internally, handles its own
# CORS) following the same shape as kironomics.tf, plus three DynamoDB tables.
# ==========================================

# ------------------------------------------
# DYNAMODB TABLES
#
# Teams and submissions are separate tables rather than nested arrays on the
# hackathon item. Sprint already nests sessions/submissions/registeredUsers in a
# single item and is bounded by the 400KB per-item limit; hackathons avoid
# inheriting that ceiling.
# ------------------------------------------

resource "aws_dynamodb_table" "hackathons" {
  name         = "${var.project_name}-hackathons"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "sprintId"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  # Resolves "which hackathons belong to this sprint" for the sprint page
  # cross-link, mirroring the meetups table's sprintId-index.
  global_secondary_index {
    name            = "sprintId-index"
    hash_key        = "sprintId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-hackathons-table"
  }
}

resource "aws_dynamodb_table" "hackathon_teams" {
  name         = "${var.project_name}-hackathon-teams"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "hackathonId"
    type = "S"
  }

  attribute {
    name = "joinCode"
    type = "S"
  }

  global_secondary_index {
    name            = "hackathonId-index"
    hash_key        = "hackathonId"
    projection_type = "ALL"
  }

  # Lets a builder join by share code without scanning the table.
  global_secondary_index {
    name            = "joinCode-index"
    hash_key        = "joinCode"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-hackathon-teams-table"
  }
}

resource "aws_dynamodb_table" "hackathon_submissions" {
  name         = "${var.project_name}-hackathon-submissions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "hackathonId"
    type = "S"
  }

  attribute {
    name = "teamId"
    type = "S"
  }

  global_secondary_index {
    name            = "hackathonId-index"
    hash_key        = "hackathonId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "teamId-index"
    hash_key        = "teamId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-hackathon-submissions-table"
  }
}

# ------------------------------------------
# IAM
# Per-domain inline policy on the shared lambda role, following the pattern in
# kironomics.tf. SES send is needed for team invites and join-request emails.
# ------------------------------------------
resource "aws_iam_role_policy" "lambda_hackathons" {
  name = "${var.project_name}-lambda-hackathons-policy"
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
          aws_dynamodb_table.hackathons.arn,
          "${aws_dynamodb_table.hackathons.arn}/index/*",
          aws_dynamodb_table.hackathon_teams.arn,
          "${aws_dynamodb_table.hackathon_teams.arn}/index/*",
          aws_dynamodb_table.hackathon_submissions.arn,
          "${aws_dynamodb_table.hackathon_submissions.arn}/index/*",
        ]
      },
      {
        # Users: read to resolve the caller's role and look up invitees by email;
        # update to credit points, redeemablePoints and the point-activity trail
        # when a submission is approved (and to reverse them if it's revised).
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          "${aws_dynamodb_table.users.arn}/index/*",
        ]
      },
      {
        # Meetups: read to find events linked to a hackathon, and update only to
        # clear meetup.hackathonId when that hackathon is deleted.
        Effect = "Allow"
        Action = [
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
        ]
        Resource = [aws_dynamodb_table.meetups.arn]
      },
      {
        # Sprints: a hackathon that runs under a sprint mirrors its participants
        # into that sprint's registeredUsers. Read to re-derive the participant
        # count, update to append. No delete, no write to any other attribute.
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
        ]
        Resource = [aws_dynamodb_table.sprints.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
        ]
        Resource = "*"
      },
    ]
  })
}

# ------------------------------------------
# LAMBDA FUNCTION
# ------------------------------------------
data "archive_file" "hackathons_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/hackathons-crud"
  output_path = "${path.module}/lambda/hackathons-crud.zip"
  excludes    = ["*.zip"]
}

resource "aws_lambda_function" "hackathons_crud" {
  filename         = data.archive_file.hackathons_crud.output_path
  function_name    = "${var.project_name}-hackathons-crud"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.hackathons_crud.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30

  environment {
    variables = {
      HACKATHONS_TABLE_NAME            = aws_dynamodb_table.hackathons.name
      HACKATHON_TEAMS_TABLE_NAME       = aws_dynamodb_table.hackathon_teams.name
      HACKATHON_SUBMISSIONS_TABLE_NAME = aws_dynamodb_table.hackathon_submissions.name
      USERS_TABLE_NAME                 = aws_dynamodb_table.users.name
      MEETUPS_TABLE_NAME               = aws_dynamodb_table.meetups.name
      SPRINTS_TABLE_NAME               = aws_dynamodb_table.sprints.name
      SES_FROM_EMAIL                   = "info@awsugmdu.in"
      APP_URL                          = "https://www.awsugmdu.in"
      ADMIN_EMAILS                     = var.admin_emails
    }
  }

  tags = {
    Name = "${var.project_name}-hackathons-crud"
  }
}

resource "aws_cloudwatch_log_group" "hackathons_crud_logs" {
  name              = "/aws/lambda/${aws_lambda_function.hackathons_crud.function_name}"
  retention_in_days = 14
}

# ------------------------------------------
# API GATEWAY: /hackathons and /hackathons/{proxy+}
# A single greedy proxy sends every /hackathons/* request (any method, including
# OPTIONS) to the Lambda, which routes and handles CORS itself.
# ------------------------------------------
resource "aws_api_gateway_resource" "hackathons" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "hackathons"
}

resource "aws_api_gateway_resource" "hackathons_proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.hackathons.id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "hackathons_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.hackathons.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "hackathons_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.hackathons_proxy.id
  http_method   = "ANY"
  authorization = "NONE"

  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_integration" "hackathons_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.hackathons.id
  http_method             = aws_api_gateway_method.hackathons_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.hackathons_crud.invoke_arn
}

resource "aws_api_gateway_integration" "hackathons_proxy_any_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.hackathons_proxy.id
  http_method             = aws_api_gateway_method.hackathons_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.hackathons_crud.invoke_arn
}

resource "aws_lambda_permission" "apigw_hackathons" {
  statement_id  = "AllowAPIGatewayInvokeHackathons"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.hackathons_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ------------------------------------------
# OUTPUTS
# ------------------------------------------
output "lambda_hackathons_crud_arn" {
  value       = aws_lambda_function.hackathons_crud.arn
  description = "ARN of the Hackathons CRUD Lambda function"
}

output "hackathons_table_name" {
  value       = aws_dynamodb_table.hackathons.name
  description = "Name of the Hackathons DynamoDB table"
}

output "hackathon_teams_table_name" {
  value       = aws_dynamodb_table.hackathon_teams.name
  description = "Name of the Hackathon Teams DynamoDB table"
}

output "hackathon_submissions_table_name" {
  value       = aws_dynamodb_table.hackathon_submissions.name
  description = "Name of the Hackathon Submissions DynamoDB table"
}
