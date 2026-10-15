// options.js

const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');
const autoCheckToggle = document.getElementById('auto-check-toggle');
const debounceSelect = document.getElementById('debounce-select');
const maxTokensSelect = document.getElementById('max-tokens-select');
const autoCheckSubSettings = document.getElementById('auto-check-sub-settings');
const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
const saveButton = document.getElementById('save-btn');
const testButton = document.getElementById('test-btn');
const detectButton = document.getElementById('detect-btn');
const statusDiv = document.getElementById('status');

// Chrome Built-in AI elements
const useChromeAiToggle = document.getElementById('use-chrome-ai-toggle');
const checkChromeAiBtn = document.getElementById('check-chrome-ai-btn');
const chromeAiStatusMsg = document.getElementById('chrome-ai-status-msg');
const apiKeyOptionalHint = document.getElementById('api-key-optional-hint');

// Suggestion Variations elements (100% independent)
const var1Checkbox = document.getElementById('var-1-checkbox');
const var2Checkbox = document.getElementById('var-2-checkbox');

// Toggle API key visibility (password vs text)
if (toggleKeyVisibilityBtn && apiKeyInput) {
  toggleKeyVisibilityBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyVisibilityBtn.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleKeyVisibilityBtn.textContent = 'Show';
    }
  });
}

// Update sub-settings visual enabled/disabled appearance
function updateSubSettingsState(enabled) {
  if (!autoCheckSubSettings) return;
  if (enabled) {
    autoCheckSubSettings.style.opacity = '1';
    autoCheckSubSettings.style.pointerEvents = 'auto';
    if (debounceSelect) debounceSelect.disabled = false;
  } else {
    autoCheckSubSettings.style.opacity = '0.5';
    autoCheckSubSettings.style.pointerEvents = 'none';
    if (debounceSelect) debounceSelect.disabled = true;
  }
}

if (autoCheckToggle) {
  autoCheckToggle.addEventListener('change', (e) => {
    updateSubSettingsState(e.target.checked);
  });
}

// Browser detection
const isFirefox = navigator.userAgent.includes('Firefox');

// Chrome Built-in AI toggle listener
if (useChromeAiToggle) {
  if (isFirefox) {
    useChromeAiToggle.disabled = true;
    useChromeAiToggle.checked = false;
  }
  useChromeAiToggle.addEventListener('change', (e) => {
    if (apiKeyOptionalHint) {
      apiKeyOptionalHint.style.display = e.target.checked ? 'inline' : 'none';
    }
  });
}

// Check Chrome Built-in AI (Prompt API) status in browser
async function checkChromeBuiltInAIStatus() {
  if (!chromeAiStatusMsg) return;

  if (isFirefox) {
    chromeAiStatusMsg.innerHTML = `🦊 <strong>Exclusive to Google Chrome.</strong> Firefox does not have built-in Gemini Nano. Please use your free Gemini API key below.`;
    chromeAiStatusMsg.style.color = '#d97706';
    if (useChromeAiToggle) {
      useChromeAiToggle.disabled = true;
      useChromeAiToggle.checked = false;
    }
    return;
  }

  chromeAiStatusMsg.textContent = 'Checking Prompt API status...';
  chromeAiStatusMsg.style.color = '#2563eb';

  const scope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  const ModelAPI = scope.LanguageModel || scope.ai?.languageModel;

  if (!ModelAPI) {
    chromeAiStatusMsg.innerHTML = `
      <div style="margin-top: 4px; line-height: 1.6;">
        <span style="color: #b45309; font-weight: 700;">⚠️ Prompt API not enabled in this Chrome browser.</span><br/>
        <span style="font-size: 12px; color: #475569;">To activate Google's free on-device Gemini Nano:</span>
        <ol style="margin: 6px 0 0 18px; padding: 0; font-size: 11.5px; color: #334155; line-height: 1.6;">
          <li>Open <code>chrome://flags</code> in your address bar.</li>
          <li>Set <strong>#prompt-api-for-gemini-nano</strong> to <strong>Enabled</strong>.</li>
          <li>Set <strong>#optimization-guide-on-device-model</strong> to <strong>Enabled BypassPerfRequirement</strong>.</li>
          <li>Click <strong>Relaunch</strong> Chrome.</li>
          <li>Go to <code>chrome://components</code> and click <strong>Check for update</strong> on <em>Optimization Guide On Device Model</em> (~1.5GB).</li>
        </ol>
      </div>
    `;
    chromeAiStatusMsg.style.color = '#b45309';
    return;
  }

  try {
    let availableStatus = 'readily';
    const modelOptions = {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    };

    if (typeof ModelAPI.availability === 'function') {
      try {
        availableStatus = await ModelAPI.availability(modelOptions);
      } catch (_) {
        availableStatus = await ModelAPI.availability();
      }
    } else if (typeof ModelAPI.capabilities === 'function') {
      const caps = await ModelAPI.capabilities();
      availableStatus = caps?.available || 'readily';
    }

    if (availableStatus === 'readily' || availableStatus === 'available') {
      chromeAiStatusMsg.innerHTML = `🟢 <strong>Ready to use!</strong> Chrome Gemini Nano is downloaded and active on this device.`;
      chromeAiStatusMsg.style.color = '#15803d';
    } else if (availableStatus === 'after-download' || availableStatus === 'downloadable') {
      chromeAiStatusMsg.innerHTML = `🟡 <strong>Supported!</strong> Gemini Nano will download automatically when first used (~1.5GB).`;
      chromeAiStatusMsg.style.color = '#2563eb';
    } else if (availableStatus === 'downloading') {
      chromeAiStatusMsg.innerHTML = `⏳ <strong>Downloading...</strong> Gemini Nano is currently downloading.`;
      chromeAiStatusMsg.style.color = '#2563eb';
    } else {
      chromeAiStatusMsg.innerHTML = `⚠️ <strong>Status: ${availableStatus}</strong>. Device or storage requirements may not be met.`;
      chromeAiStatusMsg.style.color = '#b45309';
    }
  } catch (err) {
    chromeAiStatusMsg.textContent = `Detection error: ${err.message}`;
    chromeAiStatusMsg.style.color = '#dc2626';
  }
}

