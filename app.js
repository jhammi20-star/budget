const STORAGE_KEY = "budget-compass-state";
const API_BASE_URL = window.BUDGET_API_BASE_URL || "";

const defaultState = {
  income: 0,
  integration: {
    connected: false,
    institutionName: "",
    lastSyncAt: "",
    linkTokenReady: false,
    syncError: "",
  },
  budgets: [
    { id: crypto.randomUUID(), category: "Housing", limit: 1600 },
    { id: crypto.randomUUID(), category: "Groceries", limit: 600 },
    { id: crypto.randomUUID(), category: "Transportation", limit: 350 },
  ],
  transactions: [
    {
      id: crypto.randomUUID(),
      description: "Rent",
      category: "Housing",
      amount: 1600,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Weekly groceries",
      category: "Groceries",
      amount: 124.33,
      date: currentDateString(),
    },
  ],
};

const state = loadState();

const incomeForm = document.querySelector("#incomeForm");
const incomeInput = document.querySelector("#incomeInput");
const budgetForm = document.querySelector("#budgetForm");
const budgetCategoryInput = document.querySelector("#budgetCategory");
const budgetLimitInput = document.querySelector("#budgetLimit");
const transactionForm = document.querySelector("#transactionForm");
const transactionDescriptionInput = document.querySelector("#transactionDescription");
const transactionCategorySelect = document.querySelector("#transactionCategory");
const transactionCategoryHint = document.querySelector("#transactionCategoryHint");
const transactionAmountInput = document.querySelector("#transactionAmount");
const transactionDateInput = document.querySelector("#transactionDate");
const transactionSubmit = document.querySelector("#transactionSubmit");
const connectAccountButton = document.querySelector("#connectAccountButton");
const syncTransactionsButton = document.querySelector("#syncTransactionsButton");

const incomeValue = document.querySelector("#incomeValue");
const budgetedValue = document.querySelector("#budgetedValue");
const spentValue = document.querySelector("#spentValue");
const remainingValue = document.querySelector("#remainingValue");
const heroNet = document.querySelector("#heroNet");
const monthLabel = document.querySelector("#monthLabel");
const activeBudgetCount = document.querySelector("#activeBudgetCount");
const transactionCount = document.querySelector("#transactionCount");
const topCategoryValue = document.querySelector("#topCategoryValue");
const integrationStatusTitle = document.querySelector("#integrationStatusTitle");
const integrationStatusText = document.querySelector("#integrationStatusText");
const budgetStatusList = document.querySelector("#budgetStatusList");
const transactionList = document.querySelector("#transactionList");
const statusTemplate = document.querySelector("#statusTemplate");
const transactionTemplate = document.querySelector("#transactionTemplate");

incomeInput.value = state.income || "";
transactionDateInput.value = currentDateString();

incomeForm.addEventListener("submit", (event) => {
  event.preventDefault();

  state.income = parseCurrency(incomeInput.value);
  persistState();
  render();
});

budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const category = budgetCategoryInput.value.trim();
  const limit = parseCurrency(budgetLimitInput.value);
  const duplicate = state.budgets.some(
    (budget) => budget.category.toLowerCase() === category.toLowerCase(),
  );

  if (!category || limit <= 0 || duplicate) {
    return;
  }

  state.budgets.push({
    id: crypto.randomUUID(),
    category,
    limit,
  });

  budgetForm.reset();
  persistState();
  render();
});

transactionForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const description = transactionDescriptionInput.value.trim();
  const category = transactionCategorySelect.value;
  const amount = parseCurrency(transactionAmountInput.value);
  const date = transactionDateInput.value || currentDateString();

  if (!description || !category || amount <= 0) {
    return;
  }

  state.transactions.unshift({
    id: crypto.randomUUID(),
    description,
    category,
    amount,
    date,
  });

  transactionForm.reset();
  transactionDateInput.value = currentDateString();
  persistState();
  render();
});

budgetStatusList.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement) || !target.matches(".remove-budget")) {
    return;
  }

  const { id } = target.dataset;
  state.budgets = state.budgets.filter((budget) => budget.id !== id);
  state.transactions = state.transactions.filter((transaction) => {
    return transaction.category !== target.dataset.category;
  });
  persistState();
  render();
});

