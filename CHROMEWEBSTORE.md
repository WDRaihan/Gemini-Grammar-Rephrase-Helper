# Chrome Web Store Listing — Gemini Grammar & Rephrase Helper

> Last Updated: 2026-10-11

## Store Listing

**Extension Name** [REQUIRED]
Gemini Grammar & Rephrase Helper

**Short Description** [REQUIRED]
Auto-check grammar & rephrase with free Chrome Built-in AI or Gemini. Real-time checks as you type + smart right-click suggestions.

**Detailed Description** [REQUIRED]
Write with confidence! Instantly fix grammar, rephrase sentences, and get smart writing suggestions powered by free Chrome Built-in AI (Gemini Nano) or Google's Gemini cloud API, directly in your browser.

Tired of awkward phrasing and embarrassing typos? Gemini Grammar & Rephrase Helper is your essential writing assistant. Auto-check grammar as you type in any input field, or simply select text on any website and right-click to get instant, intelligent suggestions.

Whether you're drafting an important email, writing a report, or posting on social media, this extension helps you communicate your ideas perfectly.

How to Use
It couldn't be simpler:
1. Auto-Check as You Type: Type into any input field or composer—the extension automatically checks your text and shows a quick-fix badge.
2. Select Text & Shortcut: Highlight any sentence and right-click to choose "Fix Grammar & Rephrase", or simply press Alt+Shift+G (Option+Shift+G on Mac).
3. Review Suggestions: A clean modal overlay appears with one strict grammar correction and tailored rephrasing alternatives.
4. Copy or Apply: Click "Apply Fix" for instant inline replacement or "Copy" to save suggestions to your clipboard.

Key Features
• 100% Free Chrome Built-in AI: Run on-device with Chrome's built-in Gemini Nano—zero cost, fast, and completely private with no API key required!
• Real-Time Auto-Check: Automatically inspects text inputs as you type with an elegant inline indicator and 1-click quick fix.
• Right-Click or Keyboard Shortcut: Trigger suggestions via context menu or quick Alt+Shift+G / Option+Shift+G shortcut (fully customizable in Chrome).
• AI-Powered Corrections: Fix complex grammar mistakes, typos, and improve sentence structure without altering your original meaning.
• Multiple Tailored Options: Receive one direct grammar fix and two distinct rephrasing choices to find the perfect tone and style.
• Powered by Cloud Gemini Models: Also supports cloud Gemini 2.5 Flash and Gemini 2.0 Flash for maximum creative rephrasing power.
• Auto-Model Detection: Automatically discovers and configures the active Gemini models supported by your API key.
• Built-In Connection Tester: Verify your API key and connection directly in the settings before you start writing.
• One-Click Clipboard Copy: Quickly paste your refined text wherever you need it.
• Works on Most Websites: Use it on Gmail, webmail, social media, forums, and standard web pages. (Note: Due to custom web interfaces, this extension does not work inside Google Docs or apps that override standard browser context menus.)
• Private & Secure: Your Gemini API key is stored securely in your browser's sync storage. Selected text is sent directly to Google's official API—never through third-party proxy servers.

Easy Setup
1. Get a free Gemini API key from Google AI Studio (https://aistudio.google.com/).
2. Open the extension Options page, paste your key, and click "Test Connection".
3. Click "Save Settings" and you're ready to write with confidence!

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Fixes grammar and provides rephrasing alternatives for user-selected text using the Gemini API.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `images/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | 🟡 Required | `screenshot-modal.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Recommended | `screenshot-options.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Optional | `promo-small.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Optional | `promo-marquee.png` |

---

## Permissions Justification

| Permission | Type | Justification (for Chrome Reviewers) |
|------------|------|---------------------------------------|
| `contextMenus` | permissions | Required to add the "Fix Grammar & Rephrase" item to the user's right-click context menu when text is selected. |
| `activeTab` | permissions | Required to display the suggestions modal and inject styles directly onto the user's active page only when they explicitly invoke the context menu. |
| `scripting` | permissions | Required to dynamically insert the content script (`content.js`) and modal stylesheet (`style.css`) into the active tab upon clicking the context menu item. |
| `storage` | permissions | Required to securely save the user's Gemini API key and model preference across their synced Chrome browser instances. |
| `https://generativelanguage.googleapis.com/*` | host_permissions | Required to send the user-selected text to the Google Gemini API (`generativelanguage.googleapis.com`) to generate grammar corrections and rephrasings. |

---

## Privacy & Data Use

### Data Collection Disclosure

**Does the extension collect user data?** Yes (Website Content & User Activity for AI processing)

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Authentication info (API Key) | Yes | No (Stored locally in chrome.storage.sync) | Authentication | No |
| Website content (Selected Text) | Yes | Yes (Sent directly to Google Gemini API) | Core Functionality | Only with Google Generative AI API per user request |
| Personally identifiable info | No | No | N/A | No |
| Web history / URLs | No | No | N/A | No |
| User activity | No | No | N/A | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.2.1 | 2026-10-11 | Centered modal UI fix using flexbox overlay, added Escape key dismissal, added Alt+Shift+G keyboard shortcut with dynamic OS context menu label, API timeout protection, and auto-model discovery | Ready to Submit |
| 1.2 | 2026-10-11 | Migrated Gemini API to gemini-2.5-flash, added connection tester | Superseded |
| 1.1 | Previous | Initial release | Published |
