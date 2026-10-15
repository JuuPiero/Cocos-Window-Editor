/** Shared by the main process and the panels. */
export interface WindowInfo {
    id: string;
    menu: string;
    title: string;
}

export interface SlotInfo {
    windowId: string | null;
    state: unknown;
    windows: WindowInfo[];
}

/** Panel slots declared in package.json ("default" opens as "editor-window"). */
export const SLOTS = ['default', 'window-2', 'window-3', 'window-4'];

export function panelName(slot: string): string {
    return slot === 'default' ? 'editor-window' : `editor-window.${slot}`;
}

/** i18n key part of a slot's title ("slot_default", "slot_window_2"). */
export function slotKey(slot: string): string {
    return slot.replace(/-/g, '_');
}
