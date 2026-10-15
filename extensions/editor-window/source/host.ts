/**
 * Hosts EditorWindow instances in the scene process, one per window panel
 * slot. The classes and the GUI come from the project's runtime module
 * (assets/EditorWindow.ts) through a registry on globalThis, so a script
 * reload hands over new classes: the window is re-created and its saved
 * fields put back (like Unity's domain reload).
 */
import type { GuiControl, GuiEvent, GuiState, Registry, Resolver, WindowInfo } from '../assets/EditorWindow';

export type HostEvent = GuiEvent | { type: 'selection' | 'hierarchy' | 'project'; id?: string };

export interface FrameContext {
    /** Selected node uuids (last = active). */
    nodes?: string[];
    /** Selected asset uuids. */
    assets?: string[];
}

export interface FrameResult {
    /** No window in this slot (the scene process restarted): open it again. */
    missing?: boolean;
    title?: string;
    tree?: GuiControl[];
    error?: string;
    /** The window's saved state, when it changed. */
    state?: any;
    autoRepaint?: number;
}

export interface HostEnv {
    resolver: Resolver;
    repaint(slot: string): void;
    close(slot: string): void;
    log(...args: unknown[]): void;
}

interface Instance {
    windowId: string;
    ctor: unknown;
    win: any;
    gui: GuiState;
    json: string;
}

export const NO_RUNTIME = 'No script imports the EditorWindow runtime yet. Create a window with @editorWindow (import from "db://editor-window/EditorWindow").';

export function registry(): Registry | undefined {
    const r = (globalThis as any).__editorWindowRegistry as Registry | undefined;
    return r && r.api ? r : undefined;
}

function titleOf(id: string, options: { menu?: string; title?: string }): string {
    if (options.title) return options.title;
    const parts = (options.menu || id).split('/');
    return parts[parts.length - 1];
}

export class WindowHost {
    private instances = new Map<string, Instance>();

    constructor(private env: HostEnv) {}

    list(): WindowInfo[] {
        const r = registry();
        if (!r) return [];
        return [...r.windows.values()].map((e) => ({ id: e.id, menu: e.options.menu || '', title: titleOf(e.id, e.options) })).sort((a, b) => a.id.localeCompare(b.id));
    }

    has(slot: string): boolean {
        return this.instances.has(slot);
    }

    /** Shows window `windowId` in `slot`, restoring `saved` state. */
    async open(slot: string, windowId: string, saved?: unknown): Promise<{ ok: boolean; error?: string }> {
        const r = registry();
        if (!r) return { ok: false, error: NO_RUNTIME };
        const entry = r.windows.get(windowId);
        if (!entry) return { ok: false, error: `There is no window "${windowId}".` };
        const cur = this.instances.get(slot);
        if (cur && cur.windowId === windowId && cur.ctor === entry.ctor) return { ok: true };
        if (cur) this.close(slot);
        await this.create(slot, r, windowId, saved);
        return { ok: true };
    }

    private async create(slot: string, r: Registry, windowId: string, saved: unknown): Promise<Instance> {
        const entry = r.windows.get(windowId)!;
        const win = new entry.ctor() as any;
        win.__host = { repaint: () => this.env.repaint(slot), close: () => this.env.close(slot) };
        let gui: GuiState = {};
        if (saved) {
            try {
                gui = await r.api.restore(win, saved, this.env.resolver);
            } catch (e) {
                this.env.log(`[Editor Window] Could not restore ${windowId}:`, e);
            }
        }
        const inst: Instance = { windowId, ctor: entry.ctor, win, gui, json: '' };
        this.instances.set(slot, inst);
        this.call(inst, 'onEnable');
        return inst;
    }

    private call(inst: Instance, method: string): string | undefined {
        const fn = inst.win[method];
        if (typeof fn !== 'function') return undefined;
        try {
            fn.call(inst.win);
        } catch (e) {
            this.env.log(`[Editor Window] ${inst.windowId}.${method}():`, e);
            return `${method}: ${(e as Error)?.message || e}`;
        }
        return undefined;
    }

