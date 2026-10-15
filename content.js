let geminiLoadingTimer = null;
let originalPromptText = ""; // Immutable raw input from initial selection
let currentModalText = "";   // Mutable active input for subsequent styles/prompts
let currentModalStyle = "default";
let isProUser = false;
let isInternalStyleChange = false;
let initialDefaultSuggestions = null;
let initialEngine = "";
let currentVariationLabels = [];

const FREEMIUS_PRODUCT_ID = "41271";
const FREEMIUS_PRICING_ID = "98283";
const FREEMIUS_CHECKOUT_URL = `https://checkout.freemius.com/?plugin_id=${FREEMIUS_PRODUCT_ID}&pricing_id=${FREEMIUS_PRICING_ID}`;

const DEFAULT_PRESETS_LIST = [
  { id: 'default', label: '✦ Default', isPro: false },
  { id: 'formal', label: 'Make Formal', isPro: true },
  { id: 'simplify', label: 'Simplify for 5th Grader', isPro: true },
  { id: 'bullets', label: 'Convert to Bullets', isPro: true },
  { id: 'slack', label: 'Casual Slack Message', isPro: true },
  { id: 'custom', label: 'Custom Prompt...', isPro: true }
];

let activeStylePresets = [...DEFAULT_PRESETS_LIST];

function updateActivePresets(storedPresets) {
  if (!Array.isArray(storedPresets)) {
    activeStylePresets = [...DEFAULT_PRESETS_LIST];
    return;
  }

  const list = [{ id: 'default', label: '✦ Default', isPro: false }];

  storedPresets.forEach(preset => {
    if (preset.enabled !== false) {
      list.push({
        id: preset.id,
        label: preset.label,
        isPro: true
      });
    }
  });

  list.push({ id: 'custom', label: 'Custom Prompt...', isPro: true });
  activeStylePresets = list;
}

function clearGeminiLoadingTimer() {
  if (geminiLoadingTimer) {
    clearTimeout(geminiLoadingTimer);
    geminiLoadingTimer = null;
  }
}

// Check initial Pro status and presets from storage
chrome.storage.sync.get(['isPro', 'stylePresets'], (res) => {
  if (typeof res?.isPro === 'boolean') {
    isProUser = res.isPro;
  }
  if (Array.isArray(res?.stylePresets)) {
    updateActivePresets(res.stylePresets);
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    let shouldRefresh = false;
    if (changes.isPro) {
      isProUser = Boolean(changes.isPro.newValue);
      shouldRefresh = true;
    }
    if (changes.stylePresets) {
      updateActivePresets(changes.stylePresets.newValue);
      shouldRefresh = true;
    }
    if (shouldRefresh) {
      refreshPresetsBar();
    }
  }
});

// Attach listener per active runtime instance
if (window.__geminiCurrentRuntime !== chrome.runtime) {
  window.__geminiCurrentRuntime = chrome.runtime;

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SHOW_LOADING') {
      clearGeminiLoadingTimer();
      currentModalStyle = request.activeStyle || currentModalStyle || 'default';
      if (typeof request.isPro === 'boolean') isProUser = request.isPro;

      const existingModal = document.getElementById('gemini-rephrase-modal');
      if (!existingModal || !isInternalStyleChange) {
        // Fresh invocation from context menu / shortcut
        originalPromptText = request.originalText || '';
        currentModalText = request.originalText || '';
        initialDefaultSuggestions = null;
        initialEngine = '';
        showModal('<h3>Loading...</h3><div class="spinner"></div><p>Asking Gemini for suggestions...</p>');
      } else {
        // Preset or prompt switch inside an already open modal
        const modalBody = document.getElementById('gemini-modal-body');
        if (modalBody) {
          const presetLabel = activeStylePresets.find(p => p.id === currentModalStyle)?.label || currentModalStyle;
          modalBody.innerHTML = `
            <div class="spinner"></div>
            <p style="color: #475569; font-size: 14px; margin-top: 10px;">
              Applying style: <strong>${escapeHTML(presetLabel)}</strong>...
            </p>
          `;
        }
      }

      // Safety watchdog: ensure loading spinner never hangs indefinitely
      geminiLoadingTimer = setTimeout(() => {
        isInternalStyleChange = false;
        updateModalContent("Request timed out. Google Gemini took too long to respond. Please check your connection or try again.", true);
      }, 28000);

    } else if (request.type === 'SHOW_RESULT') {
      clearGeminiLoadingTimer();
      isInternalStyleChange = false;
      if (!originalPromptText && request.originalText) {
        originalPromptText = request.originalText;
      }
      currentModalStyle = request.activeStyle || currentModalStyle || 'default';
      if (typeof request.isPro === 'boolean') isProUser = request.isPro;

      updateModalContent(request.data, request.isError, currentModalStyle, isProUser, request.engine, request.labels);
    }
  });
}

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Creates and displays the modal on the page with the presets bar.
 * @param {string} contentHTML The initial HTML content to display inside the modal.
 */
