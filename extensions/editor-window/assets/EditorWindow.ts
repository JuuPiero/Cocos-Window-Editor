import { Asset, Color, Component, js, Node, Quat, Rect, Size, Vec2, Vec3, Vec4 } from 'cc';
import { EDITOR } from 'cc/env';

/**
 * Unity-style editor windows for Cocos Creator.
 *
 * ```ts
 * import { _decorator, Prefab } from 'cc';
 * import { EditorWindow, editorWindow, GUI } from 'db://editor-window/EditorWindow';
 *
 * @editorWindow('Tools/Level Builder')
 * export class LevelBuilder extends EditorWindow {
 *     count = 5;
 *     prefab: Prefab | null = null;
 *
 *     onGUI(gui: GUI) {
 *         this.count = gui.intSlider('Count', this.count, 1, 50);
 *         this.prefab = gui.objectField('Prefab', this.prefab, Prefab);
 *         if (gui.button('Spawn')) this.spawn();
 *     }
 * }
 * ```
 *
 * onGUI runs in the editor's scene process, so windows can use `cc` (the open
 * scene) and `Editor.Message` (asset-db, ...). It is immediate mode, like
 * Unity's OnGUI: each call describes the whole window; a field returns the
 * new value when the user changed it, a button returns true when clicked.
 */

// ------------------------------------------------------------- wire types

/** One control or layout group, as sent to the window panel. */
export interface GuiControl {
    k: string;
    id: string;
    disabled?: boolean;
    children?: GuiControl[];
    [prop: string]: any;
}

/** User input sent back by the window panel. */
export interface GuiEvent {
    id: string;
    type: 'change' | 'click' | 'toggle';
    value?: any;
    /** objectField changes: what the uuid in `value` is. */
    object?: 'node' | 'component' | 'asset';
    /** Filled in by the host: the object an objectField uuid stands for. */
    resolved?: unknown;
}

export interface WindowOptions {
    /** Menu path, e.g. "Tools/Level Builder" ("Window/..." goes to the Panel menu). Also the window's id. */
    menu?: string;
    /** Tab title (defaults to the last menu segment). */
    title?: string;
    /** Repaint every n milliseconds while the window is visible (like Unity's OnInspectorUpdate). */
    autoRepaint?: number;
}

export interface WindowInfo {
    id: string;
    menu: string;
    title: string;
}

type Ctor<T> = abstract new (...args: any[]) => T;

// ---------------------------------------------------------------- windows

export abstract class EditorWindow {
    /** Title of the window (tab and header). */
    title = '';

    /** @internal Set by the window host. */
    __host?: { repaint(): void; close(): void };

    /** Draws the window. Called after every input and repaint. */
    abstract onGUI(gui: GUI): void;

    /** The window was opened, or re-created after scripts were recompiled. */
    onEnable?(): void;
    /** The window is closing, or about to be re-created. */
    onDisable?(): void;
    /** The node or asset selection changed (Selection is up to date). */
    onSelectionChange?(): void;
    /** Something in the open scene changed. */
    onHierarchyChange?(): void;
    /** Assets changed. */
    onProjectChange?(): void;

    /** Redraw soon (e.g. after async work). */
    repaint() {
        this.__host?.repaint();
    }

    /** Close this window's panel. */
    close() {
        this.__host?.close();
    }
}

const NON_SERIALIZED = '__ewNonSerialized';

/** The field isn't saved (across script reloads and editor restarts), like Unity's [NonSerialized]. */
export function nonSerialized(target: object, key: string) {
    const ctor = (target as any).constructor;
    if (!Object.prototype.hasOwnProperty.call(ctor, NON_SERIALIZED)) ctor[NON_SERIALIZED] = new Set<string>();
    ctor[NON_SERIALIZED].add(key);
}

function isNonSerialized(win: object, key: string): boolean {
    for (let c = (win as any).constructor; c && c !== Object; c = Object.getPrototypeOf(c)) {
        if (Object.prototype.hasOwnProperty.call(c, NON_SERIALIZED) && c[NON_SERIALIZED].has(key)) return true;
    }
    return false;
}

