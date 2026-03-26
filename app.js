const STORAGE_KEY = "budget-compass-state";
const AUTH_STORAGE_KEY = "budget-compass-auth";
const API_BASE_URL = window.BUDGET_API_BASE_URL || "";
const AUTH_CONFIG = window.BUDGET_AUTH || {};

const defaultState = {
  income: 7800,
  integration: {
    connected: false,
    institutionName: "",
    accessReady: false,
    lastSyncAt: "",
    linkTokenReady: false,
    linkToken: "",
    syncError: "",
  },
  budgets: [
    { id: crypto.randomUUID(), category: "Housing", limit: 2200 },
    { id: crypto.randomUUID(), category: "Groceries", limit: 900 },
    { id: crypto.randomUUID(), category: "Utilities", limit: 350 },
    { id: crypto.randomUUID(), category: "Transportation", limit: 500 },
    { id: crypto.randomUUID(), category: "Childcare", limit: 1200 },
    { id: crypto.randomUUID(), category: "Insurance", limit: 450 },
    { id: crypto.randomUUID(), category: "Healthcare", limit: 250 },
    { id: crypto.randomUUID(), category: "Dining Out", limit: 250 },
    { id: crypto.randomUUID(), category: "School & Activities", limit: 300 },
    { id: crypto.randomUUID(), category: "Savings", limit: 800 },
  ],
  transactions: [
    {
      id: crypto.randomUUID(),
      description: "Mortgage payment",
      category: "Housing",
      amount: 2200,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Weekly grocery run",
      category: "Groceries",
      amount: 186.42,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Electric bill",
      category: "Utilities",
      amount: 118.72,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "After-school care",
      category: "Childcare",
      amount: 950,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Fuel fill-up",
      category: "Transportation",
      amount: 64.8,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Family health premium",
      category: "Insurance",
      amount: 215,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Pediatric copay",
      category: "Healthcare",
      amount: 45,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Soccer registration",
      category: "School & Activities",
      amount: 95,
      date: currentDateString(),
    },
    {
      id: crypto.randomUUID(),
      description: "Friday pizza night",
      category: "Dining Out",
      amount: 42.5,
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
const authStatus = document.querySelector("#authStatus");
const authButton = document.querySelector("#authButton");
let plaidHandler = null;
let authSession = loadAuthSession();

incomeInput.value = state.income || "";
transactionDateInput.value = currentDateString();

incomeForm.addEventListener("submit", (event) => {
  event.preventDefault();

  state.income = parseCurrency(incomeInput.value);
  persistState();
  render();
  void syncSharedBudgetState();
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
  void syncSharedBudgetState();
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
  void syncSharedBudgetState();
});

budgetStatusList.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.matches(".edit-budget")) {
    toggleBudgetEditForm(target.dataset.id, true);
    return;
  }

  if (target.matches(".cancel-edit-budget")) {
    toggleBudgetEditForm(target.dataset.id, false);
    return;
  }

  if (!target.matches(".remove-budget")) {
    return;
  }

  const { id } = target.dataset;
  state.budgets = state.budgets.filter((budget) => budget.id !== id);
  state.transactions = state.transactions.filter((transaction) => {
    return transaction.category !== target.dataset.category;
  });
  persistState();
  render();
  void syncSharedBudgetState();
});

budgetStatusList.addEventListener("submit", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLFormElement) || !target.matches(".budget-edit-form")) {
    return;
  }

  event.preventDefault();

  const budgetId = target.dataset.id;
  const categoryInput = target.elements.namedItem("category");
  const limitInput = target.elements.namedItem("limit");

  if (!(categoryInput instanceof HTMLInputElement) || !(limitInput instanceof HTMLInputElement)) {
    return;
  }

  saveBudgetEdits(budgetId, categoryInput.value, limitInput.value);
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
  void syncSharedBudgetState();
});

connectAccountButton.addEventListener("click", async () => {
  await handleConnectAccount();
});

syncTransactionsButton.addEventListener("click", async () => {
  await handleSyncTransactions();
});

authButton.addEventListener("click", async () => {
  if (isAuthenticated()) {
    signOut();
    return;
  }

  await signIn();
});

consumeAuthRedirect();
render();
hydrateSharedBudgetState();
hydrateRemoteState();

function render() {
  renderOverview();
  renderAuth();
  renderIntegration();
  renderCategoryOptions();
  renderSummary();
  renderStatusCards();
  renderTransactions();
}

