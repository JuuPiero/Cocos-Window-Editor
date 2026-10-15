/**
 * A window panel: asks the scene process to draw its window, renders the
 * controls and sends input back. Input is queued while a frame is in flight
 * (repeated changes of one field collapse into the latest), so a slow onGUI
 * never loses or reorders input.
 */
import { createApp, defineComponent, h, reactive } from 'vue';
import type { MenuItem, WindowBridge } from './bridge';
import { renderControls } from './renderer';
import type { FrameResult, GuiControl, HostEvent, WindowInfo } from './types';

export interface WindowApp {
    readonly state: AppState;
    /** The panel's window changed (or first load). */
    reload(): Promise<void>;
    repaint(): void;
    notify(kind: 'selection' | 'hierarchy' | 'project'): void;
    setWindows(list: WindowInfo[]): void;
    /** Resolves when no frame is pending (tests). */
    idle(): Promise<void>;
    dispose(): Promise<void>;
}

export interface AppState {
    windowId: string | null;
    title: string;
    tree: GuiControl[];
    error: string;
    openError: string;
    windows: WindowInfo[];
    loading: boolean;
}

const RETRY_MS = 2000;

export function createWindowApp(el: HTMLElement, bridge: WindowBridge): WindowApp {
    const state = reactive<AppState>({ windowId: null, title: '', tree: [], error: '', openError: '', windows: [], loading: true });
    let lastState: unknown = null;
    let open = false;
    const queue: HostEvent[] = [];
    let dirty = false;
    let busy = false;
    let disposed = false;
    let autoMs = 0;
    let autoTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let hierarchyTimer: ReturnType<typeof setTimeout> | null = null;
    const waiters: (() => void)[] = [];

    /** Vector fields send one axis at a time: those changes add up, they can't replace each other. */
    const partial = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);

    function enqueue(e: HostEvent) {
        if (e.type === 'change' && !partial((e as any).value)) {
            const i = queue.findIndex((q) => q.type === 'change' && q.id === e.id && !partial((q as any).value));
            if (i >= 0) queue.splice(i, 1);
        } else if ((e.type === 'selection' || e.type === 'hierarchy' || e.type === 'project') && queue.some((q) => q.type === e.type)) {
            return;
        }
        queue.push(e);
        pump();
    }

    function repaint() {
        dirty = true;
        pump();
    }

    function apply(res: FrameResult) {
        if (res.title !== undefined) state.title = res.title;
        state.tree = res.tree || [];
        state.error = res.error || '';
        if (res.state !== undefined && state.windowId) {
            lastState = res.state;
            bridge.saveState(state.windowId, res.state);
        }
        setAutoRepaint(res.autoRepaint || 0);
    }

    async function openWindow(): Promise<boolean> {
        if (!state.windowId) return false;
        let r: { ok: boolean; error?: string };
        try {
            r = await bridge.open(state.windowId, lastState);
        } catch (e) {
            r = { ok: false, error: String((e as Error)?.message || e) };
        }
        open = r.ok;
        state.openError = r.ok ? '' : r.error || 'Could not open the window.';
        if (!r.ok && !disposed) {
            // The scene (or the project's scripts) may not be loaded yet.
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
                retryTimer = null;
                openWindow().then((ok) => ok && repaint());
            }, RETRY_MS);
        }
        return r.ok;
    }

    async function pump() {
        if (busy || disposed) return;
        busy = true;
        try {
            while ((queue.length || dirty) && !disposed && state.windowId && open) {
                dirty = false;
                const events = queue.splice(0);
                let res: FrameResult;
                try {
                    res = await bridge.frame(events, bridge.selection());
                } catch (e) {
                    state.error = String((e as Error)?.message || e);
                    break;
                }
                if (res.missing) {
                    // The scene process lost the window (it restarted): open it again.
                    if (!(await openWindow())) break;
                    dirty = true;
                    continue;
                }
                apply(res);
            }
        } finally {
            busy = false;
            if (!queue.length && !dirty) waiters.splice(0).forEach((f) => f());
        }
    }

    function setAutoRepaint(ms: number) {
        if (ms === autoMs) return;
        autoMs = ms;
        if (autoTimer) clearInterval(autoTimer);
        autoTimer = null;
        if (ms > 0) {
            autoTimer = setInterval(() => {
                if (document.hidden || !el.isConnected || !el.offsetParent) return;
                repaint();
            }, Math.max(16, ms));
        }
    }

    async function closeCurrent() {
        if (!open || !state.windowId) return;
        open = false;
        const saved = await bridge.close();
        if (saved) bridge.saveState(state.windowId, saved);
    }

    async function reload() {
        state.loading = true;
        const info = await bridge.slotInfo();
        if (info.windowId !== state.windowId) {
            await closeCurrent();
            state.windowId = info.windowId;
            lastState = info.state;
            state.tree = [];
            state.error = '';
            state.title = '';
        }
        state.windows = info.windows?.length ? info.windows : await bridge.listWindows();
        if (state.windowId) {
            if (!open) await openWindow();
            repaint();
        } else {
            setAutoRepaint(0);
            state.windows = await bridge.listWindows();
        }
        state.loading = false;
    }

    function notify(kind: 'selection' | 'hierarchy' | 'project') {
        if (!state.windowId || !open) return;
        if (kind === 'hierarchy') {
            if (hierarchyTimer) return;
            hierarchyTimer = setTimeout(() => {
                hierarchyTimer = null;
                enqueue({ type: 'hierarchy' });
            }, 100);
            return;
        }
        enqueue({ type: kind });
    }

    function showMenu() {
        const items: MenuItem[] = [
            { label: 'Reload Window', click: () => reopen() },
            { type: 'separator' },
            ...state.windows.map((w) => ({ label: w.title, type: 'checkbox' as const, checked: w.id === state.windowId, click: () => w.id !== state.windowId && bridge.assign(w.id) })),
            { type: 'separator' },
            { label: 'Window List', click: () => bridge.assign(null) },
            { label: 'Close', click: () => bridge.closePanel() },
        ];
        bridge.popup(items);
    }

    async function reopen() {
        await closeCurrent();
        if (await openWindow()) repaint();
    }

    const Root = defineComponent({
        setup() {
            return () => {
                if (state.windowId) {
                    return h('div', { class: 'ew-window' }, [
                        h('div', { class: 'ew-header' }, [
                            h('span', { class: 'ew-header-title' }, state.title || state.windowId),
                            h('div', { class: 'ew-flex' }),
                            h('button', { class: 'ew-header-menu', title: 'Window menu', onClick: showMenu }, '⋮'),
                        ]),
                        h('div', { class: 'ew-body' }, [
                            state.openError ? h('div', { class: 'ew-help ew-help-error' }, [h('span', { class: 'ew-help-icon' }), h('span', state.openError)]) : null,
                            ...renderControls(state.tree, enqueue),
                            state.error ? h('div', { class: 'ew-help ew-help-error ew-error' }, [h('span', { class: 'ew-help-icon' }), h('span', `${state.error}\nSee the Console for details.`)]) : null,
                        ]),
                    ]);
                }
                return h('div', { class: 'ew-launcher' }, [
                    h('div', { class: 'ew-launcher-title' }, 'Editor Windows'),
                    state.windows.length
                        ? h('div', { class: 'ew-launcher-list' }, state.windows.map((w) =>
                            h('div', { key: w.id, class: 'ew-launcher-item', title: 'Open here', onClick: () => bridge.assign(w.id) }, [
                                h('span', { class: 'ew-launcher-name' }, w.title),
                                h('span', { class: 'ew-launcher-menu' }, w.menu || w.id),
                            ])))
                        : h('div', { class: 'ew-launcher-empty' }, state.loading ? 'Loading…' : [
                            h('div', 'No editor windows yet. Add one to a script in your project:'),
                            h('pre', { class: 'ew-code' }, "import { EditorWindow, editorWindow, GUI } from 'db://editor-window/EditorWindow';\n\n@editorWindow('Tools/My Window')\nexport class MyWindow extends EditorWindow {\n    count = 1;\n    onGUI(gui: GUI) {\n        this.count = gui.intField('Count', this.count);\n        if (gui.button('Hello')) console.log('Hello', this.count);\n    }\n}"),
                        ]),
                ]);
            };
        },
    });

    const app = createApp(Root);
    app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
    app.mount(el);
    reload();

    return {
        state,
        reload,
        repaint,
        notify,
        setWindows(list) {
            state.windows = list || [];
        },
        idle() {
            if (!busy && !queue.length && !dirty) return Promise.resolve();
            return new Promise((r) => waiters.push(r));
        },
        async dispose() {
            disposed = true;
            if (autoTimer) clearInterval(autoTimer);
            if (retryTimer) clearTimeout(retryTimer);
            if (hierarchyTimer) clearTimeout(hierarchyTimer);
            await closeCurrent().catch(() => undefined);
            app.unmount();
        },
    };
}
