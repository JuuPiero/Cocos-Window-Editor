/**
 * Bundles tests/*.test.ts with esbuild ('cc' replaced by tests/stubs) and runs them.
 *
 *   node tests/run.js
 */
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');

const stubs = {
    'cc': path.join(__dirname, 'stubs', 'cc.ts'),
    'cc/env': path.join(__dirname, 'stubs', 'cc-env.ts'),
};

async function main() {
    const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.ts'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-window-tests-'));
    for (const file of files) {
        const outfile = path.join(outDir, file.replace(/\.ts$/, '.js'));
        await esbuild.build({
            entryPoints: [path.join(__dirname, file)],
            outfile,
            bundle: true,
            platform: 'node',
            format: 'cjs',
            target: 'node16',
            logLevel: 'error',
            tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
            plugins: [{
                name: 'cc-stubs',
                setup(build) {
                    build.onResolve({ filter: /^cc(\/env)?$/ }, (args) => ({ path: stubs[args.path] }));
                },
            }],
        });
        require(outfile);
    }
    const r = globalThis.__ewTests;
    await r.queue;
    console.log(`\n${r.passed} passed, ${r.failed} failed`);
    process.exitCode = r.failed ? 1 : 0;
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