transactionList.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement) || !target.matches(".remove-transaction")) {
    return;
  }

  const { id } = target.dataset;
  state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
  persistState();
  render();
});

connectAccountButton.addEventListener("click", async () => {
  await handleConnectAccount();
});

syncTransactionsButton.addEventListener("click", async () => {
  await handleSyncTransactions();
});

render();

function render() {
  renderOverview();
  renderIntegration();
  renderCategoryOptions();
  renderSummary();
  renderStatusCards();
  renderTransactions();
}

function renderOverview() {
  monthLabel.textContent = currentMonthLabel();
  activeBudgetCount.textContent = String(state.budgets.length);
  transactionCount.textContent = String(state.transactions.length);
  topCategoryValue.textContent = topSpendingCategoryLabel();
}

function renderIntegration() {
  if (!API_BASE_URL) {
    connectAccountButton.disabled = true;
    syncTransactionsButton.disabled = true;
    integrationStatusTitle.textContent = "Local-only mode";
    integrationStatusText.textContent =
      "Set window.BUDGET_API_BASE_URL and deploy the Plaid backend to enable account sync.";
    return;
  }

  connectAccountButton.disabled = false;
  syncTransactionsButton.disabled = !state.integration.connected;

  if (state.integration.connected) {
    integrationStatusTitle.textContent = state.integration.institutionName
      ? `Connected to ${state.integration.institutionName}`
      : "Account connected";
    integrationStatusText.textContent = state.integration.lastSyncAt
      ? `Last sync ${formatTimestamp(state.integration.lastSyncAt)}. Use sync to pull any new transactions.`
      : "Connection is active. Run a sync to pull the first set of transactions.";
    return;
  }

  if (state.integration.linkTokenReady) {
    integrationStatusTitle.textContent = "Plaid Link ready";
    integrationStatusText.textContent =
      "Your backend can now hand Plaid Link to the browser. Complete the public-token exchange before syncing.";
    return;
  }

  integrationStatusTitle.textContent = "Ready to connect";
  integrationStatusText.textContent = state.integration.syncError
    ? state.integration.syncError
    : "Use Plaid Link to authorize your institution and import transactions.";
}

function renderCategoryOptions() {
  transactionCategorySelect.innerHTML = "";

  const hasBudgets = state.budgets.length > 0;
  transactionCategorySelect.disabled = !hasBudgets;
  transactionAmountInput.disabled = !hasBudgets;
  transactionDateInput.disabled = !hasBudgets;
  transactionDescriptionInput.disabled = !hasBudgets;
  transactionSubmit.disabled = !hasBudgets;
  transactionCategoryHint.textContent = hasBudgets
    ? "Transactions are assigned to one of your active budget categories."
    : "Add a budget category first so transactions have somewhere to go.";

  state.budgets.forEach((budget) => {
    const option = document.createElement("option");
    option.value = budget.category;
    option.textContent = budget.category;
    transactionCategorySelect.append(option);
  });
}

function renderSummary() {
  const income = state.income;
  const budgeted = state.budgets.reduce((sum, budget) => sum + budget.limit, 0);
  const spent = state.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const remaining = income - spent;

  incomeValue.textContent = formatCurrency(income);
  budgetedValue.textContent = formatCurrency(budgeted);
  spentValue.textContent = formatCurrency(spent);
  remainingValue.textContent = formatCurrency(remaining);
  heroNet.textContent = formatCurrency(income - budgeted);
  heroNet.style.color = income - budgeted < 0 ? "var(--warn)" : "var(--ink)";
  remainingValue.style.color = remaining < 0 ? "var(--warn)" : "var(--ink)";
}

