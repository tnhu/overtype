/**
 * v-markdown-input Web Component
 * Derived from OverType by David Miranda.
 * Original project: https://github.com/panphora/overtype
 * License preserved: MIT
 */

import OverType from './overtype.js';
import { generateStyles } from './styles.js';
import { getTheme } from './themes.js';

const CONTAINER_CLASS = 'v-markdown-input-container';
const DEFAULT_PLACEHOLDER = 'Start typing...';
const SHIKI_VERSION = '4.0.2';
const SHIKI_PRIMARY_CDN_URL = `https://esm.sh/shiki@${SHIKI_VERSION}`;
const SHIKI_FALLBACK_CDN_URL = `https://esm.run/shiki@${SHIKI_VERSION}`;
const MAX_HIGHLIGHT_CACHE_ENTRIES = 200;
const OBSERVED_ATTRIBUTES = [
  'value', 'theme', 'toolbar', 'height', 'min-height', 'max-height',
  'placeholder', 'font-size', 'line-height', 'padding', 'auto-resize',
  'autofocus', 'show-stats', 'smart-lists', 'readonly', 'spellcheck',
  'syntax-highlighting', 'show-active-line-raw', 'mode'
];

class VMarkdownInputElement extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' });

    this._editor = null;
    this._initialized = false;
    this._pendingOptions = {};
    this._styleVersion = 0;
    this._baseStyleElement = null;
    this._selectionChangeHandler = null;
    this._isConnected = false;
    this._advancedOptions = {};
    this._shikiHighlightCache = new Map();
    this._pendingShikiHighlights = new Set();
    this._shikiLoaderPromise = null;
    this._shikiCodeToHtml = null;
    this._shikiSourceUrl = null;
    this._shikiLoadError = null;
    this._shikiLoadFailed = false;
    this._syntaxHighlightingStatus = null;

    this._handleChange = this._handleChange.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    this._handleRender = this._handleRender.bind(this);
    this._handleAutoResizeChange = this._handleAutoResizeChange.bind(this);
    this._handleShowStatsChange = this._handleShowStatsChange.bind(this);
    this._handleSpellcheckChange = this._handleSpellcheckChange.bind(this);
    this._internalCodeHighlighter = this._internalCodeHighlighter.bind(this);
  }

  static get observedAttributes() {
    return OBSERVED_ATTRIBUTES;
  }

  connectedCallback() {
    this._isConnected = true;
    this._initializeEditor();
  }

  disconnectedCallback() {
    this._isConnected = false;
    this._cleanup();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (this._silentUpdate) return;

    if (!this._initialized) {
      this._pendingOptions[name] = newValue;
      return;
    }

    this._updateOption(name, newValue);
  }

  _decodeValue(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }

  _isSpellcheckEnabled() {
    return this.hasAttribute('spellcheck') && this.getAttribute('spellcheck') !== 'false';
  }

  _isSyntaxHighlightingEnabled() {
    return !this.hasAttribute('syntax-highlighting') || this.getAttribute('syntax-highlighting') !== 'false';
  }

  _hasCustomCodeHighlighter() {
    return typeof this._advancedOptions.codeHighlighter === 'function';
  }

  _usesInternalCodeHighlighter() {
    return this._isSyntaxHighlightingEnabled() && !this._hasCustomCodeHighlighter();
  }

  _resolveCodeHighlighter(customCodeHighlighter = this._advancedOptions.codeHighlighter) {
    if (typeof customCodeHighlighter === 'function') {
      return customCodeHighlighter;
    }

    return this._isSyntaxHighlightingEnabled() ? this._internalCodeHighlighter : null;
  }

  _currentShikiTheme() {
    const theme = this.getAttribute('theme') || 'solar';
    if (theme === 'cave') return 'github-dark';
    if (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'github-dark';
    }
    return 'github-light';
  }

  _normalizeCodeLanguage(language) {
    const aliases = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      rs: 'rust',
      sh: 'bash',
      yml: 'yaml'
    };

    return aliases[language] || language || 'text';
  }

  _extractHighlightedCode(html, fallback) {
    const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
    return match ? match[1] : fallback;
  }

  _rememberHighlightCache(cacheKey, value) {
    if (this._shikiHighlightCache.has(cacheKey)) {
      this._shikiHighlightCache.delete(cacheKey);
    } else if (this._shikiHighlightCache.size >= MAX_HIGHLIGHT_CACHE_ENTRIES) {
      const oldestKey = this._shikiHighlightCache.keys().next().value;
      if (oldestKey !== undefined) {
        this._shikiHighlightCache.delete(oldestKey);
      }
    }

    this._shikiHighlightCache.set(cacheKey, value);
  }

  _clearInternalHighlightCache() {
    this._shikiHighlightCache.clear();
    this._pendingShikiHighlights.clear();
  }

  _resetSyntaxHighlightingErrorState() {
    this._shikiLoadError = null;
    this._shikiLoadFailed = false;
    if (!this._shikiCodeToHtml) {
      this._shikiLoaderPromise = null;
      this._shikiSourceUrl = null;
    }
  }

  _buildSyntaxHighlightingStatus(state, overrides = {}) {
    const usingCustomHighlighter = this._hasCustomCodeHighlighter();
    const internalEnabled = this._isSyntaxHighlightingEnabled();

    return {
      enabled: usingCustomHighlighter || internalEnabled,
      internalEnabled,
      state,
      source: overrides.source || (usingCustomHighlighter ? 'custom' : (internalEnabled ? 'shiki-cdn' : 'none')),
      version: SHIKI_VERSION,
      url: Object.prototype.hasOwnProperty.call(overrides, 'url')
        ? overrides.url
        : (this._shikiSourceUrl || null),
      error: overrides.error
        ? { message: overrides.error.message || String(overrides.error) }
        : null
    };
  }

  _setSyntaxHighlightingStatus(state, overrides = {}) {
    const status = this._buildSyntaxHighlightingStatus(state, overrides);
    this._syntaxHighlightingStatus = status;
    this._dispatchEvent('syntax-highlighting-status', status);
    return status;
  }

  _syncSyntaxHighlightingStatus() {
    if (this._hasCustomCodeHighlighter()) {
      return this._setSyntaxHighlightingStatus('custom', { source: 'custom', url: null });
    }

    if (!this._isSyntaxHighlightingEnabled()) {
      return this._setSyntaxHighlightingStatus('disabled', { source: 'none', url: null });
    }

    if (this._shikiCodeToHtml) {
      return this._setSyntaxHighlightingStatus('active');
    }

    if (this._shikiLoaderPromise) {
      return this._setSyntaxHighlightingStatus('loading');
    }

    if (this._shikiLoadFailed && this._shikiLoadError) {
      return this._setSyntaxHighlightingStatus('error', { error: this._shikiLoadError });
    }

    return this._setSyntaxHighlightingStatus('idle');
  }

  async _ensureShikiCodeToHtml() {
    if (this._shikiCodeToHtml) {
      if (this._usesInternalCodeHighlighter()) {
        this._setSyntaxHighlightingStatus('active');
      }
      return this._shikiCodeToHtml;
    }

    if (this._shikiLoadFailed && this._shikiLoadError) {
      throw this._shikiLoadError;
    }

    if (!this._shikiLoaderPromise) {
      this._setSyntaxHighlightingStatus('loading');
      this._shikiLoaderPromise = (async () => {
        try {
          const primaryModule = await import('https://esm.sh/shiki@4.0.2');
          this._shikiCodeToHtml = primaryModule.codeToHtml;
          this._shikiSourceUrl = SHIKI_PRIMARY_CDN_URL;
          this._shikiLoadError = null;
          this._shikiLoadFailed = false;

          if (this._usesInternalCodeHighlighter()) {
            this._setSyntaxHighlightingStatus('active');
          }

          return this._shikiCodeToHtml;
        } catch (primaryError) {
          try {
            const fallbackModule = await import('https://esm.run/shiki@4.0.2');
            this._shikiCodeToHtml = fallbackModule.codeToHtml;
            this._shikiSourceUrl = SHIKI_FALLBACK_CDN_URL;
            this._shikiLoadError = null;
            this._shikiLoadFailed = false;

            if (this._usesInternalCodeHighlighter()) {
              this._setSyntaxHighlightingStatus('active');
            }

            return this._shikiCodeToHtml;
          } catch (fallbackError) {
            this._shikiLoaderPromise = null;
            this._shikiLoadFailed = true;
            this._shikiLoadError = fallbackError;

            if (this._usesInternalCodeHighlighter()) {
              this._setSyntaxHighlightingStatus('error', { error: fallbackError });
            }

            throw fallbackError;
          }
        }
      })();
    }

    return this._shikiLoaderPromise;
  }

  _primeInternalSyntaxHighlighting() {
    if (!this._isConnected || !this._usesInternalCodeHighlighter()) {
      this._syncSyntaxHighlightingStatus();
      return;
    }

    this._ensureShikiCodeToHtml().catch(() => {});
  }

  _internalCodeHighlighter(code, language) {
    if (!this._usesInternalCodeHighlighter()) {
      return code;
    }

    const normalizedLanguage = this._normalizeCodeLanguage(language);
    const theme = this._currentShikiTheme();
    const cacheKey = `${theme}:${normalizedLanguage}:${code}`;

    if (this._shikiHighlightCache.has(cacheKey)) {
      return this._shikiHighlightCache.get(cacheKey);
    }

    if (this._pendingShikiHighlights.has(cacheKey)) {
      return code;
    }

    this._pendingShikiHighlights.add(cacheKey);

    this._ensureShikiCodeToHtml()
      .then((codeToHtml) => codeToHtml(code, {
        lang: normalizedLanguage,
        theme
      }))
      .then((html) => {
        const highlightedCode = this._extractHighlightedCode(html, code);
        this._rememberHighlightCache(cacheKey, highlightedCode);

        if (!this._isConnected) return;
        if (!this._editor?.updatePreview) return;
        if (this._editor.options.codeHighlighter !== this._internalCodeHighlighter) return;

        this._editor.updatePreview();
      })
      .catch(() => {})
      .finally(() => {
        this._pendingShikiHighlights.delete(cacheKey);
      });

    return code;
  }

  _applyResolvedCodeHighlighter() {
    const resolvedHighlighter = this._resolveCodeHighlighter();

    if (this._editor?.setCodeHighlighter) {
      this._editor.setCodeHighlighter(resolvedHighlighter);
    } else if (this._editor) {
      this._editor.options.codeHighlighter = resolvedHighlighter;
      this._editor.updatePreview();
    }

    this._syncSyntaxHighlightingStatus();
    return resolvedHighlighter;
  }

  _initializeEditor() {
    if (this._initialized || !this._isConnected) return;

    try {
      const container = document.createElement('div');
      container.className = CONTAINER_CLASS;

      const height = this.getAttribute('height');
      const minHeight = this.getAttribute('min-height');
      const maxHeight = this.getAttribute('max-height');
      if (height) container.style.height = height;
      if (minHeight) container.style.minHeight = minHeight;
      if (maxHeight) container.style.maxHeight = maxHeight;

      this._injectStyles();
      this.shadowRoot.appendChild(container);

      const options = this._getInitializationOptions();
      const instances = new OverType(container, options);
      this._editor = instances[0];
      this._initialized = true;
      this._syncSizeOptionsToEditor();

      if (this._editor?.textarea) {
        this._editor.textarea.addEventListener('scroll', () => {
          if (this._editor?.preview && this._editor?.textarea) {
            this._editor.preview.scrollTop = this._editor.textarea.scrollTop;
            this._editor.preview.scrollLeft = this._editor.textarea.scrollLeft;
          }
        });

        this._editor.textarea.addEventListener('input', (event) => {
          if (this._editor?.handleInput) {
            this._editor.handleInput(event);
          }
        });

        this._editor.textarea.addEventListener('keydown', (event) => {
          if (this._editor?.handleKeydown) {
            this._editor.handleKeydown(event);
          }
        });

        this._selectionChangeHandler = () => {
          if (document.activeElement !== this) return;

          const shadowActiveElement = this.shadowRoot.activeElement;
          if (shadowActiveElement && shadowActiveElement === this._editor.textarea) {
            if (this._editor.options.showStats && this._editor.statsBar) {
              this._editor._updateStats();
            }

            if (this._editor.linkTooltip?.checkCursorPosition) {
              this._editor.linkTooltip.checkCursorPosition();
            }
          }
        };
        document.addEventListener('selectionchange', this._selectionChangeHandler);
      }

      this._applyPendingOptions();
      this._applyMode(this.getAttribute('mode') || 'normal');
      requestAnimationFrame(() => this._syncSizeOptionsToEditor());
      this._syncSyntaxHighlightingStatus();
      this._primeInternalSyntaxHighlighting();
      this._dispatchEvent('ready', {
        editor: this._editor,
        syntaxHighlighting: this.getSyntaxHighlightingStatus()
      });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.warn('v-markdown-input initialization failed:', message);
      this._dispatchEvent('error', { error: { message } });
    }
  }

  _getInitializationOptions() {
    const baseOptions = this._getOptionsFromAttributes();
    const {
      fileUpload: advancedFileUploadOptions,
      codeHighlighter: customCodeHighlighter,
      ...advancedOptions
    } = this._advancedOptions;

    const advancedFileUpload = advancedFileUploadOptions
      ? {
          ...(baseOptions.fileUpload || {}),
          ...advancedFileUploadOptions
        }
      : baseOptions.fileUpload;

    return {
      ...baseOptions,
      ...advancedOptions,
      ...(advancedFileUpload ? { fileUpload: advancedFileUpload } : {}),
      codeHighlighter: this._resolveCodeHighlighter(customCodeHighlighter)
    };
  }

  _injectStyles() {
    const style = document.createElement('style');
    const themeAttr = this.getAttribute('theme') || 'solar';
    const theme = getTheme(themeAttr);
    const options = this._getInitializationOptions();
    const styles = generateStyles({ ...options, theme });

    const wrapperStyles = `
      :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
        contain: layout style;
      }

      .${CONTAINER_CLASS} {
        width: 100%;
        height: 100%;
        position: relative;
      }

      .overtype-container {
        height: 100% !important;
      }
    `;

    this._styleVersion += 1;
    style.textContent = `\n/* v-markdown-input styles v${this._styleVersion} */\n${styles}${wrapperStyles}`;
    this._baseStyleElement = style;
    this.shadowRoot.appendChild(style);
  }

  _getOptionsFromAttributes() {
    const options = {
      value: this.getAttribute('value') !== null
        ? this._decodeValue(this.getAttribute('value'))
        : (this.textContent || '').trim(),
      placeholder: this.getAttribute('placeholder') || DEFAULT_PLACEHOLDER,
      toolbar: this.hasAttribute('toolbar'),
      autofocus: this.hasAttribute('autofocus'),
      autoResize: this.hasAttribute('auto-resize'),
      showStats: this.hasAttribute('show-stats'),
      showActiveLineRaw: this.hasAttribute('show-active-line-raw'),
      smartLists: !this.hasAttribute('smart-lists') || this.getAttribute('smart-lists') !== 'false',
      spellcheck: this._isSpellcheckEnabled(),
      onAutoResizeChange: this._handleAutoResizeChange,
      onShowStatsChange: this._handleShowStatsChange,
      onSpellcheckChange: this._handleSpellcheckChange,
      onChange: this._handleChange,
      onKeydown: this._handleKeydown,
      onRender: this._handleRender
    };

    const fontSize = this.getAttribute('font-size');
    if (fontSize) options.fontSize = fontSize;

    const lineHeight = this.getAttribute('line-height');
    if (lineHeight) options.lineHeight = parseFloat(lineHeight) || 1.6;

    const padding = this.getAttribute('padding');
    if (padding) options.padding = padding;

    const minHeight = this.getAttribute('min-height');
    if (minHeight) options.minHeight = minHeight;

    const maxHeight = this.getAttribute('max-height');
    if (maxHeight) options.maxHeight = maxHeight;

    return options;
  }

  _applyPendingOptions() {
    for (const [attribute, value] of Object.entries(this._pendingOptions)) {
      this._updateOption(attribute, value);
    }
    this._pendingOptions = {};
  }

  _updateOption(attribute, value) {
    if (!this._editor) return;

    switch (attribute) {
      case 'value': {
        const decoded = this._decodeValue(value);
        if (this._editor.getValue() !== decoded) {
          this._editor.setValue(decoded || '');
        }
        break;
      }
      case 'theme':
        this._clearInternalHighlightCache();
        this._reinjectStyles();
        if (this._editor.setTheme) {
          this._editor.setTheme(value || 'solar');
        }
        this._syncSyntaxHighlightingStatus();
        break;
      case 'placeholder':
        this._editor.options.placeholder = value || '';
        if (this._editor.textarea) {
          this._editor.textarea.placeholder = value || '';
        }
        if (this._editor.placeholderEl) {
          this._editor.placeholderEl.textContent = value || '';
        }
        break;
      case 'readonly':
        if (this._editor.textarea) {
          this._editor.textarea.readOnly = this.hasAttribute('readonly');
        }
        break;
      case 'height':
      case 'min-height':
      case 'max-height':
        this._syncSizeOptionsToEditor();
        this._updateContainerHeight();
        break;
      case 'mode':
        this._applyMode(value || 'normal');
        break;
      case 'show-active-line-raw':
        this._editor.options.showActiveLineRaw = this.hasAttribute('show-active-line-raw');
        this._editor.updatePreview();
        break;
      case 'syntax-highlighting':
        this._clearInternalHighlightCache();
        this._resetSyntaxHighlightingErrorState();
        this._applyResolvedCodeHighlighter();
        this._primeInternalSyntaxHighlighting();
        break;
      case 'toolbar':
        if (!!this.hasAttribute('toolbar') !== !!this._editor.options.toolbar) {
          this._reinitializeEditor();
        }
        break;
      case 'auto-resize':
        if (typeof this._editor.setAutoResize === 'function') {
          this._editor.setAutoResize(this.hasAttribute('auto-resize'));
        } else if (!!this.hasAttribute('auto-resize') !== !!this._editor.options.autoResize) {
          this._reinitializeEditor();
        }
        this._updateContainerHeight();
        break;
      case 'show-stats':
        if (typeof this._editor.showStats === 'function') {
          this._editor.showStats(this.hasAttribute('show-stats'));
        } else if (!!this.hasAttribute('show-stats') !== !!this._editor.options.showStats) {
          this._reinitializeEditor();
        }
        this._syncSizeOptionsToEditor();
        break;
      case 'font-size':
        if (this._updateFontSize(value)) {
          this._reinjectStyles();
        }
        break;
      case 'line-height':
        if (this._updateLineHeight(value)) {
          this._reinjectStyles();
        }
        break;
      case 'padding':
        this._reinjectStyles();
        break;
      case 'smart-lists': {
        const smartLists = !this.hasAttribute('smart-lists') || this.getAttribute('smart-lists') !== 'false';
        if (!!this._editor.options.smartLists !== !!smartLists) {
          this._reinitializeEditor();
        }
        break;
      }
      case 'spellcheck': {
        const enabled = this._isSpellcheckEnabled();
        if (typeof this._editor.setSpellcheck === 'function') {
          this._editor.setSpellcheck(enabled);
        } else {
          this._editor.options.spellcheck = enabled;
          if (this._editor.textarea) {
            this._editor.textarea.setAttribute('spellcheck', String(enabled));
          }
        }
        break;
      }
    }
  }

  _applyMode(mode) {
    if (!this._editor) return;

    if (mode === 'preview') {
      this._editor.showPreviewMode();
    } else if (mode === 'plain') {
      this._editor.showPlainTextarea();
    } else {
      this._editor.showNormalEditMode();
      mode = 'normal';
    }

    this._updateModeAttribute(mode);
  }

  _updateModeAttribute(mode) {
    if (this.getAttribute('mode') === mode) return;
    this._silentUpdate = true;
    this.setAttribute('mode', mode);
    this._silentUpdate = false;
  }

  _updateContainerHeight() {
    const container = this.shadowRoot.querySelector(`.${CONTAINER_CLASS}`);
    if (!container) return;

    const height = this.getAttribute('height');
    const minHeight = this.getAttribute('min-height');
    const maxHeight = this.getAttribute('max-height');
    container.style.height = this.hasAttribute('auto-resize') ? '' : (height || '');
    container.style.minHeight = minHeight || '';
    container.style.maxHeight = maxHeight || '';
  }

  _syncSizeOptionsToEditor() {
    if (!this._editor) return;

    const minHeight = this.getAttribute('min-height');
    const maxHeight = this.getAttribute('max-height');
    this._editor.options.minHeight = minHeight || '100px';
    this._editor.options.maxHeight = this._getEditorBodyMaxHeight(maxHeight);

    if (this._editor.options.autoResize && typeof this._editor._updateAutoHeight === 'function') {
      this._editor._updateAutoHeight();
    }
  }

  _getEditorBodyMaxHeight(maxHeight) {
    if (!maxHeight) return null;

    const totalMaxHeight = parseFloat(maxHeight);
    if (!Number.isFinite(totalMaxHeight)) return maxHeight;

    const toolbarHeight = this._getElementOuterHeight(this._editor?.toolbar?.container);
    const statsHeight = this._getElementOuterHeight(this._editor?.statsBar);
    const editorMaxHeight = Math.max(60, Math.floor(totalMaxHeight - toolbarHeight - statsHeight));
    return `${editorMaxHeight}px`;
  }

  _getElementOuterHeight(element) {
    if (!element) return 0;

    const rectHeight = element.getBoundingClientRect?.().height || 0;
    const ownHeight = rectHeight || element.offsetHeight || 0;
    const styles = getComputedStyle(element);
    const marginTop = parseFloat(styles.marginTop) || 0;
    const marginBottom = parseFloat(styles.marginBottom) || 0;
    return ownHeight + marginTop + marginBottom;
  }

  _updateFontSize(value) {
    if (!this._editor?.wrapper) return false;
    this._editor.options.fontSize = value || '';
    this._editor.wrapper.style.setProperty('--instance-font-size', this._editor.options.fontSize);
    this._editor.updatePreview();
    return true;
  }

  _updateLineHeight(value) {
    if (!this._editor?.wrapper) return false;
    const numeric = parseFloat(value);
    const lineHeight = Number.isFinite(numeric) ? numeric : this._editor.options.lineHeight;
    this._editor.options.lineHeight = lineHeight;
    this._editor.wrapper.style.setProperty('--instance-line-height', String(lineHeight));
    this._editor.updatePreview();
    return true;
  }

  _reinjectStyles() {
    if (this._baseStyleElement?.parentNode) {
      this._baseStyleElement.remove();
    }
    this._injectStyles();
  }

  _reinitializeEditor() {
    const currentValue = this._editor ? this._editor.getValue() : '';
    this._cleanup();
    this._initialized = false;
    this.shadowRoot.innerHTML = '';

    if (currentValue && !this.getAttribute('value')) {
      this.setAttribute('value', currentValue);
    }

    this._initializeEditor();
  }

  _handleChange(value) {
    this._updateValueAttribute(value);

    if (!this._initialized || !this._editor) return;

    this._dispatchEvent('change', {
      value,
      editor: this._editor
    });
  }

  _handleKeydown(event) {
    this._dispatchEvent('keydown', {
      event,
      editor: this._editor
    });
  }

  _handleRender(preview, mode) {
    this._dispatchEvent('render', {
      preview,
      mode,
      editor: this._editor
    });
  }

  _handleSpellcheckChange(enabled) {
    this._silentUpdate = true;
    if (enabled) {
      this.setAttribute('spellcheck', '');
    } else {
      this.removeAttribute('spellcheck');
    }
    this._silentUpdate = false;

    this._dispatchEvent('spellcheck-change', {
      enabled,
      editor: this._editor
    });
  }

  _handleAutoResizeChange(enabled) {
    this._silentUpdate = true;
    if (enabled) {
      this.setAttribute('auto-resize', '');
    } else {
      this.removeAttribute('auto-resize');
    }
    this._silentUpdate = false;
    this._updateContainerHeight();
    this._syncSizeOptionsToEditor();

    this._dispatchEvent('auto-resize-change', {
      enabled,
      editor: this._editor
    });
  }

  _handleShowStatsChange(enabled) {
    this._silentUpdate = true;
    if (enabled) {
      this.setAttribute('show-stats', '');
    } else {
      this.removeAttribute('show-stats');
    }
    this._silentUpdate = false;
    this._syncSizeOptionsToEditor();

    this._dispatchEvent('show-stats-change', {
      enabled,
      editor: this._editor
    });
  }

  _updateValueAttribute(value) {
    if (this.getAttribute('value') === value) return;
    this._silentUpdate = true;
    this.setAttribute('value', value);
    this._silentUpdate = false;
  }

  _dispatchEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true
    }));
  }

  _cleanup() {
    if (this._selectionChangeHandler) {
      document.removeEventListener('selectionchange', this._selectionChangeHandler);
      this._selectionChangeHandler = null;
    }

    if (this._editor?.destroy) {
      this._editor.destroy();
    }

    this._editor = null;
    this._initialized = false;

    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    }
  }

  refreshTheme() {
    if (this._initialized) {
      this._reinjectStyles();
    }
    return this;
  }

  getValue() {
    return this._editor ? this._editor.getValue() : this.getAttribute('value') || '';
  }

  setValue(value) {
    if (this._editor) {
      this._editor.setValue(value);
    } else {
      this.setAttribute('value', value);
    }
    return this;
  }

  getHTML() {
    return this._editor ? this._editor.getRenderedHTML(false) : '';
  }

  getCleanHTML() {
    return this._editor ? this._editor.getCleanHTML() : '';
  }

  getPreviewHTML() {
    return this._editor ? this._editor.getPreviewHTML() : '';
  }

  insertText(text) {
    if (!this._editor || typeof text !== 'string') return this;

    if (typeof this._editor.insertAtCursor === 'function') {
      this._editor.insertAtCursor(text);
    } else if (typeof this._editor.insertText === 'function') {
      this._editor.insertText(text);
    }

    return this;
  }

  focus() {
    if (this._editor?.textarea) {
      this._editor.textarea.focus();
    }
    return this;
  }

  blur() {
    if (this._editor?.textarea) {
      this._editor.textarea.blur();
    }
    return this;
  }

  getStats() {
    if (!this._editor?.textarea) return null;

    const value = this._editor.textarea.value;
    const lines = value.split('\n');
    const chars = value.length;
    const words = value.split(/\s+/).filter(Boolean).length;
    const selectionStart = this._editor.textarea.selectionStart;
    const beforeCursor = value.substring(0, selectionStart);
    const linesBefore = beforeCursor.split('\n');

    return {
      characters: chars,
      words,
      lines: lines.length,
      line: linesBefore.length,
      column: linesBefore[linesBefore.length - 1].length + 1
    };
  }

  isReady() {
    return this._initialized && this._editor !== null;
  }

  getMode() {
    if (this._editor?.container?.dataset?.mode) {
      return this._editor.container.dataset.mode;
    }
    return this.getAttribute('mode') || 'normal';
  }

  setMode(mode) {
    this._applyMode(mode || 'normal');
    return this;
  }

  getEditor() {
    return this._editor;
  }

  getSyntaxHighlightingStatus() {
    if (this._syntaxHighlightingStatus) {
      return { ...this._syntaxHighlightingStatus };
    }

    return { ...this._syncSyntaxHighlightingStatus() };
  }

  configure(options = {}) {
    if (!options || typeof options !== 'object') return this;

    const merged = { ...this._advancedOptions, ...options };
    if (Object.prototype.hasOwnProperty.call(options, 'codeHighlighter')) {
      merged.codeHighlighter = typeof options.codeHighlighter === 'function'
        ? options.codeHighlighter
        : null;
    }
    if (options.fileUpload || this._advancedOptions.fileUpload) {
      merged.fileUpload = {
        ...(this._advancedOptions.fileUpload || {}),
        ...(options.fileUpload || {})
      };
    }
    this._advancedOptions = merged;

    if (this._editor?.reinit) {
      this._editor.reinit({
        ...this._advancedOptions,
        codeHighlighter: this._resolveCodeHighlighter()
      });
      this._syncSyntaxHighlightingStatus();
      this._primeInternalSyntaxHighlighting();
    }

    if ('theme' in options) {
      if (typeof options.theme === 'string') {
        this.setAttribute('theme', options.theme);
      } else if (this._editor?.setTheme) {
        this._editor.setTheme(options.theme);
        this.refreshTheme();
      }
    }

    return this;
  }

  setOptions(options = {}) {
    return this.configure(options);
  }

  setCodeHighlighter(highlighter) {
    this._advancedOptions = {
      ...this._advancedOptions,
      codeHighlighter: typeof highlighter === 'function' ? highlighter : null
    };
    this._clearInternalHighlightCache();
    this._resetSyntaxHighlightingErrorState();
    this._applyResolvedCodeHighlighter();
    this._primeInternalSyntaxHighlighting();

    return this;
  }

  showToolbar() {
    if (this._editor) {
      this._editor.showToolbar();
    }
    return this;
  }

  hideToolbar() {
    if (this._editor) {
      this._editor.hideToolbar();
    }
    return this;
  }

  showNormalEditMode() {
    this._applyMode('normal');
    return this;
  }

  showPlainTextarea() {
    this._applyMode('plain');
    return this;
  }

  showPreviewMode() {
    this._applyMode('preview');
    return this;
  }
}

if (!customElements.get('v-markdown-input')) {
  customElements.define('v-markdown-input', VMarkdownInputElement);
}

export default VMarkdownInputElement;
export { VMarkdownInputElement };
