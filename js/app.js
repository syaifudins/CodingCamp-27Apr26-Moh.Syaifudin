 /**
 * app.js — Expense & Budget Visualizer (single consolidated JS file)
 *
 * Sections:
 *  1. State
 *  2. Sorting
 *  3. Validation helpers
 *  4. Transactions
 *  5. Categories
 *  6. Spending Limits
 *  7. Theme
 *  8. Chart Manager
 *  9. Render
 * 10. App entry point & event wiring
 */

'use strict';

// ============================================================
// 1. STATE
// ============================================================

const STORAGE_KEY = 'expense-visualizer-state';

const DEFAULT_STATE = {
  transactions: [],
  categories: ['Food', 'Transport', 'Fun'],
  spendingLimits: {},
  activeSortOption: 'none',
  theme: 'light',
  activeView: 'main',
};

const AppState = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState));
  } catch (e) {
    console.warn('localStorage unavailable:', e);
    const el = document.getElementById('storage-warning');
    if (el) el.classList.add('visible');
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const parsed = JSON.parse(raw);
    return {
      ...JSON.parse(JSON.stringify(DEFAULT_STATE)),
      ...parsed,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : [...DEFAULT_STATE.categories],
      spendingLimits: (parsed.spendingLimits && typeof parsed.spendingLimits === 'object') ? parsed.spendingLimits : {},
    };
  } catch (e) {
    console.warn('Could not parse stored state, resetting to defaults:', e);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

// ============================================================
// 2. SORTING
// ============================================================

function sortTransactions(transactions, option) {
  const copy = [...transactions];
  switch (option) {
    case 'amount-asc':  return copy.sort((a, b) => a.amount - b.amount);
    case 'amount-desc': return copy.sort((a, b) => b.amount - a.amount);
    case 'category-asc': return copy.sort((a, b) => a.category.localeCompare(b.category));
    default: return copy;
  }
}

// ============================================================
// 3. VALIDATION HELPERS
// ============================================================

function validateTransaction(name, rawAmount, category, categories) {
  const errors = {};
  if (!name || name.trim() === '') {
    errors.name = 'Item name is required.';
  }
  if (rawAmount === '' || rawAmount === null || rawAmount === undefined) {
    errors.amount = 'Amount must be a number.';
  } else if (isNaN(parseFloat(rawAmount))) {
    errors.amount = 'Amount must be a number.';
  } else if (parseFloat(rawAmount) <= 0) {
    errors.amount = 'Amount must be a positive number.';
  }
  if (!category || category.trim() === '') {
    errors.category = 'Please select a category.';
  } else if (!categories.includes(category)) {
    errors.category = 'Please select a valid category.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function validateCategory(name, existingCategories) {
  if (!name || name.trim() === '') {
    return { valid: false, errors: { name: 'Category name is required.' } };
  }
  const trimmed = name.trim();
  const duplicate = existingCategories.some(c => c.toLowerCase() === trimmed.toLowerCase());
  if (duplicate) {
    return { valid: false, errors: { name: 'This category already exists.' } };
  }
  return { valid: true, errors: {} };
}

function validateSpendingLimit(rawLimit) {
  if (rawLimit === '' || rawLimit === null || rawLimit === undefined) {
    return { valid: true, errors: {} }; // empty = remove limit
  }
  const val = parseFloat(rawLimit);
  if (isNaN(val) || val <= 0) {
    return { valid: false, errors: { limit: 'Spending limit must be a positive number.' } };
  }
  return { valid: true, errors: {} };
}

// ============================================================
// 4. TRANSACTIONS
// ============================================================

function addTransaction(name, rawAmount, category) {
  const result = validateTransaction(name, rawAmount, category, AppState.categories);
  if (!result.valid) return result;

  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(36).slice(2);

  AppState.transactions.push({
    id,
    name: name.trim(),
    amount: parseFloat(rawAmount),
    category,
    date: new Date().toISOString(),
  });

  saveState();
  render();
  return { valid: true, errors: {} };
}

function deleteTransaction(id) {
  const idx = AppState.transactions.findIndex(t => t.id === id);
  if (idx === -1) return;
  AppState.transactions.splice(idx, 1);
  saveState();
  render();
}

// ============================================================
// 5. CATEGORIES
// ============================================================

function addCategory(name) {
  const result = validateCategory(name, AppState.categories);
  if (!result.valid) return result;
  AppState.categories.push(name.trim());
  saveState();
  render();
  return { valid: true, errors: {} };
}

// ============================================================
// 6. SPENDING LIMITS
// ============================================================

function getCategoryTotal(transactions, category) {
  return transactions
    .filter(t => t.category === category)
    .reduce((sum, t) => sum + t.amount, 0);
}

function isOverLimit(total, limit) {
  if (limit === undefined || limit === null) return false;
  return total > limit;
}

function setSpendingLimit(category, rawLimit) {
  const result = validateSpendingLimit(rawLimit);
  if (!result.valid) return result;
  if (rawLimit === '' || rawLimit === null || rawLimit === undefined) {
    delete AppState.spendingLimits[category];
  } else {
    AppState.spendingLimits[category] = parseFloat(rawLimit);
  }
  saveState();
  render();
  return { valid: true, errors: {} };
}

// ============================================================
// 7. THEME
// ============================================================

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function toggleTheme() {
  AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
  applyTheme(AppState.theme);
  saveState();
}

// ============================================================
// 8. CHART MANAGER
// ============================================================

let chartInstance = null;

const PALETTE = [
  '#6c63ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff922b', '#cc5de8', '#20c997', '#f06595', '#74c0fc',
  '#a9e34b', '#ff8787', '#63e6be', '#ffa94d', '#da77f2',
];

function getCategoryColor(index) {
  return PALETTE[index % PALETTE.length];
}

function updateChart(totals, categories) {
  const canvas = document.getElementById('spending-chart');
  const fallback = document.getElementById('chart-fallback');
  const emptyEl = document.getElementById('chart-empty');
  const legendEl = document.getElementById('chart-legend');

  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    canvas.style.display = 'none';
    if (fallback) fallback.style.display = 'block';
    return;
  }

  // Build data arrays
  const labels = [], data = [], colors = [];
  categories.forEach((cat, i) => {
    if (totals[cat] && totals[cat] > 0) {
      labels.push(cat);
      data.push(parseFloat(totals[cat].toFixed(2)));
      colors.push(getCategoryColor(i));
    }
  });

  const hasData = data.length > 0;

  if (emptyEl) emptyEl.style.display = hasData ? 'none' : 'block';
  canvas.style.display = hasData ? 'block' : 'none';

  if (legendEl) {
    legendEl.innerHTML = labels.map((label, i) =>
      `<div class="legend-item">
        <span class="legend-dot" style="background:${colors[i]}"></span>
        <span>${escHtml(label)}</span>
      </div>`
    ).join('');
  }

  if (!hasData) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
  } else {
    chartInstance = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: $${ctx.parsed.toFixed(2)}`,
            },
          },
        },
      },
    });
  }
}

// ============================================================
// 9. RENDER
// ============================================================

function formatCurrency(amount) {
  return '$' + Math.abs(amount).toFixed(2);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function computeBalance(transactions) {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

function computeCategoryTotals(transactions) {
  return transactions.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount;
    return acc;
  }, {});
}

function computeMonthlySummary(transactions) {
  const map = {};
  transactions.forEach(t => {
    const d = new Date(t.date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!map[key]) {
      map[key] = {
        year, month,
        label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
        categoryTotals: {},
        grandTotal: 0,
      };
    }
    map[key].categoryTotals[t.category] = (map[key].categoryTotals[t.category] || 0) + t.amount;
    map[key].grandTotal += t.amount;
  });
  return Object.values(map).sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  );
}

function render() {
  renderBalance();
  renderTransactionList();
  renderChart();
  renderLimits();
  renderMonthlySummary();
  renderCategoryDropdowns();
  renderAlertBanner();
}

function renderBalance() {
  const el = document.getElementById('balance-amount');
  const countEl = document.getElementById('balance-count');
  if (!el) return;
  el.textContent = formatCurrency(computeBalance(AppState.transactions));
  if (countEl) {
    const n = AppState.transactions.length;
    countEl.textContent = `${n} transaction${n !== 1 ? 's' : ''}`;
  }
}

function renderTransactionList() {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) return;

  const sorted = sortTransactions(AppState.transactions, AppState.activeSortOption);

  if (sorted.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" role="status" aria-live="polite">
        <div class="empty-icon">💸</div>
        <p>No transactions yet.<br>Add one above to get started!</p>
      </div>`;
    return;
  }

  listEl.innerHTML = sorted.map(t => {
    const catIndex = AppState.categories.indexOf(t.category);
    const color = getCategoryColor(catIndex >= 0 ? catIndex : 0);
    const catTotal = getCategoryTotal(AppState.transactions, t.category);
    const over = isOverLimit(catTotal, AppState.spendingLimits[t.category]);
    const dateStr = new Date(t.date).toLocaleDateString('default', { month: 'short', day: 'numeric' });

    return `
      <div class="transaction-item${over ? ' over-limit' : ''}" role="listitem" data-id="${escHtml(t.id)}">
        <span class="tx-category-dot" style="background:${color}" aria-hidden="true"></span>
        <div class="tx-info">
          <div class="tx-name" title="${escHtml(t.name)}">${escHtml(t.name)}</div>
          <div class="tx-meta">
            <span class="tx-category-badge">${escHtml(t.category)}</span>
            <span>${dateStr}</span>
            ${over ? '<span class="over-limit-icon" aria-label="Over budget">⚠️</span>' : ''}
          </div>
        </div>
        <span class="tx-amount" aria-label="Amount: ${formatCurrency(t.amount)}">-${formatCurrency(t.amount)}</span>
        <button class="btn-icon delete-btn"
                aria-label="Delete transaction: ${escHtml(t.name)}"
                data-id="${escHtml(t.id)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14H6L5 6"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="M9 6V4h6v2"></path>
          </svg>
        </button>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

function renderChart() {
  updateChart(computeCategoryTotals(AppState.transactions), AppState.categories);
}

function renderLimits() {
  const container = document.getElementById('limits-list');
  if (!container) return;

  const totals = computeCategoryTotals(AppState.transactions);

  container.innerHTML = AppState.categories.map(cat => {
    const currentLimit = AppState.spendingLimits[cat];
    const total = totals[cat] || 0;
    const over = isOverLimit(total, currentLimit);
    const statusText = currentLimit !== undefined
      ? (over
          ? `⚠️ $${total.toFixed(2)} / $${currentLimit.toFixed(2)}`
          : `✓ $${total.toFixed(2)} / $${currentLimit.toFixed(2)}`)
      : '';

    return `
      <div class="limit-item">
        <label for="limit-${escHtml(cat)}">${escHtml(cat)}</label>
        <input type="number"
               id="limit-${escHtml(cat)}"
               class="limit-input"
               placeholder="No limit"
               min="0.01" step="0.01"
               value="${currentLimit !== undefined ? currentLimit : ''}"
               aria-label="Spending limit for ${escHtml(cat)}"
               data-category="${escHtml(cat)}">
        ${currentLimit !== undefined
          ? `<span class="limit-status ${over ? 'over' : 'ok'}" aria-live="polite">${statusText}</span>`
          : ''}
      </div>`;
  }).join('');

  container.querySelectorAll('.limit-input').forEach(input => {
    input.addEventListener('change', () => {
      setSpendingLimit(input.dataset.category, input.value.trim());
    });
  });
}

function renderAlertBanner() {
  const banner = document.getElementById('alert-banner');
  if (!banner) return;

  const totals = computeCategoryTotals(AppState.transactions);
  const overCategories = AppState.categories.filter(cat =>
    isOverLimit(totals[cat] || 0, AppState.spendingLimits[cat])
  );

  if (overCategories.length === 0) {
    banner.classList.remove('visible');
    banner.innerHTML = '';
    return;
  }

  banner.classList.add('visible');
  banner.innerHTML = `
    <span class="alert-icon" aria-hidden="true">⚠️</span>
    <span><strong>Over budget:</strong> ${overCategories.map(escHtml).join(', ')}</span>`;
}

function renderMonthlySummary() {
  const container = document.getElementById('monthly-summary');
  if (!container) return;

  const summary = computeMonthlySummary(AppState.transactions);

  if (summary.length === 0) {
    container.innerHTML = `
      <div class="empty-state" role="status">
        <div class="empty-icon">📅</div>
        <p>No transactions to summarize yet.</p>
      </div>`;
    return;
  }

  container.innerHTML = summary.map(month => {
    const cats = Object.entries(month.categoryTotals).sort((a, b) => b[1] - a[1]);
    const maxAmt = cats.length > 0 ? cats[0][1] : 1;

    return `
      <div class="month-block">
        <div class="month-header">
          <span>${escHtml(month.label)}</span>
          <span class="month-total">${formatCurrency(month.grandTotal)}</span>
        </div>
        <div class="month-categories">
          ${cats.map(([cat, amount]) => {
            const color = getCategoryColor(AppState.categories.indexOf(cat));
            const pct = Math.round((amount / maxAmt) * 100);
            return `
              <div class="month-cat-row">
                <span class="month-cat-name">
                  <span class="legend-dot" style="background:${color}" aria-hidden="true"></span>
                  ${escHtml(cat)}
                </span>
                <span class="month-cat-amount">${formatCurrency(amount)}</span>
              </div>
              <div class="month-bar-wrap" aria-hidden="true">
                <div class="month-bar" style="width:${pct}%;background:${color}"></div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderCategoryDropdowns() {
  document.querySelectorAll('.category-select').forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">Select category…</option>' +
      AppState.categories.map(c =>
        `<option value="${escHtml(c)}"${c === current ? ' selected' : ''}>${escHtml(c)}</option>`
      ).join('');
  });
}

// ============================================================
// 10. APP ENTRY POINT & EVENT WIRING
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(AppState.theme);
  render();
  wireEventListeners();
  setActiveView(AppState.activeView);

  const sortSel = document.getElementById('sort-select');
  if (sortSel) sortSel.value = AppState.activeSortOption;
});

function wireEventListeners() {
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  document.getElementById('transaction-form')?.addEventListener('submit', handleAddTransaction);
  document.getElementById('category-form')?.addEventListener('submit', handleAddCategory);

  document.getElementById('sort-select')?.addEventListener('change', e => {
    AppState.activeSortOption = e.target.value;
    saveState();
    render();
  });

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveView(tab.dataset.view));
  });
}

function setActiveView(view) {
  AppState.activeView = view;
  saveState();

  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  });

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.view === view);
  });
}

function handleAddTransaction(e) {
  e.preventDefault();
  const name = document.getElementById('tx-name').value;
  const amount = document.getElementById('tx-amount').value;
  const category = document.getElementById('tx-category').value;

  clearFieldErrors(['tx-name', 'tx-amount', 'tx-category']);

  const result = addTransaction(name, amount, category);

  if (!result.valid) {
    if (result.errors.name)     showFieldError('tx-name', result.errors.name);
    if (result.errors.amount)   showFieldError('tx-amount', result.errors.amount);
    if (result.errors.category) showFieldError('tx-category', result.errors.category);
    return;
  }

  e.target.reset();
  renderCategoryDropdowns();
}

function handleAddCategory(e) {
  e.preventDefault();
  const input = document.getElementById('new-category');
  clearFieldErrors(['new-category']);

  const result = addCategory(input.value);

  if (!result.valid) {
    if (result.errors.name) showFieldError('new-category', result.errors.name);
    return;
  }

  input.value = '';
  const btn = document.getElementById('add-category-btn');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Added';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }
}

function showFieldError(fieldId, message) {
  document.getElementById(fieldId)?.classList.add('error');
  const errEl = document.getElementById(`${fieldId}-error`);
  if (errEl) { errEl.textContent = message; errEl.classList.add('visible'); }
}

function clearFieldErrors(fieldIds) {
  fieldIds.forEach(id => {
    document.getElementById(id)?.classList.remove('error');
    const errEl = document.getElementById(`${id}-error`);
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
  });
}
