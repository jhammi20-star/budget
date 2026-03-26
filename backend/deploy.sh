#!/usr/bin/env bash
set -euo pipefail

APP_NAME="budget-compass"
REGION="${AWS_REGION:-us-east-1}"
FUNCTION_NAME="${APP_NAME}-api"
ROLE_NAME="${APP_NAME}-lambda-role"
POLICY_NAME="${APP_NAME}-dynamodb-policy"
TABLE_NAME="${APP_NAME}"
ZIP_PATH="build/lambda.zip"
BUILD_DIR="build/package"

if [[ -z "${PLAID_CLIENT_ID:-}" || -z "${PLAID_SECRET:-}" ]]; then
  echo "PLAID_CLIENT_ID and PLAID_SECRET must be set before deployment." >&2
  exit 1
fi

mkdir -p build
npm install --omit=dev
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cp -R src package.json package-lock.json node_modules "${BUILD_DIR}/"
(cd "${BUILD_DIR}" && zip -qr "../lambda.zip" .)

if ! aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  aws dynamodb create-table \
    --region "${REGION}" \
    --table-name "${TABLE_NAME}" \
    --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=userId,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null
  aws dynamodb wait table-exists --table-name "${TABLE_NAME}" --region "${REGION}"
fi

ROLE_ARN="$(aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.Arn' --output text 2>/dev/null || true)"
if [[ -z "${ROLE_ARN}" || "${ROLE_ARN}" == "None" ]]; then
  ROLE_ARN="$(aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document file://iam-trust-policy.json \
    --query 'Role.Arn' --output text)"
  aws iam attach-role-policy --role-name "${ROLE_NAME}" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
fi

cat > build/dynamodb-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:BatchWriteItem",
        "dynamodb:DeleteItem",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:${REGION}:$(aws sts get-caller-identity --query 'Account' --output text):table/${TABLE_NAME}"
    }
  ]
}
JSON

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "${POLICY_NAME}" \
  --policy-document file://build/dynamodb-policy.json >/dev/null

sleep 10

if aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --function-name "${FUNCTION_NAME}" \
    --region "${REGION}" \
    --zip-file "fileb://${ZIP_PATH}" >/dev/null
  aws lambda update-function-configuration \
    --function-name "${FUNCTION_NAME}" \
    --region "${REGION}" \
    --runtime nodejs20.x \
    --handler src/handler.handler \
    --timeout 30 \
    --environment "Variables={TABLE_NAME=${TABLE_NAME},PLAID_CLIENT_ID=${PLAID_CLIENT_ID},PLAID_SECRET=${PLAID_SECRET},PLAID_ENV=${PLAID_ENV:-sandbox}}" >/dev/null
else
  aws lambda create-function \
    --function-name "${FUNCTION_NAME}" \
    --region "${REGION}" \
    --runtime nodejs20.x \
    --handler src/handler.handler \
    --timeout 30 \
    --role "${ROLE_ARN}" \
    --zip-file "fileb://${ZIP_PATH}" \
    --environment "Variables={TABLE_NAME=${TABLE_NAME},PLAID_CLIENT_ID=${PLAID_CLIENT_ID},PLAID_SECRET=${PLAID_SECRET},PLAID_ENV=${PLAID_ENV:-sandbox}}" >/dev/null
fi

API_ID="$(aws apigatewayv2 get-apis --region "${REGION}" --query "Items[?Name=='${APP_NAME}-http'].ApiId | [0]" --output text)"
if [[ -z "${API_ID}" || "${API_ID}" == "None" ]]; then
  API_ID="$(aws apigatewayv2 create-api \
    --region "${REGION}" \
    --name "${APP_NAME}-http" \
    --protocol-type HTTP \
    --cors-configuration AllowOrigins='*',AllowHeaders='Content-Type,X-Budget-User',AllowMethods='GET,POST,OPTIONS' \
    --query 'ApiId' --output text)"
fi

LAMBDA_ARN="$(aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${REGION}" --query 'Configuration.FunctionArn' --output text)"
INTEGRATION_ID="$(aws apigatewayv2 get-integrations --api-id "${API_ID}" --region "${REGION}" --query "Items[0].IntegrationId" --output text)"
if [[ -z "${INTEGRATION_ID}" || "${INTEGRATION_ID}" == "None" ]]; then
  INTEGRATION_ID="$(aws apigatewayv2 create-integration \
    --api-id "${API_ID}" \
    --region "${REGION}" \
    --integration-type AWS_PROXY \
    --integration-uri "${LAMBDA_ARN}" \
    --payload-format-version 2.0 \
    --query 'IntegrationId' --output text)"
fi

for route in "GET /api/plaid/state" "POST /api/plaid/link-token" "POST /api/plaid/exchange-public-token" "POST /api/plaid/sync" "OPTIONS /api/{proxy+}"; do
  ROUTE_EXISTS="$(aws apigatewayv2 get-routes --api-id "${API_ID}" --region "${REGION}" --query "Items[?RouteKey=='${route}'].RouteId | [0]" --output text)"
  if [[ -z "${ROUTE_EXISTS}" || "${ROUTE_EXISTS}" == "None" ]]; then
    aws apigatewayv2 create-route \
      --api-id "${API_ID}" \
      --region "${REGION}" \
      --route-key "${route}" \
      --target "integrations/${INTEGRATION_ID}" >/dev/null
  fi
done

STAGE_EXISTS="$(aws apigatewayv2 get-stages --api-id "${API_ID}" --region "${REGION}" --query "Items[?StageName=='\$default'].StageName | [0]" --output text)"
if [[ -z "${STAGE_EXISTS}" || "${STAGE_EXISTS}" == "None" ]]; then
  aws apigatewayv2 create-stage \
    --api-id "${API_ID}" \
    --region "${REGION}" \
    --stage-name '$default' \
    --auto-deploy >/dev/null
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query 'Account' --output text)"
SOURCE_ARN="arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*/*"
if ! aws lambda get-policy --function-name "${FUNCTION_NAME}" --region "${REGION}" --query "Policy" --output text 2>/dev/null | grep -q "${API_ID}"; then
  aws lambda add-permission \
    --function-name "${FUNCTION_NAME}" \
    --region "${REGION}" \
    --statement-id "${APP_NAME}-api-gateway" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "${SOURCE_ARN}" >/dev/null
fi

echo "API_BASE_URL=https://${API_ID}.execute-api.${REGION}.amazonaws.com"
echo "TABLE_NAME=${TABLE_NAME}"
