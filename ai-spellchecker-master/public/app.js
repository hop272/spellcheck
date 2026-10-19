/**
 * Speaker Notes Spell Checker
 *
 * Main application entry point - orchestration only.
 * All business logic is delegated to specialized modules.
 *
 * Architecture follows functional programming principles:
 * - Immutable state (state.js)
 * - Pure transformations (utils/fp.js, handlers/)
 * - Explicit side effects (UI updates isolated here)
 * - Composition over inheritance (factory functions)
 */

// ============================================
// Module Imports
// ============================================

import { getState, updateState, hasErrors, getErrorCount } from './state.js';
import { api } from './api.js';
import { escapeHtml } from './utils/string.js';

// Handlers
import { handleAccept, handleDismiss, handleCorrectAll } from './handlers/corrections.js';
import { createCheckHandler, getStatusMessage } from './handlers/check.js';
import { createContextController } from './handlers/context.js';

// UI Controllers
import { createPopupController } from './ui/popup.js';
import { createHighlightController } from './ui/highlights.js';
import { setupModal } from './ui/modal.js';

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Editor
  editorContent: document.getElementById('editorContent'),
  checkBtn: document.getElementById('checkBtn'),
  aiToggle: document.getElementById('aiToggle'),

  // Results
  resultsInfo: document.getElementById('resultsInfo'),
  issueCount: document.getElementById('issueCount'),
  correctAllBtn: document.getElementById('correctAllBtn'),

  // Status
  aiStatus: document.getElementById('aiStatus'),
  editorStatus: document.getElementById('editorStatus'),
  statusText: document.getElementById('statusText'),

  // Context modal
  slideContent: document.getElementById('slideContent'),
  slideContextBtn: document.getElementById('slideContextBtn'),
  contextModal: document.getElementById('contextModal'),
  modalClose: document.getElementById('modalClose'),
  modalSave: document.getElementById('modalSave'),

  // Popup
  popup: document.getElementById('suggestionPopup'),
  popupClose: document.getElementById('popupClose'),
  popupContext: document.getElementById('popupContext'),
  wrongWord: document.getElementById('wrongWord'),
  correctWord: document.getElementById('correctWord'),
  popupReason: document.getElementById('popupReason'),
  btnAccept: document.getElementById('btnAccept'),
  btnDismiss: document.getElementById('btnDismiss'),
  navPrev: document.getElementById('navPrev'),
  navNext: document.getElementById('navNext'),
  currentIndex: document.getElementById('currentIndex'),
  totalCount: document.getElementById('totalCount'),
};

// ============================================
// UI Controllers (Factory Pattern)
// ============================================

// Highlight controller for editor
const highlightController = createHighlightController(
  elements.editorContent,
  (index, element) => popupController.show(index, element, () => highlightController.getText())
);

// Popup controller
const popupController = createPopupController({
  popup: elements.popup,
  popupContext: elements.popupContext,
  wrongWord: elements.wrongWord,
  correctWord: elements.correctWord,
  popupReason: elements.popupReason,
  currentIndex: elements.currentIndex,
  totalCount: elements.totalCount,
  navPrev: elements.navPrev,
  navNext: elements.navNext,
});

// Context controller
const contextController = createContextController({
  slideContent: elements.slideContent,
  slideContextBtn: elements.slideContextBtn,
});

// ============================================
// UI Update Functions
// ============================================

const updateResultsInfo = () => {
  if (hasErrors()) {
    elements.resultsInfo.classList.remove('hidden');
    elements.issueCount.textContent = getErrorCount();
  } else {
    elements.resultsInfo.classList.add('hidden');
  }
};

const setLoading = (loading) => {
  const state = getState();
  elements.checkBtn.disabled = loading;

  if (loading) {
    elements.checkBtn.innerHTML = '<span class="spinner"></span> Checking...';
    elements.checkBtn.classList.add('loading');
  } else {
    elements.checkBtn.innerHTML = 'Check Spelling';
    elements.checkBtn.classList.remove('loading');
  }
};

const showStatus = (message, isDone = false) => {
  if (!message) {
    elements.editorStatus.classList.add('hidden');
    return;
  }

  elements.statusText.textContent = message;
  elements.editorStatus.classList.remove('hidden', 'done');

  if (isDone) {
    elements.editorStatus.classList.add('done');
    setTimeout(() => elements.editorStatus.classList.add('hidden'), 2000);
  }
};

// ============================================
// Check Handler (Composed)
// ============================================