function showModal(contentHTML) {
  const existingModal = document.getElementById('gemini-rephrase-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'gemini-rephrase-modal';
  modal.innerHTML = `
    <div id="gemini-modal-overlay"></div>
    <div id="gemini-modal-content">
      <div id="gemini-modal-header">
        <h2>Gemini Suggestions <span id="gemini-engine-badge" style="display: none; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; vertical-align: middle; margin-left: 6px;"></span></h2>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="gemini-modal-history-btn" title="View Rephrase History Log (Pro)" aria-label="Open History Log">📜 History</button>
          <button id="gemini-modal-close-btn" aria-label="Close modal">&times;</button>
        </div>
      </div>
      <div id="gemini-modal-presets"></div>
      <div id="gemini-custom-prompt-container">
        <input type="text" id="gemini-custom-prompt-input" placeholder="Enter custom style instruction (e.g. Translate to French and sound persuasive)..." />
        <button id="gemini-custom-prompt-btn">Generate</button>
      </div>
      <div id="gemini-modal-body">
        ${contentHTML}
      </div>
    </div>
  `;

  // Append inside the topmost active modal/dialog if one exists, or document.body as the last child
  const activeDialog = document.querySelector('dialog[open], #artdeco-modal-outlet, .artdeco-modal-overlay, [role="dialog"][aria-modal="true"]');
  const targetParent = (activeDialog && activeDialog.contains(document.activeElement)) ? activeDialog : document.body;
  targetParent.appendChild(modal);

  // Apply maximum integer z-index inline to guarantee overriding any host site styles
  modal.style.setProperty('z-index', '2147483647', 'important');
  const modalContent = modal.querySelector('#gemini-modal-content');
  if (modalContent) {
    modalContent.style.setProperty('z-index', '2147483647', 'important');

    // Centralized event delegation for copy buttons
    modalContent.addEventListener('click', async (event) => {
      const copyBtn = event.target.closest('.copy-suggestion-btn');
      if (copyBtn) {
        event.stopPropagation();
        const textElement = copyBtn.closest('.suggestion-item')?.querySelector('.suggestion-text');
        const textToCopy = textElement ? textElement.textContent : '';
        if (textToCopy) {
          await copyToClipboard(textToCopy, copyBtn);
        }
      }
    });
  }
  const modalOverlay = modal.querySelector('#gemini-modal-overlay');
  if (modalOverlay) {
    modalOverlay.style.setProperty('z-index', '2147483646', 'important');
  }

  document.getElementById('gemini-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('gemini-modal-overlay').addEventListener('click', closeModal);

  const historyBtn = document.getElementById('gemini-modal-history-btn');
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_HISTORY_PAGE' });
    });
  }
  
  const customBtn = document.getElementById('gemini-custom-prompt-btn');
  const customInput = document.getElementById('gemini-custom-prompt-input');
  if (customBtn && customInput) {
    const handleCustomSubmit = () => {
      const promptVal = customInput.value.trim();
      if (!promptVal) return;
      triggerStyleRephrase('custom', promptVal);
    };
    customBtn.addEventListener('click', handleCustomSubmit);
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCustomSubmit();
      }
    });
  }

  window.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(event) {
  if (event.key === 'Escape') {
    closeModal();
  }
}

/**
 * Renders the presets toolbar buttons and pro locks.
 */
function renderPresetsBar() {
  const container = document.getElementById('gemini-modal-presets');
  if (!container) return;

  container.innerHTML = '';

  // If currentModalStyle is no longer in activeStylePresets, reset to default
  if (!activeStylePresets.some(p => p.id === currentModalStyle)) {
    currentModalStyle = 'default';
  }

  activeStylePresets.forEach(preset => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `gemini-preset-pill ${preset.id === currentModalStyle ? 'active' : ''}`;
    pill.dataset.presetId = preset.id;

    let lockBadge = '';
    if (preset.isPro && !isProUser) {
      lockBadge = '<span class="gemini-pro-tag">🔒 PRO</span>';
    }

    pill.innerHTML = `${escapeHTML(preset.label)} ${lockBadge}`;

    pill.addEventListener('click', () => {
      handlePresetClick(preset);
    });

    container.appendChild(pill);
  });

  const customContainer = document.getElementById('gemini-custom-prompt-container');
  if (customContainer) {
    if (currentModalStyle === 'custom' && isProUser) {
      customContainer.classList.add('visible');
    } else {
      customContainer.classList.remove('visible');
    }
  }
}

function refreshPresetsBar() {
  renderPresetsBar();
}

/**
 * Handles preset clicks, gating Pro features for Free users.
 * @param {object} preset
 */
function handlePresetClick(preset) {
  if (preset.isPro && !isProUser) {
    showProUpgradeBanner();
    return;
  }

  // If user clicks 'default', it acts as the reset button to restore first suggestions
  if (preset.id === 'default') {
    currentModalStyle = 'default';
    renderPresetsBar();
    const customContainer = document.getElementById('gemini-custom-prompt-container');
    if (customContainer) customContainer.classList.remove('visible');

    if (initialDefaultSuggestions && initialDefaultSuggestions.length > 0) {
      currentModalText = initialDefaultSuggestions[0];
      updateModalContent(initialDefaultSuggestions, false, 'default', isProUser, initialEngine, currentVariationLabels);
      return;
    } else {
      currentModalText = originalPromptText;
      triggerStyleRephrase('default');
      return;
    }
  }

  currentModalStyle = preset.id;
  renderPresetsBar();

  const customContainer = document.getElementById('gemini-custom-prompt-container');
  if (preset.id === 'custom') {
    const customInput = document.getElementById('gemini-custom-prompt-input');
    if (customContainer && customInput) {
      customContainer.classList.add('visible');
      customInput.focus();
    }
  } else {
    if (customContainer) customContainer.classList.remove('visible');
    triggerStyleRephrase(preset.id);
  }
}

