# ==========================================
# Meetup Verification Reminder
# Weekly email to users who signed up but have not verified their Meetup
# membership. Runs on an EventBridge schedule and reuses the shared Lambda
# execution role (which already has DynamoDB Scan + SES SendEmail).
# ==========================================

# --- Lambda package ---------------------------------------------------------
data "archive_file" "meetup_reminder" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/meetup-reminder"
  output_path = "${path.module}/lambda/meetup-reminder.zip"
  excludes    = ["node_modules", "*.zip"]
}

resource "aws_lambda_function" "meetup_reminder" {
  filename         = data.archive_file.meetup_reminder.output_path
  function_name    = "${var.project_name}-meetup-reminder"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.meetup_reminder.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 120

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
      SES_FROM_EMAIL   = "info@awsugmdu.in"
      APP_URL          = "https://www.awsugmdu.in"
      ADMIN_EMAILS     = var.admin_emails
      # Safety: ships in DRY_RUN so the first scheduled run only logs recipients.
      # Set to "false" (here or in the console) to start sending real emails.
      DRY_RUN          = "true"
      # Optional: redirect all reminder emails to one inbox while testing.
      TEST_EMAIL       = ""
      # Optional: stop reminding a user after this many reminders (0 = no cap).
      MAX_REMINDERS    = "6"
    }
  }

  tags = {
    Name = "${var.project_name}-meetup-reminder"
  }
}

resource "aws_cloudwatch_log_group" "meetup_reminder_logs" {
  name              = "/aws/lambda/${aws_lambda_function.meetup_reminder.function_name}"
  retention_in_days = 14
}

# --- Schedule (EventBridge Scheduler) ---------------------------------------
# Role that lets the scheduler invoke the Lambda.
resource "aws_iam_role" "meetup_reminder_scheduler" {
  name = "${var.project_name}-meetup-reminder-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "scheduler.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "meetup_reminder_scheduler_invoke" {
  name = "${var.project_name}-meetup-reminder-scheduler-invoke"
  role = aws_iam_role.meetup_reminder_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.meetup_reminder.arn
    }]
  })
}

resource "aws_scheduler_schedule" "meetup_reminder_weekly" {
  name       = "${var.project_name}-meetup-reminder-weekly"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  # Every Monday 04:00 UTC = 09:30 IST.
  schedule_expression          = "cron(0 4 ? * MON *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.meetup_reminder.arn
    role_arn = aws_iam_role.meetup_reminder_scheduler.arn
  }
}

output "lambda_meetup_reminder_arn" {
  description = "Meetup reminder Lambda ARN"
  value       = aws_lambda_function.meetup_reminder.arn
}
