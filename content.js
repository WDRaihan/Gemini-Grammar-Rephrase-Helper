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