/**
 * Triggers rephrasing with the selected style.
 * @param {string} styleId
 * @param {string} customPrompt
 */
function triggerStyleRephrase(styleId, customPrompt = '') {
  if (!currentModalText) return;

  isInternalStyleChange = true;
  clearGeminiLoadingTimer();
  const modalBody = document.getElementById('gemini-modal-body');
  if (modalBody) {
    const presetLabel = activeStylePresets.find(p => p.id === styleId)?.label || styleId;
    modalBody.innerHTML = `
      <div class="spinner"></div>
      <p style="color: #475569; font-size: 14px; margin-top: 10px;">
        Applying style: <strong>${escapeHTML(presetLabel)}</strong>...
      </p>
    `;
  }

  geminiLoadingTimer = setTimeout(() => {
    isInternalStyleChange = false;
    updateModalContent("Request timed out. Google Gemini took too long to respond. Please try again.", true);
  }, 28000);

  chrome.runtime.sendMessage({
    type: 'REPHRASE_WITH_STYLE',
    text: currentModalText,
    style: styleId,
    customPrompt: customPrompt
  }, (response) => {
    if (chrome.runtime.lastError) {
      isInternalStyleChange = false;
      clearGeminiLoadingTimer();
      updateModalContent("Could not contact background service. Please reload the page and try again.", true);
    }
  });
}

/**
 * Shows the Pro Upgrade banner inside the modal body for free users.
 */
function showProUpgradeBanner() {
  const existingBanner = document.getElementById('gemini-pro-upgrade-banner');
  if (existingBanner) {
    existingBanner.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const modalBody = document.getElementById('gemini-modal-body');
  if (!modalBody) return;

  const banner = document.createElement('div');
  banner.id = 'gemini-pro-upgrade-banner';
  banner.innerHTML = `
    <div class="gemini-pro-banner-header">
      <h4 class="gemini-pro-banner-title">⭐ Unlock Style Presets with Pro</h4>
      <button class="gemini-pro-banner-close" aria-label="Close banner">&times;</button>
    </div>
    <p class="gemini-pro-banner-desc">
      Unlock instant style transformations: <strong>Make Formal</strong>, <strong>5th Grader simplicity</strong>, <strong>Bullet Points</strong>, <strong>Slack chat</strong>, and <strong>Custom Prompts</strong>.
    </p>
    <ul class="gemini-pro-banner-features">
      <li>✓ Custom Style Presets</li>
      <li>✓ Unlimited Custom Prompts</li>
      <li>✓ Executive & Formal Tone</li>
      <li>✓ Casual Slack & Chat Mode</li>
    </ul>
    <div class="gemini-pro-banner-actions" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
      <a href="${FREEMIUS_CHECKOUT_URL}" target="_blank" rel="noopener noreferrer" class="gemini-btn-buy-pro">
        Upgrade to Pro
      </a>
      <div style="font-size: 12px; color: #475569; display: inline-flex; align-items: center; gap: 5px;">
        <span>Already purchased?</span>
        <a href="https://customers.freemius.com/" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 500;">
          Find License (Client Portal) ↗
        </a>
      </div>
    </div>
    <div class="gemini-pro-inline-activate" id="gemini-pro-key-row">
      <input type="text" id="gemini-banner-license-key" placeholder="Enter your license key (e.g. fs_lic_...)" />
      <button type="button" id="gemini-banner-activate-btn">Activate</button>
    </div>
    <div id="gemini-banner-key-status" style="font-size: 11px; margin-top: 6px; font-weight: 500;"></div>
  `;

  modalBody.prepend(banner);

  banner.querySelector('.gemini-pro-banner-close').addEventListener('click', () => banner.remove());
  
  const keyRow = banner.querySelector('#gemini-pro-key-row');
  const activateBtn = banner.querySelector('#gemini-banner-activate-btn');
  const keyInput = banner.querySelector('#gemini-banner-license-key');
  const statusEl = banner.querySelector('#gemini-banner-key-status');

  activateBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = 'Please enter a license key.';
      return;
    }

    statusEl.style.color = '#4338ca';
    statusEl.textContent = 'Validating license key with Freemius...';
    activateBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ACTIVATE_FS_LICENSE',
        licenseKey: key
      });

      if (response?.success) {
        isProUser = true;
        statusEl.style.color = '#16a34a';
        statusEl.textContent = '✓ Pro successfully activated! Enjoy full presets.';
        setTimeout(() => {
          banner.remove();
          renderPresetsBar();
        }, 1500);
      } else {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = response?.error || 'License activation failed. Please check your key.';
      }
    } catch (err) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = 'Could not contact licensing service.';
    } finally {
      activateBtn.disabled = false;
    }
  });
}

/**
 * Updates the content of the modal with the API response.
 * @param {string|string[]} data The suggestions or error message.
 * @param {boolean} isError Indicates if the result is an error message.
 * @param {string} activeStyle Active style preset ID.
 * @param {boolean} isPro Indicates whether user has Pro license.
 */
