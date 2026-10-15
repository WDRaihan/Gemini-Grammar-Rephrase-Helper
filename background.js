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

const WELCOME_URL = "https://ggrh.atplugins.com/";

chrome.runtime.onInstalled.addListener((details) => {
  setupContextMenu();

  // Redirect user to welcome website on fresh installation only
  if (details.reason === 'install') {
    chrome.tabs.create({ url: WELCOME_URL });
  }
});
chrome.runtime.onStartup.addListener(setupContextMenu);

// Open options page when user clicks the extension toolbar icon
if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage();
  });
}

// Helper to check if a URL is restricted from extension scripting
function isRestrictedUrl(url) {
  return !url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:") || url.includes("chromewebstore.google.com") || url.includes("addons.mozilla.org");
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

function buildPromptForStyle(text, style = 'default', customPrompt = '', storedPresets = [], numVariations = 2) {
  let instruction = "Correct all grammar, spelling, and punctuation mistakes without changing the style.";

  // 1. Check if style matches any preset (built-in or custom) in storedPresets
  if (Array.isArray(storedPresets) && storedPresets.length > 0) {
    const matchedPreset = storedPresets.find(p => p.id === style);
    if (matchedPreset && matchedPreset.prompt) {
      instruction = matchedPreset.prompt.trim();
    }
  }

  // 2. Built-in styles fallback if storedPresets did not match
  if (instruction === "Correct all grammar, spelling, and punctuation mistakes without changing the style.") {
    switch (style) {
      case 'formal':
        instruction = "Rewrite the following text in an executive, formal, and polished professional tone suitable for high-level business correspondence. Fix all grammar and elevate vocabulary.";
        break;
      case 'simplify':
        instruction = "Rewrite the following text so that an elementary school student (5th grader) can effortlessly understand it. Use simple, direct words, short sentences, and avoid jargon while preserving the core meaning.";
        break;
      case 'bullets':
        instruction = "Convert the key ideas and points from the following text into clear, readable, and structured bullet points (use • symbol).";
        break;
      case 'slack':
        instruction = "Rewrite the following text as a casual, warm, and natural workplace chat message (ideal for Slack, Teams, or Discord). It should sound friendly, concise, and approachable while remaining polite and professional.";
        break;
      case 'custom':
        instruction = customPrompt.trim() || "Improve clarity and style";
        break;
    }
  }

  let provideText = "Provide:\n1. One primary version fulfilling this instruction.";
  let schemaText = '"grammar_fix": "primary version"';

  if (numVariations === 1) {
    provideText += "\n2. One alternative variation that also fulfills the instruction in a slightly different way.";
    schemaText += ',\n  "rephrases": [\n    "one alternative variation"\n  ]';
  } else if (numVariations >= 2) {
    provideText += "\n2. Two distinct alternative variations that also fulfill the instruction in slightly different ways.";
    schemaText += ',\n  "rephrases": [\n    "first alternative variation",\n    "second alternative variation"\n  ]';
  }

  return `You are an expert AI writing assistant.
Task: ${instruction}

${provideText}

Return a valid JSON object matching this exact schema:
{
  ${schemaText}
}

Original text:
${JSON.stringify(text)}`;
}

/**
 * Chrome Built-in AI (Prompt API / Gemini Nano) Integration
 */

function buildBuiltInAIPrompt(text, style = 'default', customPrompt = '', storedPresets = [], numVariations = 2) {
  let instruction = "Correct all grammar, spelling, and punctuation errors. Keep the original meaning and natural tone.";
  
  if (Array.isArray(storedPresets) && storedPresets.length > 0) {
    const matched = storedPresets.find(p => p.id === style);
    if (matched && matched.prompt) {
      instruction = matched.prompt.trim();
    }
  }

  if (instruction === "Correct all grammar, spelling, and punctuation errors. Keep the original meaning and natural tone.") {
    switch (style) {
      case 'formal':
        instruction = "Rewrite the text in an executive, formal, and polished professional tone suitable for business correspondence. Fix all grammar.";
        break;
      case 'simplify':
        instruction = "Rewrite the text so that an elementary school student (5th grader) can effortlessly understand it. Use simple words.";
        break;
      case 'bullets':
        instruction = "Convert the key ideas and points into clear, readable bullet points (using • symbol).";
        break;
      case 'slack':
        instruction = "Rewrite as a casual, warm, and natural workplace chat message (ideal for Slack, Teams, or Discord).";
        break;
      case 'custom':
        instruction = customPrompt.trim() || "Improve clarity, tone, and grammar.";
        break;
    }
  }

  let provideText = "Provide:\n1. One primary version fulfilling this instruction.";
  let schemaText = '"grammar_fix": "primary version"';

  if (numVariations === 1) {
    provideText += "\n2. One alternative variation fulfilling the instruction in a slightly different way.";
    schemaText += ',\n  "rephrases": [\n    "one alternative variation"\n  ]';
  } else if (numVariations >= 2) {
    provideText += "\n2. Two alternative variations fulfilling the instruction in slightly different ways.";
    schemaText += ',\n  "rephrases": [\n    "first variation",\n    "second variation"\n  ]';
  }

  return `You are an expert AI grammar and writing assistant.
Task: ${instruction}

Original text:
${JSON.stringify(text)}

${provideText}

Respond strictly in valid JSON matching this schema:
{
  ${schemaText}
}`;
}

function buildBuiltInAIAutoCheckPrompt(text) {
  return `You are a real-time grammar and spell checker. Analyze the following text carefully:
${JSON.stringify(text)}

If there are any spelling, punctuation, or grammar errors, set has_errors to true and provide the corrected_text.
If the text has no mistakes or is already grammatically sound, set has_errors to false and return the original text as corrected_text.

Respond strictly in valid JSON format:
{
  "has_errors": true,
  "corrected_text": "text with errors fixed",
  "explanation": "Short 1-sentence note of corrections"
}`;
}

/**
 * Executes a prompt using Chrome's built-in AI (Prompt API / Gemini Nano).
 * First checks service worker scope (Chrome 138+ / flags), then falls back to tab script execution.
 */
async function executePromptWithBuiltInAI(promptText, tab) {
  const modelOptions = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }]
  };

  // Helper to check availability and create session on any Prompt API interface
  const runModelSession = async (ModelAPI) => {
    let isAvailable = false;
    if (typeof ModelAPI.availability === 'function') {
      let avail;
      try {
        avail = await ModelAPI.availability(modelOptions);
      } catch (_) {
        avail = await ModelAPI.availability();
      }
      isAvailable = (avail !== 'no' && avail !== 'unavailable');
    } else if (typeof ModelAPI.capabilities === 'function') {
      const caps = await ModelAPI.capabilities();
      isAvailable = (caps && caps.available !== 'no' && caps.available !== 'unavailable');
    } else {
      isAvailable = true;
    }

    if (!isAvailable) {
      throw new Error("PROMPT_API_UNAVAILABLE");
    }

    let session;
    try {
      session = await ModelAPI.create(modelOptions);
    } catch (_) {
      session = await ModelAPI.create();
    }

    try {
      return await session.prompt(promptText);
    } finally {
      try { session.destroy(); } catch (_) {}
    }
  };

  // 1. Try background Service Worker scope
  const workerScope = typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : {});
  const WorkerModelAPI = workerScope.LanguageModel || workerScope.ai?.languageModel;
  if (WorkerModelAPI) {
    try {
      return await runModelSession(WorkerModelAPI);
    } catch (swErr) {
      console.warn("Service worker Prompt API attempt failed, checking tab context:", swErr);
    }
  }

  // 2. Try in active tab context via chrome.scripting.executeScript
  if (tab?.id && !isRestrictedUrl(tab.url)) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (pText) => {
          const tabScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
          const TabModelAPI = tabScope.LanguageModel || tabScope.ai?.languageModel;
          if (!TabModelAPI) {
            throw new Error("PROMPT_API_UNSUPPORTED");
          }

          const modelOptions = {
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }]
          };

          let isAvail = false;
          if (typeof TabModelAPI.availability === 'function') {
            let avail;
            try {
              avail = await TabModelAPI.availability(modelOptions);
            } catch (_) {
              avail = await TabModelAPI.availability();
            }
            isAvail = (avail !== 'no' && avail !== 'unavailable');
          } else if (typeof TabModelAPI.capabilities === 'function') {
            const caps = await TabModelAPI.capabilities();
            isAvail = (caps && caps.available !== 'no' && caps.available !== 'unavailable');
          } else {
            isAvail = true;
          }

          if (!isAvail) {
            throw new Error("PROMPT_API_UNAVAILABLE");
          }

          let session;
          try {
            session = await TabModelAPI.create(modelOptions);
          } catch (_) {
            session = await TabModelAPI.create();
          }

          try {
            return await session.prompt(pText);
          } finally {
            try { session.destroy(); } catch (_) {}
          }
        },
        args: [promptText]
      });

      if (result && typeof result.result === 'string') {
        return result.result;
      }
    } catch (tabErr) {
      if (tabErr.message?.includes("PROMPT_API_UNSUPPORTED")) {
        throw new Error("Chrome Built-in AI (Prompt API) is not enabled in this browser. Please enable '#prompt-api-for-gemini-nano' and '#optimization-guide-on-device-model' in chrome://flags.");
      }
      if (tabErr.message?.includes("PROMPT_API_UNAVAILABLE")) {
        throw new Error("Chrome Built-in AI model is currently unavailable or downloading. Please check chrome://components for 'Optimization Guide On Device Model'.");
      }
      throw tabErr;
    }
  }

  throw new Error("Chrome Built-in AI is not available in this browser. Please enable Prompt API flags in chrome://flags or use your Gemini API key.");
}