/**
 * Editor.Message.request, usable from window code (project scripts have no
 * editor typings), e.g. `request('scene', 'create-node', { parent, assetUuid })`.
 */
export function request<T = any>(target: string, message: string, ...args: unknown[]): Promise<T> {
    const editor = (globalThis as any).Editor;
    if (!editor?.Message) return Promise.reject(new Error('Editor messages are only available in the editor.'));
    return editor.Message.request(target, message, ...args);
}

/** What is selected in the editor, updated before each onGUI. */
export const Selection = {
    /** Selected nodes in the open scene (last selected last). */
    nodes: [] as Node[],
    /** Uuids of selected assets. */
    assetUuids: [] as string[],
    get activeNode(): Node | null {
        return this.nodes.length ? this.nodes[this.nodes.length - 1] : null;
    },
};

interface Entry {
    id: string;
    ctor: new () => EditorWindow;
    options: WindowOptions;
}

/** Shared with the extension's scene script (which hosts the windows). */
export interface Registry {
    version: number;
    windows: Map<string, Entry>;
    api: {
        GUI: typeof GUI;
        snapshot: typeof snapshot;
        restore: typeof restore;
        Selection: typeof Selection;
    };
}

const REGISTRY = '__editorWindowRegistry';

function registry(): Registry {
    const g = globalThis as any;
    if (!g[REGISTRY]) g[REGISTRY] = { version: 0, windows: new Map() };
    return g[REGISTRY];
}

export function windowTitle(id: string, options: WindowOptions): string {
    if (options.title) return options.title;
    const parts = (options.menu || id).split('/');
    return parts[parts.length - 1];
}

/** Registers an EditorWindow. `@editorWindow('Tools/My Window')` or `@editorWindow({ menu, title, autoRepaint })`. */
export function editorWindow(menuOrOptions: string | WindowOptions = {}) {
    return <T extends new () => EditorWindow>(ctor: T): T => {
        if (!EDITOR) return ctor;
        const options = typeof menuOrOptions === 'string' ? { menu: menuOrOptions } : { ...menuOrOptions };
        const id = options.menu || ctor.name;
        const r = registry();
        r.windows.set(id, { id, ctor, options });
        r.version++;
        return ctor;
    };
}

/** All registered windows. */
export function listWindows(): WindowInfo[] {
    return [...registry().windows.values()].map((e) => ({ id: e.id, menu: e.options.menu || '', title: windowTitle(e.id, e.options) }));
}

// -------------------------------------------------------------------- GUI

export type ButtonColor = 'blue' | 'red' | 'green';
export type HelpType = 'none' | 'info' | 'warning' | 'error';

export interface ControlOptions {
    /** Stable id, when the same control can appear at different positions. */
    id?: string;
    tooltip?: string;
    disabled?: boolean;
}

interface Scope {
    id: string;
    children: GuiControl[];
    counts: Map<string, number>;
    disabled: boolean;
}

/** Per-window GUI state kept between frames (foldouts, tabs). */
export type GuiState = Record<string, any>;

function enumEntries(e: any): { name: string; value: number | string }[] {
    if (Array.isArray(e?.__enums__)) return e.__enums__.map((x: any) => ({ name: x.name, value: x.value }));
    return Object.keys(e || {})
        .filter((k) => isNaN(Number(k)) && !k.startsWith('__'))
        .map((k) => ({ name: k, value: e[k] }));
}

function clamp(v: number, min?: number, max?: number): number {
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
}