/**
 * Updates the content of the modal with the API response.
 * @param {string|string[]} data The suggestions or error message.
 * @param {boolean} isError Indicates if the result is an error message.
 * @param {string} activeStyle Active style preset ID.
 * @param {boolean} isPro Indicates whether user has Pro license.
 */
function updateModalContent(data, isError, activeStyle = 'default', isPro = false, engine = '', labels = []) {
  const modalBody = document.getElementById('gemini-modal-body');
  if (!modalBody) return;

  currentModalStyle = activeStyle;
  isProUser = isPro;
  if (Array.isArray(labels) && labels.length > 0) {
    currentVariationLabels = labels;
  }

  const engineBadge = document.getElementById('gemini-engine-badge');
  if (engineBadge) {
    if (!isError && engine === 'chrome-ai') {
      engineBadge.textContent = '🤖 Built-in AI (Local)';
      engineBadge.style.display = 'inline-block';
      engineBadge.style.backgroundColor = '#dbeafe';
      engineBadge.style.color = '#1d4ed8';
    } else if (!isError && engine === 'gemini-cloud') {
      engineBadge.textContent = '☁️ Gemini Cloud';
      engineBadge.style.display = 'inline-block';
      engineBadge.style.backgroundColor = '#f1f5f9';
      engineBadge.style.color = '#475569';
    } else {
      engineBadge.style.display = 'none';
    }
  }

  const presetsContainer = document.getElementById('gemini-modal-presets');
  const customContainer = document.getElementById('gemini-custom-prompt-container');

  let contentHTML = '';

  if (isError) {
    // Hide presets bar and custom prompt row on error
    if (presetsContainer) presetsContainer.classList.remove('visible');
    if (customContainer) customContainer.classList.remove('visible');
    contentHTML = `<p class="error-text">${escapeHTML(data)}</p>`;
  } else {
    // Only display style presets when Gemini successfully returns results
    renderPresetsBar();
    if (presetsContainer) presetsContainer.classList.add('visible');
    if (customContainer) {
      if (currentModalStyle === 'custom' && isProUser) {
        customContainer.classList.add('visible');
      } else {
        customContainer.classList.remove('visible');
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      // Cache initial default suggestions for 1-click reset on 'default' preset
      if (activeStyle === 'default' && !initialDefaultSuggestions) {
        initialDefaultSuggestions = data;
        initialEngine = engine;
      }

      // Active source automatically builds upon the first suggestion of the current result
      currentModalText = data[0];

      contentHTML = '<div class="suggestion-list">';
    
      // Choose badge names based on current style
      const getBadgeLabel = (index) => {
        if (index === 0) {
          switch (activeStyle) {
            case 'formal': return 'Formal Version';
            case 'simplify': return '5th Grader Simple';
            case 'bullets': return 'Bullet Points';
            case 'slack': return 'Casual Slack';
            case 'custom': return 'Custom Style';
            default: {
              const customPreset = activeStylePresets.find(p => p.id === activeStyle);
              return customPreset ? escapeHTML(customPreset.label) : (activeStyle === 'default' ? '✦ DEFAULT' : 'Grammar Fix');
            }
          }
        }
        if (Array.isArray(currentVariationLabels) && currentVariationLabels[index]) {
          return currentVariationLabels[index];
        }
        return `Variation ${index}`;
      };

      data.forEach((suggestion, index) => {
        const sanitized = escapeHTML(suggestion);
        const label = getBadgeLabel(index);
        contentHTML += `
          <div class="suggestion-item">
            <div class="suggestion-content">
              <span class="suggestion-badge">${label}</span>
              <p class="suggestion-text">${sanitized}</p>
            </div>
            <button class="copy-suggestion-btn" type="button">Copy</button>
          </div>
        `;
      });
      contentHTML += '</div>';
    } else {
      currentModalText = String(data);
      contentHTML = `<p class="suggestion-text">${escapeHTML(data)}</p>`;
    }
  }

  modalBody.innerHTML = contentHTML;
}

/**
 * Closes and removes the modal from the DOM.
 */
function closeModal() {
  clearGeminiLoadingTimer();
  const modal = document.getElementById('gemini-rephrase-modal');
  if (modal) {
    modal.remove();
  }
  originalPromptText = "";
  currentModalText = "";
  initialDefaultSuggestions = null;
  initialEngine = "";
  currentVariationLabels = [];
  isInternalStyleChange = false;
  window.removeEventListener('keydown', handleKeyDown);
}

/**
 * Copies the provided text to the clipboard with modern API and fallback.
 * @param {string} text The text to copy.
 * @param {HTMLElement} button The button that was clicked.
 */
async function copyToClipboard(text, button) {
  let copied = false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (_) {
      // Fallback to execCommand if clipboard API fails
    }
  }

  if (!copied) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch (err) {
      console.error('Copy fallback failed:', err);
    }
  }

  if (button) {
    const originalText = button.textContent;
    if (copied) {
      button.textContent = 'Copied!';
      button.style.backgroundColor = '#28a745';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.backgroundColor = '';
      }, 2000);
    } else {
      button.textContent = 'Failed';
      button.style.backgroundColor = '#dc3545';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.backgroundColor = '';
      }, 2000);
    }
  }
}

/* ==========================================================================
   Real-Time Inline Grammar Checker (Grammarly-Style)
   ========================================================================== */

