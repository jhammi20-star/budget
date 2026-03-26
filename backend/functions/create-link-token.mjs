import { plaidClient } from "../shared/plaid-client.mjs";

export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const response = await plaidClient.linkTokenCreate({
      client_name: body.clientName || "Budget Compass",
      country_codes: ["US"],
      language: "en",
      user: {
        client_user_id: body.userId || "budget-compass-user",
      },
      products: ["transactions"],
    });

    return jsonResponse(200, {
      linkToken: response.data.link_token,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Unable to create link token.",
      detail: error.message,
    });
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}
