# This file can be used to add additional outputs if needed
# Main outputs are defined in main.tf

output "environment_variables" {
  description = "Environment variables for .env.local"
  value = <<-EOT
    VITE_AWS_REGION=${var.aws_region}
    VITE_COGNITO_USER_POOL_ID=${aws_cognito_user_pool.user_pool.id}
    VITE_COGNITO_CLIENT_ID=${aws_cognito_user_pool_client.web_client.id}
    VITE_API_ENDPOINT=https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.aws_region}.amazonaws.com/${var.environment}
    VITE_S3_BUCKET_NAME=${aws_s3_bucket.profile_photos.id}
  EOT
}