if (checkChromeAiBtn) {
  checkChromeAiBtn.addEventListener('click', checkChromeBuiltInAIStatus);
}

// Load saved settings
function loadOptions() {
  chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'autoCheckEnabled', 'maxOutputTokens', 'autoCheckDebounce', 'useChromeBuiltInAI', 'enableVariation1', 'enableVariation2', 'isPro'], (result) => {
    const isPro = result.isPro === true;
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      ensureOptionExists(result.geminiModel);
      modelSelect.value = result.geminiModel;
    }
    const autoCheckOn = result.autoCheckEnabled === true;
    if (autoCheckToggle) {
      autoCheckToggle.checked = autoCheckOn;
      updateSubSettingsState(autoCheckOn);
    }
    if (debounceSelect && result.autoCheckDebounce) {
      debounceSelect.value = String(result.autoCheckDebounce);
    }
    if (maxTokensSelect) {
      if (typeof result.maxOutputTokens !== 'undefined') {
        maxTokensSelect.value = String(result.maxOutputTokens);
      } else {
        maxTokensSelect.value = "0"; // Default: No Limit
      }
    }
    if (var1Checkbox) {
      var1Checkbox.checked = isPro ? (result.enableVariation1 !== false) : true;
      var1Checkbox.disabled = !isPro;
    }
    if (var2Checkbox) {
      var2Checkbox.checked = isPro ? (result.enableVariation2 !== false) : true;
      var2Checkbox.disabled = !isPro;
    }
    const useChromeAI = !isFirefox && result.useChromeBuiltInAI === true;
    if (useChromeAiToggle) {
      useChromeAiToggle.checked = useChromeAI;
      if (isFirefox) {
        useChromeAiToggle.disabled = true;
      }
      if (apiKeyOptionalHint) {
        apiKeyOptionalHint.style.display = useChromeAI ? 'inline' : 'none';
      }
    }
  });

  // Check built-in AI capabilities in background on page load
  checkChromeBuiltInAIStatus();
}

// Ensure option is present in select element
function ensureOptionExists(modelValue) {
  let found = false;
  for (let i = 0; i < modelSelect.options.length; i++) {
    if (modelSelect.options[i].value === modelValue) {
      found = true;
      break;
    }
  }
  if (!found) {
    const opt = document.createElement('option');
    opt.value = modelValue;
    opt.textContent = modelValue;
    modelSelect.appendChild(opt);
  }
}

// Display status message with color
function showStatus(text, color = '#28a745', timeoutMs = 5000) {
  statusDiv.textContent = text;
  statusDiv.title = text;
  statusDiv.style.color = color;
  if (timeoutMs > 0) {
    setTimeout(() => {
      if (statusDiv.textContent === text) {
        statusDiv.textContent = '';
        statusDiv.title = '';
      }
    }, timeoutMs);
  }
}

// Save settings to chrome.storage.sync
function saveOptions() {
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const autoCheckEnabled = autoCheckToggle ? autoCheckToggle.checked : false;
  const autoCheckDebounce = debounceSelect ? Number(debounceSelect.value) || 2500 : 2500;
  const rawMaxTokens = maxTokensSelect ? Number(maxTokensSelect.value) : 0;
  const maxOutputTokens = isNaN(rawMaxTokens) ? 0 : rawMaxTokens;
  const useChromeBuiltInAI = useChromeAiToggle ? useChromeAiToggle.checked : false;
  const enableVariation1 = (!var1Checkbox || var1Checkbox.disabled) ? true : var1Checkbox.checked;
  const enableVariation2 = (!var2Checkbox || var2Checkbox.disabled) ? true : var2Checkbox.checked;

  // If user has not enabled Chrome Built-in AI, an API key is required
  if (!useChromeBuiltInAI && !apiKey) {
    showStatus('Please enter an API key, or enable Chrome Built-in AI above.', '#dc3545');
    return;
  }

  chrome.storage.sync.set({
    geminiApiKey: apiKey,
    geminiModel: model,
    autoCheckEnabled: autoCheckEnabled,
    autoCheckDebounce: autoCheckDebounce,
    maxOutputTokens: maxOutputTokens,
    useChromeBuiltInAI: useChromeBuiltInAI,
    enableVariation1: enableVariation1,
    enableVariation2: enableVariation2
  }, () => {
    const msg = useChromeBuiltInAI
      ? 'Settings saved! Chrome Built-in AI is active for free grammar checking.'
      : 'Settings saved successfully!';
    showStatus(msg, '#28a745');
  });
}