function toNumber(v: unknown, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Builds the controls of one onGUI call and hands out the user's input.
 * Controls are identified by position (kind + label + occurrence in their
 * group), like Unity's control ids; pass `{ id }` when that isn't stable.
 */
export class GUI {
    /** The controls built by this onGUI call. */
    readonly root: GuiControl[] = [];
    /** True when this pass consumed user input. */
    used = false;
    private stack: Scope[];

    /** @internal */
    constructor(private events: GuiEvent[] = [], private state: GuiState = {}) {
        this.stack = [{ id: '', children: this.root, counts: new Map(), disabled: false }];
    }

    private get top(): Scope {
        return this.stack[this.stack.length - 1];
    }

    private nextId(kind: string, label: string | undefined, explicit?: string): string {
        const scope = this.top;
        if (explicit) return `${scope.id}/${explicit}`;
        const key = `${kind}:${label ?? ''}`;
        const n = scope.counts.get(key) ?? 0;
        scope.counts.set(key, n + 1);
        return `${scope.id}/${key}${n ? `#${n}` : ''}`;
    }

    private add(ctl: GuiControl, opts?: ControlOptions): GuiControl {
        if (this.top.disabled || opts?.disabled) ctl.disabled = true;
        if (opts?.tooltip) ctl.tooltip = opts.tooltip;
        this.top.children.push(ctl);
        return ctl;
    }

    private take(id: string, type: GuiEvent['type']): GuiEvent | undefined {
        const i = this.events.findIndex((e) => e.id === id && e.type === type);
        if (i < 0) return undefined;
        this.used = true;
        return this.events.splice(i, 1)[0];
    }

    private group(kind: string, id: string, props: Record<string, any>, body: (() => void) | null, opts?: ControlOptions): GuiControl {
        const ctl = this.add({ k: kind, id, ...props, children: [] }, opts);
        if (body) {
            this.stack.push({ id, children: ctl.children!, counts: new Map(), disabled: this.top.disabled || !!opts?.disabled });
            try {
                body();
            } finally {
                this.stack.pop();
            }
        }
        return ctl;
    }

    /** A field: returns the changed value, or the current one. */
    private field<T>(kind: string, label: string, value: T, props: Record<string, any>, opts: ControlOptions | undefined, convert: (v: any) => T): T {
        const id = this.nextId(kind, label, opts?.id);
        const e = this.take(id, 'change');
        const next = e ? convert(e.value) : value;
        this.add({ k: kind, id, label, value: next, ...props }, opts);
        return next;
    }

    // ------------------------------------------------------------- text

    label(text: string, opts: ControlOptions & { bold?: boolean; italic?: boolean; size?: number; color?: string; align?: 'left' | 'center' | 'right'; wrap?: boolean } = {}) {
        const { id, tooltip, disabled, ...style } = opts;
        this.add({ k: 'label', id: this.nextId('label', text, id), text: String(text), ...style }, { tooltip, disabled });
    }

    /** A bold heading with a line under it. */
    title(text: string, subtitle?: string) {
        this.add({ k: 'title', id: this.nextId('title', text), text, subtitle });
    }

    /** A read-only value in a labelled row. */
    labelField(label: string, value: unknown, opts?: ControlOptions) {
        this.add({ k: 'labelField', id: this.nextId('labelField', label, opts?.id), label, text: String(value ?? '') }, opts);
    }

    helpBox(message: string, type: HelpType = 'info') {
        this.add({ k: 'help', id: this.nextId('help', message), text: message, type });
    }

    // ----------------------------------------------------------- layout

    space(pixels = 8) {
        this.add({ k: 'space', id: this.nextId('space', ''), size: pixels });
    }

    separator() {
        this.add({ k: 'separator', id: this.nextId('separator', '') });
    }

    /** Pushes the following controls of a horizontal group to the right. */
    flexibleSpace() {
        this.add({ k: 'flex', id: this.nextId('flex', '') });
    }

    horizontal(body: () => void, opts?: ControlOptions) {
        this.group('horizontal', this.nextId('horizontal', '', opts?.id), {}, body, opts);
    }

    vertical(body: () => void, opts?: ControlOptions) {
        this.group('vertical', this.nextId('vertical', '', opts?.id), {}, body, opts);
    }

    /** A framed box, with an optional header. */
    box(title: string | null, body: () => void, opts?: ControlOptions) {
        this.group('box', this.nextId('box', title ?? '', opts?.id), { title }, body, opts);
    }

    indent(body: () => void) {
        this.group('indent', this.nextId('indent', ''), {}, body);
    }

    /** Controls in `body` are read-only when `disabled` is true. */
    disabled(disabled: boolean, body: () => void) {
        this.group('vertical', this.nextId('disabled', ''), {}, body, { disabled });
    }

    /** A collapsible section; `body` runs only while it is open. Returns whether it is open. */
    foldout(label: string, body: () => void, opts: ControlOptions & { open?: boolean } = {}): boolean {
        const id = this.nextId('foldout', label, opts.id);
        if (this.take(id, 'toggle')) this.state[id] = !(this.state[id] ?? opts.open ?? true);
        const open = this.state[id] ?? opts.open ?? true;
        this.group('foldout', id, { label, open }, open ? body : null, opts);
        return open;
    }

    /** A scrolling area (`height` in pixels; fills the window when omitted). */
    scroll(body: () => void, opts: ControlOptions & { height?: number } = {}) {
        this.group('scroll', this.nextId('scroll', '', opts.id), { height: opts.height }, body, opts);
    }

    /** Tabs; `body` draws the selected one. Returns the selected index. */
    tabs(labels: string[], body: (index: number) => void, opts: ControlOptions = {}): number {
        const id = this.nextId('tabs', labels.join('|'), opts.id);
        const e = this.take(id, 'change');
        if (e) this.state[id] = clamp(Math.round(toNumber(e.value, 0)), 0, labels.length - 1);
        const index = clamp(this.state[id] ?? 0, 0, Math.max(0, labels.length - 1));
        this.group('tabs', id, { labels, index }, () => body(index), opts);
        return index;
    }

    // ---------------------------------------------------------- buttons

    /** Returns true when clicked. */
    button(label: string, opts: ControlOptions & { color?: ButtonColor; height?: number; width?: number } = {}): boolean {
        const id = this.nextId('button', label, opts.id);
        const clicked = !!this.take(id, 'click');
        this.add({ k: 'button', id, label, color: opts.color, height: opts.height, width: opts.width }, opts);
        return clicked;
    }

    /** A row of toggle buttons (Unity's Toolbar). Returns the selected index. */
    toolbar(index: number, labels: string[], opts?: ControlOptions): number {
        return this.field('toolbar', labels.join('|'), index, { labels }, opts, (v) => clamp(Math.round(toNumber(v, index)), 0, labels.length - 1));
    }

    // ----------------------------------------------------------- fields

    toggle(label: string, value: boolean, opts?: ControlOptions): boolean {
        return this.field('toggle', label, !!value, {}, opts, (v) => !!v);
    }

    textField(label: string, value: string, opts: ControlOptions & { placeholder?: string } = {}): string {
        return this.field('text', label, value ?? '', { placeholder: opts.placeholder }, opts, (v) => String(v ?? ''));
    }

    textArea(label: string, value: string, opts: ControlOptions & { rows?: number } = {}): string {
        return this.field('textarea', label, value ?? '', { rows: opts.rows ?? 3 }, opts, (v) => String(v ?? ''));
    }

    intField(label: string, value: number, opts: ControlOptions & { min?: number; max?: number } = {}): number {
        return this.field('number', label, Math.round(value), { min: opts.min, max: opts.max, step: 1, int: true }, opts, (v) => clamp(Math.round(toNumber(v, value)), opts.min, opts.max));
    }

    floatField(label: string, value: number, opts: ControlOptions & { min?: number; max?: number; step?: number } = {}): number {
        return this.field('number', label, value, { min: opts.min, max: opts.max, step: opts.step ?? 0.1 }, opts, (v) => clamp(toNumber(v, value), opts.min, opts.max));
    }

    slider(label: string, value: number, min: number, max: number, opts: ControlOptions & { step?: number } = {}): number {
        return this.field('slider', label, clamp(value, min, max), { min, max, step: opts.step ?? (max - min) / 100 }, opts, (v) => clamp(toNumber(v, value), min, max));
    }

    intSlider(label: string, value: number, min: number, max: number, opts?: ControlOptions): number {
        return this.field('slider', label, clamp(Math.round(value), min, max), { min, max, step: 1, int: true }, opts, (v) => clamp(Math.round(toNumber(v, value)), min, max));
    }

    /** Pick one of `options` by index. */
    popup(label: string, index: number, options: string[], opts?: ControlOptions): number {
        const items = options.map((name, i) => ({ name, value: i }));
        return this.field('popup', label, index, { items }, opts, (v) => clamp(Math.round(toNumber(v, index)), 0, options.length - 1));
    }

    /** Pick a value of a TypeScript enum or cc.Enum. */
    enumPopup<T extends number | string>(label: string, value: T, enumType: object, opts?: ControlOptions): T {
        const items = enumEntries(enumType);
        return this.field('popup', label, value, { items }, opts, (v) => {
            const hit = items.find((x) => String(x.value) === String(v));
            return (hit ? hit.value : value) as T;
        });
    }

    colorField(label: string, value: Color, opts?: ControlOptions): Color {
        const c = value || new Color();
        const id = this.nextId('color', label, opts?.id);
        const e = this.take(id, 'change');
        let next = c;
        if (e) {
            const v = e.value;
            const [r, g, b, a] = Array.isArray(v) ? v : [v?.r, v?.g, v?.b, v?.a];
            next = new Color(toNumber(r, c.r), toNumber(g, c.g), toNumber(b, c.b), toNumber(a, c.a));
        }
        this.add({ k: 'color', id, label, value: [next.r, next.g, next.b, next.a] }, opts);
        return next;
    }

    private vectorField<T>(kind: string, label: string, axes: string[], value: any, make: (v: Record<string, number>) => T, opts?: ControlOptions): T {
        const id = this.nextId(kind, label, opts?.id);
        const e = this.take(id, 'change');
        const cur: Record<string, number> = {};
        for (const a of axes) cur[a] = toNumber(value?.[a], 0);
        if (e && e.value && typeof e.value === 'object') for (const a of axes) if (a in e.value) cur[a] = toNumber(e.value[a], cur[a]);
        this.add({ k: 'vector', id, label, axes, value: cur }, opts);
        return e ? make(cur) : value;
    }

    vector2Field(label: string, value: Vec2, opts?: ControlOptions): Vec2 {
        return this.vectorField('vec2', label, ['x', 'y'], value, (v) => new Vec2(v.x, v.y), opts);
    }

    vector3Field(label: string, value: Vec3, opts?: ControlOptions): Vec3 {
        return this.vectorField('vec3', label, ['x', 'y', 'z'], value, (v) => new Vec3(v.x, v.y, v.z), opts);
    }

    vector4Field(label: string, value: Vec4, opts?: ControlOptions): Vec4 {
        return this.vectorField('vec4', label, ['x', 'y', 'z', 'w'], value, (v) => new Vec4(v.x, v.y, v.z, v.w), opts);
    }

    /**
     * A node, component or asset field; drag from the Hierarchy / Assets panel
     * or use the picker. `type` is Node, a component class or an asset class.
     */
    objectField<T extends object>(label: string, value: T | null, type: Ctor<T>, opts?: ControlOptions): T | null {
        const id = this.nextId('object', label, opts?.id);
        const e = this.take(id, 'change');
        const next = e ? ((e.resolved as T) ?? null) : value;
        const proto = (type as any)?.prototype;
        const kind = type === (Node as any) || proto instanceof Node ? 'node' : proto instanceof Component ? 'component' : 'asset';
        const typeName = js.getClassName(type) || (kind === 'node' ? 'cc.Node' : 'cc.Asset');
        this.add({ k: 'object', id, label, kind, type: typeName, value: uuidOf(next) }, opts);
        return next;
    }

    /** A progress bar, `value` from 0 to 1. */
    progressBar(value: number, text?: string, opts?: ControlOptions) {
        this.add({ k: 'progress', id: this.nextId('progress', text, opts?.id), value: clamp(toNumber(value, 0), 0, 1), text }, opts);
    }
}

function uuidOf(v: any): string {
    if (!v) return '';
    if (v instanceof Node) return v.uuid;
    if (v instanceof Component) return v.uuid;
    if (v instanceof Asset) return v.uuid;
    return '';
}

// ----------------------------------------------------- state persistence

/** Turns a window's fields into JSON (kept across script reloads and editor restarts). */
export function snapshot(win: EditorWindow, gui: GuiState): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const key of Object.keys(win)) {
        if (key.startsWith('__') || key === 'title' || isNonSerialized(win, key)) continue;
        const v = (win as any)[key];
        if (typeof v === 'function') continue;
        const enc = encode(v, 0);
        if (enc !== SKIP) fields[key] = enc;
    }
    return { fields, gui: { ...gui } };
}

