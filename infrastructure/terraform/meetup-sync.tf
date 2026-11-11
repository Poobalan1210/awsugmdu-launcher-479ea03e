# POST /meetups/sync-meetup — "Sync from Meetup" in the admin console.
# Creates draft meetups for Meetup.com events not yet on the platform
# (lambda/meetups-crud/meetup-sync.js). A static path segment takes precedence
# over the sibling /meetups/{id}, so no meetup id can collide with it.

resource "aws_api_gateway_resource" "meetups_sync_meetup" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.meetups.id
  path_part   = "sync-meetup"
}

resource "aws_api_gateway_method" "meetups_sync_meetup_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_sync_meetup.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "meetups_sync_meetup_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.meetups_sync_meetup.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "meetups_sync_meetup_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_sync_meetup.id
  http_method = aws_api_gateway_method.meetups_sync_meetup_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.meetups_crud.invoke_arn
}

resource "aws_api_gateway_integration" "meetups_sync_meetup_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_sync_meetup.id
  http_method = aws_api_gateway_method.meetups_sync_meetup_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "meetups_sync_meetup_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_sync_meetup.id
  http_method = aws_api_gateway_method.meetups_sync_meetup_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "meetups_sync_meetup_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.meetups_sync_meetup.id
  http_method = aws_api_gateway_method.meetups_sync_meetup_options.http_method
  status_code = aws_api_gateway_method_response.meetups_sync_meetup_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }

  depends_on = [aws_api_gateway_integration.meetups_sync_meetup_options_lambda]
}
