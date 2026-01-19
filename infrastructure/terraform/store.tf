# DynamoDB Table for Store Items
resource "aws_dynamodb_table" "store_items" {
  name           = "${var.project_name}-store-items"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "category"
    type = "S"
  }

  global_secondary_index {
    name     = "category-index"
    hash_key = "category"
    projection_type = "ALL"
  }

  tags = {
    Name = "${var.project_name}-store-items-table"
  }
}

# DynamoDB Table for Orders
resource "aws_dynamodb_table" "orders" {
  name           = "${var.project_name}-orders"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name     = "userId-index"
    hash_key = "userId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name     = "status-index"
    hash_key = "status"
    projection_type = "ALL"
  }

  tags = {
    Name = "${var.project_name}-orders-table"
  }
}

# Archive Lambda function
data "archive_file" "store_crud" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/store-crud"
  output_path = "${path.module}/lambda/store-crud.zip"
  excludes    = ["node_modules", "*.zip"]
}

# Lambda: Store CRUD
resource "aws_lambda_function" "store_crud" {
  filename         = data.archive_file.store_crud.output_path
  function_name    = "${var.project_name}-store-crud"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.store_crud.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 30

  environment {
    variables = {
      STORE_ITEMS_TABLE_NAME = aws_dynamodb_table.store_items.name
      ORDERS_TABLE_NAME      = aws_dynamodb_table.orders.name
      USERS_TABLE_NAME       = aws_dynamodb_table.users.name
      SES_FROM_EMAIL         = "your-new-email@example.com"
    }
  }

  tags = {
    Name = "${var.project_name}-store-crud"
  }
}

# Update IAM Policy for Lambda to access Store DynamoDB tables and SES
resource "aws_iam_role_policy" "lambda_store_dynamodb" {
  name = "${var.project_name}-lambda-store-dynamodb-policy"
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
          aws_dynamodb_table.store_items.arn,
          "${aws_dynamodb_table.store_items.arn}/index/*",
          aws_dynamodb_table.orders.arn,
          "${aws_dynamodb_table.orders.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

# API Gateway Resources for Store
resource "aws_api_gateway_resource" "store" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "store"
}

resource "aws_api_gateway_resource" "store_items" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.store.id
  path_part   = "items"
}

resource "aws_api_gateway_resource" "store_items_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.store_items.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "store_items_id_redeem" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.store_items_id.id
  path_part   = "redeem"
}

resource "aws_api_gateway_resource" "store_orders" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.store.id
  path_part   = "orders"
}

resource "aws_api_gateway_resource" "store_orders_id" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.store_orders.id
  path_part   = "{id}"
}

resource "aws_api_gateway_resource" "store_orders_id_status" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.store_orders_id.id
  path_part   = "status"
}

resource "aws_api_gateway_resource" "store_orders_id_assign_code" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.store_orders_id.id
  path_part   = "assign-code"
}

# API Gateway Methods for Store Items
# GET /store/items - List all items
resource "aws_api_gateway_method" "store_items_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items.id
  http_method   = "GET"
  authorization = "NONE"
}

# POST /store/items - Create item (admin)
resource "aws_api_gateway_method" "store_items_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /store/items
resource "aws_api_gateway_method" "store_items_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /store/items/{id} - Get single item
resource "aws_api_gateway_method" "store_items_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items_id.id
  http_method   = "GET"
  authorization = "NONE"
}

# PUT /store/items/{id} - Update item (admin)
resource "aws_api_gateway_method" "store_items_id_put" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items_id.id
  http_method   = "PUT"
  authorization = "NONE"
}

# DELETE /store/items/{id} - Delete item (admin)
resource "aws_api_gateway_method" "store_items_id_delete" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items_id.id
  http_method   = "DELETE"
  authorization = "NONE"
}

# OPTIONS /store/items/{id}
resource "aws_api_gateway_method" "store_items_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# POST /store/items/{id}/redeem - Redeem item
resource "aws_api_gateway_method" "store_items_id_redeem_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items_id_redeem.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /store/items/{id}/redeem
resource "aws_api_gateway_method" "store_items_id_redeem_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_items_id_redeem.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# API Gateway Methods for Orders
# GET /store/orders - List orders
resource "aws_api_gateway_method" "store_orders_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders.id
  http_method   = "GET"
  authorization = "NONE"
}

# POST /store/orders - Create order
resource "aws_api_gateway_method" "store_orders_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders.id
  http_method   = "POST"
  authorization = "NONE"
}

# OPTIONS /store/orders
resource "aws_api_gateway_method" "store_orders_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GET /store/orders/{id} - Get single order
resource "aws_api_gateway_method" "store_orders_id_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders_id.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS /store/orders/{id}
resource "aws_api_gateway_method" "store_orders_id_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders_id.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# PATCH /store/orders/{id}/status - Update order status
resource "aws_api_gateway_method" "store_orders_id_status_patch" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders_id_status.id
  http_method   = "PATCH"
  authorization = "NONE"
}

