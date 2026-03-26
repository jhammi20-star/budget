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
2. Store Plaid credentials securely on the server
3. Set `window.BUDGET_API_BASE_URL` before loading [`app.js`](./app.js)
4. Replace browser-only storage with a real backend store for synced data
