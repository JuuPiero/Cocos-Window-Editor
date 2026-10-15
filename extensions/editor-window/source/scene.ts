/**
 * Scene-process half of editor-window: runs the windows (WindowHost) with
 * the real engine, and tells the main process when the list of windows
 * changes (to update the menus).
 */
import { join } from 'path';
import { HostEvent, FrameContext, registry, WindowHost } from './host';

module.paths.push(join(Editor.App.path, 'node_modules'));

function cc(): any {
    return require('cc');
}

function findNode(root: any, uuid: string): any {
    if (!root) return null;
    if (root.uuid === uuid) return root;
    for (const child of root.children) {
        const found = findNode(child, uuid);
        if (found) return found;
    }
    return null;
}

function findComponent(root: any, uuid: string): any {
    if (!root) return null;
    for (const comp of root.components || []) if (comp.uuid === uuid) return comp;
    for (const child of root.children) {
        const found = findComponent(child, uuid);
        if (found) return found;
    }
    return null;
}

const host = new WindowHost({
    resolver: {
        node: (uuid) => findNode(cc().director.getScene(), uuid),
        component: (uuid) => findComponent(cc().director.getScene(), uuid),
        asset: (uuid) =>
            new Promise((resolve) => {
                cc().assetManager.loadAny(uuid, (err: unknown, asset: any) => resolve(err ? null : asset));
            }),
    },
    repaint: (slot) => Editor.Message.broadcast('editor-window:repaint', slot),
    close: (slot) => Editor.Message.send('editor-window', 'close-slot', slot),
    log: (...args) => console.error(...args),
});

let watchTimer: ReturnType<typeof setInterval> | null = null;
let lastVersion = -1;

/** Tell the main process about new / removed windows (after scripts reload). */
function watchWindows() {
    const r = (globalThis as any).__editorWindowRegistry;
    const version = r?.version ?? 0;
    if (version === lastVersion) return;
    lastVersion = version;
    Editor.Message.send('editor-window', 'windows-changed', host.list());
}

export const methods: Record<string, (...args: any[]) => any> = {
    ewList() {
        return host.list();
    },
    ewOpen(slot: string, windowId: string, saved?: unknown) {
        return host.open(slot, windowId, saved);
    },
    ewFrame(slot: string, events: HostEvent[], context: FrameContext) {
        return host.frame(slot, events, context);
    },
    ewClose(slot: string) {
        return host.close(slot);
    },
    ewHas(slot: string) {
        return host.has(slot);
    },
    ewRuntime() {
        return !!registry();
    },
};

export function load() {
    // Only the edit scene hosts windows (Play-in-Editor runs its own scene process).
    if ((globalThis as any).isPreviewProcess) return;
    watchTimer = setInterval(watchWindows, 1000);
}

export function unload() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
}