let isAutoCheckEnabled = false;
let autoCheckDebounce = 2500;
let activeInputElement = null;
let activeInlineBadge = null;
let activeInlinePopover = null;

// Per-element state map to isolate debounce timers, corrections, and statuses across multiple input fields
const fieldStateMap = new WeakMap();

function getElementState(el) {
  if (!fieldStateMap.has(el)) {
    fieldStateMap.set(el, {
      status: 'idle', // 'idle' | 'checking' | 'has-error' | 'clean'
      lastCheckedText: '',
      correction: null, // { originalText, correctedText, explanation }
      debounceTimer: null,
      requestId: 0
    });
  }
  return fieldStateMap.get(el);
}

// Initialize setting from storage
chrome.storage.sync.get(['autoCheckEnabled', 'autoCheckDebounce'], (result) => {
  isAutoCheckEnabled = result.autoCheckEnabled === true;
  if (result.autoCheckDebounce) {
    autoCheckDebounce = Number(result.autoCheckDebounce) || 2500;
  }
});

// Update when user toggles setting in options
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.autoCheckEnabled) {
      isAutoCheckEnabled = Boolean(changes.autoCheckEnabled.newValue);
      if (!isAutoCheckEnabled) {
        removeInlineBadge();
        removeInlinePopover();
      }
    }
    if (changes.autoCheckDebounce) {
      autoCheckDebounce = Number(changes.autoCheckDebounce.newValue) || 2500;
    }
  }
});

function getRootEditableElement(element) {
  if (!element) return null;
  const el = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
  if (!el || !(el instanceof HTMLElement)) return null;

  // Never target our own extension UI elements
  if (el.closest('#gemini-inline-badge') || el.closest('#gemini-inline-popover') || el.closest('#gemini-rephrase-modal')) {
    return null;
  }

  // 1. Textarea and standard text inputs
  if (el.tagName === 'TEXTAREA') return el;
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url'].includes(type) ? el : null;
  }

  // 2. Clicked on a wrapper container that holds an editor (e.g. white space in LinkedIn post modal)
  if (el.matches?.('.share-creation-state__text-editor, .share-box-feed-entry__text-editor, .editor-content, .share-creation-state, .artdeco-modal__content')) {
    const innerEditor = el.querySelector('[contenteditable="true"], [contenteditable="plaintext-only"], .ql-editor');
    if (innerEditor && innerEditor instanceof HTMLElement) return innerEditor;
  }

  // 3. Recognized rich text editor containers (LinkedIn Quill post editor, LinkedIn Message editor, Draft.js, etc.)
  const knownEditor = el.closest('.ql-editor, .msg-form__contenteditable, [role="textbox"], [data-placeholder][contenteditable], [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (knownEditor && knownEditor instanceof HTMLElement) {
    return knownEditor;
  }

  // 4. Generic contenteditable: traverse upwards to find outermost editable element
  if (el.isContentEditable) {
    let curr = el;
    while (curr.parentElement && curr.parentElement.isContentEditable) {
      curr = curr.parentElement;
    }
    return curr;
  }

  return null;
}

function isEditableInput(element) {
  return Boolean(getRootEditableElement(element));
}

function getModalContainer(el) {
  if (!el || !(el instanceof HTMLElement)) return document.body;
  return el.closest('dialog, .artdeco-modal, [role="dialog"], #artdeco-modal-outlet') || document.body;
}

function getComposerBounds(el) {
  if (!el) return null;
  // For LinkedIn post creation modal, find the text-editor container for clean bottom-right docking
  const composerWrapper = el.closest('.share-creation-state__text-editor, .share-box-feed-entry__text-editor, .editor-content, .share-creation-state');
  if (composerWrapper && composerWrapper instanceof HTMLElement) {
    const wrapRect = composerWrapper.getBoundingClientRect();
    if (wrapRect.width > 50 && wrapRect.height > 50) {
      return wrapRect;
    }
  }
  return el.getBoundingClientRect();
}

function getFieldText(el) {
  const root = getRootEditableElement(el);
  if (!root) return '';
  if (root.tagName === 'TEXTAREA' || root.tagName === 'INPUT') {
    return root.value || '';
  }
  if (root.isContentEditable) {
    return root.innerText || root.textContent || '';
  }
  return '';
}

function setFieldText(el, newText) {
  const root = getRootEditableElement(el);
  if (!root) return false;

  if (root.tagName === 'TEXTAREA' || root.tagName === 'INPUT') {
    root.focus();
    try {
      root.setSelectionRange(0, root.value.length);
      const ok = document.execCommand('insertText', false, newText);
      if (!ok) throw new Error();
    } catch (_) {
      root.value = newText;
    }
    root.dispatchEvent(new Event('input', { bubbles: true }));
    root.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (root.isContentEditable) {
    root.focus();
    try {
      document.execCommand('selectAll', false, null);
      const ok = document.execCommand('insertText', false, newText);
      if (!ok) throw new Error();
    } catch (_) {
      root.innerText = newText;
    }

    // Dispatch synthetic InputEvent so React/Quill/Draft.js internal state updates reliably
    try {
      root.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: newText
      }));
    } catch (_) {
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }
    root.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

