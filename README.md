# Budget Compass

A dependency-free budgeting web app built with plain HTML, CSS, and JavaScript.

## Run it

Open [`index.html`](./index.html) directly in a browser, or serve the folder with any static server.

## Features

- Set monthly income
- Create budget categories with monthly limits
- Log transactions by category and date
- See total income, budgeted amount, spending, and remaining cash
- Track category progress with overspend warnings
- Save everything in browser `localStorage`
- Includes a Plaid-ready sync scaffold for importing institution transactions

## Plaid Sync Direction

The frontend now includes a transaction-sync panel. To make it work end to end:

1. Deploy the handlers in [`backend/`](./backend)
2. Configure Cognito Hosted UI for browser sign-in
3. Store Plaid credentials in Secrets Manager
4. Set runtime values in [`config.js`](./config.js)
5. Use DynamoDB-backed sync instead of browser-only storage for imported transactions
