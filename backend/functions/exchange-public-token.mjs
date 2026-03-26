import { plaidClient } from "../shared/plaid-client.mjs";

export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};

    if (!body.publicToken) {
      return jsonResponse(400, {
        error: "Missing publicToken.",
      });
    }

    const exchange = await plaidClient.itemPublicTokenExchange({
      public_token: body.publicToken,
    });

    return jsonResponse(200, {
      accessToken: exchange.data.access_token,
      itemId: exchange.data.item_id,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Unable to exchange public token.",
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