function ensureInlineBadge(targetEl) {
  const container = getModalContainer(targetEl || activeInputElement);
  if (activeInlineBadge) {
    if (activeInlineBadge.parentElement !== container) {
      container.appendChild(activeInlineBadge);
    }
    return activeInlineBadge;
  }
  const badge = document.createElement('div');
  badge.id = 'gemini-inline-badge';

  const iconUrl = (chrome.runtime && chrome.runtime.getURL) 
    ? chrome.runtime.getURL('images/icon48.png') 
    : '';

  badge.innerHTML = `
    <img src="${iconUrl}" class="gemini-badge-img" alt="✦" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" />
    <span class="gemini-badge-fallback-icon" style="display:none;font-size:12px;color:#2563eb;line-height:1;">✦</span>
    <span class="gemini-badge-dot"></span>
  `;
  container.appendChild(badge);
  activeInlineBadge = badge;

  badge.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent input from losing focus
  });

  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeInputElement) return;
    const state = getElementState(activeInputElement);
    if (badge.classList.contains('has-error') && state.correction) {
      toggleInlinePopover();
    }
  });

  return badge;
}

function removeInlineBadge() {
  if (activeInlineBadge) {
    activeInlineBadge.remove();
    activeInlineBadge = null;
  }
}

function updateBadgePosition() {
  if (!activeInlineBadge || !activeInputElement || !activeInputElement.isConnected) {
    if (activeInlineBadge) activeInlineBadge.style.display = 'none';
    return;
  }
  const rect = getComposerBounds(activeInputElement);
  if (!rect || rect.width === 0 || rect.height === 0 || rect.bottom < 15 || rect.top > window.innerHeight - 15 || rect.right < 15 || rect.left > window.innerWidth - 15) {
    activeInlineBadge.style.display = 'none';
    return;
  }

  activeInlineBadge.style.display = 'inline-flex';
  const badgeSize = 24;
  const isSingleLine = activeInputElement.tagName === 'INPUT';
  let top, left;

  if (isSingleLine) {
    // Vertically center inside single-line inputs
    top = rect.top + (rect.height - badgeSize) / 2;
    left = rect.right - badgeSize - 8;
  } else {
    // Bottom-right corner for textareas & multi-line inputs
    // Clamp to viewport boundary in case of large or scrolling modal editors
    const visibleBottom = Math.min(rect.bottom, window.innerHeight - 10);
    const visibleRight = Math.min(rect.right, window.innerWidth - 10);
    top = visibleBottom - badgeSize - 10;
    left = visibleRight - badgeSize - 12;
  }

  activeInlineBadge.style.position = 'fixed';
  activeInlineBadge.style.top = `${Math.max(8, top)}px`;
  activeInlineBadge.style.left = `${Math.max(8, left)}px`;

  if (activeInlinePopover) {
    positionInlinePopover();
  }
}

function setBadgeState(state, tooltipText = '') {
  const badge = ensureInlineBadge();
  badge.style.opacity = '1';
  badge.className = '';
  if (state && state !== 'idle') {
    badge.classList.add(state);
  }

  if (state === 'checking') {
    badge.title = tooltipText || 'Checking grammar with Gemini...';
  } else if (state === 'has-error') {
    badge.title = tooltipText || 'Grammar issue found — Click to fix';
  } else if (state === 'clean') {
    badge.title = tooltipText || 'Grammar looking good!';
    setTimeout(() => {
      if (badge && badge.classList.contains('clean')) {
        if (activeInputElement) {
          const st = getElementState(activeInputElement);
          if (st.status === 'clean') {
            setBadgeState('idle');
          }
        }
      }
    }, 2500);
  } else {
    // idle / default
    badge.title = tooltipText || 'Gemini Grammar Helper';
  }
  updateBadgePosition();
}

function syncBadgeWithElement(el) {
  const root = getRootEditableElement(el);
  if (!isAutoCheckEnabled || !root) {
    removeInlineBadge();
    removeInlinePopover();
    return;
  }

  // Dismiss any open popover from previous field
  removeInlinePopover();

  const text = getFieldText(root).trim();
  const isMultiLine = root.tagName === 'TEXTAREA' || root.isContentEditable || root.clientHeight > 45;

  // On single-line inputs, require at least 3 chars to prevent cluttering tiny search fields
  if (!isMultiLine && text.length < 3) {
    removeInlineBadge();
    return;
  }

  const state = getElementState(root);

  // If text changed since last correction was retrieved, invalidate stale correction
  if (state.correction && state.correction.originalText !== text) {
    state.correction = null;
    state.status = 'idle';
  }

  ensureInlineBadge();
  updateBadgePosition();

  if (state.status === 'has-error' && state.correction) {
    setBadgeState('has-error', 'Fix Available');
  } else if (state.status === 'checking') {
    setBadgeState('checking');
  } else if (state.status === 'clean' && state.lastCheckedText === text) {
    setBadgeState('clean', 'Looking good');
  } else {
    setBadgeState('idle', 'Gemini');
  }
}

function positionInlinePopover() {
  if (!activeInlinePopover || !activeInlineBadge) return;
  const badgeRect = activeInlineBadge.getBoundingClientRect();
  const popoverWidth = 320;
  let top = badgeRect.top - 210;
  let left = badgeRect.right - popoverWidth;

  if (badgeRect.top < 230) {
    top = badgeRect.bottom + 8;
  }
  if (left < 10) left = 10;
  if (left + popoverWidth > window.innerWidth - 10) {
    left = window.innerWidth - popoverWidth - 10;
  }

  activeInlinePopover.style.position = 'fixed';
  activeInlinePopover.style.top = `${Math.max(10, top)}px`;
  activeInlinePopover.style.left = `${Math.max(10, left)}px`;
}

