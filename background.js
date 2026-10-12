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

// Open options page when user clicks the extension toolbar icon
if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
  });
}

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

  // 7. Network Disconnect or Blocked
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Network connection error. Unable to reach Google servers. Please check your internet connection or VPN.";
  }

  // 8. Timeout
  if (lower.includes("timed out") || lower.includes("abort")) {
    return "Request timed out. Google Gemini took too long to generate suggestions. Please try again or ensure a fast Flash model is selected in Options.";
  }

  // 8. JSON Mode unsupported
  if (lower.includes("json mode is not enabled")) {
    return "This model does not support formatted responses. Please switch to a recommended Flash model in Options.";
  }

  // 9. Token limit reached / Response cut off midway
  if (lower.includes("could not parse json") || lower.includes("max_tokens") || lower.includes("token limit")) {
    return "Gemini response was interrupted before completion. This happens when 'Max Output Tokens' is set too low. Please switch to 'No Limit' in Extension Preferences.";
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

const FREEMIUS_PRICING_ID = "98283";
const DEFAULT_FS_PRODUCT_ID = "41271";

async function getOrCreateDeviceUid() {
  const sync = await chrome.storage.sync.get(['fs_device_uid']);
  if (sync.fs_device_uid) {
    return sync.fs_device_uid;
  }
  const local = await chrome.storage.local.get(['fs_device_uid']);
  if (local.fs_device_uid) {
    await chrome.storage.sync.set({ fs_device_uid: local.fs_device_uid });
    return local.fs_device_uid;
  }
  const newUid = crypto.randomUUID().replace(/-/g, '');
  await Promise.all([
    chrome.storage.sync.set({ fs_device_uid: newUid }),
    chrome.storage.local.set({ fs_device_uid: newUid })
  ]);
  return newUid;
}

async function getProStatus() {
  const syncData = await chrome.storage.sync.get(['isPro', 'fs_license_key', 'fs_plan_name', 'fs_product_id', 'fs_install_id']);
  return {
    isPro: syncData.isPro === true,
    licenseKey: syncData.fs_license_key || '',
    planName: syncData.fs_plan_name || 'Free',
    productId: syncData.fs_product_id || DEFAULT_FS_PRODUCT_ID,
    installId: syncData.fs_install_id || ''
  };
}

async function activateFreemiusLicense(licenseKey, userProductId) {
  if (!licenseKey) throw new Error("License key is required.");

  const uid = await getOrCreateDeviceUid();
  const productId = userProductId || (await chrome.storage.sync.get(['fs_product_id'])).fs_product_id || DEFAULT_FS_PRODUCT_ID;

  const activateUrl = `https://api.freemius.com/v1/products/${encodeURIComponent(productId)}/licenses/activate.json`;

  const response = await fetch(activateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: uid,
      license_key: licenseKey.trim(),
      title: "Chrome Extension (WebExtension)"
    })
  });

  if (!response.ok) {
    let errDetail = `Activation failed (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.error?.code === 'license_utilized' || /quota/i.test(errJson.error?.message || '')) {
        errDetail = "License quota reached (1 active device limit). Please release previous install at customers.freemius.com or click Deactivate before uninstalling.";
      } else if (errJson.error?.message) {
        errDetail = errJson.error.message;
      }
    } catch (_) {}
    throw new Error(errDetail);
  }

  const data = await response.json();

  await chrome.storage.sync.set({
    isPro: true,
    fs_license_key: licenseKey.trim(),
    fs_install_id: data.install_id || '',
    fs_install_token: data.install_api_token || '',
    fs_plan_name: data.license_plan_name || 'Pro',
    fs_plan_id: data.license_plan_id || '',
    fs_product_id: productId
  });

  return {
    success: true,
    planName: data.license_plan_name || 'Pro',
    installId: data.install_id
  };
}

async function deactivateFreemiusLicense() {
  const data = await chrome.storage.sync.get(['fs_license_key', 'fs_install_id', 'fs_product_id']);
  const uid = await getOrCreateDeviceUid();
  const productId = data.fs_product_id || DEFAULT_FS_PRODUCT_ID;

  if (data.fs_install_id && data.fs_license_key) {
    try {
      await fetch(`https://api.freemius.com/v1/products/${encodeURIComponent(productId)}/licenses/deactivate.json?fields=id%2Cname%2Cslug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: uid,
          install_id: data.fs_install_id,
          license_key: data.fs_license_key
        })
      });
    } catch (_) {}
  }

  await chrome.storage.sync.set({
    isPro: false,
    fs_license_key: '',
    fs_install_id: '',
    fs_install_token: '',
    fs_plan_name: 'Free'
  });

  return { success: true };
}