const handleCheck = createCheckHandler({
  getText: () => highlightController.getText(),

  onUpdate: ({ errors, text }) => {
    highlightController.apply(text, errors);
    updateResultsInfo();
  },

  onStatusChange: (status) => {
    const message = getStatusMessage(status);

    switch (status.phase) {
      case 'start':
        setLoading(true);
        popupController.hide();
        break;

      case 'ai-start':
        elements.checkBtn.innerHTML = '<span class="spinner"></span> AI checking...';
        showStatus(message);
        break;

      case 'ai-progress':
        showStatus(message);
        break;

      case 'done':
        setLoading(false);
        if (message) showStatus(message, true);
        break;

      case 'error':
        setLoading(false);
        showStatus(null);
        break;
    }
  },
});

// ============================================
// Correction Handlers (Wired to UI)
// ============================================

const onAccept = () => {
  handleAccept(
    () => highlightController.getText(),
    (result) => {
      highlightController.apply(result.text, result.errors);
      updateResultsInfo();

      if (result.errors.length > 0 && result.nextIndex >= 0) {
        const highlight = document.querySelector(
          `.error-highlight[data-error-index="${result.nextIndex}"]`
        );
        if (highlight) {
          popupController.show(result.nextIndex, highlight, () => highlightController.getText());
        } else {
          popupController.hide();
        }
      } else {
        popupController.hide();
      }
    }
  );
};

const onDismiss = () => {
  handleDismiss(
    () => highlightController.getText(),
    (result) => {
      highlightController.apply(result.text, result.errors);
      updateResultsInfo();

      if (result.errors.length > 0 && result.nextIndex >= 0) {
        const highlight = document.querySelector(
          `.error-highlight[data-error-index="${result.nextIndex}"]`
        );
        if (highlight) {
          popupController.show(result.nextIndex, highlight, () => highlightController.getText());
        } else {
          popupController.hide();
        }
      } else {
        popupController.hide();
      }
    }
  );
};

const onCorrectAll = () => {
  popupController.hide();
  handleCorrectAll(
    () => highlightController.getText(),
    (result) => {
      highlightController.setHtml(escapeHtml(result.text));
      updateResultsInfo();
    }
  );
};

// ============================================
// Event Listeners Setup
// ============================================

const setupEventListeners = () => {
  // Check button
  elements.checkBtn.addEventListener('click', () => {
    const useAI = elements.aiToggle.checked && getState().aiConfigured;
    handleCheck(useAI);
  });

  // Correction buttons
  elements.correctAllBtn.addEventListener('click', onCorrectAll);
  elements.btnAccept.addEventListener('click', onAccept);
  elements.btnDismiss.addEventListener('click', onDismiss);
  elements.popupClose.addEventListener('click', () => popupController.hide());

  // Navigation
  elements.navPrev.addEventListener('click', () =>
    popupController.navigate(-1, () => highlightController.getText())
  );
  elements.navNext.addEventListener('click', () =>
    popupController.navigate(1, () => highlightController.getText())
  );

  // Context modal
  const modal = setupModal({
    modal: elements.contextModal,
    openBtn: elements.slideContextBtn,
    closeBtn: elements.modalClose,
    saveBtn: elements.modalSave,
    backdrop: elements.contextModal.querySelector('.modal-backdrop'),
    focusElement: elements.slideContent,
    onSave: () => contextController.save(),
  });

  // Close popup on outside click
  document.addEventListener('click', (e) => {
    if (!elements.popup.contains(e.target) &&
        !e.target.classList.contains('error-highlight')) {
      popupController.hide();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    // Modal escape
    if (modal.handleEscape(e)) return;

    // Popup shortcuts
    if (!popupController.isVisible()) return;

    switch (e.key) {
      case 'Escape':
        popupController.hide();
        break;
      case 'ArrowLeft':
        popupController.navigate(-1, () => highlightController.getText());
        break;
      case 'ArrowRight':
        popupController.navigate(1, () => highlightController.getText());
        break;
      case 'Enter':
        onAccept();
        break;
    }
  });

  // Paste as plain text
  elements.editorContent.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });
};

// ============================================
// Initialization
// ============================================

const init = async () => {
  // Check API health
  const health = await api.checkHealth();
  updateState({ aiConfigured: health.aiConfigured });

  // Update AI status display
  elements.aiStatus.textContent = health.aiConfigured ? 'Connected' : 'Not configured';
  elements.aiStatus.className = health.aiConfigured ? '' : 'disabled';

  if (!health.aiConfigured) {
    elements.aiToggle.disabled = true;
    elements.aiToggle.parentElement.style.opacity = '0.5';
  }

  // Setup all event listeners
  setupEventListeners();

  console.log('App initialized with modular architecture');
};

// Start the application
init();