// Fetch all models available for the user's API key
async function fetchAvailableModels(showSuccessMsg = true) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showStatus('Please enter your API key first.', '#dc3545');
    return null;
  }

  detectButton.disabled = true;
  showStatus('Querying available models from Google...', '#4a90e2', 0);

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: {
        'x-goog-api-key': apiKey
      }
    });

    if (!response.ok) {
      let errDetail = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error?.message) {
          errDetail = errJson.error.message;
        }
      } catch (_) {}
      throw new Error(errDetail);
    }

    const data = await response.json();
    const availableModels = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''));

    if (availableModels.length === 0) {
      throw new Error('No models supporting generateContent found for this API key.');
    }

    // Save previous selection if still available
    const previousModel = modelSelect.value;
    modelSelect.innerHTML = '';

    availableModels.forEach(modelName => {
      const opt = document.createElement('option');
      opt.value = modelName;
      opt.textContent = modelName;
      modelSelect.appendChild(opt);
    });

    // Pick best model: prefer previous selection, or flash models
    const preferredOrder = [
      previousModel,
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      availableModels[0]
    ];

    const bestModel = preferredOrder.find(m => availableModels.includes(m)) || availableModels[0];
    modelSelect.value = bestModel;

    // Automatically save chosen model
    chrome.storage.sync.set({ geminiModel: bestModel });

    if (showSuccessMsg) {
      showStatus(`Found ${availableModels.length} models. Selected "${bestModel}".`, '#28a745', 5000);
    }

    return bestModel;

  } catch (err) {
    showStatus(`Could not detect models: ${err.message}`, '#dc3545', 7000);
    return null;
  } finally {
    detectButton.disabled = false;
  }
}

// Friendly error formatter for options page
function formatFriendlyErrorMessage(rawError, modelName = '') {
  if (!rawError) return "Connection failed.";
  const lower = rawError.toLowerCase();

  if (lower.includes("quota") || lower.includes("rate limit") || lower.includes("resource has been exhausted") || lower.includes("free_tier_requests")) {
    const retryMatch = rawError.match(/retry in\s+([0-9a-z.]+)/i);
    let timeText = "";
    if (retryMatch && retryMatch[1]) {
      const cleanTime = retryMatch[1].replace(/\.\d+s/, 's').replace(/([0-9]+[a-z]+)/g, '$1 ').trim();
      timeText = ` (resets in ~${cleanTime})`;
    }
    return `Free quota limit reached for this model${timeText}. Try another model or wait for quota reset.`;
  }

  if (lower.includes("no longer available") || lower.includes("not found") || lower.includes("not supported") || lower.includes("listmodels")) {
    return `Model "${modelName}" is no longer available. Click "Auto-Detect" to load your available models.`;
  }

  if (lower.includes("api_key_invalid") || lower.includes("api key not valid") || lower.includes("unregistered callers")) {
    return "API key is invalid. Please verify and re-paste your key from Google AI Studio.";
  }

  if (lower.includes("high demand") || lower.includes("overloaded") || lower.includes("503")) {
    return "Gemini servers are currently experiencing high demand. Please try again shortly.";
  }

  let cleanMsg = rawError
    .replace(/^Gemini API Error\s*\(/i, '')
    .replace(/\)$/, '')
    .replace(/https?:\/\/[^\s)]+/g, '')
    .replace(/\s*\*+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanMsg;
}

// Display test status message next to test button inside card
function showTestStatus(text, color = '#28a745', timeoutMs = 7000) {
  const el = document.getElementById('test-status');
  if (!el) return;
  el.textContent = text;
  el.title = text;
  el.style.color = color;
  if (timeoutMs > 0) {
    setTimeout(() => {
      if (el.textContent === text) {
        el.textContent = '';
        el.title = '';
      }
    }, timeoutMs);
  }
}

