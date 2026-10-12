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

// Load saved settings
function loadOptions() {
  chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'autoCheckEnabled', 'maxOutputTokens', 'autoCheckDebounce'], (result) => {
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
  });
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

  if (!apiKey) {
    showStatus('Please enter an API key.', '#dc3545');
    return;
  }

  chrome.storage.sync.set({
    geminiApiKey: apiKey,
    geminiModel: model,
    autoCheckEnabled: autoCheckEnabled,
    autoCheckDebounce: autoCheckDebounce,
    maxOutputTokens: maxOutputTokens
  }, () => {
    showStatus('Settings saved successfully!', '#28a745');
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
    showTestStatus('Please enter an API key first.', '#dc3545');
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
      showLicenseStatus(`Your ${result.fs_plan_name || 'Pro'} membership is active. Enjoy all style presets!`, 'success');
    } else {
      if (proBadge) {
        proBadge.textContent = 'Free Plan';
        proBadge.style.backgroundColor = '#e2e8f0';
        proBadge.style.color = '#475569';
      }
      if (proUpgradeBox) proUpgradeBox.style.display = 'block';
      if (fsLicenseInput) {
        fsLicenseInput.value = '';
        fsLicenseInput.disabled = false;
      }
      if (activateLicenseBtn) activateLicenseBtn.style.display = 'inline-block';
      if (deactivateLicenseBtn) deactivateLicenseBtn.style.display = 'none';
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
});

saveButton.addEventListener('click', saveOptions);
testButton.addEventListener('click', testConnection);
detectButton.addEventListener('click', () => fetchAvailableModels(true));

