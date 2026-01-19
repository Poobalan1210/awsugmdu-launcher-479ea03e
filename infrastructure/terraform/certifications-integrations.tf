# API Gateway Integrations for Certification Groups

# Helper function for CORS OPTIONS responses
resource "aws_api_gateway_integration" "certification_groups_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups.id
  http_method = aws_api_gateway_method.certification_groups_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups.id
  http_method = aws_api_gateway_method.certification_groups_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups.id
  http_method = aws_api_gateway_method.certification_groups_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# GET /certification-groups
resource "aws_api_gateway_integration" "certification_groups_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups.id
  http_method = aws_api_gateway_method.certification_groups_get.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups
resource "aws_api_gateway_integration" "certification_groups_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups.id
  http_method = aws_api_gateway_method.certification_groups_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# GET /certification-groups/{id}
resource "aws_api_gateway_integration" "certification_groups_id_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id.id
  http_method = aws_api_gateway_method.certification_groups_id_get.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# PUT /certification-groups/{id}
resource "aws_api_gateway_integration" "certification_groups_id_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id.id
  http_method = aws_api_gateway_method.certification_groups_id_put.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# DELETE /certification-groups/{id}
resource "aws_api_gateway_integration" "certification_groups_id_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id.id
  http_method = aws_api_gateway_method.certification_groups_id_delete.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups/{id}/join
resource "aws_api_gateway_integration" "certification_groups_id_join_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_join.id
  http_method = aws_api_gateway_method.certification_groups_id_join_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups/{id}/leave
resource "aws_api_gateway_integration" "certification_groups_id_leave_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_leave.id
  http_method = aws_api_gateway_method.certification_groups_id_leave_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups/{id}/messages
resource "aws_api_gateway_integration" "certification_groups_id_messages_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# PUT /certification-groups/{id}/messages/{messageId}
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_put.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# DELETE /certification-groups/{id}/messages/{messageId}
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_delete.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups/{id}/messages/{messageId}/like
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_like_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_like_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups/{id}/messages/{messageId}/replies
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_replies_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# PUT /certification-groups/{id}/messages/{messageId}/replies/{replyId}
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_replies_replyid_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_put.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# DELETE /certification-groups/{id}/messages/{messageId}/replies/{replyId}
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_replies_replyid_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_delete.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups/{id}/messages/{messageId}/replies/{replyId}/like
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_replies_replyid_like_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_like_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# POST /certification-groups/{id}/sessions
resource "aws_api_gateway_integration" "certification_groups_id_sessions_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_post.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# PUT /certification-groups/{id}/sessions/{sessionId}
resource "aws_api_gateway_integration" "certification_groups_id_sessions_sessionid_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_sessionid_put.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# DELETE /certification-groups/{id}/sessions/{sessionId}
resource "aws_api_gateway_integration" "certification_groups_id_sessions_sessionid_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_sessionid_delete.http_method
  integration_http_method = "POST"
  type = "AWS_PROXY"
  uri = aws_lambda_function.certifications_crud.invoke_arn
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "api_certifications_crud" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.certifications_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}


# OPTIONS method integrations for all endpoints
resource "aws_api_gateway_integration" "certification_groups_id_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id.id
  http_method = aws_api_gateway_method.certification_groups_id_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id.id
  http_method = aws_api_gateway_method.certification_groups_id_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id.id
  http_method = aws_api_gateway_method.certification_groups_id_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
  depends_on = [aws_api_gateway_integration.certification_groups_id_options_lambda]
}

# OPTIONS for join endpoint
resource "aws_api_gateway_integration" "certification_groups_id_join_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_join.id
  http_method = aws_api_gateway_method.certification_groups_id_join_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_join_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_join.id
  http_method = aws_api_gateway_method.certification_groups_id_join_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_join_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_join.id
  http_method = aws_api_gateway_method.certification_groups_id_join_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_join_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for leave endpoint
resource "aws_api_gateway_integration" "certification_groups_id_leave_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_leave.id
  http_method = aws_api_gateway_method.certification_groups_id_leave_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_leave_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_leave.id
  http_method = aws_api_gateway_method.certification_groups_id_leave_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_leave_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_leave.id
  http_method = aws_api_gateway_method.certification_groups_id_leave_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_leave_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for messages endpoint
resource "aws_api_gateway_integration" "certification_groups_id_messages_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_messages_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_messages_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_messages_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for messages/{messageId}
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_messages_messageid_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_messages_messageid_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_messages_messageid_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for like endpoint
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_like_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_like_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_messages_messageid_like_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_like_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_messages_messageid_like_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_like_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_messages_messageid_like_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for replies endpoint
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_replies_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_messages_messageid_replies_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_messages_messageid_replies_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_messages_messageid_replies_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for replies/{replyId}
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_replies_replyid_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_messages_messageid_replies_replyid_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_messages_messageid_replies_replyid_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_messages_messageid_replies_replyid_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for reply like endpoint
resource "aws_api_gateway_integration" "certification_groups_id_messages_messageid_replies_replyid_like_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_like_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_messages_messageid_replies_replyid_like_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_like_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_messages_messageid_replies_replyid_like_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_messages_messageid_replies_replyid_like.id
  http_method = aws_api_gateway_method.certification_groups_id_messages_messageid_replies_replyid_like_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_messages_messageid_replies_replyid_like_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for sessions endpoint
resource "aws_api_gateway_integration" "certification_groups_id_sessions_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_sessions_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_sessions_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_sessions_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# OPTIONS for sessions/{sessionId}
resource "aws_api_gateway_integration" "certification_groups_id_sessions_sessionid_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_sessionid_options.http_method
  type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "certification_groups_id_sessions_sessionid_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_sessionid_options.http_method
  status_code = "200"
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "certification_groups_id_sessions_sessionid_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.certification_groups_id_sessions_sessionid.id
  http_method = aws_api_gateway_method.certification_groups_id_sessions_sessionid_options.http_method
  status_code = aws_api_gateway_method_response.certification_groups_id_sessions_sessionid_options_200.status_code
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}
