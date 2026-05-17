import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

const banner = `/**
 * v-markdown-input v${version}
 * Standalone web component scaffold derived from OverType by David Miranda
 * Original project: https://github.com/panphora/overtype
 * License preserved: MIT
 */`;

const baseConfig = {
  bundle: true,
  sourcemap: true,
  target: ['es2020', 'chrome62', 'firefox78', 'safari16'],
  banner: { js: banner },
  loader: { '.js': 'js' },
  mainFields: ['module', 'main']
};

const webComponentConfig = {
  ...baseConfig,
  target: ['es2022'],
  external: ['https://esm.sh/*', 'https://esm.run/*']
};

const distDir = path.join(rootDir, 'dist');
const demoDir = path.join(rootDir, 'demo');
const demoDistDir = path.join(demoDir, 'dist');

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

async function build() {
  try {
    cleanDir(distDir);
    cleanDir(demoDistDir);

    await esbuild.build({
      ...baseConfig,
      entryPoints: [path.join(rootDir, 'src', 'v-markdown-input.js')],
      outfile: path.join(distDir, 'v-markdown-input.js'),
      format: 'iife',
      globalName: 'VMarkdownInput',
      platform: 'browser',
      footer: {
        js: `
if (typeof window !== "undefined" && typeof window.document !== "undefined") {
  window.toolbarButtons = VMarkdownInput.toolbarButtons;
  window.defaultToolbarButtons = VMarkdownInput.defaultToolbarButtons;
  window.VMarkdownInput = VMarkdownInput.default ? VMarkdownInput.default : VMarkdownInput;
}
        `
      }
    });
    console.log('Built dist/v-markdown-input.js');

    await esbuild.build({
      ...baseConfig,
      entryPoints: [path.join(rootDir, 'src', 'v-markdown-input.js')],
      outfile: path.join(distDir, 'v-markdown-input.min.js'),
      format: 'iife',
      globalName: 'VMarkdownInput',
      minify: true,
      sourcemap: false,
      platform: 'browser',
      footer: {
        js: `
if (typeof window !== "undefined" && typeof window.document !== "undefined") {
  window.toolbarButtons = VMarkdownInput.toolbarButtons;
  window.defaultToolbarButtons = VMarkdownInput.defaultToolbarButtons;
  window.VMarkdownInput = VMarkdownInput.default ? VMarkdownInput.default : VMarkdownInput;
}
        `
      }
    });
    console.log('Built dist/v-markdown-input.min.js');

    await esbuild.build({
      ...baseConfig,
      entryPoints: [path.join(rootDir, 'src', 'v-markdown-input.js')],
      outfile: path.join(distDir, 'v-markdown-input.cjs'),
      format: 'cjs',
      platform: 'node'
    });
    console.log('Built dist/v-markdown-input.cjs');

    await esbuild.build({
      ...baseConfig,
      entryPoints: [path.join(rootDir, 'src', 'v-markdown-input.js')],
      outfile: path.join(distDir, 'v-markdown-input.esm.js'),
      format: 'esm',
      platform: 'browser'
    });
    console.log('Built dist/v-markdown-input.esm.js');

    await esbuild.build({
      ...webComponentConfig,
      entryPoints: [path.join(rootDir, 'src', 'v-markdown-input-webcomponent.js')],
      outfile: path.join(distDir, 'v-markdown-input-webcomponent.js'),
      format: 'iife',
      globalName: 'VMarkdownInputElement',
      platform: 'browser'
    });
    console.log('Built dist/v-markdown-input-webcomponent.js');

    await esbuild.build({
      ...webComponentConfig,
      entryPoints: [path.join(rootDir, 'src', 'v-markdown-input-webcomponent.js')],
      outfile: path.join(distDir, 'v-markdown-input-webcomponent.min.js'),
      format: 'iife',
      globalName: 'VMarkdownInputElement',
      minify: true,
      sourcemap: false,
      platform: 'browser'
    });
    console.log('Built dist/v-markdown-input-webcomponent.min.js');

    await esbuild.build({
      ...webComponentConfig,
      entryPoints: [path.join(rootDir, 'src', 'v-markdown-input-webcomponent.js')],
      outfile: path.join(distDir, 'v-markdown-input-webcomponent.esm.js'),
      format: 'esm',
      platform: 'browser'
    });
    console.log('Built dist/v-markdown-input-webcomponent.esm.js');

    await esbuild.build({
      ...baseConfig,
      bundle: false,
      entryPoints: [path.join(rootDir, 'demo', 'demo-entry.js')],
      outfile: path.join(demoDir, 'demo.js'),
      format: 'esm',
      platform: 'browser',
      target: ['es2022']
    });
    console.log('Built demo/demo.js');

    const typesSource = path.join(rootDir, 'src', 'overtype.d.ts');
    const typesDest = path.join(distDir, 'v-markdown-input.d.ts');
    if (fs.existsSync(typesSource)) {
      fs.copyFileSync(typesSource, typesDest);
      console.log('Copied dist/v-markdown-input.d.ts');
    }

    fs.cpSync(distDir, demoDistDir, { recursive: true });
    console.log('Copied dist to demo/dist');

    console.log('\nBundle sizes:');
    console.log(`  Core IIFE: ${(fs.statSync(path.join(distDir, 'v-markdown-input.js')).size / 1024).toFixed(2)} KB`);
    console.log(`  Core Min:  ${(fs.statSync(path.join(distDir, 'v-markdown-input.min.js')).size / 1024).toFixed(2)} KB`);
    console.log(`  WC IIFE:   ${(fs.statSync(path.join(distDir, 'v-markdown-input-webcomponent.js')).size / 1024).toFixed(2)} KB`);
    console.log(`  WC Min:    ${(fs.statSync(path.join(distDir, 'v-markdown-input-webcomponent.min.js')).size / 1024).toFixed(2)} KB`);
    console.log('\nBuild complete.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
