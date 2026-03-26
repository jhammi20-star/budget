const CATEGORY_MAP = {
  FOOD_AND_DRINK: "Groceries",
  GENERAL_MERCHANDISE: "Shopping",
  LOAN_PAYMENTS: "Debt",
  MEDICAL: "Healthcare",
  PAYMENT: "Bills",
  RENT_AND_UTILITIES: "Housing",
  TRANSPORTATION: "Transportation",
  TRAVEL: "Travel",
};

export function normalizeTransaction(transaction) {
  const primaryCategory =
    transaction.personal_finance_category?.primary || transaction.category?.[0] || "Other";

  return {
    id: transaction.transaction_id,
    description: transaction.merchant_name || transaction.name || "Imported transaction",
    category: CATEGORY_MAP[primaryCategory] || titleize(primaryCategory),
    amount: Math.abs(transaction.amount || 0),
    date: transaction.date,
  };
}

function titleize(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
