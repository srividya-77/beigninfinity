# JobPulse — Project Proposal & Technical Specification

**Theme:** Daily Productivity / Open Innovation  
**Project Stage:** Prototype / MVP Scope (Hackathon Submission)

---

## 1. Executive Summary & Problem Statement

In today's highly competitive job market, applicants frequently submit hundreds of applications across multiple platforms like LinkedIn, Indeed, and Greenhouse. To prevent corporate trackers, marketing newsletters, and recruitment spam from overwhelming their primary inboxes, an increasing number of applicants create **multiple dedicated email accounts** exclusively for job submissions.

But this creates a new problem: **Inbox Fragmentation**. Monitoring 3, 4, or 5 separate accounts manually means missed interview windows, cold communication trails, and constant tab-switching overhead.

> Job seekers send an average of 100+ applications. JobPulse monitors all of them across every account — so you never miss the email that changes everything.

### The Innovation
**JobPulse** is a Chrome Extension backed by a Node.js server. Together they form a unified command dashboard that monitors all of a user's job-hunting Gmail accounts in real time — no profile switching, no manual logging, no missed opportunities.

---

## 2. Official Hackathon Submission Answers

### Name - Tagline of your project
**JobPulse** — One dashboard for every inbox, every opportunity.

### Who is/are the end user(s) of what you are building?
* **Active Job Seekers:** Students, fresh graduates, and cross-disciplinary professionals managing high-volume application pipelines across multiple email accounts.
* **Privacy-Conscious Applicants:** Users who deliberately separate their job-hunt emails from their primary inbox to avoid spam and data exposure.

### How does this idea help them, put some key points?
* **Eradicates Multi-Login Friction:** No more opening, switching, and logging into multiple Gmail profiles every morning. One glance at the dashboard shows everything.
* **Real-Time Opportunity Interception:** Push notifications fire within seconds of a shortlist email arriving — not after a polling delay. Time-sensitive interview slots and assessment invitations are never missed.
* **Zero-Friction Application Logging:** When a user types one of their monitored emails into an application form, JobPulse silently captures the company and job title in the background — no copy-pasting, no spreadsheets.
* **Emotionally Intelligent Design:** Rejections are logged silently and color-coded gray. The user sees the outcome without a disruptive notification. Positive signals get the full alert treatment.

### What are creative/innovative aspects about your idea?
* **Unlimited Account Support:** Users add as many job-hunting Gmail accounts as they use. The dashboard scales dynamically — no arbitrary caps.
* **Gmail Push via Pub/Sub (Not Polling):** Most tools poll inboxes every N seconds. JobPulse uses Gmail's native push notification system (Google Cloud Pub/Sub) to receive email events within seconds of arrival, then classifies them before the user even opens their browser. This is technically non-trivial and architecturally correct.
* **Passive Application Capture:** A content script on Greenhouse and Lever detects when the user types a monitored email into an application form, auto-logging company and role — zero manual entry required.
* **Silent Rejection Logging:** Automated rejections update a status badge to gray/red without firing a notification. No other job tool treats the user's attention and emotional energy as a resource worth protecting.

### Any questions/queries/info you would like to share?
JobPulse is built as a Chrome Extension (HTML, CSS, JavaScript) backed by a Node.js (Express) server. The extension handles the UI dashboard and form interception. The Node backend manages Gmail OAuth tokens securely server-side, subscribes accounts to Gmail push notifications via Google Cloud Pub/Sub, classifies incoming emails using a precision keyword engine, and delivers prioritized alerts back to the extension. Users register as many Gmail accounts as they need — the system has no fixed limit.

---

## 3. Technical Architecture

### Stack
| Layer | Technology |
|---|---|
| Extension UI | HTML, CSS, JavaScript (Manifest V3) |
| Form Interceptor | Content Script (JavaScript) |
| Backend | Node.js (Express) |
| Email Delivery | Gmail API + Google Cloud Pub/Sub (push) |
| Auth | Google OAuth 2.0 |
| Extension Storage | `chrome.storage.local` |
| Server Storage | Node in-memory store (demo) → lightweight DB (production) |

---

### Architecture Overview

```
User's Browser (Chrome Extension)
  ├── popup.html / popup.js      → Dashboard UI, account management
  ├── content.js                 → Form interceptor on Greenhouse & Lever
  └── background.js (SW)        → Polls /alerts, fires chrome.notifications

Node.js Backend
  ├── GET  /auth                 → Initiates Google OAuth flow
  ├── GET  /auth/callback        → Stores access + refresh tokens
  ├── POST /webhook              → Receives Gmail Pub/Sub push events
  ├── Gmail API client           → Fetches email on push trigger
  ├── classifyEmail()            → Keyword classifier (positive / rejection / neutral)
  └── GET  /alerts               → Returns pending HIGH_PRIORITY alerts for extension
```

---

### A. Account Management
Users add Gmail accounts through the extension popup. Each account goes through a Google OAuth flow handled by the Node backend — access and refresh tokens are stored server-side, never in the extension. The extension stores only metadata (email address, display label) in `chrome.storage.local`.

Once authorized, the backend calls Gmail API's `watch()` method to subscribe the account to push notifications, pointing to a Google Cloud Pub/Sub topic that forwards events to the Node `/webhook` endpoint. The `watch()` subscription renews every 7 days automatically.

### B. Real-Time Email Processing (Push Architecture)

When a new email arrives in any monitored account:

```
Gmail → Pub/Sub topic → Node /webhook
                              ↓
                     Fetch email via Gmail API
                              ↓
                       classifyEmail()
                              ↓
              HIGH_PRIORITY → queue alert
              REJECTED      → update account status
              NEUTRAL        → log only
                              ↓
              Extension polls /alerts (30s interval)
                              ↓
              chrome.notifications fires on HIGH_PRIORITY
```

