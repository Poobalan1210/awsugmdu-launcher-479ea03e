# ─────────────────────────────────────────────────────────────────────────────
# Speaker invitations + Code of Conduct acceptance
#
# Routes (handled by the meetups-crud Lambda):
#   POST   /meetups/{id}/invite-speaker            (organiser only)
#   GET    /meetups/{id}/speaker-invite/{token}    (public lookup)
#   POST   /meetups/{id}/speaker-invite/{token}    (accept / decline; body.action)
#
# Follows the same non-proxy pattern as the other meetups routes in main.tf:
# AWS_PROXY integration for the real methods + a MOCK OPTIONS integration for CORS.
# ─────────────────────────────────────────────────────────────────────────────

# ── Resources ────────────────────────────────────────────────────────────────
resource "aws_api_gateway_resource" "meetups_id_invite_speaker" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetups_id.id
  path_part   = "invite-speaker"
}

resource "aws_api_gateway_resource" "meetups_id_speaker_invite" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetups_id.id
  path_part   = "speaker-invite"
}

resource "aws_api_gateway_resource" "meetups_id_speaker_invite_token" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetups_id_speaker_invite.id
  path_part   = "{token}"
}

# ── invite-speaker: POST + OPTIONS ───────────────────────────────────────────
resource "aws_api_gateway_method" "meetups_id_invite_speaker_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_invite_speaker.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_id_invite_speaker_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_invite_speaker.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "meetups_id_invite_speaker_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_invite_speaker.id
  http_method = aws_api_gateway_method.meetups_id_invite_speaker_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

resource "aws_api_gateway_integration" "meetups_id_invite_speaker_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_invite_speaker.id
  http_method = aws_api_gateway_method.meetups_id_invite_speaker_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "meetups_id_invite_speaker_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_invite_speaker.id
  http_method = aws_api_gateway_method.meetups_id_invite_speaker_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "meetups_id_invite_speaker_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_invite_speaker.id
  http_method = aws_api_gateway_method.meetups_id_invite_speaker_options.http_method
  status_code = aws_api_gateway_method_response.meetups_id_invite_speaker_options_200.status_code

  depends_on = [aws_api_gateway_integration.meetups_id_invite_speaker_options_lambda]

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# ── speaker-invite/{token}: GET + POST + OPTIONS ─────────────────────────────
resource "aws_api_gateway_method" "meetups_id_speaker_invite_token_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_id_speaker_invite_token_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_id_speaker_invite_token_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "meetups_id_speaker_invite_token_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method = aws_api_gateway_method.meetups_id_speaker_invite_token_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

resource "aws_api_gateway_integration" "meetups_id_speaker_invite_token_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method = aws_api_gateway_method.meetups_id_speaker_invite_token_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

resource "aws_api_gateway_integration" "meetups_id_speaker_invite_token_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method = aws_api_gateway_method.meetups_id_speaker_invite_token_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "meetups_id_speaker_invite_token_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method = aws_api_gateway_method.meetups_id_speaker_invite_token_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "meetups_id_speaker_invite_token_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_id_speaker_invite_token.id
  http_method = aws_api_gateway_method.meetups_id_speaker_invite_token_options.http_method
  status_code = aws_api_gateway_method_response.meetups_id_speaker_invite_token_options_200.status_code

  depends_on = [aws_api_gateway_integration.meetups_id_speaker_invite_token_options_lambda]

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}
