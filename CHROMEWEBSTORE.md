# Chrome Web Store Listing — Gemini Grammar & Rephrase Helper

> Last Updated: 2026-10-11

## Store Listing

**Extension Name** [REQUIRED]
Gemini Grammar & Rephrase Helper

**Short Description** [REQUIRED]
Auto-check grammar & rephrase with free Chrome Built-in AI or Gemini. Real-time checks as you type + smart right-click suggestions.

**Detailed Description** [REQUIRED]
Gemini Grammar & Rephrase Helper – AI Writing Assistant

Write clearly and confidently across the web with Gemini Grammar & Rephrase Helper. Instantly correct grammar and spelling, improve tone, and rephrase sentences using Google Gemini AI or supported Chrome Built-in AI—all directly from your browser.

⚡ NEW: Chrome Built-in AI Support
Use Chrome's built-in Prompt API with Gemini Nano for on-device writing assistance, without an external API key or cloud API requests. Availability depends on your Chrome version, device, and AI configuration.

🌐 Official Website & Documentation: https://ggrh.atplugins.com/

Your AI Writing Assistant for the Web
Tired of typos, awkward sentences, or struggling to find the right words? Whether you're writing professional emails in Gmail, sharing updates on LinkedIn, responding to customer inquiries, or chatting with your team on Slack, Gemini Grammar & Rephrase Helper helps you communicate more clearly and professionally.

Looking for an alternative to Grammarly? Get AI-powered grammar correction, natural rephrasing, and flexible writing tools directly in your browser, with a choice of supported AI processing methods.

✨ Key Features

🆓 Free Features
1. Grammar & Spelling Correction
Fix grammatical errors, spelling mistakes, punctuation issues, and awkward sentences while preserving your original meaning.

2. Three AI-Powered Writing Suggestions
Get three suggestions for each check:
• One direct grammar correction.
• Two natural rephrasing alternatives.
Choose the version that best fits your message and writing style.

3. Real-Time Inline Writing Assistance
A floating sparkle badge appears in supported text fields, including textareas and comment boxes. When an issue is detected, open the suggestions and compare your original text with the proposed correction using a side-by-side difference view.

4. Right-Click Context Menu
Select text on a webpage, right-click, and choose “Fix Grammar & Rephrase with Gemini” to improve your writing without switching tabs.

5. Convenient Keyboard Shortcut
Use Alt + Shift + G on Windows or Linux, or Option + Shift + G on Mac, to quickly rephrase selected text.

6. Google Gemini Cloud AI
Connect your own API key from Google AI Studio and use supported Gemini models, including Gemini 2.5 Flash and other models available to your configuration.
Get started with Google AI Studio: https://aistudio.google.com/

7. Chrome Built-in AI with Gemini Nano
Use supported Chrome Built-in AI capabilities for on-device text processing. When processing stays entirely on-device, your text does not need to be sent to a cloud AI service.
No external Gemini API key is required for this mode. Availability depends on your browser and device.

8. One-Click Copy
Copy any suggested correction or rephrased sentence to your clipboard instantly.

9. Customizable Auto-Check Thresholds
Choose when automatic checking begins, such as after a space is entered or after a specified number of characters.

10. Direct API Communication
When using Gemini Cloud, the extension sends text directly to Google's Gemini API using your configured API key, without routing requests through a third-party proxy server.

⭐ Pro Features
Unlock additional writing tools designed for professional communication and everyday productivity.

1. Executive & Formal Writing Presets
Turn casual drafts into polished, professional messages suitable for business emails, formal correspondence, and executive communication.

2. Casual Chat & Slack Presets
Make formal or overly stiff messages sound more natural, friendly, and approachable for team chats and informal conversations.

3. Multilingual Translation & Rephrasing
Translate and rewrite text in Bangla, Arabic, Spanish, French, German, and other supported languages.

4. Simplify Text & Create Bullet Points
Make complex writing easier to understand, simplify content for a general audience, or convert long paragraphs into concise bullet points.

5. Unlimited Custom Prompts
Create your own instructions to control how Gemini rewrites your text. For example:
• “Write like an enthusiastic startup founder.”
• “Make this message persuasive for an investor pitch.”
• “Rewrite this email in a polite and professional tone.”

6. One-Click Inline Apply
Apply a suggested correction directly to the original text field using the Apply Fix button—no manual copying and pasting required.

7. Personal Rephrasing History
Access your latest 50 rephrasing results with timestamps, full-text keyword search, style filters, and JSON export.

8. Multi-Device License Management
Manage your active browser licenses through the Freemius customer portal.

🚀 Quick Setup: Get Started in Three Steps
Step 1: Pin the Extension
Click the Extensions puzzle-piece icon in Chrome and pin Gemini Grammar & Rephrase Helper to your toolbar for easy access.

Step 2: Configure Your AI
Open the extension's settings and choose your preferred processing method:
• Google Gemini Cloud: Add your API key from https://aistudio.google.com/
• Chrome Built-in AI: Enable this option if your Chrome version and device support the required on-device AI features.

Step 3: Start Writing
Type in a supported text field, select text and use the right-click menu, or press the keyboard shortcut to access grammar corrections and rephrasing suggestions.

🔒 Privacy & Security
Your privacy matters. Gemini Grammar & Rephrase Helper is designed to let you choose how your text is processed.
• No third-party proxy servers: Gemini Cloud requests are sent directly to Google's official API.
• No extension-operated text collection: The extension does not store, sell, or monitor your personal text on its own servers.
• Your API key: Your configured Gemini API key is stored in browser storage and used to communicate with Google's API.
• On-device processing: When using Chrome Built-in AI, supported text processing takes place locally on your computer, without sending the text to a cloud AI service for that operation.

Cloud AI processing is subject to Google's applicable API terms and data-handling policies. Review the extension's privacy policy for complete details.
Privacy Policy: https://wdraihan.github.io/gemini-fix-grammar-and-rephrase-helper-extension-privacy/

🌐 Learn More & Get Support
Website & Documentation: https://ggrh.atplugins.com/

Write better. Communicate clearly. Work confidently.
Make Gemini Grammar & Rephrase Helper your everyday AI writing companion for clearer, more natural, and more professional communication across the web.

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
| `content_scripts (<all_urls>)` | content_scripts | Required to detect editable text fields and provide real-time inline grammar checking and correction badges across any website the user writes on (emails, social media, web forms). |
| `contextMenus` | permissions | Required to add the "Fix Grammar & Rephrase" item to the user's right-click context menu when text is selected. |
| `activeTab` | permissions | Required to display the suggestions modal and inject styles directly onto the user's active page when the user explicitly triggers a check. |
| `scripting` | permissions | Required to dynamically insert the content script and styles into the active tab upon clicking the context menu item or shortcut. |
| `storage` | permissions | Required to securely save the user's Gemini API key, tone presets, and preferences locally in the browser. |
| `https://generativelanguage.googleapis.com/*` | host_permissions | Required to send user-selected text directly to Google's official Gemini API to generate grammar corrections and rephrasings. |
| `https://api.freemius.com/*` | host_permissions | Required to securely validate optional Pro feature license keys via the Freemius API. |

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
