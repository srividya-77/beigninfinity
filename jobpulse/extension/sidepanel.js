const BACKEND_URL = "https://your-node-backend.com";
const POLL_INTERVAL_MS = 30000;

// ── State ──────────────────────────────────────────────────────────────────
let accounts = [];      // { id, label, email, status, entries: [], unread }
let trackerEntries = []; // { company, role, accountEmail, timestamp }
let expandedId = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await loadState();
  render();
  bindEvents();
  startPolling();
});

async function loadState() {
  const data = await chrome.storage.local.get(["accounts", "trackerEntries"]);
  accounts = data.accounts || [];
  trackerEntries = data.trackerEntries || [];
}

async function saveState() {
  await chrome.storage.local.set({ accounts, trackerEntries });
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  renderAccounts();
  renderTracker();
  renderHeader();
}

function renderHeader() {
  const countEl = document.getElementById("accountCount");
  countEl.textContent = `${accounts.length} account${accounts.length !== 1 ? "s" : ""}`;

  const totalUnread = accounts.reduce((sum, a) => sum + (a.unread || 0), 0);
  const badge = document.getElementById("notifBadge");
  const badgeCount = document.getElementById("notifCount");
  if (totalUnread > 0) {
    badge.style.display = "flex";
    badgeCount.textContent = totalUnread;
  } else {
    badge.style.display = "none";
  }
}

function renderAccounts() {
  const list = document.getElementById("accountsList");
  const empty = document.getElementById("emptyState");

  if (accounts.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  list.innerHTML = accounts.map(account => buildAccountCard(account)).join("");

  // Bind expand toggles
  list.querySelectorAll(".account-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".rejections-toggle")) return;
      const id = card.dataset.id;
      expandedId = expandedId === id ? null : id;
      render();
    });
  });

  // Bind rejection toggles
  list.querySelectorAll(".rejections-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.nextElementSibling;
      if (section) section.style.display = section.style.display === "none" ? "block" : "none";
      btn.textContent = btn.textContent.includes("show")
        ? btn.textContent.replace("show", "hide")
        : btn.textContent.replace("hide", "show");
    });
  });
}

