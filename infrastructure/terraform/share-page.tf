# Share Page Lambda - serves dynamic OG meta tags for social sharing

data "archive_file" "share_page" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/share-page"
  output_path = "${path.module}/lambda/share-page.zip"
  excludes    = ["*.zip"]
}

resource "aws_lambda_function" "share_page" {
  filename         = data.archive_file.share_page.output_path
  function_name    = "${var.project_name}-share-page"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.share_page.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 10

  environment {
    variables = {
      SITE_URL = "https://awsugmdu.in"
    }
  }

  tags = {
    Name = "${var.project_name}-share-page"
  }
}

# API Gateway resource: /share
resource "aws_api_gateway_resource" "share" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "share"
}

# GET /share
resource "aws_api_gateway_method" "share_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.share.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS /share
resource "aws_api_gateway_method" "share_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.share.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /share integration
resource "aws_api_gateway_integration" "share_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.share.id
  http_method = aws_api_gateway_method.share_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.share_page.invoke_arn
}

# OPTIONS /share MOCK integration
resource "aws_api_gateway_integration" "share_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.share.id
  http_method = aws_api_gateway_method.share_options.http_method

  type = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "share_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.share.id
  http_method = aws_api_gateway_method.share_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "share_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.share.id
  http_method = aws_api_gateway_method.share_options.http_method
  status_code = aws_api_gateway_method_response.share_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "share_page_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.share_page.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
