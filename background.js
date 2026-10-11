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

/**
 * Translates technical Gemini API errors into clear, friendly guidance for non-tech users.
 * @param {string} rawError The raw technical error message from Google or fetch.
 * @returns {string} User-friendly explanation and next step.
 */
function formatFriendlyErrorMessage(rawError) {
  if (!rawError || typeof rawError !== 'string') {
    return "An unexpected error occurred while communicating with Gemini. Please try again.";
  }

  const err = rawError.trim();
  const lower = err.toLowerCase();

  // 1. Quota exceeded / Rate limit (HTTP 429)
  if (lower.includes("quota") || lower.includes("rate limit") || lower.includes("resource has been exhausted") || lower.includes("free_tier_requests")) {
    const retryMatch = err.match(/retry in\s+([0-9a-z.]+)/i);
    let timeText = "";
    if (retryMatch && retryMatch[1]) {
      const cleanTime = retryMatch[1].replace(/\.\d+s/, 's').replace(/([0-9]+[a-z]+)/g, '$1 ').trim();
      timeText = ` (resets in ~${cleanTime})`;
    }
    return `Daily free quota reached for this model${timeText}. Please try again later, or switch to another model in the extension Options.`;
  }

  // 2. Model deprecated / no longer available / not found (HTTP 404)
  if (lower.includes("no longer available") || lower.includes("not found") || lower.includes("not supported") || lower.includes("listmodels")) {
    const matches = [...err.matchAll(/models\/([a-zA-Z0-9.-]+)/g)].map(m => m[1]);
    const recommended = matches.find(m => !lower.includes("modelservice") && m !== "gemini-1.5-flash" && m !== "gemini-2.0-flash" && m !== "gemini-2.5-flash");
    if (recommended) {
      return `The selected model is no longer available. Please open extension Options and switch to a supported model (such as "${recommended}").`;
    }
    return "The selected Gemini model is no longer available or supported. Please open extension Options to select another model.";
  }

  // 3. High demand / Server busy / Overloaded (HTTP 503)
  if (lower.includes("high demand") || lower.includes("overloaded") || lower.includes("capacity") || lower.includes("temporarily unavailable") || lower.includes("503")) {
    return "Gemini servers are currently experiencing high demand. Spikes are temporary—please try again in a few moments.";
  }

  // 4. Invalid API Key
  if (lower.includes("api_key_invalid") || lower.includes("api key not valid") || lower.includes("unregistered callers")) {
    return "Your Gemini API key appears invalid or expired. Please check and re-enter your key in the extension Options.";
  }

  // 5. Missing API Key
  if (lower.includes("api key not found")) {
    return "Gemini API key not found. Please set your API key in the extension Options page.";
  }

  // 6. Safety Filter
  if (lower.includes("safety") || lower.includes("blocked this request")) {
    return "Gemini was unable to process this text due to content safety policies.";
  }

  // 7. Timeout or Network Issue
  if (lower.includes("timed out") || lower.includes("abort") || lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Connection timed out. Gemini took too long to respond. Please check your connection and try again.";
  }

  // 8. JSON Mode unsupported
  if (lower.includes("json mode is not enabled")) {
    return "This model does not support formatted responses. Please switch to a recommended Flash model in Options.";
  }

  // 9. Generic clean-up: remove raw URLs and technical wrappers like "Gemini API Error ( ... )"
  let cleanMsg = err
    .replace(/^Gemini API Error\s*\(/i, '')
    .replace(/\)$/, '')
    .replace(/https?:\/\/[^\s)]+/g, '')
    .replace(/\s*\*+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanMsg.length > 0 ? `Gemini Error: ${cleanMsg}` : "Unable to get suggestions from Gemini. Please try again.";
}

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
    const rawModel = data.geminiModel?.trim() || "gemini-3.8-flash";
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
      const friendlyMessage = formatFriendlyErrorMessage(error.message);
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RESULT', data: friendlyMessage, isError: true }).catch(() => {});
    } catch (sendError) {
      console.error("Could not send error message to content script:", sendError);
    }
  }
}

// 3. Message handler for real-time auto-check from content script
const autoCheckCache = new Map();
const MAX_CACHE_SIZE = 100;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AUTO_CHECK_GRAMMAR') {
    handleAutoCheckGrammar(request.text)
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

async function handleAutoCheckGrammar(text) {
  if (!text || typeof text !== 'string') {
    return { hasErrors: false };
  }

  const cleanText = text.trim();
  if (cleanText.length < 15) {
    return { hasErrors: false };
  }

  // Check cache first
  if (autoCheckCache.has(cleanText)) {
    return autoCheckCache.get(cleanText);
  }

  // Retrieve API key and model preference
  const data = await chrome.storage.sync.get(['geminiApiKey', 'geminiModel']);
  const apiKey = data.geminiApiKey?.trim();
  if (!apiKey) {
    return { hasErrors: false, error: 'NO_API_KEY' };
  }

  const rawModel = data.geminiModel?.trim() || "gemini-2.5-flash";
  const model = rawModel.replace(/^models\//, "");

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const promptText = `You are a real-time grammar and spell checker. Analyze the following text carefully.
If there are any spelling, punctuation, or grammar errors, set has_errors to true and provide the corrected_text. Keep the author's original style and vocabulary intact.
If the text has no mistakes or is already grammatically sound, set has_errors to false and return the original text as corrected_text.

Text to inspect:
${JSON.stringify(cleanText)}`;

  const payload = {
    contents: [
      {
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties: {
          has_errors: {
            type: "BOOLEAN",
            description: "True if the original text had grammar, spelling, or punctuation errors."
          },
          corrected_text: {
            type: "STRING",
            description: "The text with grammar and spelling corrected."
          },
          explanation: {
            type: "STRING",
            description: "Short 1-sentence description of the corrections made."
          }
        },
        required: ["has_errors", "corrected_text"]
      }
    }
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) errDetail = errJson.error.message;
    } catch (_) {}
    throw new Error(errDetail);
  }

  const responseData = await response.json();
  const candidate = responseData.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    return { hasErrors: false };
  }

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
      return { hasErrors: false };
    }
  }

  let hasErrors = Boolean(resultJson.has_errors);
  const correctedText = (resultJson.corrected_text || "").trim();

  // If text is identical, mark as no errors
  if (correctedText === cleanText) {
    hasErrors = false;
  }

  const result = {
    hasErrors,
    correctedText: hasErrors ? correctedText : cleanText,
    explanation: resultJson.explanation || (hasErrors ? "Grammar & spelling corrections" : "")
  };

  // Cache result
  if (autoCheckCache.size >= MAX_CACHE_SIZE) {
    const firstKey = autoCheckCache.keys().next().value;
    autoCheckCache.delete(firstKey);
  }
  autoCheckCache.set(cleanText, result);

  return result;
}