function buildPromptForStyle(text, style = 'default', customPrompt = '', storedPresets = []) {
  // 1. Check if style matches any preset (built-in or custom) in storedPresets
  if (Array.isArray(storedPresets) && storedPresets.length > 0) {
    const matchedPreset = storedPresets.find(p => p.id === style);
    if (matchedPreset && matchedPreset.prompt) {
      return `You are an expert AI writing assistant. Transform the following text strictly according to this writing instruction:
"${matchedPreset.prompt.trim()}"

Provide:
1. One primary version fulfilling this instruction.
2. Two alternative variations that also fulfill the instruction in slightly different ways.

Return a valid JSON object matching this exact schema:
{
  "grammar_fix": "primary version fulfilling instruction",
  "rephrases": [
    "first alternative variation",
    "second alternative variation"
  ]
}

Original text:
${JSON.stringify(text)}`;
    }
  }

  // 2. Built-in styles fallback if storedPresets did not match
  switch (style) {
    case 'formal':
      return `You are an executive communication assistant. Rewrite the following text in an executive, formal, and polished professional tone suitable for high-level business correspondence. Fix all grammar and elevate vocabulary.
Provide:
1. One direct formal version that preserves original phrasing but elevates tone and ensures correctness.
2. Two distinct formal variations.

Return a valid JSON object matching this exact schema:
{
  "grammar_fix": "direct formal version",
  "rephrases": [
    "first formal alternative",
    "second formal alternative"
  ]
}

Original text:
${JSON.stringify(text)}`;

    case 'simplify':
      return `You are a plain-language writing assistant. Rewrite the following text so that an elementary school student (5th grader) can effortlessly understand it. Use simple, direct words, short sentences, and avoid jargon while preserving the core meaning.
Provide:
1. One direct simple version.
2. Two alternative simple variations.

Return a valid JSON object matching this exact schema:
{
  "grammar_fix": "direct simplified 5th grader version",
  "rephrases": [
    "first alternative simplified version",
    "second alternative simplified version"
  ]
}

Original text:
${JSON.stringify(text)}`;

    case 'bullets':
      return `You are a concise information architect. Convert the key ideas and points from the following text into clear, readable, and structured bullet points (use • symbol).
Provide:
1. One structured bullet-point version.
2. Two alternative bullet-point variations (one concise, one detailed).

Return a valid JSON object matching this exact schema:
{
  "grammar_fix": "bullet point summary version",
  "rephrases": [
    "concise bullet points version",
    "actionable bullet points version"
  ]
}

Original text:
${JSON.stringify(text)}`;

    case 'slack':
      return `You are a modern workplace communication assistant. Rewrite the following text as a casual, warm, and natural workplace chat message (ideal for Slack, Teams, or Discord). It should sound friendly, concise, and approachable while remaining polite and professional.
Provide:
1. One natural casual chat version.
2. Two alternative casual variations.

Return a valid JSON object matching this exact schema:
{
  "grammar_fix": "casual workplace chat version",
  "rephrases": [
    "first casual chat variation",
    "second casual chat variation"
  ]
}

Original text:
${JSON.stringify(text)}`;

    case 'custom':
      const instruction = customPrompt.trim() || "Improve clarity and style";
      return `You are an expert AI writing assistant. Transform the following text strictly according to this custom instruction:
"${instruction}"

Provide:
1. Primary version fulfilling the custom instruction.
2. Two creative variations that also fulfill the instruction in slightly different ways.

Return a valid JSON object matching this exact schema:
{
  "grammar_fix": "primary version meeting instruction",
  "rephrases": [
    "first variation meeting instruction",
    "second variation meeting instruction"
  ]
}

Original text:
${JSON.stringify(text)}`;

    default:
      return `You are a writing assistant. For the following text, provide:
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
  }
}

// Common processor for both Context Menu, Shortcut, and Style Selection
async function processFixGrammar(text, tab, style = 'default', customPrompt = '') {
  if (!text || !tab?.id || isRestrictedUrl(tab.url)) {
    return;
  }

  // 1. Fetch settings in parallel
  const [proInfo, syncData] = await Promise.all([
    getProStatus(),
    chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'maxOutputTokens', 'stylePresets'])
  ]);
  const isPro = proInfo.isPro;

  // Gate pro styles
  if (style !== 'default' && !isPro) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_RESULT',
        data: "Style presets and custom prompts are Pro features. Please upgrade to Pro to unlock them.",
        isError: true,
        originalText: text,
        activeStyle: style,
        isPro: false
      });
    } catch (_) {}
    return;
  }

  const apiKey = syncData.geminiApiKey?.trim();
  let rawModel = syncData.geminiModel?.trim() || "gemini-3.8-flash";
  if (rawModel === "gemini-2.0-flash") {
    rawModel = "gemini-3.8-flash";
  }
  const model = rawModel.replace(/^models\//, "");

  // Helper to ensure content script is ready and send message
  const sendTabMessage = async (msg) => {
    try {
      await chrome.tabs.sendMessage(tab.id, msg);
    } catch (_) {
      // Fallback: inject content script if not already present on page
      try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["style.css"] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        await chrome.tabs.sendMessage(tab.id, msg);
      } catch (injectErr) {
        console.warn("Could not send message or inject script into tab:", injectErr);
      }
    }
  };

  try {
    // 2. Check for missing API key
    if (!apiKey) {
      const errorMessage = "Gemini API key not found. Please set your API key in the extension's options page.";
      await sendTabMessage({
        type: 'SHOW_RESULT',
        data: errorMessage,
        isError: true,
        originalText: text,
        activeStyle: style,
        isPro
      });
      chrome.runtime.openOptionsPage();
      return;
    }

    // 3. Show loading modal immediately for instant user feedback
    await sendTabMessage({
      type: 'SHOW_LOADING',
      originalText: text,
      activeStyle: style,
      isPro
    });

    // 4. Make the API call to Gemini with timeout protection
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const promptText = buildPromptForStyle(text, style, customPrompt, syncData.stylePresets || []);
    const rawTokens = typeof syncData.maxOutputTokens !== 'undefined' ? Number(syncData.maxOutputTokens) : 0;
    const userMaxTokens = isNaN(rawTokens) ? 0 : rawTokens;

    const generationConfig = {
      temperature: 0.2,
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties: {
          grammar_fix: {
            type: "STRING",
            description: "Primary corrected or rephrased version according to requested style."
          },
          rephrases: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Two alternative rephrased variations."
          }
        },
        required: ["grammar_fix", "rephrases"]
      }
    };

    // If userMaxTokens > 0, cap output to conserve quota; if 0 (No Limit), allow full native model length
    if (userMaxTokens > 0) {
      generationConfig.max_output_tokens = userMaxTokens;
    }

    const payload = {
      contents: [{
        parts: [{ text: promptText }]
      }],
      generationConfig
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25-second timeout for server load spikes

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
        throw new Error("Request timed out after 25 seconds. Gemini took too long to respond. Please try again.");
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
    const finishReason = candidate?.finishReason || 'UNKNOWN';

    // Check if output was blocked by safety filters or finished due to max tokens
    if (!candidate?.content?.parts?.[0]?.text) {
      if (finishReason === "SAFETY") {
        throw new Error("Gemini blocked this request due to content safety policies.");
      }
      if (finishReason === "MAX_TOKENS") {
        throw new Error("Token limit reached: Gemini was cut off because 'Max Output Tokens' was set too low. Please switch to 'No Limit' in Extension Preferences.");
      }
      throw new Error(`Empty response from Gemini API (finish reason: ${finishReason}).`);
    }

    // Clean potential markdown code blocks before JSON parsing
    let rawText = candidate.content.parts[0].text.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }

    let resultJson = null;
    try {
      resultJson = JSON.parse(rawText);
    } catch (_) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          resultJson = JSON.parse(match[0]);
        } catch (_) {}
      }
    }

    const suggestions = [];

    if (resultJson) {
      const grammarFix = resultJson.grammar_fix || resultJson.grammarFix || resultJson.correction;
      if (grammarFix) suggestions.push(grammarFix);

      const rephrases = resultJson.rephrases || resultJson.alternatives || [];
      if (Array.isArray(rephrases)) {
        suggestions.push(...rephrases);
      } else if (typeof rephrases === 'string') {
        suggestions.push(rephrases);
      }
    } else {
      // Partial salvage attempt: if JSON was cut off midway by MAX_TOKENS, extract what was completed!
      const grammarMatch = rawText.match(/"grammar_fix"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
      if (grammarMatch && grammarMatch[1]) {
        suggestions.push(grammarMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
      }

      const rephrasesBlockMatch = rawText.match(/"rephrases"\s*:\s*\[([\s\S]*)/i);
      if (rephrasesBlockMatch && rephrasesBlockMatch[1]) {
        const itemMatches = [...rephrasesBlockMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        itemMatches.forEach(m => {
          if (m[1]) suggestions.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
        });
      }
    }

    if (suggestions.length === 0) {
      if (finishReason === "MAX_TOKENS") {
        throw new Error("Token limit reached: Gemini was cut off because 'Max Output Tokens' was set too low. Please switch to 'No Limit' in Extension Preferences.");
      }
      throw new Error("Could not parse JSON response from Gemini. Please ensure 'Max Output Tokens' is set to 'No Limit' in Extension Preferences.");
    }

    // 6. Send suggestions to content script with style context
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_RESULT',
      data: suggestions,
      isError: false,
      originalText: text,
      activeStyle: style,
      isPro
    }).catch(() => {});

  } catch (error) {
    console.error("Error during Gemini request:", error);
    try {
      const friendlyMessage = formatFriendlyErrorMessage(error.message);
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_RESULT',
        data: friendlyMessage,
        isError: true,
        originalText: text,
        activeStyle: style,
        isPro
      }).catch(() => {});
    } catch (sendError) {
      console.error("Could not send error message to content script:", sendError);
    }
  }
}

// 3. Message handler for real-time auto-check, styles, and licensing
const autoCheckCache = new Map();
const MAX_CACHE_SIZE = 100;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AUTO_CHECK_GRAMMAR') {
    handleAutoCheckGrammar(request.text)
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.type === 'REPHRASE_WITH_STYLE') {
    const targetTab = sender.tab;
    if (targetTab) {
      processFixGrammar(request.text, targetTab, request.style, request.customPrompt)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }
    sendResponse({ success: false, error: "No active tab found" });
    return false;
  }

  if (request.type === 'ACTIVATE_FS_LICENSE') {
    activateFreemiusLicense(request.licenseKey, request.productId)
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'DEACTIVATE_FS_LICENSE') {
    deactivateFreemiusLicense()
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'GET_PRO_STATUS') {
    getProStatus()
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
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
  const data = await chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'maxOutputTokens']);
  const apiKey = data.geminiApiKey?.trim();
  if (!apiKey) {
    return { hasErrors: false, error: 'NO_API_KEY' };
  }

  const rawModel = data.geminiModel?.trim() || "gemini-3.8-flash";
  const model = rawModel.replace(/^models\//, "");

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const promptText = `You are a real-time grammar and spell checker. Analyze the following text carefully.
If there are any spelling, punctuation, or grammar errors, set has_errors to true and provide the corrected_text. Keep the author's original style and vocabulary intact.
If the text has no mistakes or is already grammatically sound, set has_errors to false and return the original text as corrected_text.

Text to inspect:
${JSON.stringify(cleanText)}`;

  const rawTokens = typeof data.maxOutputTokens !== 'undefined' ? Number(data.maxOutputTokens) : 0;
  const userMaxTokens = isNaN(rawTokens) ? 0 : rawTokens;
  const autoCheckMaxTokens = userMaxTokens > 0 ? Math.min(userMaxTokens, 300) : 300;

  const payload = {
    contents: [
      {
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      max_output_tokens: autoCheckMaxTokens,
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

