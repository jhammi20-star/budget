import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const environment =
  PlaidEnvironments[process.env.PLAID_ENV?.toLowerCase() || "sandbox"] || PlaidEnvironments.sandbox;

const configuration = new Configuration({
  basePath: environment,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID || "",
      "PLAID-SECRET": process.env.PLAID_SECRET || "",
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