const SKIP = Symbol('skip');

function encode(v: any, depth: number): any {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v === undefined || typeof v !== 'object' || depth > 8) return SKIP;
    if (v instanceof Vec2) return { __t: 'Vec2', x: v.x, y: v.y };
    if (v instanceof Vec3) return { __t: 'Vec3', x: v.x, y: v.y, z: v.z };
    if (v instanceof Vec4) return { __t: 'Vec4', x: v.x, y: v.y, z: v.z, w: v.w };
    if (v instanceof Quat) return { __t: 'Quat', x: v.x, y: v.y, z: v.z, w: v.w };
    if (v instanceof Size) return { __t: 'Size', width: v.width, height: v.height };
    if (v instanceof Rect) return { __t: 'Rect', x: v.x, y: v.y, width: v.width, height: v.height };
    if (v instanceof Color) return { __t: 'Color', r: v.r, g: v.g, b: v.b, a: v.a };
    if (v instanceof Node) return v.isValid ? { __node: v.uuid } : null;
    if (v instanceof Component) return v.isValid ? { __comp: v.uuid } : null;
    if (v instanceof Asset) return { __asset: v.uuid };
    if (Array.isArray(v)) return v.map((x) => encode(x, depth + 1)).map((x) => (x === SKIP ? null : x));
    if (v instanceof Map) return { __map: [...v].map(([k, x]) => [encode(k, depth + 1), encode(x, depth + 1)]).filter(([k, x]) => k !== SKIP && x !== SKIP) };
    if (v instanceof Set) return { __set: [...v].map((x) => encode(x, depth + 1)).filter((x) => x !== SKIP) };
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return SKIP; // class instances keep their constructor value
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) {
        const x = encode(v[k], depth + 1);
        if (x !== SKIP) out[k] = x;
    }
    return out;
}

