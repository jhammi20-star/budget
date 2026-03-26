const STORAGE_KEY = "budget-compass-state";

const defaultState = {
  income: 0,
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

const incomeValue = document.querySelector("#incomeValue");
const budgetedValue = document.querySelector("#budgetedValue");
const spentValue = document.querySelector("#spentValue");
const remainingValue = document.querySelector("#remainingValue");
const heroNet = document.querySelector("#heroNet");
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

render();

function render() {
  renderCategoryOptions();
  renderSummary();
  renderStatusCards();
  renderTransactions();
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

function emptyState(message) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}
