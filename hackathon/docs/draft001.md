# JobPulse — Project Proposal & Technical Specification

**Theme:** Daily Productivity / Open Innovation  
**Project Stage:** Prototype / MVP Scope (Hackathon Submission)

---

## 1. Executive Summary & Problem Statement

In today's highly competitive job market, applicants frequently submit hundreds of applications across multiple platforms like LinkedIn, Indeed, and Greenhouse. To prevent corporate trackers, marketing newsletters, and recruitment spam from completely overwhelming their personal or primary email accounts, an increasing number of applicants choose to create **multiple distinct, secondary email accounts** exclusively for job submissions.

However, this strategy creates a severe bottleneck: **Inbox Fragmentation & Friction**. Job seekers struggle to consistently monitor several entirely separate accounts. Key communication trails grow cold, high-stakes interview invitations are missed, and critical multi-stage evaluation opportunities vanish due to the manual overhead of constantly switching between browser profiles.

### The Innovation
**JobPulse** solves this by acting as a lightweight Chrome Extension backed by a Node.js server. Together they form a unified command dashboard that monitors all of a user's job-hunting Gmail accounts in one place—completely removing the need for manual profile switching while intelligently surfacing only the communications that matter.

---

## 2. Official Hackathon Submission Answers

### Name - Tagline of your project
**JobPulse** - A smart central monitor for multi-email job hunting.

### Who is/are the end user(s) of what you are building?
* **Active Job Seekers:** Students, fresh graduates, and cross-disciplinary professionals managing high-volume application pipelines.
* **Privacy-Conscious Applicants:** Users who purposely divide their applications into separate, siloed email accounts to protect their primary inboxes from scraping or data leaks.

### How does this idea help them, put some key points?
* **Eradicates Multi-Login Friction:** Eliminates the exhausting daily requirement to open, switch, and log into multiple Gmail profiles manually.
* **Critical Opportunity Interception:** Instant system-level notifications ensure time-sensitive interview slots, coding assessments, and recruiter responses are never missed.
* **Context-Aware Automation:** Tracks which company corresponds to which email account, building a unified application pipeline without any manual entry.

### What are creative/innovative aspects about your idea?
* **Unlimited Account Aggregation:** Users add as many job-hunting Gmail accounts as they use. JobPulse monitors all of them from a single dashboard — no fixed cap, no profile switching.
* **Real-Time Push Alerts via Gmail Pub/Sub:** Instead of draining resources with constant polling, JobPulse uses Gmail's push notification system to receive alerts within seconds of a new email arriving — then classifies it before the user even opens their browser.
* **Intelligent "Shortlist" Filtering:** The Node backend classifies incoming email content and triggers high-priority alerts only when positive signals like *"Interview"*, *"Schedule"*, *"Assessment"*, or *"Offer"* are detected. Rejections are logged silently, protecting the user's focus and emotional energy.
* **Passive Application Capture:** A content script detects when a user types one of their monitored emails into an application form on platforms like Greenhouse or Lever, automatically logging the company and job title into their dashboard.

### Any questions/queries/info you would like to share?
JobPulse is built as a Chrome Extension (HTML, CSS, JavaScript) backed by a Node.js server. The extension handles the UI dashboard and form interception. The Node backend manages Gmail OAuth tokens securely, subscribes to Gmail push notifications via Google Cloud Pub/Sub, classifies incoming emails, and delivers alerts back to the extension. Users can register as many Gmail accounts as they use for job hunting — the dashboard scales to however many they add.

---

## 3. Technical Architecture

### Stack
| Layer | Technology |
|---|---|
| Extension UI | HTML, CSS, JavaScript (Manifest V3) |
| Form Interceptor | Content Script (JavaScript) |
| Backend | Node.js (Express) |
| Email Push | Gmail API + Google Cloud Pub/Sub |
| Auth | Google OAuth 2.0 |
| Storage | `chrome.storage.local` (extension state), Node server (token + alert state) |

---

### Architecture Overview

```
User's Browser (Chrome Extension)
  ├── popup.html / popup.js      → Dashboard UI, account management
  ├── content.js                 → Form interceptor on ATS sites
  └── background.js (SW)        → Polls Node backend, fires chrome.notifications

Node.js Backend
  ├── /auth                      → Google OAuth flow, token storage
  ├── /webhook                   → Receives Gmail Pub/Sub push notifications
  ├── Gmail API                  → Fetches email content on push trigger
  ├── Email Classifier           → Keyword filter (positive / rejection / neutral)
  └── /alerts                    → Extension polls this for pending notifications
```

