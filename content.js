let geminiLoadingTimer = null;

function clearGeminiLoadingTimer() {
  if (geminiLoadingTimer) {
    clearTimeout(geminiLoadingTimer);
    geminiLoadingTimer = null;
  }
}

// Attach listener per active runtime instance
if (window.__geminiCurrentRuntime !== chrome.runtime) {
  window.__geminiCurrentRuntime = chrome.runtime;

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SHOW_LOADING') {
      clearGeminiLoadingTimer();
      showModal('<h3>Loading...</h3><div class="spinner"></div><p>Asking Gemini for suggestions...</p>');

      // Safety watchdog: ensure loading spinner never hangs indefinitely
      geminiLoadingTimer = setTimeout(() => {
        updateModalContent("Request timed out. Gemini took too long to respond. Please verify your Gemini API key in Options and try again.", true);
      }, 20000);

    } else if (request.type === 'SHOW_RESULT') {
      clearGeminiLoadingTimer();
      updateModalContent(request.data, request.isError);
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
 * Creates and displays the modal on the page.
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
      <div id="gemini-modal-body">
        ${contentHTML}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('gemini-modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('gemini-modal-overlay').addEventListener('click', closeModal);
  window.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(event) {
  if (event.key === 'Escape') {
    closeModal();
  }
}

/**
 * Updates the content of the modal with the API response.
 * @param {string|string[]} data The suggestions or error message.
 * @param {boolean} isError Indicates if the result is an error message.
 */
function updateModalContent(data, isError) {
  const modalBody = document.getElementById('gemini-modal-body');
  if (!modalBody) return;

  let contentHTML = '';

  if (isError) {
    contentHTML = `<p class="error-text">${escapeHTML(data)}</p>`;
  } else if (Array.isArray(data)) {
    contentHTML = '<div class="suggestion-list">';
    data.forEach((suggestion, index) => {
      const sanitized = escapeHTML(suggestion);
      const label = index === 0 ? "Grammar Fix" : `Alternative ${index}`;
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
let activeInputElement = null;
let inlineDebounceTimer = null;
let currentInlineCorrection = null;
let activeInlineBadge = null;
let activeInlinePopover = null;

// Initialize setting from storage
chrome.storage.sync.get(['autoCheckEnabled'], (result) => {
  isAutoCheckEnabled = result.autoCheckEnabled === true;
});

// Update when user toggles setting in options
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.autoCheckEnabled) {
    isAutoCheckEnabled = Boolean(changes.autoCheckEnabled.newValue);
    if (!isAutoCheckEnabled) {
      removeInlineBadge();
      removeInlinePopover();
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

  // Wait 1.8 seconds after user finishes typing
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
  }, 1800);
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