function buildAccountCard(account) {
  const statusClass = `status-${account.status || "pending"}`;
  const statusLabel = { shortlisted: "Shortlisted", pending: "Pending", rejected: "Rejected" }[account.status] || "Pending";
  const initial = (account.label || account.email)[0].toUpperCase();
  const isExpanded = expandedId === account.id;

  const positiveEntries = (account.entries || []).filter(e => e.tag !== "rejected");
  const rejectedEntries = (account.entries || []).filter(e => e.tag === "rejected");

  const entriesHTML = isExpanded ? `
    <div class="account-entries">
      ${positiveEntries.map(e => `
        <div class="entry-row">
          <div>
            <div class="entry-company">${escHtml(e.company)}</div>
            <div class="entry-role">${escHtml(e.role)}</div>
          </div>
          <span class="entry-tag ${e.tag}">${capitalise(e.tag)}</span>
          <span class="entry-time">${e.time}</span>
        </div>
      `).join("") || `<p style="font-size:11px;color:var(--text-muted);padding:4px 0">No positive signals yet.</p>`}
      ${rejectedEntries.length > 0 ? `
        <button class="rejections-toggle">Rejected (${rejectedEntries.length}) ▾ show</button>
        <div style="display:none">
          ${rejectedEntries.map(e => `
            <div class="entry-row">
              <div>
                <div class="entry-company">${escHtml(e.company)}</div>
                <div class="entry-role">${escHtml(e.role)}</div>
              </div>
              <span class="entry-tag rejected">Rejected</span>
              <span class="entry-time">${e.time}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  ` : "";

  return `
    <div class="account-card ${isExpanded ? "expanded" : ""} ${statusClass}" data-id="${account.id}">
      <div class="account-row">
        <div class="account-avatar">${initial}</div>
        <div class="account-info">
          <div class="account-label">${escHtml(account.label || "Job Account")}</div>
          <div class="account-email">${escHtml(account.email)}</div>
        </div>
        <div class="account-status">
          <span class="status-dot"></span>
          <span class="status-label">${statusLabel}</span>
          ${account.unread ? `<span class="unread-count">${account.unread}</span>` : ""}
        </div>
      </div>
      ${entriesHTML}
    </div>
  `;
}

function renderTracker() {
  const section = document.getElementById("trackerSection");
  const list = document.getElementById("trackerList");
  const count = document.getElementById("trackerCount");

  if (trackerEntries.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  count.textContent = `${trackerEntries.length} tracked`;
  list.innerHTML = trackerEntries.slice(0, 20).map(e => `
    <div class="tracker-row">
      <span class="tracker-company">${escHtml(e.company)}</span>
      <span class="tracker-role">${escHtml(e.role || "—")}</span>
      <span class="tracker-account">${shortEmail(e.accountEmail)}</span>
    </div>
  `).join("");
}

// ── Alert Banner ───────────────────────────────────────────────────────────
function showAlertBanner(text) {
  const banner = document.getElementById("alertBanner");
  const alertText = document.getElementById("alertText");
  alertText.textContent = text;
  banner.style.display = "flex";
}

document.getElementById("alertDismiss").addEventListener("click", () => {
  document.getElementById("alertBanner").style.display = "none";
});

// ── Polling ────────────────────────────────────────────────────────────────
function startPolling() {
  setInterval(pollAlerts, POLL_INTERVAL_MS);
}

async function pollAlerts() {
  try {
    const res = await fetch(`${BACKEND_URL}/alerts`, { credentials: "include" });
    const { alerts } = await res.json();

    for (const alert of alerts) {
      const account = accounts.find(a => a.email === alert.account);
      if (!account) continue;

      if (alert.priority === "HIGH_PRIORITY") {
        account.status = "shortlisted";
        account.unread = (account.unread || 0) + 1;
        account.entries = account.entries || [];
        account.entries.unshift({
          company: alert.company || "Unknown Company",
          role: alert.role || "",
          tag: tagFromSubject(alert.subject),
          time: "just now"
        });
        showAlertBanner(`${alert.account}: ${alert.subject}`);
      } else if (alert.priority === "REJECTED") {
        account.entries = account.entries || [];
        account.entries.push({
          company: alert.company || "Unknown Company",
          role: alert.role || "",
          tag: "rejected",
          time: "just now"
        });
        if (account.status !== "shortlisted") account.status = "rejected";
      }
    }

    if (alerts.length > 0) {
      await saveState();
      render();
    }
  } catch (e) {
    // Backend unreachable — fail silently, don't break the UI
  }
}

// ── Events ─────────────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById("addAccountBtn").addEventListener("click", openModal);
  document.getElementById("emptyAddBtn").addEventListener("click", openModal);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById("modalConnectBtn").addEventListener("click", connectAccount);
}

function openModal() {
  document.getElementById("modalOverlay").style.display = "flex";
  document.getElementById("accountLabel").focus();
}

function closeModal() {
  document.getElementById("modalOverlay").style.display = "none";
  document.getElementById("accountLabel").value = "";
}

async function connectAccount() {
  const label = document.getElementById("accountLabel").value.trim() || "Job Account";

  // In production: initiate OAuth via chrome.identity or redirect to backend /auth
  // For demo: add a placeholder account
  const demoEmail = `demo.${Date.now()}@gmail.com`;
  accounts.push({
    id: `acc_${Date.now()}`,
    label,
    email: demoEmail,
    status: "pending",
    entries: [],
    unread: 0
  });

  await saveState();
  closeModal();
  render();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str = "") {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function capitalise(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function shortEmail(email = "") {
  const [local] = email.split("@");
  return local.length > 10 ? local.slice(0, 10) + "…" : local;
}

function tagFromSubject(subject = "") {
  const s = subject.toLowerCase();
  if (s.includes("offer"))      return "offer";
  if (s.includes("assessment") || s.includes("test")) return "assessment";
  if (s.includes("interview") || s.includes("schedule")) return "interview";
  return "interview";
}

// ── Listen for form interceptor messages ──────────────────────────────────
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "APPLICATION_LOGGED") {
    trackerEntries.unshift({
      company: msg.company,
      role: msg.role || "",
      accountEmail: msg.email,
      timestamp: Date.now()
    });
    await saveState();
    render();
  }
});