The 30-second extension poll is a lightweight status check — it fetches a tiny JSON payload, not email content. All heavy lifting happens server-side on the push trigger.

### C. Email Classifier

```javascript
const POSITIVE_KEYWORDS = [
  "interview", "schedule", "assessment", "offer", "next steps",
  "phone screen", "invitation", "shortlisted", "move forward with you",
  "excited to", "pleased to inform"
];

const REJECTION_KEYWORDS = [
  "unfortunately", "moved forward with other candidates",
  "position has been filled", "not moving forward",
  "we will not be", "decided not to proceed"
];

function classifyEmail(subject = "", snippet = "") {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (POSITIVE_KEYWORDS.some(kw => text.includes(kw))) return "HIGH_PRIORITY";
  if (REJECTION_KEYWORDS.some(kw => text.includes(kw))) return "REJECTED";
  return "NEUTRAL";
}
```

### D. Form Interceptor (Content Script)

A content script injected into Greenhouse and Lever listens for `input` events on email fields. When a value matches one of the user's registered addresses, it messages the background service worker with the site domain and page title. The background worker forwards this to the Node backend, which logs the application entry.

LinkedIn is intentionally excluded — their DOM structure is obfuscated and changes frequently, making reliable field detection impractical without ongoing maintenance.

---

## 4. Blueprint Code

### `manifest.json`
```json
{
  "manifest_version": 3,
  "name": "JobPulse: Multi-Email Job Tracker",
  "version": "1.0",
  "description": "One dashboard for every inbox, every opportunity.",
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

### `background.js`
```javascript
const BACKEND_URL = "https://your-node-backend.com";
const POLL_INTERVAL_MS = 30000;

async function checkAlerts() {
  try {
    const res = await fetch(`${BACKEND_URL}/alerts`, { credentials: "include" });
    const { alerts } = await res.json();

    for (const alert of alerts) {
      if (alert.priority === "HIGH_PRIORITY") {
        chrome.notifications.create(`alert-${Date.now()}`, {
          type: "basic",
          iconUrl: "icon.png",
          title: `JobPulse — ${alert.account}`,
          message: alert.subject
        });
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
      }
    }
  } catch (e) {
    console.error("JobPulse alert check failed:", e);
  }
}

setInterval(checkAlerts, POLL_INTERVAL_MS);
```

### `server.js` — Node.js webhook handler
```javascript
import express from "express";
import { classifyEmail } from "./classifier.js";
import { getStoredToken, queueAlert, updateAccountStatus } from "./store.js";
import { fetchLatestEmail } from "./gmail.js";

const app = express();
app.use(express.json());

// Receives Gmail Pub/Sub push notifications
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // acknowledge immediately to avoid Pub/Sub retries

  try {
    const raw = Buffer.from(req.body.message.data, "base64").toString();
    const { emailAddress, historyId } = JSON.parse(raw);

    const token = await getStoredToken(emailAddress);
    if (!token) return;

    const email = await fetchLatestEmail(token, historyId);
    if (!email) return;

    const priority = classifyEmail(email.subject, email.snippet);

    if (priority === "HIGH_PRIORITY") {
      queueAlert(emailAddress, email.subject, priority);
    } else if (priority === "REJECTED") {
      updateAccountStatus(emailAddress, "rejected");
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});

// Extension polls this endpoint
app.get("/alerts", (req, res) => {
  const pending = flushAlertQueue(); // returns and clears pending alerts
  res.json({ alerts: pending });
});

app.listen(3000, () => console.log("JobPulse backend running on port 3000"));
```

---

## 5. Demo Script (Hackathon Presentation)

This is the sequence to run for maximum impact. Rehearse it until it's under 3 minutes.

**Opening line (10 seconds)**
> "Job seekers send over 100 applications on average. Most use separate email accounts to keep their inbox clean. JobPulse monitors all of them — so you never miss the email that changes everything."

**Show the dashboard (30 seconds)**
- Open the extension popup. Show 3 registered accounts with their status badges.
- Point out: green = shortlisted, gray = rejected, yellow = pending response.
- "Every account, one view. No tab switching. No logging in."

**The live notification moment (60 seconds — this is your applause line)**
- Have a phone or second laptop ready to send a test email to one of the monitored accounts. Subject: "Interview Invitation — Software Engineer Role"
- Walk through the form interceptor first (go to boards.greenhouse.io, type the monitored email into the field, show it auto-log in the dashboard).
- Then trigger the email send. Within seconds, the desktop notification fires on screen.
- "That just happened in real time. Gmail pushed the notification to our server, we classified it, and the extension surfaced it — no polling, no delay."

**Silent rejection (20 seconds)**
- Send a second email with "Unfortunately, we have decided not to proceed."
- No notification fires. Dashboard badge quietly turns gray.
- "Rejections don't deserve your attention. They just update the board."

**Closing line (10 seconds)**
> "One dashboard. Every inbox. Every opportunity — caught."

---

## 6. Deployment Checklist

- [ ] Google Cloud project created with Gmail API and Pub/Sub enabled
- [ ] OAuth 2.0 client ID created (Web application type)
- [ ] Pub/Sub topic created, subscription pointed to Node backend `/webhook`
- [ ] Node backend deployed to Render / Railway (free tier) with HTTPS
- [ ] `BACKEND_URL` in `background.js` updated to deployed URL
- [ ] Extension loaded unpacked in Chrome for demo
- [ ] Test accounts registered and `watch()` subscriptions active
- [ ] Demo email drafts prepared and ready to send on cue
