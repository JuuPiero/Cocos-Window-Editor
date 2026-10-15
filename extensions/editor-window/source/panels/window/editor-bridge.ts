/** WindowBridge backed by the Cocos editor (main process + scene script). */
import type { MenuItem, WindowBridge } from './bridge';

const PKG = 'editor-window';
const request = (Editor.Message.request as any).bind(Editor.Message) as (target: string, message: string, ...args: any[]) => Promise<any>;

function scene(method: string, ...args: unknown[]): Promise<any> {
    return request('scene', 'execute-scene-script', { name: PKG, method, args });
}

export function editorBridge(slot: string): WindowBridge {
    return {
        slot,
        slotInfo: () => request(PKG, 'slot-info', slot),
        async listWindows() {
            try {
                return (await scene('ewList')) || [];
            } catch {
                return (await request(PKG, 'query-windows')) || [];
            }
        },
        open: (windowId, state) => scene('ewOpen', slot, windowId, state),
        frame: (events, context) => scene('ewFrame', slot, events, context),
        close: () => scene('ewClose', slot).catch(() => null),
        assign: (windowId) => {
            Editor.Message.send(PKG, 'assign-slot', slot, windowId);
        },
        openWindow: (windowId) => {
            Editor.Message.send(PKG, 'open-window', windowId);
        },
        saveState: (windowId, state) => {
            Editor.Message.send(PKG, 'save-state', windowId, state);
        },
        release: () => {
            Editor.Message.send(PKG, 'release-slot', slot);
        },
        closePanel: () => {
            Editor.Message.send(PKG, 'close-slot', slot);
        },
        selection: () => ({
            nodes: Editor.Selection.getSelected('node') || [],
            assets: Editor.Selection.getSelected('asset') || [],
        }),
        popup(items: MenuItem[]) {
            Editor.Menu.popup({ menu: items as any });
        },
    };
}
