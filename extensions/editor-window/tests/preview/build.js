/* Bundles tests/preview/harness.ts into a standalone HTML page (no Cocos needed). */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

const map = {
    'cc': path.join(root, 'tests', 'stubs', 'cc.ts'),
    'cc/env': path.join(root, 'tests', 'stubs', 'cc-env.ts'),
    'db://editor-window/EditorWindow': path.join(root, 'assets', 'EditorWindow.ts'),
};

esbuild.build({
    entryPoints: [path.join(__dirname, 'harness.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2019',
    outfile: path.join(out, 'harness.js'),
    alias: { vue: 'vue/dist/vue.esm-bundler.js' },
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', 'process.env.NODE_ENV': '"development"' },
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    logLevel: 'warning',
    plugins: [{
        name: 'aliases',
        setup(build) {
            build.onResolve({ filter: /^(cc|cc\/env|db:\/\/editor-window\/EditorWindow)$/ }, (args) => ({ path: map[args.path] }));
        },
    }],
}).then(() => {
    const css = fs.readFileSync(path.join(root, 'static/style/window.css'), 'utf8');
    fs.writeFileSync(path.join(out, 'preview.html'), `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Editor Window preview</title>
<style>
:root {
    --color-normal-fill: #232323; --color-normal-fill-emphasis: #2c2c2c; --color-normal-border: #171717;
    --color-default-fill: #3c3c3c; --color-default-border: #1e1e1e;
    --color-normal-contrast: #ccc; --color-normal-contrast-weakest: #f2f2f2; --color-normal-contrast-emphasis: #8c8c8c;
    --color-focus-fill: #2f7de1; --color-focus-border: #2f7de1;
}
html, body { margin: 0; height: 100%; background: #232323; font-family: sans-serif; }
body { display: flex; flex-direction: column; }
#app { flex: 1; min-height: 0; display: flex; flex-direction: column; }
#result { white-space: pre; font: 12px monospace; padding: 8px; color: #ccc; }
${css}
</style>
</head>
<body>
<div id="app" class="ew-app"></div>
<script src="harness.js"></script>
</body>
</html>
`);
    console.log('wrote', path.join(out, 'preview.html'));
}).catch(() => process.exit(1));
