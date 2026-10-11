// options.js

const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');
const autoCheckToggle = document.getElementById('auto-check-toggle');
const saveButton = document.getElementById('save-btn');
const testButton = document.getElementById('test-btn');
const detectButton = document.getElementById('detect-btn');
const statusDiv = document.getElementById('status');

// Load saved settings
function loadOptions() {
  chrome.storage.sync.get(['geminiApiKey', 'geminiModel', 'autoCheckEnabled'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      ensureOptionExists(result.geminiModel);
      modelSelect.value = result.geminiModel;
    }
    if (autoCheckToggle) {
      autoCheckToggle.checked = result.autoCheckEnabled === true;
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
  statusDiv.style.color = color;
  if (timeoutMs > 0) {
    setTimeout(() => {
      if (statusDiv.textContent === text) {
        statusDiv.textContent = '';
      }
    }, timeoutMs);
  }
}

// Save settings to chrome.storage.sync
function saveOptions() {
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const autoCheckEnabled = autoCheckToggle ? autoCheckToggle.checked : false;

  if (!apiKey) {
    showStatus('Please enter an API key.', '#dc3545');
    return;
  }

  chrome.storage.sync.set({
    geminiApiKey: apiKey,
    geminiModel: model,
    autoCheckEnabled: autoCheckEnabled
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

// Test connection with Google Gemini API
async function testConnection() {
  const apiKey = apiKeyInput.value.trim();
  let model = modelSelect.value;

  if (!apiKey) {
    showStatus('Please enter an API key first.', '#dc3545');
    return;
  }

  showStatus('Testing connection to Gemini...', '#4a90e2', 0);
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
      showStatus(`Connection successful! (${model} is active)`, '#28a745', 5000);
    } else {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch (_) {}

      const friendly = formatFriendlyErrorMessage(errorMsg, model);
      showStatus(`Test failed: ${friendly}`, '#dc3545', 9000);
    }
  } catch (err) {
    showStatus(`Network error: ${err.message}`, '#dc3545', 7000);
  } finally {
    testButton.disabled = false;
  }
}

// Pro & Freemius licensing UI controls
const proBadge = document.getElementById('pro-badge');
const proUpgradeBox = document.getElementById('pro-upgrade-box');
const fsLicenseInput = document.getElementById('fs-license-key');
const activateLicenseBtn = document.getElementById('activate-license-btn');
const deactivateLicenseBtn = document.getElementById('deactivate-license-btn');
const licenseStatusText = document.getElementById('license-status-text');

function loadProSettings() {
  chrome.storage.sync.get(['isPro', 'fs_license_key', 'fs_plan_name'], (result) => {
    const isPro = result.isPro === true;

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
      if (licenseStatusText) {
        licenseStatusText.textContent = `Your ${result.fs_plan_name || 'Pro'} membership is active. Enjoy all style presets!`;
      }
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
      if (licenseStatusText) {
        licenseStatusText.textContent = 'Enter your license key above to unlock all styles and custom prompts.';
      }
    }
  });
}

if (activateLicenseBtn) {
  activateLicenseBtn.addEventListener('click', async () => {
    const key = fsLicenseInput.value.trim();
    if (!key) {
      showStatus('Please enter a license key to activate.', '#dc3545');
      return;
    }

    activateLicenseBtn.disabled = true;
    showStatus('Activating license...', '#4a90e2', 0);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ACTIVATE_FS_LICENSE',
        licenseKey: key
      });

      if (response?.success) {
        showStatus(`Pro successfully activated! Plan: ${response.planName || 'Pro'}`, '#28a745', 6000);
        loadProSettings();
      } else {
        showStatus(`Activation error: ${response?.error || 'Invalid key.'}`, '#dc3545', 8000);
      }
    } catch (err) {
      showStatus(`Activation failed: ${err.message}`, '#dc3545', 7000);
    } finally {
      activateLicenseBtn.disabled = false;
    }
  });
}

if (deactivateLicenseBtn) {
  deactivateLicenseBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to deactivate your Pro license on this browser?')) return;

    deactivateLicenseBtn.disabled = true;
    showStatus('Deactivating license...', '#4a90e2', 0);

    try {
      await chrome.runtime.sendMessage({ type: 'DEACTIVATE_FS_LICENSE' });
      showStatus('License deactivated successfully.', '#28a745', 5000);
      loadProSettings();
    } catch (err) {
      showStatus(`Deactivation error: ${err.message}`, '#dc3545', 7000);
    } finally {
      deactivateLicenseBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadOptions();
  loadProSettings();
});

saveButton.addEventListener('click', saveOptions);
testButton.addEventListener('click', testConnection);
detectButton.addEventListener('click', () => fetchAvailableModels(true));