// Test connection with Google Gemini API
async function testConnection() {
  const apiKey = apiKeyInput.value.trim();
  let model = modelSelect.value;

  if (!apiKey) {
    if (useChromeAiToggle && useChromeAiToggle.checked) {
      showTestStatus('Enter a Gemini key to test Cloud API, or click "Check Browser AI Status" above.', '#dc3545', 7000);
    } else {
      showTestStatus('Please enter an API key first.', '#dc3545');
    }
    return;
  }

  showTestStatus('Testing connection to Gemini...', '#4a90e2', 0);
  testButton.disabled = true;

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }]
      })
    });

    if (response.ok) {
      showTestStatus(`Connection successful! (${model} is active)`, '#28a745', 6000);
    } else {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch (_) {}

      const friendly = formatFriendlyErrorMessage(errorMsg, model);
      showTestStatus(`Test failed: ${friendly}`, '#dc3545', 9000);
    }
  } catch (err) {
    showTestStatus(`Network error: ${err.message}`, '#dc3545', 7000);
  } finally {
    testButton.disabled = false;
  }
}

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// Default Presets definition
const DEFAULT_STYLE_PRESETS = [
  {
    id: 'formal',
    label: 'Make Formal',
    prompt: 'Rewrite the following text in an executive, formal, and polished professional tone suitable for high-level business correspondence. Fix all grammar and elevate vocabulary.',
    enabled: true,
    isBuiltIn: true
  },
  {
    id: 'simplify',
    label: 'Simplify for 5th Grader',
    prompt: 'Rewrite the following text so that an elementary school student (5th grader) can effortlessly understand it. Use simple, direct words, short sentences, and avoid jargon while preserving the core meaning.',
    enabled: true,
    isBuiltIn: true
  },
  {
    id: 'bullets',
    label: 'Convert to Bullets',
    prompt: 'Convert the key ideas and points from the following text into clear, readable, and structured bullet points (use • symbol).',
    enabled: true,
    isBuiltIn: true
  },
  {
    id: 'slack',
    label: 'Casual Slack Message',
    prompt: 'Rewrite the following text as a casual, warm, and natural workplace chat message (ideal for Slack, Teams, or Discord). Friendly, concise, approachable while polite and professional.',
    enabled: true,
    isBuiltIn: true
  }
];

// Presets Storage & Management
function loadStoredPresets(callback) {
  chrome.storage.sync.get(['stylePresets'], (result) => {
    let presets = result.stylePresets;
    if (!Array.isArray(presets) || presets.length === 0) {
      presets = JSON.parse(JSON.stringify(DEFAULT_STYLE_PRESETS));
      chrome.storage.sync.set({ stylePresets: presets });
    } else {
      // Ensure all built-in presets exist
      let updated = false;
      DEFAULT_STYLE_PRESETS.forEach(defPreset => {
        const found = presets.find(p => p.id === defPreset.id);
        if (!found) {
          presets.push({ ...defPreset });
          updated = true;
        }
      });
      if (updated) {
        chrome.storage.sync.set({ stylePresets: presets });
      }
    }
    if (callback) callback(presets);
  });
}

function renderStylePresets() {
  loadStoredPresets((presets) => {
    const builtinList = document.getElementById('builtin-presets-list');
    const customList = document.getElementById('custom-presets-list');
    const customCountEl = document.getElementById('custom-presets-count');

    if (!builtinList || !customList) return;

    builtinList.innerHTML = '';
    customList.innerHTML = '';

    const builtins = presets.filter(p => p.isBuiltIn);
    const customs = presets.filter(p => !p.isBuiltIn);

    if (customCountEl) {
      customCountEl.textContent = `${customs.length} custom preset${customs.length === 1 ? '' : 's'}`;
    }

    // 1. Render Built-in Presets
    builtins.forEach(preset => {
      const card = document.createElement('div');
      card.className = 'preset-item-card';
      const isChecked = preset.enabled !== false;
      card.innerHTML = `
        <div class="preset-item-main">
          <div class="preset-item-title">
            <span>${escapeHTML(preset.label)}</span>
            <span class="pro-badge" style="font-size: 10px; padding: 1px 7px;">Built-in</span>
          </div>
          <div class="preset-item-prompt">${escapeHTML(preset.prompt)}</div>
        </div>
        <div class="preset-item-actions">
          <label class="toggle-switch" style="margin: 0;" title="${isChecked ? 'Enabled' : 'Disabled'}">
            <input type="checkbox" data-preset-id="${preset.id}" ${isChecked ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      `;

      const checkbox = card.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        togglePresetStatus(preset.id, e.target.checked);
      });

      builtinList.appendChild(card);
    });

    // 2. Render Custom Presets
    if (customs.length === 0) {
      customList.innerHTML = `
        <div style="font-size: 13px; color: var(--text-muted); font-style: italic; padding: 14px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center;">
          No custom presets created yet. Use the form below to create your first custom AI writing style.
        </div>
      `;
    } else {
      customs.forEach(preset => {
        const card = document.createElement('div');
        card.className = 'preset-item-card';
        const isChecked = preset.enabled !== false;
        card.innerHTML = `
          <div class="preset-item-main">
            <div class="preset-item-title">
              <span>${escapeHTML(preset.label)}</span>
              <span class="smart-pill" style="font-size: 10.5px; padding: 2px 7px; background: #e0e7ff; color: #3730a3; border-color: #c7d2fe;">Custom</span>
            </div>
            <div class="preset-item-prompt">${escapeHTML(preset.prompt)}</div>
          </div>
          <div class="preset-item-actions">
            <label class="toggle-switch" style="margin: 0;" title="${isChecked ? 'Enabled' : 'Disabled'}">
              <input type="checkbox" data-preset-id="${preset.id}" ${isChecked ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <button type="button" class="btn-delete-preset" data-delete-id="${preset.id}">Delete</button>
          </div>
        `;

        const checkbox = card.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
          togglePresetStatus(preset.id, e.target.checked);
        });

        const deleteBtn = card.querySelector('.btn-delete-preset');
        deleteBtn.addEventListener('click', () => {
          deleteCustomPreset(preset.id, preset.label);
        });

        customList.appendChild(card);
      });
    }
  });
}