    private async resolveObject(e: GuiEvent): Promise<unknown> {
        const uuid = typeof e.value === 'string' ? e.value : '';
        if (!uuid) return null;
        const r = this.env.resolver;
        if (e.object === 'node') return r.node(uuid);
        if (e.object === 'component') return r.component(uuid);
        return r.asset(uuid);
    }

    /** Applies input and draws the window. */
    async frame(slot: string, events: HostEvent[] = [], context: FrameContext = {}): Promise<FrameResult> {
        const r = registry();
        if (!r) return { error: NO_RUNTIME, tree: [] };
        let inst = this.instances.get(slot);
        if (!inst) return { missing: true };
        const entry = r.windows.get(inst.windowId);
        if (!entry) {
            return { title: titleOf(inst.windowId, {}), tree: [], error: `The window "${inst.windowId}" is no longer registered. Was its @editorWindow removed?` };
        }
        if (entry.ctor !== inst.ctor) {
            // Scripts were recompiled: re-create the window from the new class.
            const saved = r.api.snapshot(inst.win, inst.gui);
            this.call(inst, 'onDisable');
            this.instances.delete(slot);
            inst = await this.create(slot, r, inst.windowId, saved);
        }

        const sel = r.api.Selection;
        sel.nodes = (context.nodes || []).map((u) => this.env.resolver.node(u)).filter((n): n is NonNullable<typeof n> => !!n);
        sel.assetUuids = [...(context.assets || [])];

        const input: GuiEvent[] = [];
        const errors: string[] = [];
        for (const e of events) {
            if (e.type === 'selection' || e.type === 'hierarchy' || e.type === 'project') {
                const method = e.type === 'selection' ? 'onSelectionChange' : e.type === 'hierarchy' ? 'onHierarchyChange' : 'onProjectChange';
                const err = this.call(inst, method);
                if (err) errors.push(err);
                continue;
            }
            const ev = { ...e } as GuiEvent;
            if (ev.type === 'change' && ev.object) ev.resolved = await this.resolveObject(ev);
            input.push(ev);
        }

        let gui = new r.api.GUI(input, inst.gui);
        let error = this.draw(inst, gui);
        if (gui.used) {
            // Input may have changed what was drawn before it: draw again (Unity's Repaint).
            gui = new r.api.GUI([], inst.gui);
            error = this.draw(inst, gui);
        }
        if (error) errors.push(error);

        let state: unknown;
        try {
            const snap = r.api.snapshot(inst.win, inst.gui);
            const json = JSON.stringify(snap);
            if (json !== inst.json) {
                inst.json = json;
                state = snap;
            }
        } catch (e) {
            this.env.log('[Editor Window] Could not save the window state:', e);
        }

        return {
            title: inst.win.title || titleOf(entry.id, entry.options),
            tree: gui.root,
            error: errors.length ? errors.join('\n') : undefined,
            state,
            autoRepaint: entry.options.autoRepaint,
        };
    }

    private draw(inst: Instance, gui: { root: GuiControl[] }): string | undefined {
        try {
            inst.win.onGUI(gui);
        } catch (e) {
            this.env.log(`[Editor Window] ${inst.windowId}.onGUI():`, e);
            return `onGUI: ${(e as Error)?.message || e}`;
        }
        return undefined;
    }

    /** Closes the window in `slot`; returns its state to keep. */
    close(slot: string): unknown {
        const inst = this.instances.get(slot);
        if (!inst) return null;
        let saved: unknown = null;
        try {
            saved = registry()?.api.snapshot(inst.win, inst.gui) ?? null;
        } catch {
            saved = null;
        }
        this.call(inst, 'onDisable');
        this.instances.delete(slot);
        return saved;
    }
}