function parseBuiltInAISuggestions(rawOutput, originalText, numVariations = 2) {
  let cleaned = (rawOutput || '').trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  let resultJson = null;
  try {
    resultJson = JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        resultJson = JSON.parse(match[0]);
      } catch (_) {}
    }
  }

  const suggestions = [];
  if (resultJson) {
    const fix = resultJson.grammar_fix || resultJson.grammarFix || resultJson.correction || resultJson.corrected_text;
    if (fix && typeof fix === 'string') suggestions.push(fix.trim());

    if (numVariations > 0) {
      const rephrases = resultJson.rephrases || resultJson.alternatives || [];
      if (Array.isArray(rephrases)) {
        rephrases.slice(0, numVariations).forEach(r => {
          if (typeof r === 'string' && r.trim()) suggestions.push(r.trim());
        });
      } else if (typeof rephrases === 'string' && rephrases.trim()) {
        suggestions.push(rephrases.trim());
      }
    }
  }

  // Fallback regex extraction if JSON parse failed
  if (suggestions.length === 0) {
    const fixMatch = cleaned.match(/"grammar_fix"\s*:\s*"((?:[^"\\]|\\.)*)"/i) || cleaned.match(/"corrected_text"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    if (fixMatch && fixMatch[1]) {
      suggestions.push(fixMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim());
    }
    if (numVariations > 0) {
      const rephrasesBlockMatch = cleaned.match(/"rephrases"\s*:\s*\[([\s\S]*?)\]/i);
      if (rephrasesBlockMatch && rephrasesBlockMatch[1]) {
        const itemMatches = [...rephrasesBlockMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)];
        itemMatches.slice(0, numVariations).forEach(m => {
          if (m[1]) suggestions.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim());
        });
      }
    }
  }

  // Fallback to plain text if model answered directly
  if (suggestions.length === 0 && cleaned && cleaned !== originalText) {
    const cleanPlain = cleaned.replace(/^\{|\}$/g, '').replace(/"grammar_fix"\s*:\s*"/i, '').replace(/"\s*,?$/i, '').trim();
    if (cleanPlain) {
      suggestions.push(cleanPlain);
    }
  }

  return suggestions;
}