# OPTIONS /store/orders/{id}/status
resource "aws_api_gateway_method" "store_orders_id_status_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders_id_status.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# PATCH /store/orders/{id}/assign-code - Assign code to order
resource "aws_api_gateway_method" "store_orders_id_assign_code_patch" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders_id_assign_code.id
  http_method   = "PATCH"
  authorization = "NONE"
}

# OPTIONS /store/orders/{id}/assign-code
resource "aws_api_gateway_method" "store_orders_id_assign_code_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.store_orders_id_assign_code.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# API Gateway Integrations for Store Items
resource "aws_api_gateway_integration" "store_items_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items.id
  http_method = aws_api_gateway_method.store_items_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_items_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items.id
  http_method = aws_api_gateway_method.store_items_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_items_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items.id
  http_method = aws_api_gateway_method.store_items_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "store_items_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items.id
  http_method = aws_api_gateway_method.store_items_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "store_items_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items.id
  http_method = aws_api_gateway_method.store_items_options.http_method
  status_code = aws_api_gateway_method_response.store_items_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "store_items_id_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id.id
  http_method = aws_api_gateway_method.store_items_id_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_items_id_put_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id.id
  http_method = aws_api_gateway_method.store_items_id_put.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_items_id_delete_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id.id
  http_method = aws_api_gateway_method.store_items_id_delete.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_items_id_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id.id
  http_method = aws_api_gateway_method.store_items_id_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "store_items_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id.id
  http_method = aws_api_gateway_method.store_items_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "store_items_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id.id
  http_method = aws_api_gateway_method.store_items_id_options.http_method
  status_code = aws_api_gateway_method_response.store_items_id_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "store_items_id_redeem_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id_redeem.id
  http_method = aws_api_gateway_method.store_items_id_redeem_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_items_id_redeem_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id_redeem.id
  http_method = aws_api_gateway_method.store_items_id_redeem_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "store_items_id_redeem_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id_redeem.id
  http_method = aws_api_gateway_method.store_items_id_redeem_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "store_items_id_redeem_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_items_id_redeem.id
  http_method = aws_api_gateway_method.store_items_id_redeem_options.http_method
  status_code = aws_api_gateway_method_response.store_items_id_redeem_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# API Gateway Integrations for Orders
resource "aws_api_gateway_integration" "store_orders_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders.id
  http_method = aws_api_gateway_method.store_orders_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_orders_post_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders.id
  http_method = aws_api_gateway_method.store_orders_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_orders_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders.id
  http_method = aws_api_gateway_method.store_orders_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "store_orders_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders.id
  http_method = aws_api_gateway_method.store_orders_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "store_orders_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders.id
  http_method = aws_api_gateway_method.store_orders_options.http_method
  status_code = aws_api_gateway_method_response.store_orders_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "store_orders_id_get_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id.id
  http_method = aws_api_gateway_method.store_orders_id_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_orders_id_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id.id
  http_method = aws_api_gateway_method.store_orders_id_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "store_orders_id_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id.id
  http_method = aws_api_gateway_method.store_orders_id_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "store_orders_id_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id.id
  http_method = aws_api_gateway_method.store_orders_id_options.http_method
  status_code = aws_api_gateway_method_response.store_orders_id_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "store_orders_id_status_patch_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_status.id
  http_method = aws_api_gateway_method.store_orders_id_status_patch.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_orders_id_status_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_status.id
  http_method = aws_api_gateway_method.store_orders_id_status_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "store_orders_id_status_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_status.id
  http_method = aws_api_gateway_method.store_orders_id_status_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "store_orders_id_status_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_status.id
  http_method = aws_api_gateway_method.store_orders_id_status_options.http_method
  status_code = aws_api_gateway_method_response.store_orders_id_status_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,PATCH,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

resource "aws_api_gateway_integration" "store_orders_id_assign_code_patch_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_assign_code.id
  http_method = aws_api_gateway_method.store_orders_id_assign_code_patch.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.store_crud.invoke_arn
}

resource "aws_api_gateway_integration" "store_orders_id_assign_code_options_lambda" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_assign_code.id
  http_method = aws_api_gateway_method.store_orders_id_assign_code_options.http_method

  type = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "store_orders_id_assign_code_options_200" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_assign_code.id
  http_method = aws_api_gateway_method.store_orders_id_assign_code_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin" = true
  }
}

resource "aws_api_gateway_integration_response" "store_orders_id_assign_code_options" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.store_orders_id_assign_code.id
  http_method = aws_api_gateway_method.store_orders_id_assign_code_options.http_method
  status_code = aws_api_gateway_method_response.store_orders_id_assign_code_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,POST,PUT,DELETE,PATCH,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin" = "'*'"
  }
}

# Lambda Permission for API Gateway
resource "aws_lambda_permission" "api_store_crud" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.store_crud.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}
