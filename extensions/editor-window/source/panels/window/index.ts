/**
 * Window panel module, shared by the panel slots (dist/panels/<slot>.js call
 * definePanel with their slot name).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createWindowApp, WindowApp } from './app';
import { editorBridge } from './editor-bridge';
import type { WindowInfo } from './types';

const CSS = readFileSync(join(__dirname, '../../static/style/window.css'), 'utf8');

export function definePanel(slot: string) {
    const apps = new WeakMap<object, WindowApp>();
    return Editor.Panel.define({
        template: '<div id="app" class="ew-app"></div>',
        style: CSS,
        $: { app: '#app' },
        methods: {
            /** The main process put another window (or the list) in a slot. */
            onSlotChanged(changed: string) {
                if (changed === slot) apps.get(this)?.reload();
            },
            /** EditorWindow.repaint() */
            onRepaint(target: string) {
                if (target === slot) apps.get(this)?.repaint();
            },
            onSelection() {
                apps.get(this)?.notify('selection');
            },
            onSceneChanged() {
                apps.get(this)?.notify('hierarchy');
            },
            onAssetsChanged() {
                apps.get(this)?.notify('project');
            },
            onWindowsUpdated(list: WindowInfo[]) {
                const app = apps.get(this);
                if (!app) return;
                app.setWindows(list);
                // New scripts may have brought the window this panel waits for.
                app.reload();
            },
        },
        ready() {
            apps.set(this, createWindowApp((this as any).$.app as HTMLElement, editorBridge(slot)));
        },
        close() {
            apps.get(this)?.dispose();
        },
    });
}