function renderStatusCards() {
  budgetStatusList.innerHTML = "";

  if (state.budgets.length === 0) {
    budgetStatusList.append(emptyState("Add a budget category to begin tracking spending."));
    return;
  }

  state.budgets.forEach((budget) => {
    const spent = state.transactions
      .filter((transaction) => transaction.category === budget.category)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const percentage = budget.limit === 0 ? 0 : Math.min((spent / budget.limit) * 100, 100);
    const fragment = statusTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".status-card");
    const title = fragment.querySelector("h3");
    const meta = fragment.querySelector(".status-meta");
    const meterFill = fragment.querySelector(".meter-fill");
    const removeButton = fragment.querySelector(".remove-budget");

    title.textContent = budget.category;
    meta.textContent = `${formatCurrency(spent)} of ${formatCurrency(budget.limit)} spent`;
    meterFill.style.width = `${percentage}%`;

    if (spent > budget.limit) {
      meterFill.classList.add("over");
      meta.textContent = `${formatCurrency(spent)} spent, ${formatCurrency(
        spent - budget.limit,
      )} over`;
    }

    removeButton.dataset.id = budget.id;
    removeButton.dataset.category = budget.category;
    card.dataset.id = budget.id;
    budgetStatusList.append(card);
  });
}

function renderTransactions() {
  transactionList.innerHTML = "";

  if (state.transactions.length === 0) {
    transactionList.append(emptyState("No transactions yet. Add one to start tracking real spending."));
    return;
  }

  state.transactions
    .slice()
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .forEach((transaction) => {
      const fragment = transactionTemplate.content.cloneNode(true);
      const title = fragment.querySelector("h3");
      const meta = fragment.querySelector(".transaction-meta");
      const amount = fragment.querySelector("strong");
      const removeButton = fragment.querySelector(".remove-transaction");

      title.textContent = transaction.description;
      meta.textContent = `${transaction.category} • ${formatDisplayDate(transaction.date)}`;
      amount.textContent = formatCurrency(transaction.amount);
      removeButton.dataset.id = transaction.id;
      transactionList.append(fragment);
    });
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return structuredClone(defaultState);
    }

    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parseCurrency(value) {
  return Number.parseFloat(value) || 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDisplayDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function currentDateString() {
  return new Date().toISOString().split("T")[0];
}

function currentMonthLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function topSpendingCategoryLabel() {
  if (state.transactions.length === 0) {
    return "None yet";
  }

  const totalsByCategory = state.transactions.reduce((totals, transaction) => {
    totals[transaction.category] = (totals[transaction.category] || 0) + transaction.amount;
    return totals;
  }, {});

  const [category, total] = Object.entries(totalsByCategory).sort((left, right) => {
    return right[1] - left[1];
  })[0];

  return `${category} ${formatCurrency(total)}`;
}

async function handleConnectAccount() {
  if (!API_BASE_URL) {
    return;
  }

  connectAccountButton.disabled = true;
  integrationStatusTitle.textContent = "Preparing secure connection";
  integrationStatusText.textContent = "Requesting a Plaid Link token from your backend.";

  try {
    const response = await fetch(`${API_BASE_URL}/api/plaid/link-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientName: "Budget Compass",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create a link token.");
    }

    const data = await response.json();
    state.integration.linkTokenReady = Boolean(data.linkToken);
    state.integration.syncError = "";
    persistState();
    render();
  } catch (error) {
    state.integration.syncError =
      error instanceof Error ? error.message : "Connection failed. Check the API configuration.";
    persistState();
    render();
  }
}

async function handleSyncTransactions() {
  if (!API_BASE_URL || !state.integration.connected) {
    return;
  }

  syncTransactionsButton.disabled = true;
  integrationStatusTitle.textContent = "Syncing transactions";
  integrationStatusText.textContent = "Pulling the latest transaction batch from the connected account.";

  try {
    const response = await fetch(`${API_BASE_URL}/api/plaid/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Unable to sync transactions.");
    }

    const data = await response.json();
    const imported = Array.isArray(data.added) ? data.added : [];

    imported.reverse().forEach((transaction) => {
      if (!state.transactions.some((item) => item.id === transaction.id)) {
        state.transactions.unshift(transaction);
      }
    });

    state.integration.lastSyncAt = new Date().toISOString();
    state.integration.syncError = "";
    persistState();
    render();
  } catch (error) {
    state.integration.syncError =
      error instanceof Error ? error.message : "Sync failed. Check your backend logs.";
    persistState();
    render();
  }
}

function emptyState(message) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}