function togglePresetStatus(presetId, isEnabled) {
  loadStoredPresets((presets) => {
    const updated = presets.map(p => {
      if (p.id === presetId) {
        return { ...p, enabled: isEnabled };
      }
      return p;
    });

    chrome.storage.sync.set({ stylePresets: updated }, () => {
      showStatus('Preset updated successfully!', '#28a745', 2500);
    });
  });
}

function deleteCustomPreset(presetId, presetLabel) {
  if (!confirm(`Are you sure you want to delete preset "${presetLabel}"?`)) return;

  loadStoredPresets((presets) => {
    const updated = presets.filter(p => p.id !== presetId);
    chrome.storage.sync.set({ stylePresets: updated }, () => {
      showStatus(`Preset "${presetLabel}" deleted.`, '#28a745', 3000);
      renderStylePresets();
    });
  });
}

function addCustomPreset() {
  const labelInput = document.getElementById('new-preset-label');
  const promptInput = document.getElementById('new-preset-prompt');
  if (!labelInput || !promptInput) return;

  const label = labelInput.value.trim();
  const prompt = promptInput.value.trim();

  if (!label) {
    showStatus('Please enter a preset label.', '#dc3545', 4000);
    labelInput.focus();
    return;
  }

  if (!prompt) {
    showStatus('Please enter prompt instructions for Gemini.', '#dc3545', 4000);
    promptInput.focus();
    return;
  }

  const newId = 'preset_' + Date.now();
  const newPreset = {
    id: newId,
    label: label,
    prompt: prompt,
    enabled: true,
    isBuiltIn: false
  };

  loadStoredPresets((presets) => {
    presets.push(newPreset);
    chrome.storage.sync.set({ stylePresets: presets }, () => {
      labelInput.value = '';
      promptInput.value = '';
      showStatus(`Preset "${label}" created successfully!`, '#28a745', 4000);
      renderStylePresets();
    });
  });
}

// Pro & Freemius licensing UI controls
const proBadge = document.getElementById('pro-badge');
const proUpgradeBox = document.getElementById('pro-upgrade-box');
const fsLicenseInput = document.getElementById('fs-license-key');
const activateLicenseBtn = document.getElementById('activate-license-btn');
const deactivateLicenseBtn = document.getElementById('deactivate-license-btn');
const fsPortalManageLink = document.getElementById('fs-portal-manage-link');
const licenseStatusText = document.getElementById('license-status-text');

function showLicenseStatus(text, type = 'normal') {
  if (!licenseStatusText) return;
  licenseStatusText.textContent = text;

  if (type === 'error') {
    licenseStatusText.style.color = '#dc2626';
    licenseStatusText.style.fontWeight = '500';
    if (fsLicenseInput) fsLicenseInput.style.borderColor = '#ef4444';
  } else if (type === 'success') {
    licenseStatusText.style.color = '#16a34a';
    licenseStatusText.style.fontWeight = '600';
    if (fsLicenseInput) fsLicenseInput.style.borderColor = '';
  } else if (type === 'loading') {
    licenseStatusText.style.color = '#2563eb';
    licenseStatusText.style.fontWeight = '500';
    if (fsLicenseInput) fsLicenseInput.style.borderColor = '';
  } else {
    licenseStatusText.style.color = '#64748b';
    licenseStatusText.style.fontWeight = 'normal';
    if (fsLicenseInput) fsLicenseInput.style.borderColor = '';
  }
}

if (fsLicenseInput) {
  fsLicenseInput.addEventListener('input', () => {
    fsLicenseInput.style.borderColor = '';
    if (licenseStatusText && licenseStatusText.style.color === 'rgb(220, 38, 38)') {
      showLicenseStatus('Enter your license key above to unlock all styles and custom prompts.', 'normal');
    }
  });
}

