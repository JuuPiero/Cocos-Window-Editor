/** Minimal async test runner; results are summed by tests/run.js. */
const results: { passed: number; failed: number; queue: Promise<void> } = ((globalThis as any).__ewTests ??= {
    passed: 0,
    failed: 0,
    queue: Promise.resolve(),
});

export function test(name: string, fn: () => void | Promise<void>) {
    results.queue = results.queue.then(async () => {
        try {
            await fn();
            results.passed++;
            console.log(`  ok   ${name}`);
        } catch (e) {
            results.failed++;
            console.log(`  FAIL ${name}\n       ${String((e as Error)?.stack || e).split('\n').slice(0, 6).join('\n       ')}`);
        }
    });
}

export function section(name: string) {
    results.queue = results.queue.then(() => console.log(`\n${name}`));
}
