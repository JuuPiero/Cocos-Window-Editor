/** What a window panel needs from the editor (a fake one runs the browser preview). */
import type { FrameContext, FrameResult, HostEvent, SlotInfo, WindowInfo } from './types';

export interface MenuItem {
    label?: string;
    type?: 'normal' | 'separator' | 'checkbox';
    checked?: boolean;
    enabled?: boolean;
    click?: () => void;
}

export interface WindowBridge {
    readonly slot: string;
    /** Which window this panel shows, its saved state, and all windows. */
    slotInfo(): Promise<SlotInfo>;
    /** Registered windows, straight from the scene process. */
    listWindows(): Promise<WindowInfo[]>;
    open(windowId: string, state: unknown): Promise<{ ok: boolean; error?: string }>;
    frame(events: HostEvent[], context: FrameContext): Promise<FrameResult>;
    /** Closes the window instance; returns its state. */
    close(): Promise<unknown>;
    /** Show another window (or the list, null) in this panel. */
    assign(windowId: string | null): void;
    /** Open a window in its own panel. */
    openWindow(windowId: string): void;
    saveState(windowId: string, state: unknown): void;
    /** The panel closed. */
    release(): void;
    closePanel(): void;
    selection(): FrameContext;
    popup(items: MenuItem[]): void;
}
