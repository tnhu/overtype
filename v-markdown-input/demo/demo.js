/**
 * v-markdown-input v0.1.0
 * Standalone web component scaffold derived from OverType by David Miranda
 * Original project: https://github.com/panphora/overtype
 * License preserved: MIT
 */
const fullPreset = `# v-markdown-input

Derived from **OverType**, packaged as a standalone custom element.

- [x] Shadow DOM isolation
- [x] Toolbar and mode switching
- [x] Shiki syntax highlighting
- [x] Drag, drop, paste, and upload hooks
- [ ] Extract to its own repository

> Paste an image, drop a file, or switch to preview mode to test the full surface area.

## Table

| Feature | Status | Notes |
| --- | --- | --- |
| Toolbar | Ready | Formatting buttons included |
| Stats | Ready | Custom formatter enabled |
| File upload | Ready | Generates markdown links and image embeds |

## TypeScript

\`\`\`typescript
interface ReleasePlan {
  packageName: 'v-markdown-input';
  preserveCredits: true;
  mode: 'normal' | 'preview' | 'plain';
}

export function createPlan(input: ReleasePlan) {
  return {
    ...input,
    timestamp: new Date().toISOString(),
    tasks: ['docs', 'build', 'demo', 'publish']
  };
}
\`\`\`

## Python

\`\`\`python
from dataclasses import dataclass
from typing import Literal

@dataclass
class EditorState:
    mode: Literal["normal", "preview", "plain"]
    shiki_enabled: bool = True

state = EditorState(mode="normal")
print(state)
\`\`\`

## Inline markdown

Use \`getPreviewHTML()\`, ~~toggle modes~~, and [inspect the exports](https://github.com/panphora/overtype).
`;
const webPreset = `# Web Stack Example

## Component bootstrap

\`\`\`tsx
import 'v-markdown-input/webcomponent';

export function AppShell() {
  return (
    <section className="demo-shell">
      <v-markdown-input
        theme="cave"
        toolbar
        show-stats
        height="420px"
        value={'# Hello from JSX\\n\\nEdit me.'}
      />
    </section>
  );
}
\`\`\`

## API notes

1. Syntax highlighting is built in and enabled by default.
2. Call \`element.setCodeHighlighter(...)\` only if you want to override the internal Shiki loader.
3. Keep the original license and credits intact when you extract the package.
`;
const notesPreset = `# Product Notes

## Requirements

- Preserve original MIT license
- Keep David Miranda credited
- Split into a separate folder with its own build
- Ship a demo that proves the component API

## Release checklist

1. npm install
2. npm run build
3. npm run dev

\`\`\`bash
npm install
npm run build
npm run dev
\`\`\`
`;
const component = document.getElementById("editor");
const output = document.getElementById("output");
const eventLog = document.getElementById("event-log");
const snippetOutput = document.getElementById("snippet-output");
const shikiStatus = document.getElementById("shiki-status");
const modeStatus = document.getElementById("mode-status");
const wordStatus = document.getElementById("word-status");
const copySnippetButton = document.getElementById("copy-snippet");
const STANDARD_MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const controls = {
  theme: document.getElementById("theme"),
  mode: document.getElementById("mode"),
  height: document.getElementById("height"),
  maxHeight: document.getElementById("max-height"),
  fontSize: document.getElementById("font-size"),
  fontFamily: document.getElementById("font-family"),
  padding: document.getElementById("padding"),
  insertText: document.getElementById("insert-text"),
  toolbar: document.getElementById("toolbar"),
  stats: document.getElementById("stats"),
  autoResize: document.getElementById("auto-resize"),
  readonly: document.getElementById("readonly"),
  spellcheck: document.getElementById("spellcheck"),
  smartLists: document.getElementById("smart-lists"),
  syntaxHighlighting: document.getElementById("syntax-highlighting"),
  activeLineRaw: document.getElementById("active-line-raw")
};
const eventLines = [];
let renderCounter = 0;
let activeEditor = null;
let lastSyntaxStatusSummary = "";
function log(line) {
  const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString();
  eventLines.unshift(`[${timestamp}] ${line}`);
  eventLog.textContent = eventLines.slice(0, 16).join("\n");
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function updateSyntaxStatus(status = component.getSyntaxHighlightingStatus?.()) {
  if (!status) {
    shikiStatus.textContent = "Unavailable";
    return;
  }
  if (status.state === "custom") {
    shikiStatus.textContent = "Custom";
    return;
  }
  if (!status.internalEnabled || status.state === "disabled") {
    shikiStatus.textContent = "Off";
    return;
  }
  if (status.state === "loading") {
    shikiStatus.textContent = `Loading ${status.version}`;
    return;
  }
  if (status.state === "active") {
    shikiStatus.textContent = `Shiki ${status.version}`;
    return;
  }
  if (status.state === "error") {
    shikiStatus.textContent = "Load Failed";
    return;
  }
  shikiStatus.textContent = `Ready ${status.version}`;
}
function logSyntaxStatus(status) {
  if (!status)
    return;
  const summary = `${status.state}:${status.source}:${status.url || ""}:${status.error?.message || ""}`;
  if (summary === lastSyntaxStatusSummary)
    return;
  lastSyntaxStatusSummary = summary;
  if (status.state === "active") {
    log(`syntax highlighting \xB7 shiki ${status.version} \xB7 ${status.url}`);
    return;
  }
  if (status.state === "loading") {
    log(`syntax highlighting \xB7 loading \xB7 ${status.version}`);
    return;
  }
  if (status.state === "disabled") {
    log("syntax highlighting \xB7 disabled");
    return;
  }
  if (status.state === "custom") {
    log("syntax highlighting \xB7 custom override");
    return;
  }
  if (status.state === "error") {
    log(`syntax highlighting \xB7 error \xB7 ${status.error?.message || "unknown"}`);
  }
}
function createUploadMarkdown(file) {
  if (file.type.startsWith("image/")) {
    const url2 = URL.createObjectURL(file);
    return `![${file.name}](${url2})`;
  }
  if (file.type.startsWith("text/") || /\.md$/i.test(file.name)) {
    return file.text().then((text) => {
      const url2 = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
      return `[${file.name}](${url2})`;
    });
  }
  const url = URL.createObjectURL(file);
  return Promise.resolve(`[${file.name}](${url})`);
}
function configureAdvancedFeatures() {
  component.configure({
    statsFormatter: (stats) => `${stats.words} words \xB7 ${stats.lines} lines \xB7 L${stats.line}:C${stats.column}`,
    fileUpload: {
      enabled: true,
      mimeTypes: [],
      onInsertFile: async (input) => {
        const files = Array.isArray(input) ? input : [input];
        const lines = await Promise.all(files.map(createUploadMarkdown));
        return Array.isArray(input) ? lines : lines[0];
      }
    }
  });
}
function getComponentAttributes() {
  const attributes = [];
  const theme = component.getAttribute("theme");
  const mode = component.getMode();
  const height = component.getAttribute("height");
  const maxHeight = component.getAttribute("max-height");
  const fontSize = component.getAttribute("font-size");
  const fontFamily = component.getAttribute("font-family");
  const padding = component.getAttribute("padding");
  if (theme && theme !== "solar")
    attributes.push(`theme="${theme}"`);
  if (mode && mode !== "normal")
    attributes.push(`mode="${mode}"`);
  if (height && !component.hasAttribute("auto-resize"))
    attributes.push(`height="${height}"`);
  if (maxHeight)
    attributes.push(`max-height="${maxHeight}"`);
  if (fontSize && fontSize !== "14px")
    attributes.push(`font-size="${fontSize}"`);
  if (fontFamily)
    attributes.push(`font-family="${escapeAttribute(fontFamily)}"`);
  if (padding && padding !== "16px")
    attributes.push(`padding="${padding}"`);
  if (component.hasAttribute("toolbar"))
    attributes.push("toolbar");
  if (component.hasAttribute("show-stats"))
    attributes.push("show-stats");
  if (component.hasAttribute("auto-resize"))
    attributes.push("auto-resize");
  if (component.hasAttribute("readonly"))
    attributes.push("readonly");
  if (component.hasAttribute("spellcheck") && component.getAttribute("spellcheck") !== "false")
    attributes.push("spellcheck");
  if (component.getAttribute("syntax-highlighting") === "false")
    attributes.push('syntax-highlighting="false"');
  if (component.hasAttribute("show-active-line-raw"))
    attributes.push("show-active-line-raw");
  if (component.getAttribute("smart-lists") === "false")
    attributes.push('smart-lists="false"');
  return attributes;
}
function generateSnippet() {
  const attrs = getComponentAttributes();
  const attrBlock = attrs.length > 0 ? `
  ${attrs.join("\n  ")}` : "";
  const value = component.getValue().trimEnd();
  const content = escapeHtml(value);
  return `<!-- Derived from OverType by David Miranda. Preserve the original MIT license and credits. -->
<script type="module" src="./dist/v-markdown-input-webcomponent.esm.js"><\/script>
<script type="module">
  const editor = document.querySelector('v-markdown-input');
  editor.configure({
    statsFormatter: (stats) => \`\${stats.words} words \xB7 \${stats.lines} lines \xB7 L\${stats.line}:C\${stats.column}\`,
    fileUpload: {
      enabled: true,
      onInsertFile: async (fileOrFiles) => {
        // Return markdown string(s) for your app.
        const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
        return files.map((file) => \`[\${file.name}](#replace-me)\`);
      }
    }
  });
<\/script>

<v-markdown-input${attrBlock}>
${content}
</v-markdown-input>`;
}
function updateSnippet() {
  snippetOutput.textContent = generateSnippet();
}
function applyControlState() {
  component.setAttribute("theme", controls.theme.value);
  component.setAttribute("mode", controls.mode.value);
  component.setAttribute("font-size", controls.fontSize.value);
  component.setAttribute("font-family", controls.fontFamily.value);
  component.setAttribute("padding", controls.padding.value);
  if (controls.maxHeight.value) {
    component.setAttribute("max-height", controls.maxHeight.value);
  } else {
    component.removeAttribute("max-height");
  }
  if (controls.autoResize.checked) {
    component.setAttribute("auto-resize", "");
    component.removeAttribute("height");
  } else {
    component.removeAttribute("auto-resize");
    component.setAttribute("height", controls.height.value);
  }
  [
    ["toolbar", controls.toolbar.checked],
    ["show-stats", controls.stats.checked],
    ["readonly", controls.readonly.checked],
    ["show-active-line-raw", controls.activeLineRaw.checked]
  ].forEach(([attribute, enabled]) => {
    if (enabled)
      component.setAttribute(attribute, "");
    else
      component.removeAttribute(attribute);
  });
  if (controls.spellcheck.checked) {
    component.setAttribute("spellcheck", "");
  } else {
    component.removeAttribute("spellcheck");
  }
  if (controls.smartLists.checked) {
    component.setAttribute("smart-lists", "true");
  } else {
    component.setAttribute("smart-lists", "false");
  }
  if (controls.syntaxHighlighting.checked) {
    component.removeAttribute("syntax-highlighting");
  } else {
    component.setAttribute("syntax-highlighting", "false");
  }
  updateMetrics();
  updateSnippet();
}
function syncControlsFromComponent() {
  controls.theme.value = component.getAttribute("theme") || "solar";
  controls.mode.value = component.getMode();
  controls.height.value = component.getAttribute("height") || "560px";
  controls.maxHeight.value = component.getAttribute("max-height") || "";
  controls.fontSize.value = component.getAttribute("font-size") || "14px";
  controls.fontFamily.value = component.getAttribute("font-family") || STANDARD_MONO_FONT;
  controls.padding.value = component.getAttribute("padding") || "16px";
  controls.toolbar.checked = component.hasAttribute("toolbar");
  controls.stats.checked = component.hasAttribute("show-stats");
  controls.autoResize.checked = component.hasAttribute("auto-resize");
  controls.readonly.checked = component.hasAttribute("readonly");
  controls.spellcheck.checked = component.hasAttribute("spellcheck") && component.getAttribute("spellcheck") !== "false";
  controls.smartLists.checked = component.getAttribute("smart-lists") !== "false";
  controls.syntaxHighlighting.checked = component.getAttribute("syntax-highlighting") !== "false";
  controls.activeLineRaw.checked = component.hasAttribute("show-active-line-raw");
}
function updateMetrics() {
  const stats = component.getStats();
  modeStatus.textContent = component.getMode();
  wordStatus.textContent = String(stats?.words ?? 0);
}
function showOutput(label, value) {
  output.textContent = `${label}

${value}`;
}
function setPreset(value, label) {
  component.setValue(value);
  log(`preset \xB7 ${label}`);
  showOutput("Preset Loaded", `${label}

${value}`);
  updateMetrics();
  updateSnippet();
}
controls.theme.addEventListener("change", applyControlState);
controls.mode.addEventListener("change", applyControlState);
controls.height.addEventListener("change", applyControlState);
controls.maxHeight.addEventListener("change", applyControlState);
controls.fontSize.addEventListener("change", applyControlState);
controls.fontFamily.addEventListener("change", applyControlState);
controls.padding.addEventListener("change", applyControlState);
controls.toolbar.addEventListener("change", applyControlState);
controls.stats.addEventListener("change", applyControlState);
controls.autoResize.addEventListener("change", applyControlState);
controls.readonly.addEventListener("change", applyControlState);
controls.spellcheck.addEventListener("change", applyControlState);
controls.smartLists.addEventListener("change", applyControlState);
controls.syntaxHighlighting.addEventListener("change", applyControlState);
controls.activeLineRaw.addEventListener("change", applyControlState);
document.getElementById("preset-full").addEventListener("click", () => setPreset(fullPreset, "Full Demo"));
document.getElementById("preset-web").addEventListener("click", () => setPreset(webPreset, "Web Stack"));
document.getElementById("preset-notes").addEventListener("click", () => setPreset(notesPreset, "Product Notes"));
document.getElementById("action-html").addEventListener("click", () => {
  showOutput("Rendered HTML", component.getHTML());
});
document.getElementById("action-clean").addEventListener("click", () => {
  showOutput("Clean HTML", component.getCleanHTML());
});
document.getElementById("action-preview-html").addEventListener("click", () => {
  showOutput("Preview HTML", component.getPreviewHTML());
});
document.getElementById("action-stats").addEventListener("click", () => {
  showOutput("Stats", JSON.stringify(component.getStats(), null, 2));
});
document.getElementById("action-focus").addEventListener("click", () => {
  component.focus();
});
document.getElementById("action-insert").addEventListener("click", () => {
  component.insertText(controls.insertText.value || "`// inserted`");
});
document.getElementById("action-toolbar").addEventListener("click", () => {
  if (component.hasAttribute("toolbar")) {
    component.removeAttribute("toolbar");
    controls.toolbar.checked = false;
  } else {
    component.setAttribute("toolbar", "");
    controls.toolbar.checked = true;
  }
  updateSnippet();
});
document.getElementById("action-timestamp").addEventListener("click", () => {
  component.insertText(`

Updated: ${(/* @__PURE__ */ new Date()).toISOString()}`);
});
copySnippetButton.addEventListener("click", async () => {
  const snippet = generateSnippet();
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(snippet);
  } else {
    showOutput("Copy Snippet", snippet);
  }
  copySnippetButton.textContent = "Copied";
  setTimeout(() => {
    copySnippetButton.textContent = "Copy Snippet";
  }, 1200);
});
function handleReady() {
  const editor = component.getEditor();
  if (!editor || editor === activeEditor)
    return;
  activeEditor = editor;
  configureAdvancedFeatures();
  syncControlsFromComponent();
  updateSyntaxStatus();
  logSyntaxStatus(component.getSyntaxHighlightingStatus?.());
  updateMetrics();
  updateSnippet();
  log("ready \xB7 component initialized");
}
component.addEventListener("ready", handleReady);
component.addEventListener("change", (event) => {
  updateMetrics();
  updateSnippet();
  log(`change \xB7 ${event.detail.value.length} chars`);
});
component.addEventListener("syntax-highlighting-status", (event) => {
  updateSyntaxStatus(event.detail);
  logSyntaxStatus(event.detail);
});
component.addEventListener("spellcheck-change", (event) => {
  syncControlsFromComponent();
  updateSnippet();
  log(`spellcheck \xB7 ${event.detail.enabled ? "on" : "off"}`);
});
component.addEventListener("auto-resize-change", (event) => {
  syncControlsFromComponent();
  updateSnippet();
  log(`auto-resize \xB7 ${event.detail.enabled ? "on" : "off"}`);
});
component.addEventListener("show-stats-change", (event) => {
  syncControlsFromComponent();
  updateSnippet();
  log(`stats \xB7 ${event.detail.enabled ? "on" : "off"}`);
});
component.addEventListener("keydown", (event) => {
  const key = event.detail?.event?.key;
  if (key && key.length === 1)
    return;
  log(`keydown \xB7 ${key}`);
});
component.addEventListener("render", () => {
  renderCounter += 1;
  if (renderCounter % 8 === 0) {
    updateMetrics();
    updateSnippet();
  }
});
component.addEventListener("error", (event) => {
  log(`error \xB7 ${event.detail.error?.message || "unknown"}`);
});
setPreset(fullPreset, "Full Demo");
queueMicrotask(() => {
  if (component.isReady()) {
    handleReady();
  }
  updateSyntaxStatus();
  logSyntaxStatus(component.getSyntaxHighlightingStatus?.());
  updateSnippet();
});
//# sourceMappingURL=demo.js.map
