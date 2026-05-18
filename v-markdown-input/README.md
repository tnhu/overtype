# v-markdown-input

`v-markdown-input` is a standalone extraction scaffold for the OverType web component. It vendors the OverType core locally so this folder can be split into its own repository later without depending on the parent project layout.

## Credits

- Original project: [OverType](https://github.com/panphora/overtype)
- Original author: David Miranda
- License: MIT

This folder preserves the original MIT license and keeps explicit credit to OverType in the source headers, package metadata, build banners, and demo.

## What This Contains

- A standalone custom element registered as `<v-markdown-input>`
- Vendored OverType core sources under `src/`
- A local build pipeline that emits renamed `dist/` artifacts
- A dedicated demo under `demo/` with built-in Shiki 4.0.2 highlighting

## Development

```bash
npm install
npm run build
npm run dev
```

Then open `http://127.0.0.1:8090`.

## Quick Start

Use the generated web component bundle. Built-in syntax highlighting is enabled by default:

```html
<script type="module" src="./dist/v-markdown-input-webcomponent.esm.js"></script>

<v-markdown-input
  theme="solar"
  height="420px"
  max-height="720px"
  toolbar
  show-stats>
# Hello

Start writing **markdown** here.
</v-markdown-input>
```

Browser spellcheck is off by default. Add the `spellcheck` attribute if you want native browser spellcheck underlines.

## Supported Attributes

The custom element mirrors the current OverType wrapper and supports these reactive attributes:

- `value`
- `theme`
- `mode`
- `toolbar`
- `height`
- `min-height`
- `max-height`
- `placeholder`
- `font-size`
- `font-family`
- `line-height`
- `padding`
- `auto-resize`
- `autofocus`
- `show-stats`
- `smart-lists`
- `readonly`
- `spellcheck`
- `syntax-highlighting`
- `show-active-line-raw`

Add `spellcheck` to enable the native browser spellchecker. In normal overlay mode the component uses aggressive scroll syncing to keep native spellcheck underlines aligned with the preview layer, but exact rendering still depends on browser behavior. Use `syntax-highlighting="false"` to disable the built-in Shiki loader. `show-active-line-raw` renders the line under the caret as literal markdown instead of parsed preview.

When `auto-resize` is enabled, use `max-height="720px"` or another CSS pixel value to cap growth and switch the editor body to scrolling after that height.

Use `font-family` to switch the editor typography. The value is applied to the textarea, preview overlay, inline code, fenced code blocks, and Shiki-highlighted spans through inheritance:

```html
<v-markdown-input
  font-family='ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'>
</v-markdown-input>
```

## Public API

```js
const element = document.querySelector('v-markdown-input');

element.getValue();
element.setValue('# Updated');
element.getHTML();
element.getCleanHTML();
element.getPreviewHTML();
element.insertText('**hello**');
element.getStats();
element.getMode();
element.setMode('preview');
element.showNormalEditMode();
element.showPlainTextarea();
element.showPreviewMode();
element.getSyntaxHighlightingStatus();
element.setAttribute('spellcheck', '');
element.setCodeHighlighter((code, language) => code);
element.configure({
  statsFormatter: (stats) => `${stats.words} words`,
  fileUpload: {
    enabled: true,
    onInsertFile: async (fileOrFiles) => '[uploaded](#todo)'
  }
});
```

## Advanced Integration

Use `configure(...)` when you need behavior that cannot be expressed as plain HTML attributes:

```html
<script type="module" src="./dist/v-markdown-input-webcomponent.esm.js"></script>
<script type="module">
  const editor = document.querySelector('v-markdown-input');

  editor.configure({
    statsFormatter: (stats) => `${stats.words} words · ${stats.lines} lines`,
    fileUpload: {
      enabled: true,
      onInsertFile: async (fileOrFiles) => {
        const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
        return files.map((file) => `[${file.name}](#replace-me)`);
      }
    }
  });
</script>

<v-markdown-input toolbar show-stats height="420px"></v-markdown-input>
```

## Shiki Integration

Shiki is built into the web component and enabled by default. `<v-markdown-input>` loads Shiki `4.0.2` internally from `https://esm.sh/shiki@4.0.2` and falls back to `https://esm.run/shiki@4.0.2` when needed. No extra setup is required for standard syntax highlighting.

```html
<script type="module" src="./dist/v-markdown-input-webcomponent.esm.js"></script>
<v-markdown-input toolbar show-stats height="420px">
\`\`\`ts
const answer: number = 42;
\`\`\`
</v-markdown-input>
```

Disable the internal loader like this:

```html
<v-markdown-input syntax-highlighting="false"></v-markdown-input>
```

If you want to replace the built-in highlighter with your own implementation, use `setCodeHighlighter(...)`:

```html
<script type="module" src="./dist/v-markdown-input-webcomponent.esm.js"></script>
<script type="module">
  const editor = document.querySelector('v-markdown-input');
  editor.setCodeHighlighter((code, language) => code);

  const status = editor.getSyntaxHighlightingStatus();
  console.log(status.state, status.source);
</script>
```

## Demo

The demo page shows:

- Live attribute and mode controls
- Built-in Shiki 4.0.2 syntax highlighting loaded internally from CDN
- Native browser spellcheck available as an opt-in attribute, with a toolbar toggle
- File upload hooks through `configure(...)`
- Export actions for rendered HTML, clean HTML, and preview HTML
- A live copy-paste integration snippet that updates when options change

Run it with:

```bash
npm run dev
```

## Notes

- The underlying editor behavior is derived from OverType and intentionally kept close to upstream.
- Native browser spellcheck is still browser-rendered on the underlying textarea, so alignment quality in overlay mode depends partly on the browser’s scroll and paint behavior.
- The current TypeScript definitions are vendored from the upstream project and can be refined further when this folder becomes its own repository.