function loadProSettings() {
  chrome.storage.sync.get(['isPro', 'fs_license_key', 'fs_plan_name'], (result) => {
    const isPro = result.isPro === true;

    // Toggle Style Presets tab Pro lock vs Manager
    const presetsProLock = document.getElementById('presets-pro-lock');
    const presetsManager = document.getElementById('presets-manager');
    if (presetsProLock && presetsManager) {
      if (isPro) {
        presetsProLock.style.display = 'none';
        presetsManager.style.display = 'block';
      } else {
        presetsProLock.style.display = 'block';
        presetsManager.style.display = 'none';
      }
    }

    // Toggle History Log tab Pro lock vs Manager
    const historyProLock = document.getElementById('history-pro-lock');
    const historyManager = document.getElementById('history-manager');
    if (historyProLock && historyManager) {
      if (isPro) {
        historyProLock.style.display = 'none';
        historyManager.style.display = 'block';
        loadRephraseHistory();
      } else {
        historyProLock.style.display = 'block';
        historyManager.style.display = 'none';
      }
    }
    // Toggle Variations Pro Lock vs Interactive state
    const varProLock = document.getElementById('var-pro-lock');
    const varProBadge = document.getElementById('var-pro-badge');
    const varContainer = document.getElementById('var-checkboxes-container');
    const var1Label = document.getElementById('var-1-label');
    const var2Label = document.getElementById('var-2-label');

    if (varProBadge) {
      if (isPro) {
        varProBadge.textContent = 'Pro Active ✓';
        varProBadge.style.backgroundColor = '#dcfce7';
        varProBadge.style.color = '#15803d';
      } else {
        varProBadge.textContent = 'Pro Feature';
        varProBadge.style.backgroundColor = '#eff6ff';
        varProBadge.style.color = '#1d4ed8';
      }
    }

    if (varProLock) {
      varProLock.style.display = isPro ? 'none' : 'block';
    }

    if (var1Checkbox && var2Checkbox) {
      if (isPro) {
        var1Checkbox.disabled = false;
        var2Checkbox.disabled = false;
        var1Checkbox.checked = result.enableVariation1 !== false;
        var2Checkbox.checked = result.enableVariation2 !== false;
        if (varContainer) varContainer.style.opacity = '1';
        if (var1Label) var1Label.style.cursor = 'pointer';
        if (var2Label) var2Label.style.cursor = 'pointer';
      } else {
        var1Checkbox.disabled = true;
        var2Checkbox.disabled = true;
        var1Checkbox.checked = true;
        var2Checkbox.checked = true;
        if (varContainer) varContainer.style.opacity = '0.75';
        if (var1Label) var1Label.style.cursor = 'not-allowed';
        if (var2Label) var2Label.style.cursor = 'not-allowed';
      }
    }

    if (isPro) {
      if (proBadge) {
        proBadge.textContent = `${result.fs_plan_name || 'Pro'} Active ✓`;
        proBadge.style.backgroundColor = '#dcfce7';
        proBadge.style.color = '#15803d';
      }
      if (proUpgradeBox) proUpgradeBox.style.display = 'none';
      if (fsLicenseInput) {
        fsLicenseInput.value = result.fs_license_key || 'Activated';
        fsLicenseInput.disabled = true;
      }
      if (activateLicenseBtn) activateLicenseBtn.style.display = 'none';
      if (deactivateLicenseBtn) deactivateLicenseBtn.style.display = 'inline-block';
      if (fsPortalManageLink) fsPortalManageLink.style.display = 'inline-flex';
      showLicenseStatus(`Your ${result.fs_plan_name || 'Pro'} membership is active. Enjoy all style presets!`, 'success');
    } else {
      if (proBadge) {
        proBadge.textContent = 'Free Plan';
        proBadge.style.backgroundColor = '#e2e8f0';
        proBadge.style.color = '#475569';
      }
      if (proUpgradeBox) proUpgradeBox.style.display = 'flex';
      if (fsLicenseInput) {
        fsLicenseInput.value = '';
        fsLicenseInput.disabled = false;
      }
      if (activateLicenseBtn) activateLicenseBtn.style.display = 'inline-block';
      if (deactivateLicenseBtn) deactivateLicenseBtn.style.display = 'none';
      if (fsPortalManageLink) fsPortalManageLink.style.display = 'none';
      if (!licenseStatusText || !licenseStatusText.textContent.startsWith('⚠️')) {
        showLicenseStatus('Enter your license key above to unlock all styles and custom prompts.', 'normal');
      }
    }
  });
}

if (activateLicenseBtn) {
  activateLicenseBtn.addEventListener('click', async () => {
    const key = fsLicenseInput.value.trim();
    if (!key) {
      showLicenseStatus('⚠️ Please enter a license key to activate.', 'error');
      fsLicenseInput.focus();
      return;
    }

    activateLicenseBtn.disabled = true;
    showLicenseStatus('Activating license with Freemius...', 'loading');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ACTIVATE_FS_LICENSE',
        licenseKey: key
      });

      if (response?.success) {
        showLicenseStatus(`✓ Pro successfully activated! Plan: ${response.planName || 'Pro'}`, 'success');
        loadProSettings();
      } else {
        showLicenseStatus(`⚠️ Activation error: ${response?.error || 'Invalid key.'}`, 'error');
      }
    } catch (err) {
      showLicenseStatus(`⚠️ Activation failed: ${err.message}`, 'error');
    } finally {
      activateLicenseBtn.disabled = false;
    }
  });
}

if (deactivateLicenseBtn) {
  deactivateLicenseBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to deactivate your Pro license on this browser?')) return;

    deactivateLicenseBtn.disabled = true;
    showLicenseStatus('Deactivating license...', 'loading');

    try {
      await chrome.runtime.sendMessage({ type: 'DEACTIVATE_FS_LICENSE' });
      showLicenseStatus('License deactivated successfully.', 'normal');
      loadProSettings();
    } catch (err) {
      showLicenseStatus(`⚠️ Deactivation error: ${err.message}`, 'error');
    } finally {
      deactivateLicenseBtn.disabled = false;
    }
  });
}

