# DynamoDB Table for Certification Groups
resource "aws_dynamodb_table" "certification_groups" {
  name           = "${var.project_name}-certification-groups"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "level"
    type = "S"
  }

  global_secondary_index {
    name     = "level-index"
    hash_key = "level"
    projection_type = "ALL"
  }

  tags = {
    Name = "${var.project_name}-certification-groups-table"
  }
}

# Archive Lambda function
data "archive_file" "certifications_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/certifications-crud"
  output_path = "${path.module}/lambda/certifications-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

# Lambda: Certifications CRUD
resource "aws_lambda_function" "certifications_crud" {
  filename         = data.archive_file.certifications_crud.output_path
  function_name    = "${var.project_name}-certifications-crud"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.certifications_crud.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 30

  environment {
    variables = {
      CERTIFICATION_GROUPS_TABLE_NAME = aws_dynamodb_table.certification_groups.name
    }
  }

  tags = {
    Name = "${var.project_name}-certifications-crud"
  }
}

# Update IAM Policy for Lambda to access Certification Groups DynamoDB table
resource "aws_iam_role_policy" "lambda_certifications_dynamodb" {
  name = "${var.project_name}-lambda-certifications-dynamodb-policy"
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
          aws_dynamodb_table.certification_groups.arn,
          "${aws_dynamodb_table.certification_groups.arn}/index/*"
        ]
      }
    ]
  })
}

# API Gateway Resources for Certification Groups
resource "aws_api_gateway_resource" "certification_groups" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "certification-groups"
}

resource "aws_api_gateway_resource" "certification_groups_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "certification_groups_id_join" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id.id
  path_part   = "join"
}

resource "aws_api_gateway_resource" "certification_groups_id_leave" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id.id
  path_part   = "leave"
}

resource "aws_api_gateway_resource" "certification_groups_id_messages" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id.id
  path_part   = "messages"
}

resource "aws_api_gateway_resource" "certification_groups_id_messages_messageid" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id_messages.id
  path_part   = "{messageId}"
}

resource "aws_api_gateway_resource" "certification_groups_id_messages_messageid_like" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  path_part   = "like"
}

resource "aws_api_gateway_resource" "certification_groups_id_messages_messageid_replies" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  path_part   = "replies"
}

resource "aws_api_gateway_resource" "certification_groups_id_messages_messageid_replies_replyid" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies.id
  path_part   = "{replyId}"
}

resource "aws_api_gateway_resource" "certification_groups_id_messages_messageid_replies_replyid_like" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  path_part   = "like"
}

resource "aws_api_gateway_resource" "certification_groups_id_sessions" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id.id
  path_part   = "sessions"
}

resource "aws_api_gateway_resource" "certification_groups_id_sessions_sessionid" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.certification_groups_id_sessions.id
  path_part   = "{sessionId}"
}

# API Gateway Methods for Certification Groups
# GET /certification-groups - List all groups
resource "aws_api_gateway_method" "certification_groups_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups.id
  http_method   = "GET"
  authorization = "NONE"
}

# POST /certification-groups - Create group
resource "aws_api_gateway_method" "certification_groups_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups
resource "aws_api_gateway_method" "certification_groups_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /certification-groups/{id} - Get single group
resource "aws_api_gateway_method" "certification_groups_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id.id
  http_method   = "GET"
  authorization = "NONE"
}

# PUT /certification-groups/{id} - Update group
resource "aws_api_gateway_method" "certification_groups_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id.id
  http_method   = "PUT"
  authorization = "NONE"
}

# DELETE /certification-groups/{id} - Delete group
resource "aws_api_gateway_method" "certification_groups_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}
resource "aws_api_gateway_method" "certification_groups_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /certification-groups/{id}/join - Join group
resource "aws_api_gateway_method" "certification_groups_id_join_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_join.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/join
resource "aws_api_gateway_method" "certification_groups_id_join_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_join.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /certification-groups/{id}/leave - Leave group
resource "aws_api_gateway_method" "certification_groups_id_leave_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_leave.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/leave
resource "aws_api_gateway_method" "certification_groups_id_leave_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_leave.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /certification-groups/{id}/messages - Post message
resource "aws_api_gateway_method" "certification_groups_id_messages_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/messages
resource "aws_api_gateway_method" "certification_groups_id_messages_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# PUT /certification-groups/{id}/messages/{messageId} - Update message
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method   = "PUT"
  authorization = "NONE"
}

# DELETE /certification-groups/{id}/messages/{messageId} - Delete message
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/messages/{messageId}
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /certification-groups/{id}/messages/{messageId}/like - Like message
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_like_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_like.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/messages/{messageId}/like
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_like_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_like.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /certification-groups/{id}/messages/{messageId}/replies - Add reply
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_replies_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/messages/{messageId}/replies
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_replies_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# PUT /certification-groups/{id}/messages/{messageId}/replies/{replyId} - Update reply
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_replies_replyid_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method   = "PUT"
  authorization = "NONE"
}

# DELETE /certification-groups/{id}/messages/{messageId}/replies/{replyId} - Delete reply
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_replies_replyid_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/messages/{messageId}/replies/{replyId}
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_replies_replyid_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /certification-groups/{id}/messages/{messageId}/replies/{replyId}/like - Like reply
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_replies_replyid_like_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid_like.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/messages/{messageId}/replies/{replyId}/like
resource "aws_api_gateway_method" "certification_groups_id_messages_messageid_replies_replyid_like_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid_like.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /certification-groups/{id}/sessions - Create session
resource "aws_api_gateway_method" "certification_groups_id_sessions_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_sessions.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/sessions
resource "aws_api_gateway_method" "certification_groups_id_sessions_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_sessions.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# PUT /certification-groups/{id}/sessions/{sessionId} - Update session
resource "aws_api_gateway_method" "certification_groups_id_sessions_sessionid_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method   = "PUT"
  authorization = "NONE"
}

# DELETE /certification-groups/{id}/sessions/{sessionId} - Delete session
resource "aws_api_gateway_method" "certification_groups_id_sessions_sessionid_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /certification-groups/{id}/sessions/{sessionId}
resource "aws_api_gateway_method" "certification_groups_id_sessions_sessionid_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}
