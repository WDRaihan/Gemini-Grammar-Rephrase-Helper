let geminiLoadingTimer = null;
let currentModalText = "";
let currentModalStyle = "default";
let isProUser = false;

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
      currentModalText = request.originalText || currentModalText;
      currentModalStyle = request.activeStyle || currentModalStyle || 'default';
      if (typeof request.isPro === 'boolean') isProUser = request.isPro;

      showModal('<h3>Loading...</h3><div class="spinner"></div><p>Asking Gemini for suggestions...</p>');

      // Safety watchdog: ensure loading spinner never hangs indefinitely
      geminiLoadingTimer = setTimeout(() => {
        updateModalContent("Request timed out. Google Gemini took too long to respond. Please check your connection or try again.", true);
      }, 28000);

    } else if (request.type === 'SHOW_RESULT') {
      clearGeminiLoadingTimer();
      currentModalText = request.originalText || currentModalText;
      currentModalStyle = request.activeStyle || currentModalStyle || 'default';
      if (typeof request.isPro === 'boolean') isProUser = request.isPro;

      updateModalContent(request.data, request.isError, currentModalStyle, isProUser);
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
        <h2>Gemini Suggestions</h2>
        <button id="gemini-modal-close-btn" aria-label="Close modal">&times;</button>
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

  document.body.appendChild(modal);

  document.getElementById('gemini-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('gemini-modal-overlay').addEventListener('click', closeModal);
  
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
    updateModalContent("Request timed out. Google Gemini took too long to respond. Please try again.", true);
  }, 28000);

  chrome.runtime.sendMessage({
    type: 'REPHRASE_WITH_STYLE',
    text: currentModalText,
    style: styleId,
    customPrompt: customPrompt
  }, (response) => {
    if (chrome.runtime.lastError) {
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
function updateModalContent(data, isError, activeStyle = 'default', isPro = false) {
  const modalBody = document.getElementById('gemini-modal-body');
  if (!modalBody) return;

  currentModalStyle = activeStyle;
  isProUser = isPro;

  const presetsContainer = document.getElementById('gemini-modal-presets');
  const customContainer = document.getElementById('gemini-custom-prompt-container');

  let contentHTML = '';

  if (isError) {
    // Hide presets bar and custom prompt row on error
    if (presetsContainer) presetsContainer.classList.remove('visible');
    if (customContainer) customContainer.classList.remove('visible');
    contentHTML = `<p class="error-text">${escapeHTML(data)}</p>`;
  } else {
    // Only display style presets when Gemini successfully returns grammar fix results
    renderPresetsBar();
    if (presetsContainer) presetsContainer.classList.add('visible');
    if (customContainer) {
      if (currentModalStyle === 'custom' && isProUser) {
        customContainer.classList.add('visible');
      } else {
        customContainer.classList.remove('visible');
      }
    }

    if (Array.isArray(data)) {
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
            return customPreset ? escapeHTML(customPreset.label) : 'Grammar Fix';
          }
        }
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
          <button class="copy-suggestion-btn">Copy</button>
        </div>
      `;
    });
    contentHTML += '</div>';
  } else {
    contentHTML = `<p class="suggestion-text">${escapeHTML(data)}</p>`;
  }
}

modalBody.innerHTML = contentHTML;

  // Event delegation for copy buttons
  modalBody.addEventListener('click', async (event) => {
    if (event.target.classList.contains('copy-suggestion-btn')) {
      const textElement = event.target.closest('.suggestion-item')?.querySelector('.suggestion-text');
      const textToCopy = textElement ? textElement.textContent : '';
      if (textToCopy) {
        await copyToClipboard(textToCopy, event.target);
      }
    }
  });
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
let inlineDebounceTimer = null;
let currentInlineCorrection = null;
let activeInlineBadge = null;
let activeInlinePopover = null;

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

function isEditableInput(element) {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (element.tagName === 'TEXTAREA') return true;
  if (element.tagName === 'INPUT') {
    const type = (element.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url'].includes(type);
  }
  if (element.isContentEditable) return true;
  return false;
}

function getFieldText(el) {
  if (!el) return '';
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    return el.value || '';
  }
  if (el.isContentEditable) {
    return el.innerText || '';
  }
  return '';
}

function setFieldText(el, newText) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.focus();
    try {
      el.setSelectionRange(0, el.value.length);
      const ok = document.execCommand('insertText', false, newText);
      if (!ok) throw new Error();
    } catch (_) {
      el.value = newText;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el.isContentEditable) {
    el.focus();
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, newText);
    } catch (_) {
      el.innerText = newText;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

function ensureInlineBadge() {
  if (activeInlineBadge) return activeInlineBadge;
  const badge = document.createElement('div');
  badge.id = 'gemini-inline-badge';
  badge.innerHTML = `<span class="gemini-badge-icon">✦</span><span class="gemini-badge-text">Gemini</span>`;
  document.body.appendChild(badge);
  activeInlineBadge = badge;

  badge.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent input from losing focus
  });

  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (badge.classList.contains('has-error') && currentInlineCorrection) {
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
  if (!activeInlineBadge || !activeInputElement) return;
  const rect = activeInputElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    activeInlineBadge.style.display = 'none';
    return;
  }

  activeInlineBadge.style.display = 'inline-flex';
  const isSingleLine = rect.height < 45;
  let top, left;

  if (isSingleLine) {
    top = window.scrollY + rect.top + (rect.height - 24) / 2;
    left = window.scrollX + rect.right - 42;
  } else {
    top = window.scrollY + rect.bottom - 32;
    left = window.scrollX + rect.right - 46;
  }

  activeInlineBadge.style.top = `${Math.max(0, top)}px`;
  activeInlineBadge.style.left = `${Math.max(0, left)}px`;

  if (activeInlinePopover) {
    positionInlinePopover();
  }
}

function setBadgeState(state, text = '') {
  const badge = ensureInlineBadge();
  badge.className = '';
  badge.classList.add(state);

  const iconEl = badge.querySelector('.gemini-badge-icon');
  const textEl = badge.querySelector('.gemini-badge-text');

  if (state === 'checking') {
    if (iconEl) iconEl.textContent = '✦';
    if (textEl) textEl.textContent = 'Checking...';
  } else if (state === 'has-error') {
    if (iconEl) iconEl.innerHTML = `<span class="gemini-badge-dot"></span> ✦`;
    if (textEl) textEl.textContent = text || 'Fix Available';
  } else if (state === 'clean') {
    if (iconEl) iconEl.textContent = '✓';
    if (textEl) textEl.textContent = text || 'Correct';
    setTimeout(() => {
      if (badge && badge.classList.contains('clean')) {
        badge.style.opacity = '0';
        setTimeout(() => {
          if (badge && badge.style.opacity === '0') removeInlineBadge();
        }, 300);
      }
    }, 2500);
  }
  updateBadgePosition();
}

function positionInlinePopover() {
  if (!activeInlinePopover || !activeInlineBadge) return;
  const badgeRect = activeInlineBadge.getBoundingClientRect();
  const popoverWidth = 320;
  let top = window.scrollY + badgeRect.top - 210;
  let left = window.scrollX + badgeRect.right - popoverWidth;

  if (badgeRect.top < 230) {
    top = window.scrollY + badgeRect.bottom + 8;
  }
  if (left < 10) left = 10;

  activeInlinePopover.style.top = `${top}px`;
  activeInlinePopover.style.left = `${left}px`;
}

function toggleInlinePopover() {
  if (activeInlinePopover) {
    removeInlinePopover();
    return;
  }
  if (!currentInlineCorrection || !activeInputElement) return;

  const popover = document.createElement('div');
  popover.id = 'gemini-inline-popover';
  popover.innerHTML = `
    <div class="popover-header">
      <h4 class="popover-title"><span>✦</span> Gemini Grammar Fix</h4>
      <button class="popover-close" aria-label="Close">&times;</button>
    </div>
    <div class="popover-body">
      <p class="popover-explanation">${escapeHTML(currentInlineCorrection.explanation || 'Suggested grammar and spelling fix:')}</p>
      <div class="popover-diff">
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 2px;">BEFORE</div>
        <del>${escapeHTML(currentInlineCorrection.originalText)}</del>
        <div style="color: #166534; font-size: 11px; margin: 8px 0 2px 0; font-weight: 600;">SUGGESTION</div>
        <ins>${escapeHTML(currentInlineCorrection.correctedText)}</ins>
      </div>
      <div class="popover-actions">
        <button class="btn-apply-fix">Apply Fix</button>
        <button class="btn-dismiss-fix">Dismiss</button>
      </div>
    </div>
  `;

  document.body.appendChild(popover);
  activeInlinePopover = popover;
  positionInlinePopover();

  popover.querySelector('.popover-close').addEventListener('click', removeInlinePopover);
  popover.querySelector('.btn-dismiss-fix').addEventListener('click', removeInlinePopover);

  popover.querySelector('.btn-apply-fix').addEventListener('click', () => {
    if (activeInputElement && currentInlineCorrection) {
      setFieldText(activeInputElement, currentInlineCorrection.correctedText);
      setBadgeState('clean', 'Fixed!');
      currentInlineCorrection = null;
      removeInlinePopover();
    }
  });
}

function removeInlinePopover() {
  if (activeInlinePopover) {
    activeInlinePopover.remove();
    activeInlinePopover = null;
  }
}

function scheduleInlineCheck(el) {
  if (!isAutoCheckEnabled || !isEditableInput(el)) return;
  activeInputElement = el;

  if (inlineDebounceTimer) {
    clearTimeout(inlineDebounceTimer);
  }

  const text = getFieldText(el).trim();
  if (text.length < 15) {
    removeInlineBadge();
    removeInlinePopover();
    return;
  }

  // Show idle/checking badge position
  ensureInlineBadge();
  updateBadgePosition();

  // Wait debounce delay after user finishes typing
  inlineDebounceTimer = setTimeout(async () => {
    const currentText = getFieldText(el).trim();
    if (currentText.length < 15) return;

    setBadgeState('checking');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTO_CHECK_GRAMMAR',
        text: currentText
      });

      if (!response?.success) {
        removeInlineBadge();
        return;
      }

      if (response.hasErrors && response.correctedText) {
        currentInlineCorrection = {
          originalText: currentText,
          correctedText: response.correctedText,
          explanation: response.explanation
        };
        setBadgeState('has-error', 'Fix Available');
      } else {
        currentInlineCorrection = null;
        setBadgeState('clean', 'Looking good');
      }
    } catch (_) {
      removeInlineBadge();
    }
  }, autoCheckDebounce);
}

// Global delegated event listeners for real-time checking
document.addEventListener('focusin', (e) => {
  if (isAutoCheckEnabled && isEditableInput(e.target)) {
    activeInputElement = e.target;
    const text = getFieldText(e.target).trim();
    if (text.length >= 15) {
      ensureInlineBadge();
      updateBadgePosition();
    }
  }
}, true);

document.addEventListener('input', (e) => {
  if (isAutoCheckEnabled && isEditableInput(e.target)) {
    scheduleInlineCheck(e.target);
  }
}, true);

document.addEventListener('click', (e) => {
  if (activeInlinePopover && !e.target.closest('#gemini-inline-popover') && !e.target.closest('#gemini-inline-badge')) {
    removeInlinePopover();
  }
});

window.addEventListener('scroll', updateBadgePosition, { passive: true });
window.addEventListener('resize', updateBadgePosition, { passive: true });