// --- Pro Rephrase History Log Management ---
let cachedHistory = [];

const historySearchInput = document.getElementById('history-search-input');
const historyClearSearchBtn = document.getElementById('history-clear-search-btn');
const historyStyleFilter = document.getElementById('history-style-filter');
const historyItemsContainer = document.getElementById('history-items-container');
const historyCountBadge = document.getElementById('history-count-badge');
const historyExportBtn = document.getElementById('history-export-btn');
const historyClearAllBtn = document.getElementById('history-clear-all-btn');

function formatTimestamp(ms) {
  if (!ms) return '';
  const date = new Date(ms);
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
  return `${dateStr}, ${timeStr}`;
}

function formatRelativeTime(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return '';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function highlightMatch(text, query) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  if (!query) return escaped;

  const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(`(${safeQuery})`, 'gi');
  return escaped.replace(reg, '<mark class="history-highlight">$1</mark>');
}

function loadRephraseHistory() {
  chrome.storage.local.get(['rephraseHistory'], (result) => {
    cachedHistory = Array.isArray(result.rephraseHistory) ? result.rephraseHistory : [];
    if (historyCountBadge) {
      historyCountBadge.textContent = `${cachedHistory.length} / 50 Saved`;
    }
    filterAndRenderHistory();
  });
}

function filterAndRenderHistory() {
  if (!historyItemsContainer) return;

  const query = (historySearchInput ? historySearchInput.value : '').trim().toLowerCase();
  const styleFilter = historyStyleFilter ? historyStyleFilter.value : 'all';

  if (historyClearSearchBtn) {
    historyClearSearchBtn.style.display = query.length > 0 ? 'inline-block' : 'none';
  }

  let filtered = [...cachedHistory];

  if (styleFilter !== 'all') {
    if (styleFilter === 'custom') {
      filtered = filtered.filter(item => item.style === 'custom' || (!['default', 'formal', 'simplify', 'bullets', 'slack', 'inline-fix'].includes(item.style)));
    } else {
      filtered = filtered.filter(item => item.style === styleFilter);
    }
  }

  if (query) {
    filtered = filtered.filter(item => {
      const orig = (item.originalText || '').toLowerCase();
      const suggestions = (item.suggestions || []).map(s => (s || '').toLowerCase()).join(' ');
      const styleLabel = (item.styleLabel || '').toLowerCase();
      const style = (item.style || '').toLowerCase();
      const engine = (item.engine || '').toLowerCase();

      return orig.includes(query) || suggestions.includes(query) || styleLabel.includes(query) || style.includes(query) || engine.includes(query);
    });
  }

  renderHistoryItems(filtered, query, cachedHistory.length);
}

function renderHistoryItems(items, query, totalSaved) {
  if (!historyItemsContainer) return;
  historyItemsContainer.innerHTML = '';

  if (totalSaved === 0) {
    historyItemsContainer.innerHTML = `
      <div class="history-empty-state">
        <div class="history-empty-icon">📜</div>
        <h3 class="history-empty-title">No Rephrasings Saved Yet</h3>
        <p class="history-empty-desc">
          Whenever you select text on any webpage and rephrase or fix grammar with Gemini, your history will be logged here automatically (up to the last 50 rephrasings).
        </p>
      </div>
    `;
    return;
  }

  if (items.length === 0) {
    historyItemsContainer.innerHTML = `
      <div class="history-empty-state">
        <div class="history-empty-icon">🔍</div>
        <h3 class="history-empty-title">No Matching Rephrasings Found</h3>
        <p class="history-empty-desc">
          No saved items match your current search query or filter. Try a different search term or reset the style filter.
        </p>
        <button type="button" id="reset-history-search-btn" class="btn-detect" style="margin-top: 14px; padding: 7px 14px; font-size: 12.5px;">
          Clear Filters
        </button>
      </div>
    `;
    const resetBtn = document.getElementById('reset-history-search-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (historySearchInput) historySearchInput.value = '';
        if (historyStyleFilter) historyStyleFilter.value = 'all';
        filterAndRenderHistory();
      });
    }
    return;
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-item-card';
    card.dataset.id = item.id;

    const timeStr = formatTimestamp(item.timestamp);
    const relativeTime = formatRelativeTime(item.timestamp);
    const engineBadge = item.engine === 'chrome-ai' ? '⚡ Chrome AI' : '☁️ Gemini Cloud';

    const suggestionsHTML = (item.suggestions || []).map((sugg) => `
      <div class="history-suggestion-row">
        <div class="history-suggestion-text">${highlightMatch(sugg, query)}</div>
        <button type="button" class="btn-copy-history" data-text="${escapeHtml(sugg)}" title="Copy suggestion to clipboard">
          📋 Copy
        </button>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="history-item-header">
        <div class="history-item-meta">
          <span class="history-time-badge" title="${escapeHtml(timeStr)}">${escapeHtml(timeStr)}</span>
          ${relativeTime ? `<span class="history-relative-time">${escapeHtml(relativeTime)}</span>` : ''}
          <span class="history-style-pill">${escapeHtml(item.styleLabel || 'Rephrase')}</span>
          <span class="history-engine-pill">${escapeHtml(engineBadge)}</span>
        </div>
        <button type="button" class="history-delete-item-btn" data-id="${escapeHtml(item.id)}" title="Delete this entry" aria-label="Delete entry">
          🗑️
        </button>
      </div>
      <div class="history-item-body">
        <div>
          <div class="history-box-label">Original Text</div>
          <div class="history-original-text">${highlightMatch(item.originalText, query)}</div>
        </div>
        <div>
          <div class="history-box-label">Rephrased Suggestions (${(item.suggestions || []).length})</div>
          ${suggestionsHTML}
        </div>
      </div>
    `;

    historyItemsContainer.appendChild(card);
  });

  // Attach 1-click Copy button handlers
  const copyButtons = historyItemsContainer.querySelectorAll('.btn-copy-history');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const textToCopy = btn.getAttribute('data-text');
      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalHTML = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = originalHTML;
        }, 1500);
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
      }
    });
  });

  // Attach Delete Item handlers
  const deleteButtons = historyItemsContainer.querySelectorAll('.history-delete-item-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      if (id) {
        deleteHistoryItem(id);
      }
    });
  });
}

