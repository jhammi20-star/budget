# Backend Scaffold

This folder is a starting point for a Plaid-backed transaction sync service.

## What it contains

- `functions/create-link-token.mjs`: creates a Plaid Link token for the frontend
- `functions/exchange-public-token.mjs`: exchanges the short-lived public token for an access token
- `functions/sync-transactions.mjs`: pulls transactions with `transactionsSync`
- `shared/normalize-transaction.mjs`: maps Plaid data into the app's transaction format

## What still needs to happen

1. Install dependencies with `npm install` inside `backend/`
2. Store Plaid secrets in Lambda or your server environment
3. Persist the returned Plaid `accessToken` securely
4. Persist the Plaid sync cursor per connected account
5. Save synced transactions in DynamoDB instead of only browser storage
6. Expose these handlers behind API Gateway or Amplify server functions
7. Set `window.BUDGET_API_BASE_URL` in the frontend so [`app.js`](../app.js) can call the API

## Recommended AWS shape

- Amplify Hosting for the frontend
- API Gateway + Lambda for Plaid endpoints
- DynamoDB for users, items, cursors, and imported transactions
- Secrets Manager or Lambda environment variables for Plaid credentials

## Important note

Do not return or store Plaid `accessToken` values in the browser in production.
The sample `exchange-public-token` handler returns it only to show the integration step.
In a real deployment, store it server-side and associate it with the signed-in user.
