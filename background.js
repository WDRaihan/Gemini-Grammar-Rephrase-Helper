// background.js

// Helper to configure context menu with active keyboard shortcut label
async function setupContextMenu() {
  let shortcutLabel = "Alt+Shift+G";
  try {
    const commands = await chrome.commands.getAll();
    const cmd = commands.find(c => c.name === "fix-grammar-rephrase");
    if (cmd && cmd.shortcut) {
      shortcutLabel = cmd.shortcut;
    }
  } catch (_) {}

  // Format label cleanly for current OS
  try {
    const platform = await chrome.runtime.getPlatformInfo();
    if (platform?.os === "mac") {
      shortcutLabel = shortcutLabel.replace(/^Alt\+/i, "Option+");
    }
  } catch (_) {}

  const menuTitle = shortcutLabel ? `Fix Grammar && Rephrase (${shortcutLabel})` : "Fix Grammar && Rephrase";

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "fix-grammar-rephrase",
      title: menuTitle,
      contexts: ["selection"]
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenu);
chrome.runtime.onStartup.addListener(setupContextMenu);

// Helper to check if a URL is restricted from extension scripting
function isRestrictedUrl(url) {
  return !url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.includes("chromewebstore.google.com");
}

// 1. Right-Click Context Menu Handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "fix-grammar-rephrase" || !info.selectionText || !tab?.id) {
    return;
  }
  await processFixGrammar(info.selectionText.trim(), tab);
});

// 2. Keyboard Shortcut Command Handler (Alt+Shift+G / Option+Shift+G)
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "fix-grammar-rephrase") return;

  let targetTab = tab;
  if (!targetTab?.id) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTab = activeTab;
  }

  if (!targetTab?.id || isRestrictedUrl(targetTab.url)) {
    console.warn("Cannot run on restricted or unavailable tab:", targetTab?.url);
    return;
  }

  // Retrieve selected text from the active page (supports regular DOM elements, inputs, and textareas)
  let selectedText = "";
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: () => {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || (activeEl.tagName === 'INPUT' && /^(text|search|url|tel|email)$/i.test(activeEl.type)))) {
          const start = activeEl.selectionStart;
          const end = activeEl.selectionEnd;
          if (typeof start === 'number' && typeof end === 'number' && start !== end) {
            return activeEl.value.substring(start, end);
          }
        }
        return window.getSelection().toString();
      }
    });
    selectedText = result?.result?.trim() || "";
  } catch (err) {
    console.warn("Could not retrieve selection:", err);
  }

  // If no text is currently selected, display a prompt modal
  if (!selectedText) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: targetTab.id }, files: ["style.css"] });
      await chrome.scripting.executeScript({ target: { tabId: targetTab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(targetTab.id, {
        type: 'SHOW_RESULT',
        data: 'Please select some text first, then press the shortcut (or right-click) to fix grammar and rephrase.',
        isError: true
      });
    } catch (_) {}
    return;
  }

  await processFixGrammar(selectedText, targetTab);
});

// Common processor for both Context Menu and Keyboard Shortcut
async function processFixGrammar(text, tab) {
  if (!text || !tab?.id || isRestrictedUrl(tab.url)) {
    return;
  }

  try {
    // 1. Inject CSS and content script into the active tab
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["style.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });

    // 2. Check for the API key and model preference
    const data = await chrome.storage.sync.get(['geminiApiKey', 'geminiModel']);
    const apiKey = data.geminiApiKey?.trim();
    const rawModel = data.geminiModel?.trim() || "gemini-2.5-flash";
    const model = rawModel.replace(/^models\//, "");

    // 3. Handle missing API key
    if (!apiKey) {
      const errorMessage = "Gemini API key not found. Please set your API key in the extension's options page.";
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RESULT', data: errorMessage, isError: true }).catch(() => {});
      chrome.runtime.openOptionsPage();
      return;
    }

    // 4. Show loading modal
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' }).catch(() => {});

    // 5. Make the API call to Gemini with timeout protection
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const promptText = `You are a writing assistant. For the following text, provide:
1. One version that ONLY corrects grammar, spelling, and punctuation mistakes without changing the style.
2. Two separate versions rephrased for better clarity, tone, and flow.

Return a valid JSON object matching this exact schema:
{
  "grammar_fix": "text with only grammar and spelling corrected",
  "rephrases": [
    "first rephrased version",
    "second rephrased version"
  ]
}

Original text:
${JSON.stringify(text)}`;

    const payload = {
      contents: [{
        parts: [{ text: promptText }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000); // 18-second timeout

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        throw new Error("Request timed out after 18 seconds. Gemini took too long to respond. Please try again.");
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errorJson = await response.json();
        if (errorJson.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch (_) {}
      throw new Error(`Gemini API Error (${errorDetail})`);
    }

    const responseData = await response.json();
    const candidate = responseData.candidates?.[0];

    // Check if output was blocked by safety filters
    if (!candidate?.content?.parts?.[0]?.text) {
      if (candidate?.finishReason === "SAFETY") {
        throw new Error("Gemini blocked this request due to safety policies.");
      }
      throw new Error(`Empty response from Gemini API (finish reason: ${candidate?.finishReason || 'UNKNOWN'}).`);
    }

    // Clean potential markdown code blocks before JSON parsing
    let rawText = candidate.content.parts[0].text.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }

    let resultJson;
    try {
      resultJson = JSON.parse(rawText);
    } catch (_) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        resultJson = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse JSON response from Gemini.");
      }
    }

    const suggestions = [];
    const grammarFix = resultJson.grammar_fix || resultJson.grammarFix || resultJson.correction;
    if (grammarFix) {
      suggestions.push(grammarFix);
    }

    const rephrases = resultJson.rephrases || resultJson.alternatives || [];
    if (Array.isArray(rephrases)) {
      suggestions.push(...rephrases);
    } else if (typeof rephrases === 'string') {
      suggestions.push(rephrases);
    }

    if (suggestions.length === 0) {
      throw new Error("No suggestions were returned by the model.");
    }

    // 6. Send suggestions to content script
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RESULT', data: suggestions, isError: false }).catch(() => {});

  } catch (error) {
    console.error("Error during Gemini request:", error);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RESULT', data: error.message, isError: true }).catch(() => {});
    } catch (sendError) {
      console.error("Could not send error message to content script:", sendError);
    }
  }
}