function toggleInlinePopover() {
  if (activeInlinePopover) {
    removeInlinePopover();
    return;
  }
  if (!activeInputElement) return;

  const targetElement = activeInputElement; // Lock target element for apply fix
  const state = getElementState(targetElement);
  if (!state.correction) return;

  const currentFieldText = getFieldText(targetElement).trim();
  if (currentFieldText !== state.correction.originalText) {
    state.correction = null;
    state.status = 'idle';
    syncBadgeWithElement(targetElement);
    return;
  }

  const correction = state.correction;

  const popover = document.createElement('div');
  popover.id = 'gemini-inline-popover';

  const applyBtnHTML = isProUser
    ? `<button type="button" class="btn-apply-fix" title="Apply correction instantly">Apply Fix</button>`
    : `<button type="button" class="btn-apply-fix is-pro-disabled" disabled title="1-Click Apply Fix is a Pro feature — Upgrade to unlock">🔒 Apply Fix (Pro)</button>`;

  const proNoticeHTML = !isProUser
    ? `<div class="popover-pro-notice"><span>🔒</span> 1-Click Apply is for Pro users. Select & copy the suggestion above to paste.</div>`
    : '';

  popover.innerHTML = `
    <div class="popover-header">
      <h4 class="popover-title"><span>✦</span> Gemini Grammar Fix</h4>
      <button class="popover-close" aria-label="Close">&times;</button>
    </div>
    <div class="popover-body">
      <p class="popover-explanation">${escapeHTML(correction.explanation || 'Suggested grammar and spelling fix:')}</p>
      <div class="popover-diff">
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 2px;">BEFORE</div>
        <del>${escapeHTML(correction.originalText)}</del>
        <div style="color: #166534; font-size: 11px; margin: 8px 0 2px 0; font-weight: 600;">SUGGESTION</div>
        <ins>${escapeHTML(correction.correctedText)}</ins>
      </div>
      <div class="popover-actions">
        ${applyBtnHTML}
        <button type="button" class="btn-dismiss-fix">Dismiss</button>
      </div>
      ${proNoticeHTML}
    </div>
  `;

  const popoverContainer = getModalContainer(targetElement);
  popoverContainer.appendChild(popover);
  activeInlinePopover = popover;
  positionInlinePopover();

  popover.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  popover.querySelector('.popover-close').addEventListener('click', removeInlinePopover);
  popover.querySelector('.btn-dismiss-fix').addEventListener('click', removeInlinePopover);

  const applyBtn = popover.querySelector('.btn-apply-fix');
  if (applyBtn && !applyBtn.disabled) {
    applyBtn.addEventListener('click', () => {
      if (!isProUser) return;
      if (targetElement && correction) {
        setFieldText(targetElement, correction.correctedText);
        const st = getElementState(targetElement);
        st.status = 'clean';
        st.lastCheckedText = correction.correctedText.trim();
        st.correction = null;
        if (activeInputElement === targetElement) {
          setBadgeState('clean', 'Fixed!');
        }
        removeInlinePopover();

        // Record applied quick fix to History Log for Pro users
        chrome.runtime.sendMessage({
          type: 'RECORD_HISTORY_ITEM',
          item: {
            originalText: correction.originalText,
            suggestions: [correction.correctedText],
            style: 'inline-fix',
            styleLabel: 'Quick Fix',
            engine: correction.engine || 'gemini-cloud'
          }
        });
      }
    });
  }
}

function removeInlinePopover() {
  if (activeInlinePopover) {
    activeInlinePopover.remove();
    activeInlinePopover = null;
  }
}