function deleteHistoryItem(id) {
  chrome.storage.local.get(['rephraseHistory'], (result) => {
    let list = Array.isArray(result.rephraseHistory) ? result.rephraseHistory : [];
    list = list.filter(item => item.id !== id);
    chrome.storage.local.set({ rephraseHistory: list }, () => {
      loadRephraseHistory();
    });
  });
}

function clearAllHistory() {
  chrome.storage.local.get(['rephraseHistory'], (result) => {
    const list = Array.isArray(result.rephraseHistory) ? result.rephraseHistory : [];
    if (list.length === 0) return;

    if (confirm(`Are you sure you want to delete all ${list.length} saved rephrasings from your history? This action cannot be undone.`)) {
      chrome.storage.local.set({ rephraseHistory: [] }, () => {
        loadRephraseHistory();
      });
    }
  });
}

function exportHistory() {
  chrome.storage.local.get(['rephraseHistory'], (result) => {
    const list = Array.isArray(result.rephraseHistory) ? result.rephraseHistory : [];
    if (list.length === 0) {
      alert("No history records to export.");
      return;
    }

    const jsonStr = JSON.stringify(list, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-rephrase-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// Tab Switching Navigation
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(`tab-${target}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadOptions();
  loadProSettings();
  renderStylePresets();

  const addPresetBtn = document.getElementById('add-preset-btn');
  if (addPresetBtn) {
    addPresetBtn.addEventListener('click', addCustomPreset);
  }

  const switchToProBtn = document.getElementById('switch-to-pro-tab-btn');
  if (switchToProBtn) {
    switchToProBtn.addEventListener('click', () => {
      const proTabBtn = document.querySelector('.tab-btn[data-tab="pro"]');
      if (proTabBtn) proTabBtn.click();
    });
  }

  const switchToProFromHistoryBtn = document.getElementById('switch-to-pro-from-history-btn');
  if (switchToProFromHistoryBtn) {
    switchToProFromHistoryBtn.addEventListener('click', () => {
      const proTabBtn = document.querySelector('.tab-btn[data-tab="pro"]');
      if (proTabBtn) proTabBtn.click();
    });
  }

  const switchToProFromVarBtn = document.getElementById('switch-to-pro-from-var-btn');
  if (switchToProFromVarBtn) {
    switchToProFromVarBtn.addEventListener('click', () => {
      const proTabBtn = document.querySelector('.tab-btn[data-tab="pro"]');
      if (proTabBtn) proTabBtn.click();
    });
  }

  if (historySearchInput) {
    historySearchInput.addEventListener('input', filterAndRenderHistory);
  }
  if (historyClearSearchBtn) {
    historyClearSearchBtn.addEventListener('click', () => {
      if (historySearchInput) {
        historySearchInput.value = '';
        filterAndRenderHistory();
        historySearchInput.focus();
      }
    });
  }
  if (historyStyleFilter) {
    historyStyleFilter.addEventListener('change', filterAndRenderHistory);
  }
  if (historyClearAllBtn) {
    historyClearAllBtn.addEventListener('click', clearAllHistory);
  }
  if (historyExportBtn) {
    historyExportBtn.addEventListener('click', exportHistory);
  }

  // Check URL hash for direct tab linking (e.g., #history)
  const checkUrlHash = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${hash}"]`);
      if (tabBtn) tabBtn.click();
    }
  };
  checkUrlHash();
  window.addEventListener('hashchange', checkUrlHash);
});

saveButton.addEventListener('click', saveOptions);
testButton.addEventListener('click', testConnection);
detectButton.addEventListener('click', () => fetchAvailableModels(true));

