import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TABLE_NAME;
const plaidEnvironment = process.env.PLAID_ENV || "sandbox";
const plaidBaseUrl = `https://${plaidEnvironment}.plaid.com`;

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = normalizePath(event.rawPath || event.path || "");

  if (method === "OPTIONS") {
    return jsonResponse(204, {});
  }

  try {
    if (path === "/api/plaid/state" && method === "GET") {
      return await getState(event);
    }

    if (path === "/api/plaid/link-token" && method === "POST") {
      return await createLinkToken(event);
    }

    if (path === "/api/plaid/exchange-public-token" && method === "POST") {
      return await exchangePublicToken(event);
    }

    if (path === "/api/plaid/sync" && method === "POST") {
      return await syncTransactions(event);
    }

    return jsonResponse(404, { error: "Route not found." });
  } catch (error) {
    return jsonResponse(500, {
      error: "Unhandled backend error.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getState(event) {
  const userId = readUserId(event);
  const profile = await getProfile(userId);
  const transactions = await listTransactions(userId);

  return jsonResponse(200, {
    connected: Boolean(profile?.accessToken),
    institutionName: profile?.institutionName || "",
    lastSyncAt: profile?.lastSyncAt || "",
    transactions,
  });
}

async function createLinkToken(event) {
  requirePlaidConfig();
  const body = readJsonBody(event);
  const userId = readUserId(event);

  const response = await plaidRequest("/link/token/create", {
    client_name: body.clientName || "Budget Compass",
    country_codes: ["US"],
    language: "en",
    products: ["transactions"],
    user: {
      client_user_id: userId,
    },
  });

  return jsonResponse(200, {
    linkToken: response.link_token,
  });
}

async function exchangePublicToken(event) {
  requirePlaidConfig();
  const body = readJsonBody(event);
  const userId = readUserId(event);

  if (!body.publicToken) {
    return jsonResponse(400, { error: "Missing publicToken." });
  }

  const exchange = await plaidRequest("/item/public_token/exchange", {
    public_token: body.publicToken,
  });

  const profile = {
    userId,
    sk: "PROFILE",
    accessToken: exchange.access_token,
    itemId: exchange.item_id,
    institutionName: body.institutionName || "",
    lastSyncAt: "",
    cursor: "",
    updatedAt: new Date().toISOString(),
  };

  await db.send(
    new PutCommand({
      TableName: tableName,
      Item: profile,
    }),
  );

  return jsonResponse(200, {
    connected: true,
    institutionName: profile.institutionName,
  });
}

async function syncTransactions(event) {
  requirePlaidConfig();
  const userId = readUserId(event);
  const profile = await getProfile(userId);

  if (!profile?.accessToken) {
    return jsonResponse(400, { error: "No Plaid account connected for this user." });
  }

  let cursor = profile.cursor || null;
  let hasMore = true;
  const added = [];
  const removed = [];

  while (hasMore) {
    const page = await plaidRequest("/transactions/sync", {
      access_token: profile.accessToken,
      cursor,
    });

    cursor = page.next_cursor;
    hasMore = page.has_more;
    added.push(...page.added);
    removed.push(...page.removed);
  }

  const normalized = added.map(normalizeTransaction);
  const now = new Date().toISOString();

  if (normalized.length > 0) {
    for (const chunk of chunked(normalized, 25)) {
      await db.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((transaction) => ({
              PutRequest: {
                Item: {
                  userId,
                  sk: `TXN#${transaction.id}`,
                  ...transaction,
                  updatedAt: now,
                },
              },
            })),
          },
        }),
      );
    }
  }

  for (const item of removed) {
    await db.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          userId,
          sk: `TXN#${item.transaction_id}`,
        },
      }),
    );
  }

  await db.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        ...profile,
        sk: "PROFILE",
        cursor,
        lastSyncAt: now,
        updatedAt: now,
      },
    }),
  );

  return jsonResponse(200, {
    connected: true,
    institutionName: profile.institutionName || "",
    lastSyncAt: now,
    transactions: await listTransactions(userId),
  });
}

function normalizeTransaction(transaction) {
  const category = mapPlaidCategory(
    transaction.personal_finance_category?.primary || transaction.category?.[0] || "OTHER",
  );

  return {
    id: transaction.transaction_id,
    description: transaction.merchant_name || transaction.name || "Imported transaction",
    category,
    amount: Math.abs(transaction.amount || 0),
    date: transaction.date,
    source: "plaid",
  };
}

function mapPlaidCategory(value) {
  const map = {
    FOOD_AND_DRINK: "Groceries",
    GENERAL_MERCHANDISE: "Shopping",
    LOAN_PAYMENTS: "Debt",
    MEDICAL: "Healthcare",
    PAYMENT: "Bills",
    RENT_AND_UTILITIES: "Housing",
    TRANSPORTATION: "Transportation",
    TRAVEL: "Travel",
  };

  return map[value] || titleize(value);
}

function titleize(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function getProfile(userId) {
  const response = await db.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        userId,
        sk: "PROFILE",
      },
    }),
  );

  return response.Item || null;
}

async function listTransactions(userId) {
  const response = await db.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "userId = :userId AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":prefix": "TXN#",
      },
      ScanIndexForward: false,
    }),
  );

  return (response.Items || [])
    .map(({ sk, updatedAt, userId: _userId, ...item }) => item)
    .sort((left, right) => new Date(right.date) - new Date(left.date));
}

function readUserId(event) {
  const userId = event.headers?.["x-budget-user"] || event.headers?.["X-Budget-User"];

  if (!userId) {
    throw new Error("Missing X-Budget-User header.");
  }

  return userId;
}

function readJsonBody(event) {
  if (!event.body) {
    return {};
  }

  return JSON.parse(event.body);
}

function normalizePath(path) {
  return path.replace(/\/+$/, "") || "/";
}

function requirePlaidConfig() {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET || !tableName) {
    throw new Error("Missing backend configuration for Plaid or DynamoDB.");
  }
}

async function plaidRequest(path, body) {
  const response = await fetch(`${plaidBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_message || `Plaid request failed for ${path}.`);
  }

  return data;
}

function chunked(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,X-Budget-User",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