export interface Resolver {
    node(uuid: string): Node | null;
    component(uuid: string): Component | null;
    asset(uuid: string): Promise<Asset | null>;
}

async function decode(v: any, r: Resolver): Promise<any> {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return Promise.all(v.map((x) => decode(x, r)));
    switch (v.__t) {
        case 'Vec2':
            return new Vec2(v.x, v.y);
        case 'Vec3':
            return new Vec3(v.x, v.y, v.z);
        case 'Vec4':
            return new Vec4(v.x, v.y, v.z, v.w);
        case 'Quat':
            return new Quat(v.x, v.y, v.z, v.w);
        case 'Size':
            return new Size(v.width, v.height);
        case 'Rect':
            return new Rect(v.x, v.y, v.width, v.height);
        case 'Color':
            return new Color(v.r, v.g, v.b, v.a);
    }
    if ('__node' in v) return r.node(v.__node);
    if ('__comp' in v) return r.component(v.__comp);
    if ('__asset' in v) return r.asset(v.__asset);
    if ('__map' in v) return new Map(await Promise.all(v.__map.map(async ([k, x]: any) => [await decode(k, r), await decode(x, r)] as [any, any])));
    if ('__set' in v) return new Set(await Promise.all(v.__set.map((x: any) => decode(x, r))));
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) out[k] = await decode(v[k], r);
    return out;
}

/** Puts saved fields back on a new window instance. Returns the saved GUI state. */
export async function restore(win: EditorWindow, saved: any, r: Resolver): Promise<GuiState> {
    const fields = saved?.fields || {};
    for (const key of Object.keys(fields)) {
        if (!(key in win)) continue; // the field was removed from the class
        try {
            (win as any)[key] = await decode(fields[key], r);
        } catch {
            // keep the constructor's value
        }
    }
    return { ...(saved?.gui || {}) };
}

if (EDITOR) {
    // Scripts were (re)loaded: the windows register again as their modules run
    // (after this one, which they import); removed ones drop out.
    const r = registry();
    r.windows.clear();
    r.version++;
    r.api = { GUI, snapshot, restore, Selection };
}
