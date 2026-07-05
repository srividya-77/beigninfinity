// content.js — Form Interceptor
// Injected into Greenhouse and Lever job application pages

(async () => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Load monitored emails from storage
  const { accounts = [] } = await chrome.storage.local.get("accounts");
  const monitoredEmails = new Set(accounts.map(a => a.email.toLowerCase()));
  if (monitoredEmails.size === 0) return;

  let logged = false; // only log once per page load

  function getPageMeta() {
    const title = document.title || "";
    const domain = location.hostname;

    // Attempt to extract company name and role from page title
    // e.g. "Software Engineer at Acme Corp - Greenhouse"
    const atMatch = title.match(/^(.+?)\s+at\s+(.+?)(?:\s[-|]|$)/i);
    if (atMatch) {
      return { role: atMatch[1].trim(), company: atMatch[2].trim() };
    }
    return { role: "", company: domain };
  }

  function handleInput(e) {
    if (logged) return;
    const value = (e.target.value || "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(value)) return;
    if (!monitoredEmails.has(value)) return;

    logged = true;
    const { role, company } = getPageMeta();

    chrome.runtime.sendMessage({
      type: "APPLICATION_LOGGED",
      email: value,
      company,
      role
    });
  }

  // Listen on all input and textarea elements
  document.addEventListener("input", handleInput, { passive: true });
})();
