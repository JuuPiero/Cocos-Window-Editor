/**
 * Main process: which window shows in which panel slot, the windows' menu
 * items, and saved window state (temp/editor-window/state.json).
 *
 * Cocos opens one instance per panel, so the extension declares a few panel
 * slots; each shows one window. A window's menu item opens it in a free slot.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { menuSpot, MenuSpot } from './menus';
import { SLOTS, panelName, slotKey, type SlotInfo, type WindowInfo } from './shared';

const PKG = 'editor-window';

const I18N: Record<string, Record<string, string>> = {
    en: { description: 'Unity-style editor windows written in your project (EditorWindow + immediate-mode GUI).', open_panel: 'Editor Windows' },
    zh: { description: '在项目中编写 Unity 风格的编辑器窗口（EditorWindow + 即时模式 GUI）。', open_panel: '编辑器窗口' },
};

interface SavedState {
    slots: Record<string, string>;
    states: Record<string, unknown>;
}

let windows: WindowInfo[] = [];
let saved: SavedState = { slots: {}, states: {} };
let menus: MenuSpot[] = [];
const titles: Record<string, string> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const stateFile = () => join(Editor.Project.path, 'temp', 'editor-window', 'state.json');

function load_() {
    try {
        if (existsSync(stateFile())) saved = { slots: {}, states: {}, ...JSON.parse(readFileSync(stateFile(), 'utf8')) };
    } catch {
        saved = { slots: {}, states: {} };
    }
}

function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            mkdirSync(dirname(stateFile()), { recursive: true });
            writeFileSync(stateFile(), JSON.stringify(saved, null, 2));
        } catch (e) {
            console.warn('[Editor Window] Could not save window state:', e);
        }
    }, 500);
}

function titleOf(id: string): string {
    return windows.find((w) => w.id === id)?.title || id.split('/').pop() || id;
}

/**
 * Panel tab titles are i18n keys ("i18n:editor-window.slot_default"); give
 * them the window's title. (Uses the editor's internal i18n registration;
 * the generic "Editor Window" title stays if that isn't available.)
 */
function applyTitles() {
    const i18n = (Editor.I18n as any).__protected__;
    if (!i18n?.register) return;
    for (const lang of Object.keys(I18N)) {
        const map: Record<string, string> = { ...I18N[lang] };
        SLOTS.forEach((slot, i) => {
            map[`slot_${slotKey(slot)}`] = titles[slot] || (i ? `Editor Window ${i + 1}` : 'Editor Window');
        });
        try {
            i18n.register(lang, PKG, map);
        } catch {
            // older editors: keep the generic titles
        }
    }
}

/** One menu item per window (Unity's [MenuItem]); uses the editor's internal menu API. */
function applyMenus() {
    const menu = (Editor.Menu as any).__protected__;
    if (!menu?.add) return;
    try {
        for (const m of menus) menu.remove(m.path, { label: m.label });
        menus = [];
        for (const w of windows) {
            const spot = menuSpot(w.menu, w.title);
            menu.add(spot.path, { label: spot.label, message: 'open-window', target: PKG, params: [w.id] });
            menus.push(spot);
        }
        menu.apply();
    } catch (e) {
        console.warn('[Editor Window] Could not add window menus:', e);
    }
}

async function isOpen(slot: string): Promise<boolean> {
    try {
        return await Editor.Panel.has(panelName(slot));
    } catch {
        return false;
    }
}

async function show(slot: string, windowId: string | null) {
    if (windowId) {
        saved.slots[slot] = windowId;
        titles[slot] = titleOf(windowId);
    } else {
        delete saved.slots[slot];
        delete titles[slot];
    }
    save();
    applyTitles();
    await Editor.Panel.open(panelName(slot));
    Editor.Message.send(PKG, 'slot-changed', slot);
}

export const methods: Record<string, (...args: any[]) => any> = {
    /** Panel menu: the window list (or the open windows). */
    async openPanel() {
        for (const slot of SLOTS) {
            if (!saved.slots[slot] && (await isOpen(slot))) return Editor.Panel.focus(panelName(slot));
        }
        for (const slot of SLOTS) if (!(await isOpen(slot))) return show(slot, null);
        return Editor.Panel.focus(panelName(SLOTS[0]));
    },

    /** A window's menu item: focus it, or show it in a free slot. */
    async openWindow(windowId: string) {
        for (const slot of SLOTS) {
            if (saved.slots[slot] === windowId && (await isOpen(slot))) {
                await Editor.Panel.focus(panelName(slot));
                return;
            }
        }
        let target: string | undefined;
        for (const slot of SLOTS) if (!saved.slots[slot] && (await isOpen(slot))) target = target || slot; // an open, empty one
        for (const slot of SLOTS) if (!target && !(await isOpen(slot))) target = slot;
        await show(target || SLOTS[0], windowId);
    },

    /** From the scene script: the registered windows. */
    windowsChanged(list: WindowInfo[]) {
        windows = Array.isArray(list) ? list : [];
        for (const slot of Object.keys(saved.slots)) titles[slot] = titleOf(saved.slots[slot]);
        applyTitles();
        applyMenus();
        Editor.Message.send(PKG, 'windows-updated', windows);
    },

    queryWindows(): WindowInfo[] {
        return windows;
    },

    slotInfo(slot: string): SlotInfo {
        const windowId = saved.slots[slot] || null;
        return { windowId, state: windowId ? saved.states[windowId] ?? null : null, windows };
    },

    /** A panel picked a window (or null for the list). */
    assignSlot(slot: string, windowId: string | null) {
        return show(slot, windowId);
    },

    saveState(windowId: string, state: unknown) {
        if (!windowId) return;
        saved.states[windowId] = state;
        save();
    },

    /** The panel was closed: the slot is free (the window's state is kept). */
    releaseSlot(slot: string) {
        delete saved.slots[slot];
        delete titles[slot];
        save();
    },

    /** EditorWindow.close() */
    closeSlot(slot: string) {
        Editor.Panel.close(panelName(slot));
    },
};

export function load() {
    load_();
    applyTitles();
}

export function unload() {
    const menu = (Editor.Menu as any).__protected__;
    try {
        for (const m of menus) menu?.remove?.(m.path, { label: m.label });
        menu?.apply?.();
    } catch {
        // editor shutting down
    }
    menus = [];
}