function renderAuth() {
  authButton.disabled = false;

  if (isAuthenticated()) {
    authStatus.textContent = authSession.email
      ? `Signed in as ${authSession.email}`
      : "Signed in";
    authButton.textContent = "Sign out";
    return;
  }

  authStatus.textContent = AUTH_CONFIG.userPoolDomain
    ? "Sign in to sync institution data across devices."
    : "Signed out. Local budgeting still works.";
  authButton.textContent = "Sign in";
  authButton.disabled = !AUTH_CONFIG.userPoolDomain;
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

  if (!isAuthenticated()) {
    connectAccountButton.disabled = true;
    syncTransactionsButton.disabled = true;
    integrationStatusTitle.textContent = "Sign in required";
    integrationStatusText.textContent =
      "Use Cognito sign-in before connecting Plaid or loading synced transactions.";
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
      "Complete institution login to exchange the public token and enable sync.";
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
    const editForm = fragment.querySelector(".budget-edit-form");
    const categoryField = fragment.querySelector('input[name="category"]');
    const limitField = fragment.querySelector('input[name="limit"]');
    const editButton = fragment.querySelector(".edit-budget");
    const cancelEditButton = fragment.querySelector(".cancel-edit-budget");
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

    editForm.dataset.id = budget.id;
    categoryField.value = budget.category;
    limitField.value = budget.limit.toFixed(2);
    editButton.dataset.id = budget.id;
    cancelEditButton.dataset.id = budget.id;
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

    const parsed = JSON.parse(saved);

    return {
      ...structuredClone(defaultState),
      ...parsed,
      integration: {
        ...structuredClone(defaultState).integration,
        ...(parsed.integration || {}),
      },
    };
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
        ...authorizedHeaders(),
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
    state.integration.linkToken = data.linkToken || "";
    state.integration.syncError = "";
    persistState();
    initializePlaidLink(data.linkToken);
    plaidHandler?.open();
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
        ...authorizedHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error("Unable to sync transactions.");
    }

    const data = await response.json();
    mergeImportedTransactions(data.transactions || []);
    state.integration.lastSyncAt = data.lastSyncAt || new Date().toISOString();
    state.integration.connected = Boolean(data.connected);
    state.integration.institutionName = data.institutionName || state.integration.institutionName;
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

function toggleBudgetEditForm(id, isOpen) {
  const card = budgetStatusList.querySelector(`.status-card[data-id="${id}"]`);

  if (!(card instanceof HTMLElement)) {
    return;
  }

  const form = card.querySelector(".budget-edit-form");
  const editButton = card.querySelector(".edit-budget");

  if (!(form instanceof HTMLFormElement) || !(editButton instanceof HTMLButtonElement)) {
    return;
  }

  form.hidden = !isOpen;
  editButton.disabled = isOpen;

  if (isOpen) {
    const categoryInput = form.elements.namedItem("category");

    if (categoryInput instanceof HTMLInputElement) {
      categoryInput.focus();
      categoryInput.select();
    }
  }
}

function saveBudgetEdits(budgetId, nextCategoryValue, nextLimitValue) {
  const category = nextCategoryValue.trim();
  const limit = parseCurrency(nextLimitValue);
  const budget = state.budgets.find((item) => item.id === budgetId);

  if (!budget || !category || limit <= 0) {
    return;
  }

  const duplicate = state.budgets.some((item) => {
    return item.id !== budgetId && item.category.toLowerCase() === category.toLowerCase();
  });

  if (duplicate) {
    return;
  }

  const previousCategory = budget.category;
  budget.category = category;
  budget.limit = limit;

  if (previousCategory !== category) {
    state.transactions = state.transactions.map((transaction) => {
      if (transaction.category !== previousCategory) {
        return transaction;
      }

      return {
        ...transaction,
        category,
      };
    });
  }

  persistState();
  render();
  void syncSharedBudgetState();
}

async function hydrateRemoteState() {
  if (!API_BASE_URL || !isAuthenticated()) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/plaid/state`, {
      headers: {
        ...authorizedHeaders(),
      },
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    state.integration.connected = Boolean(data.connected);
    state.integration.institutionName = data.institutionName || "";
    state.integration.lastSyncAt = data.lastSyncAt || "";
    state.integration.accessReady = Boolean(data.connected);
    mergeImportedTransactions(data.transactions || []);
    persistState();
    render();
  } catch {
    // Keep local mode if the backend is unreachable.
  }
}

async function hydrateSharedBudgetState() {
  if (!API_BASE_URL) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/shared-budget`);

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    applySharedBudgetState(data);
    persistState();
    render();
  } catch {
    // Keep local cache if the shared state endpoint is unavailable.
  }
}

async function syncSharedBudgetState() {
  if (!API_BASE_URL) {
    return;
  }

  try {
    await fetch(`${API_BASE_URL}/api/shared-budget`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        income: state.income,
        budgets: state.budgets,
        transactions: sharedTransactions(),
      }),
    });
  } catch {
    // Keep local cache if the shared state endpoint is unavailable.
  }
}