---

### A. Account Management
Users add Gmail accounts through the extension popup. Each account goes through a Google OAuth flow handled by the Node backend, which stores the access/refresh tokens server-side — never in the extension. The extension only stores account metadata (email address, display label) in `chrome.storage.local`.

Once authorized, the Node backend subscribes each account to Gmail push notifications via the Gmail API's `watch()` method, pointing to a Google Cloud Pub/Sub topic that delivers to the Node `/webhook` endpoint.

### B. Real-Time Email Processing (Push, Not Polling)
When a new email arrives in any monitored account:

1. Gmail pushes a lightweight notification to Google Cloud Pub/Sub
2. Pub/Sub delivers it to the Node `/webhook` endpoint within seconds
3. Node calls the Gmail API to fetch the email subject and snippet
4. The classifier checks the content against positive and rejection keyword sets
5. The result (HIGH_PRIORITY / REJECTED / NEUTRAL) is queued on the server

The extension's background service worker polls the Node `/alerts` endpoint every 30 seconds — this is a cheap status check, not email fetching, so it has negligible resource impact. When a HIGH_PRIORITY alert is in the queue, the extension fires a `chrome.notifications` desktop alert immediately.

### C. Email Classifier
```
Positive keywords  → "interview", "schedule", "assessment", "offer", "next steps",
                      "phone screen", "invitation", "shortlisted"

Rejection keywords → "unfortunately", "moved forward with other candidates",
                      "position has been filled", "not moving forward"
```

Positive match → HIGH_PRIORITY (desktop notification + badge increment)  
Rejection match → REJECTED (dashboard status silently updated to red/gray)  
Neither → NEUTRAL (logged, no notification)

### D. Form Interceptor (Content Script)
A content script injected into supported ATS platforms listens for `input` events on email fields. When a typed value matches one of the user's registered addresses, it captures the site domain and page title and sends them to the background service worker, which logs the entry to the application tracker via the Node backend.

Supported platforms: Greenhouse (`boards.greenhouse.io`), Lever (`jobs.lever.co`). LinkedIn is excluded from content script injection due to frequent DOM obfuscation that makes reliable field detection impractical.

---

## 4. Blueprint Code for Accelerated Deployment

### File 1: `manifest.json`
```json
{
  "manifest_version": 3,
  "name": "JobPulse: Multi-Email Job Tracker",
  "version": "1.0",
  "description": "Monitors your job-hunting Gmail accounts and surfaces shortlist alerts in real time.",
  "permissions": ["storage", "activeTab", "identity", "notifications"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://boards.greenhouse.io/*",
        "https://jobs.lever.co/*"
      ],
      "js": ["content.js"]
    }
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

### File 2: `background.js` (skeleton)
```javascript
const BACKEND_URL = "https://your-node-backend.com";
const POLL_INTERVAL_MS = 30000;

async function checkAlerts() {
  try {
    const res = await fetch(`${BACKEND_URL}/alerts`, { credentials: "include" });
    const { alerts } = await res.json();
    for (const alert of alerts) {
      if (alert.priority === "HIGH_PRIORITY") {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon.png",
          title: `JobPulse — ${alert.account}`,
          message: alert.subject
        });
        chrome.action.setBadgeText({ text: "!" });
      }
    }
  } catch (e) {
    console.error("JobPulse alert check failed:", e);
  }
}

setInterval(checkAlerts, POLL_INTERVAL_MS);
```

### File 3: Node.js `/webhook` endpoint (skeleton)
```javascript
// POST /webhook — receives Gmail Pub/Sub push notifications
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // acknowledge immediately

  const data = JSON.parse(
    Buffer.from(req.body.message.data, "base64").toString()
  );
  const { emailAddress, historyId } = data;

  const token = await getStoredToken(emailAddress);
  const email = await fetchLatestEmail(token, historyId);

  const priority = classifyEmail(email.subject, email.snippet);
  if (priority !== "NEUTRAL") {
    queueAlert(emailAddress, email.subject, priority);
  }
});
```