function scheduleInlineCheck(el) {
  const root = getRootEditableElement(el);
  if (!isAutoCheckEnabled || !root) return;
  const state = getElementState(root);

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }

  const text = getFieldText(root).trim();
  const isMultiLine = root.tagName === 'TEXTAREA' || root.isContentEditable || root.clientHeight > 45;

  if (text.length < 8) {
    state.correction = null;
    state.status = 'idle';
    state.lastCheckedText = '';
    if (activeInputElement === root) {
      if (isMultiLine) {
        setBadgeState('idle', 'Gemini');
      } else {
        removeInlineBadge();
      }
      removeInlinePopover();
    }
    return;
  }

  // If text already matches what was previously verified clean, avoid duplicate network check
  if (state.lastCheckedText === text && state.status === 'clean') {
    if (activeInputElement === root) {
      setBadgeState('clean', 'Looking good');
    }
    return;
  }

  // If text matches current valid correction, maintain has-error
  if (state.correction && state.correction.originalText === text) {
    if (activeInputElement === root) {
      setBadgeState('has-error', 'Fix Available');
    }
    return;
  }

  // Text is modified or not yet verified
  state.correction = null;
  state.status = 'idle';

  if (activeInputElement === root) {
    ensureInlineBadge();
    setBadgeState('idle', 'Gemini');
    updateBadgePosition();
  }

  const currentReqId = ++state.requestId;

  // Wait debounce delay after user finishes typing
  state.debounceTimer = setTimeout(async () => {
    state.debounceTimer = null;
    const currentText = getFieldText(root).trim();
    if (currentText.length < 8) return;
    if (state.requestId !== currentReqId) return;

    state.status = 'checking';
    if (activeInputElement === root) {
      setBadgeState('checking');
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTO_CHECK_GRAMMAR',
        text: currentText
      });

      // Guard against race conditions: verify this is still the freshest request and text didn't change
      if (state.requestId !== currentReqId) return;
      if (getFieldText(root).trim() !== currentText) return;

      if (typeof response?.isPro === 'boolean') {
        isProUser = response.isPro;
      }

      if (!response?.success) {
        state.status = 'idle';
        if (activeInputElement === root) {
          setBadgeState('idle', 'Gemini');
        }
        return;
      }

      state.lastCheckedText = currentText;

      if (response.hasErrors && response.correctedText && response.correctedText !== currentText) {
        state.correction = {
          originalText: currentText,
          correctedText: response.correctedText,
          explanation: response.explanation || 'Grammar & spelling fix'
        };
        state.status = 'has-error';

        // CRITICAL: Only update badge UI if this element is STILL the active focused element
        if (activeInputElement === root) {
          setBadgeState('has-error', 'Fix Available');
        }
      } else {
        state.correction = null;
        state.status = 'clean';
        if (activeInputElement === root) {
          setBadgeState('clean', 'Looking good');
        }
      }
    } catch (_) {
      state.status = 'idle';
      if (activeInputElement === root) {
        setBadgeState('idle', 'Gemini');
      }
    }
  }, autoCheckDebounce);
}

// Global delegated event listeners for real-time checking
document.addEventListener('focusin', (e) => {
  if (!isAutoCheckEnabled) return;
  const root = getRootEditableElement(e.target);
  if (root) {
    activeInputElement = root;
    syncBadgeWithElement(root);
    scheduleInlineCheck(root);
  }
}, true);

document.addEventListener('focusout', (e) => {
  if (!isAutoCheckEnabled) return;
  const root = getRootEditableElement(e.target);
  if (root) {
    setTimeout(() => {
      const currentFocus = getRootEditableElement(document.activeElement);
      // If still inside the same modal dialog (e.g. clicking an emoji button, Proofread button, or modal whitespace), keep badge active
      const modalDialog = activeInputElement?.closest?.('dialog, .artdeco-modal, [role="dialog"], #artdeco-modal-outlet');
      const activeModal = document.activeElement?.closest?.('dialog, .artdeco-modal, [role="dialog"], #artdeco-modal-outlet');
      const stillInSameModal = modalDialog && activeModal && (modalDialog === activeModal);

      if (!currentFocus && !stillInSameModal && 
          !document.activeElement?.closest?.('#gemini-inline-popover') && 
          !document.activeElement?.closest?.('#gemini-inline-badge')) {
        if (!activeInlinePopover) {
          removeInlineBadge();
        }
      }
    }, 200);
  }
}, true);

const handleTypingEvent = (e) => {
  if (!isAutoCheckEnabled) return;
  const root = getRootEditableElement(e.target);
  if (root) {
    if (activeInputElement !== root) {
      activeInputElement = root;
      syncBadgeWithElement(root);
    }
    scheduleInlineCheck(root);
  }
};

document.addEventListener('input', handleTypingEvent, true);
document.addEventListener('keyup', handleTypingEvent, true);

document.addEventListener('click', (e) => {
  if (!isAutoCheckEnabled) return;

  if (activeInlinePopover && !e.target.closest('#gemini-inline-popover') && !e.target.closest('#gemini-inline-badge')) {
    removeInlinePopover();
    if (!getRootEditableElement(document.activeElement)) {
      removeInlineBadge();
      return;
    }
  }

  const root = getRootEditableElement(e.target);
  if (root) {
    activeInputElement = root;
    syncBadgeWithElement(root);
  }
}, true);

document.addEventListener('selectionchange', () => {
  if (!isAutoCheckEnabled) return;
  const root = getRootEditableElement(document.activeElement);
  if (root) {
    if (activeInputElement !== root) {
      activeInputElement = root;
      syncBadgeWithElement(root);
    } else {
      updateBadgePosition();
    }
  }
});

// Capture-phase scroll listener ensures scrolling inside modals/chatboxes updates position
window.addEventListener('scroll', updateBadgePosition, { passive: true, capture: true });
window.addEventListener('resize', updateBadgePosition, { passive: true });

// MutationObserver to immediately detect when LinkedIn post modal / share box mounts
if (typeof MutationObserver !== 'undefined') {
  const modalObserver = new MutationObserver(() => {
    if (!isAutoCheckEnabled) return;
    const postEditor = document.querySelector('.artdeco-modal [contenteditable="true"], .share-creation-state [contenteditable="true"], [role="dialog"] .ql-editor');
    if (postEditor && postEditor !== activeInputElement && postEditor.offsetParent !== null) {
      // Auto-activate for the modal post editor if focused or open
      if (document.activeElement === postEditor || postEditor.contains(document.activeElement) || !activeInputElement) {
        activeInputElement = postEditor;
        syncBadgeWithElement(postEditor);
        scheduleInlineCheck(postEditor);
      }
    }
  });

  modalObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