function applySharedBudgetState(data) {
  if (!data || typeof data !== "object") {
    return;
  }

  const imported = importedTransactions();
  state.income = Number.isFinite(data.income) ? data.income : state.income;
  state.budgets = Array.isArray(data.budgets) ? data.budgets : state.budgets;
  state.transactions = [
    ...(Array.isArray(data.transactions) ? data.transactions : []),
    ...imported,
  ].sort((left, right) => new Date(right.date) - new Date(left.date));
}

function initializePlaidLink(linkToken) {
  if (!window.Plaid || !linkToken) {
    throw new Error("Plaid Link is unavailable.");
  }

  plaidHandler = window.Plaid.create({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      try {
        await exchangePublicToken(publicToken, metadata);
      } catch (error) {
        state.integration.syncError =
          error instanceof Error ? error.message : "Unable to complete account connection.";
        persistState();
        render();
      }
    },
    onExit: (_error, metadata) => {
      if (!state.integration.connected && metadata?.status !== "connected") {
        state.integration.syncError = "Connection flow was closed before completion.";
        persistState();
        render();
      }
    },
  });
}

async function exchangePublicToken(publicToken, metadata) {
  const response = await fetch(`${API_BASE_URL}/api/plaid/exchange-public-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authorizedHeaders(),
    },
    body: JSON.stringify({
      publicToken,
      institutionName: metadata?.institution?.name || "",
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to complete account connection.");
  }

  const data = await response.json();
  state.integration.connected = true;
  state.integration.accessReady = true;
  state.integration.linkTokenReady = false;
  state.integration.linkToken = "";
  state.integration.institutionName = data.institutionName || metadata?.institution?.name || "";
  state.integration.syncError = "";
  persistState();
  render();
  await handleSyncTransactions();
}

function mergeImportedTransactions(transactions) {
  const localOnly = sharedTransactions();
  const imported = transactions.map((transaction) => ({
    ...transaction,
    id: transaction.id.startsWith("plaid_") ? transaction.id : `plaid_${transaction.id}`,
  }));

  state.transactions = [...imported, ...localOnly]
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 250);
}

function sharedTransactions() {
  return state.transactions.filter((transaction) => !transaction.id.startsWith("plaid_"));
}

function importedTransactions() {
  return state.transactions.filter((transaction) => transaction.id.startsWith("plaid_"));
}

function loadAuthSession() {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);

    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved);

    if (!parsed.idToken || !parsed.expiresAt || Number(parsed.expiresAt) < Date.now()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isAuthenticated() {
  return Boolean(authSession?.idToken && authSession.expiresAt > Date.now());
}

function authorizedHeaders() {
  if (!isAuthenticated()) {
    return {};
  }

  return {
    Authorization: `Bearer ${authSession.idToken}`,
  };
}

async function signIn() {
  if (!AUTH_CONFIG.userPoolDomain || !AUTH_CONFIG.clientId) {
    return;
  }

  const redirectUri = AUTH_CONFIG.redirectUri || window.location.origin;
  const authorizeUrl = new URL(`https://${AUTH_CONFIG.userPoolDomain}/login`);
  authorizeUrl.searchParams.set("client_id", AUTH_CONFIG.clientId);
  authorizeUrl.searchParams.set("response_type", "token");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  window.location.assign(authorizeUrl.toString());
}

function signOut() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  authSession = null;
  state.integration.connected = false;
  state.integration.accessReady = false;
  state.integration.institutionName = "";
  state.integration.lastSyncAt = "";
  state.integration.linkTokenReady = false;
  state.integration.linkToken = "";
  state.integration.syncError = "";
  persistState();
  render();

  if (!AUTH_CONFIG.userPoolDomain || !AUTH_CONFIG.clientId) {
    return;
  }

  const logoutUrl = new URL(`https://${AUTH_CONFIG.userPoolDomain}/logout`);
  logoutUrl.searchParams.set("client_id", AUTH_CONFIG.clientId);
  logoutUrl.searchParams.set("logout_uri", AUTH_CONFIG.logoutUri || window.location.origin);
  window.location.assign(logoutUrl.toString());
}

function consumeAuthRedirect() {
  if (!window.location.hash.startsWith("#")) {
    return;
  }

  const params = new URLSearchParams(window.location.hash.slice(1));
  const idToken = params.get("id_token");

  if (!idToken) {
    return;
  }

  const payload = parseJwt(idToken);
  authSession = {
    idToken,
    email: payload.email || "",
    expiresAt: Number(payload.exp || 0) * 1000,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

function parseJwt(token) {
  const [, payload] = token.split(".");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(atob(padded));
}