function parseBuiltInAIAutoCheckResult(rawOutput, cleanText) {
  let cleaned = (rawOutput || '').trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  let resultJson = null;
  try {
    resultJson = JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        resultJson = JSON.parse(match[0]);
      } catch (_) {}
    }
  }

  if (resultJson) {
    let hasErrors = Boolean(resultJson.has_errors);
    const correctedText = (resultJson.corrected_text || '').trim();
    if (correctedText === cleanText) hasErrors = false;
    return {
      hasErrors,
      correctedText: hasErrors ? correctedText : cleanText,
      explanation: resultJson.explanation || (hasErrors ? "Grammar & spelling corrections" : "")
    };
  }

  return { hasErrors: false, correctedText: cleanText, explanation: "" };
}

/**
 * Saves rephrasing results to history log for Pro users (capped at last 50 entries).
 */
async function saveToRephraseHistory({ originalText, suggestions, style = 'default', customPrompt = '', storedPresets = [], engine = 'gemini-cloud' }) {
  try {
    const proInfo = await getProStatus();
    if (!proInfo.isPro) {
      return; // History Log is strictly an exclusive Pro feature
    }

    if (!originalText || !Array.isArray(suggestions) || suggestions.length === 0) {
      return;
    }

    const { rephraseHistory = [] } = await chrome.storage.local.get(['rephraseHistory']);

    // Avoid duplicate if identical to top item within 3 seconds
    if (rephraseHistory.length > 0) {
      const top = rephraseHistory[0];
      if (top.originalText === originalText.trim() && top.style === style && (Date.now() - top.timestamp < 3000)) {
        return;
      }
    }

    // Determine readable style label
    let styleLabel = 'Grammar Fix';
    if (style === 'formal') styleLabel = 'Make Formal';
    else if (style === 'simplify') styleLabel = 'Simplify';
    else if (style === 'bullets') styleLabel = 'Bullet Points';
    else if (style === 'slack') styleLabel = 'Slack / Chat';
    else if (style === 'inline-fix') styleLabel = 'Quick Fix';
    else if (style === 'custom') {
      styleLabel = customPrompt ? `Custom: ${customPrompt.slice(0, 30)}` : 'Custom Prompt';
    } else if (Array.isArray(storedPresets)) {
      const matched = storedPresets.find(p => p.id === style);
      if (matched && matched.name) {
        styleLabel = matched.name;
      } else if (style !== 'default') {
        styleLabel = style;
      }
    }

    const newEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      originalText: originalText.trim(),
      suggestions: suggestions.map(s => typeof s === 'string' ? s.trim() : '').filter(Boolean),
      style: style || 'default',
      styleLabel,
      engine: engine || 'gemini-cloud'
    };

    const updated = [newEntry, ...rephraseHistory].slice(0, 50);
    await chrome.storage.local.set({ rephraseHistory: updated });
  } catch (err) {
    console.warn("Could not save to rephrase history:", err);
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
    chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'maxOutputTokens', 'stylePresets', 'useChromeBuiltInAI', 'enableVariation1', 'enableVariation2'])
  ]);
  const isPro = proInfo.isPro;
  const useChromeBuiltInAI = syncData.useChromeBuiltInAI === true;

  // Calculate number of alternative variations to generate (0, 1, or 2)
  // Gated for Pro users only: Free users always receive all variations.
  let enableVar1 = true;
  let enableVar2 = true;
  let numVariations = 2;

  if (isPro) {
    enableVar1 = syncData.enableVariation1 !== false;
    enableVar2 = syncData.enableVariation2 !== false;
    if (!enableVar1 && !enableVar2) {
      numVariations = 0;
    } else if (!enableVar1 || !enableVar2) {
      numVariations = 1;
    }
  }

  const variationLabels = ['DEFAULT'];
  if (enableVar1) variationLabels.push('Variation 1');
  if (enableVar2) variationLabels.push('Variation 2');

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

  // Branch 1: If user enabled Chrome Built-in AI, process grammar check with on-device Prompt API
  if (useChromeBuiltInAI) {
    try {
      await sendTabMessage({
        type: 'SHOW_LOADING',
        originalText: text,
        activeStyle: style,
        isPro
      });

      const promptText = buildBuiltInAIPrompt(text, style, customPrompt, syncData.stylePresets || [], numVariations);
      const rawOutput = await executePromptWithBuiltInAI(promptText, tab);
      const suggestions = parseBuiltInAISuggestions(rawOutput, text, numVariations);

      if (suggestions.length === 0) {
        throw new Error("Could not parse suggestions from Chrome Built-in AI.");
      }

      // Save to Pro History Log
      await saveToRephraseHistory({
        originalText: text,
        suggestions,
        style,
        customPrompt,
        storedPresets: syncData.stylePresets || [],
        engine: 'chrome-ai'
      });

      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_RESULT',
        data: suggestions,
        labels: variationLabels,
        isError: false,
        originalText: text,
        activeStyle: style,
        isPro,
        engine: 'chrome-ai'
      }).catch(() => {});
      return;

    } catch (builtInErr) {
      console.warn("Chrome Built-in AI error:", builtInErr);

      // If user also has a Gemini API key configured, gracefully fall back to Cloud API
      const fallbackApiKey = syncData.geminiApiKey?.trim();
      if (!fallbackApiKey) {
        // No API key to fall back to: show user-friendly message
        const errMsg = builtInErr.message?.includes("PROMPT_API") || builtInErr.message?.includes("chrome://flags")
          ? builtInErr.message
          : `Chrome Built-in AI Error: ${builtInErr.message}. Ensure Gemini Nano is enabled in chrome://flags or configure a Gemini API key in Options.`;

        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_RESULT',
          data: errMsg,
          isError: true,
          originalText: text,
          activeStyle: style,
          isPro
        }).catch(() => {});
        return;
      }
      console.log("Built-in AI unavailable, falling back to Gemini Cloud API...");
    }
  }

  // Branch 2: Original Gemini Cloud API Flow (Runs when useChromeBuiltInAI is false OR as fallback)
  const apiKey = syncData.geminiApiKey?.trim();
  let rawModel = syncData.geminiModel?.trim() || "gemini-3.8-flash";
  if (rawModel === "gemini-2.0-flash") {
    rawModel = "gemini-3.8-flash";
  }
  const model = rawModel.replace(/^models\//, "");

  try {
    // 2. Check for missing API key
    if (!apiKey) {
      const errorMessage = "Gemini API key not found. Please set your API key in the extension's options page, or enable Chrome Built-in AI.";
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
    const promptText = buildPromptForStyle(text, style, customPrompt, syncData.stylePresets || [], numVariations);
    const rawTokens = typeof syncData.maxOutputTokens !== 'undefined' ? Number(syncData.maxOutputTokens) : 0;
    const userMaxTokens = isNaN(rawTokens) ? 0 : rawTokens;

    const properties = {
      grammar_fix: {
        type: "STRING",
        description: "Primary corrected or rephrased version according to requested style."
      }
    };
    const required = ["grammar_fix"];

    if (numVariations > 0) {
      properties.rephrases = {
        type: "ARRAY",
        items: { type: "STRING" },
        description: `${numVariations} alternative rephrased variation${numVariations > 1 ? 's' : ''}.`
      };
      required.push("rephrases");
    }

    const generationConfig = {
      temperature: 0.2,
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties,
        required
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

      if (numVariations > 0) {
        const rephrases = resultJson.rephrases || resultJson.alternatives || [];
        if (Array.isArray(rephrases)) {
          suggestions.push(...rephrases.slice(0, numVariations));
        } else if (typeof rephrases === 'string') {
          suggestions.push(rephrases);
        }
      }
    } else {
      // Partial salvage attempt: if JSON was cut off midway by MAX_TOKENS, extract what was completed!
      const grammarMatch = rawText.match(/"grammar_fix"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
      if (grammarMatch && grammarMatch[1]) {
        suggestions.push(grammarMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
      }

      if (numVariations > 0) {
        const rephrasesBlockMatch = rawText.match(/"rephrases"\s*:\s*\[([\s\S]*)/i);
        if (rephrasesBlockMatch && rephrasesBlockMatch[1]) {
          const itemMatches = [...rephrasesBlockMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)];
          itemMatches.slice(0, numVariations).forEach(m => {
            if (m[1]) suggestions.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
          });
        }
      }
    }

    if (suggestions.length === 0) {
      if (finishReason === "MAX_TOKENS") {
        throw new Error("Token limit reached: Gemini was cut off because 'Max Output Tokens' was set too low. Please switch to 'No Limit' in Extension Preferences.");
      }
      throw new Error("Could not parse JSON response from Gemini. Please ensure 'Max Output Tokens' is set to 'No Limit' in Extension Preferences.");
    }

    // Save to Pro History Log
    await saveToRephraseHistory({
      originalText: text,
      suggestions,
      style,
      customPrompt,
      storedPresets: syncData.stylePresets || [],
      engine: 'gemini-cloud'
    });

    // 6. Send suggestions to content script with style context
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_RESULT',
      data: suggestions,
      labels: variationLabels,
      isError: false,
      originalText: text,
      activeStyle: style,
      isPro,
      engine: 'gemini-cloud'
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
    handleAutoCheckGrammar(request.text, sender.tab)
      .then(async res => {
        const proInfo = await getProStatus();
        sendResponse({ success: true, isPro: proInfo.isPro, ...res });
      })
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

  if (request.type === 'RECORD_HISTORY_ITEM') {
    saveToRephraseHistory(request.item || {})
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'OPEN_HISTORY_PAGE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#history') });
    sendResponse({ success: true });
    return false;
  }
});

async function handleAutoCheckGrammar(text, tab) {
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

  // Retrieve settings
  const data = await chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'maxOutputTokens', 'useChromeBuiltInAI']);
  const useChromeBuiltInAI = data.useChromeBuiltInAI === true;

  // If user enabled Chrome Built-in AI, perform on-device check
  if (useChromeBuiltInAI) {
    try {
      const promptText = buildBuiltInAIAutoCheckPrompt(cleanText);
      const rawOutput = await executePromptWithBuiltInAI(promptText, tab);
      const parsed = parseBuiltInAIAutoCheckResult(rawOutput, cleanText);

      if (autoCheckCache.size >= MAX_CACHE_SIZE) {
        const firstKey = autoCheckCache.keys().next().value;
        autoCheckCache.delete(firstKey);
      }
      autoCheckCache.set(cleanText, parsed);
      return parsed;
    } catch (builtInErr) {
      console.warn("Built-in AI auto-check error:", builtInErr);
      if (!data.geminiApiKey?.trim()) {
        return { hasErrors: false };
      }
      // If user has Gemini API key, fall through to cloud check below
    }
  }

  // Standard Gemini Cloud API auto-check
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

