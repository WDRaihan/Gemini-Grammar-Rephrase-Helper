# Gemini Grammar & Rephrase Helper

A Chrome Extension (Manifest V3) that uses the Google Gemini API to fix grammar mistakes and generate instant rephrasings for any selected text on the web.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)
![Version](https://img.shields.io/badge/Version-1.2.1-green.svg)
![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)

---

## ✨ Features

- **Context Menu & Shortcut**: Highlight text on any webpage and right-click to choose **"Fix Grammar & Rephrase"**, or press `Option+Shift+G` (macOS) / `Alt+Shift+G` (Windows/Linux).
- **Intelligent Corrections**: Uses Google's Gemini models (`gemini-2.5-flash` or `gemini-2.0-flash`) via structured JSON output for reliable parsing.
- **Multiple Options**: Provides 1 direct grammar fix and 2 rephrasing variations.
- **Modern Modal UI**: Floating, responsive modal overlay with one-click copy to clipboard.
- **Options & Model Customization**: Built-in options page with API key validation, connection test button, model picker, and rephrase tone preferences.
- **Privacy-First**: Your Gemini API key is stored locally in your browser's `chrome.storage.sync`. Text is sent directly to Google's official API endpoint—no third-party proxy servers.

---

## 🚀 Installation & Setup

### 1. Load the Extension in Developer Mode
1. Clone or download this repository:
   ```bash
   git clone https://github.com/WDRaihan/Gemini-Grammar-Rephrase-Helper.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** and select the extension folder (`Gemini-Grammar-Rephrase-Helper`).

### 2. Configure Your Gemini API Key
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. Click the extension icon or right-click the extension to open **Options**.
3. Paste your API key, click **Test Connection** to verify, and save your settings.

---

## ⌨️ Keyboard Shortcut

- **macOS**: `Option + Shift + G`
- **Windows / Linux**: `Alt + Shift + G`

You can customize this shortcut at any time by visiting `chrome://extensions/shortcuts` in Chrome.

---

## 🛠️ Tech Stack & Permissions

- **Manifest Version**: 3
- **APIs Used**: `chrome.contextMenus`, `chrome.commands`, `chrome.scripting`, `chrome.storage`, `chrome.activeTab`
- **Host Permissions**: `https://generativelanguage.googleapis.com/*`

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
