# Backend

This backend is now designed to run as a single Lambda behind an HTTP API.

## Files

- `src/handler.mjs`: route handler for state, link-token creation, public-token exchange, and transaction sync
- `deploy.sh`: creates or updates DynamoDB, IAM, Lambda, and API Gateway
- `iam-trust-policy.json`: trust policy for the Lambda execution role

## Data model

Everything is stored in one DynamoDB table:

- `userId` as the partition key
- `sk=PROFILE` for Plaid item state, access token, institution name, and sync cursor
- `sk=TXN#<transactionId>` for imported transactions

## Deployment

Set these environment variables before running the deploy script:

- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` with `sandbox`, `development`, or `production`

Then run:

```bash
cd backend
./deploy.sh
```

The script prints `API_BASE_URL=...` when finished. Put that value into [`config.js`](../config.js).

## Security note

The current app uses a browser-generated `userId` because the frontend does not have authentication yet.
That is enough for a private prototype, but it is not a secure multi-user design.
If you keep building this, the next step is to add real auth and bind the backend records to the authenticated user.
