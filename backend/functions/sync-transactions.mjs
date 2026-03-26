import { plaidClient } from "../shared/plaid-client.mjs";
import { normalizeTransaction } from "../shared/normalize-transaction.mjs";

export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const accessToken = body.accessToken || process.env.PLAID_ACCESS_TOKEN;
    const cursor = body.cursor || null;

    if (!accessToken) {
      return jsonResponse(400, {
        error: "Missing access token.",
      });
    }

    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });

    return jsonResponse(200, {
      added: response.data.added.map(normalizeTransaction),
      modified: response.data.modified.map(normalizeTransaction),
      removed: response.data.removed,
      nextCursor: response.data.next_cursor,
      hasMore: response.data.has_more,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Unable to sync transactions.",
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
