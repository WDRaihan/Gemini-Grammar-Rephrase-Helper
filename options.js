// options.js

const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');
const saveButton = document.getElementById('save-btn');
const testButton = document.getElementById('test-btn');
const detectButton = document.getElementById('detect-btn');
const statusDiv = document.getElementById('status');

// Load saved settings
function loadOptions() {
  chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.geminiModel) {
      ensureOptionExists(result.geminiModel);
      modelSelect.value = result.geminiModel;
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

  if (!apiKey) {
    showStatus('Please enter an API key.', '#dc3545');
    return;
  }

  chrome.storage.sync.set({ geminiApiKey: apiKey, geminiModel: model }, () => {
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

      // If model not found or not supported, auto-detect available models
      if (response.status === 404 || errorMsg.includes('not found') || errorMsg.includes('not supported')) {
        showStatus(`Model "${model}" not found. Auto-detecting your available models...`, '#f59e0b', 0);
        const detectedModel = await fetchAvailableModels(false);
        if (detectedModel) {
          // Test the newly detected model right away
          try {
            const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(detectedModel)}:generateContent`;
            const testRes = await fetch(testUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
            });
            if (testRes.ok) {
              showStatus(`Connection successful! (Switched to "${detectedModel}" and saved)`, '#28a745', 6000);
            } else {
              showStatus(`Switched to "${detectedModel}". Click "Test Connection" to test it.`, '#28a745', 7000);
            }
          } catch (_) {
            showStatus(`Switched to "${detectedModel}". Click "Test Connection" to test it.`, '#28a745', 7000);
          }
        }
      } else {
        showStatus(`Test failed: ${errorMsg}`, '#dc3545', 7000);
      }
    }
  } catch (err) {
    showStatus(`Network error: ${err.message}`, '#dc3545', 7000);
  } finally {
    testButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveButton.addEventListener('click', saveOptions);
testButton.addEventListener('click', testConnection);
detectButton.addEventListener('click', () => fetchAvailableModels(true));
