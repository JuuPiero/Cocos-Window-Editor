/**
 * Runs the whole loop in a browser: the project's demo windows, the real
 * runtime + WindowHost, and the real window panel, with stub ui-* elements,
 * a stub scene and a fake editor. Messages go through JSON like real IPC.
 *
 *   preview.html#interact   run the checks into #result
 *   preview.html#builder / #stats / #launcher   for screenshots
 */
import { Component, director, Node, Prefab, Vec3 } from 'cc';
import { EditorWindow, editorWindow, GUI } from '../../assets/EditorWindow';
import { WindowHost } from '../../source/host';
import { createWindowApp, WindowApp } from '../../source/panels/window/app';
import type { MenuItem, WindowBridge } from '../../source/panels/window/bridge';
import { LevelBuilderWindow } from '../../../../assets/editor-windows/LevelBuilderWindow';
import '../../../../assets/editor-windows/SceneStatsWindow';
import { defineStubs } from './ui-stubs';

defineStubs();

// ------------------------------------------------------------ fake scene

class UITransform extends Component {}
class Canvas extends Component {}
class Camera extends Component {}
class Sprite extends Component {}

const scene = new Node('Scene', 'scene');
director.scene = scene;
const canvas = scene.addChild(new Node('Canvas', 'canvas'));
canvas.addComponent(new UITransform());
canvas.addComponent(new Canvas());
const camera = scene.addChild(new Node('Main Camera', 'camera'));
camera.addComponent(new Camera());
const logo = canvas.addChild(new Node('Logo', 'logo'));
logo.addComponent(new UITransform());
logo.addComponent(new Sprite());
const enemy = new Prefab('Enemy', 'prefab-enemy');

function findNode(root: Node, uuid: string): Node | null {
    if (root.uuid === uuid) return root;
    for (const c of root.children) {
        const f = findNode(c, uuid);
        if (f) return f;
    }
    return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let nextNode = 1;
(globalThis as any).Editor = {
    Message: {
        async request(target: string, message: string, opts: any) {
            await sleep(3);
            if (target === 'scene' && message === 'create-node') {
                const n = new Node(opts.name, `spawned-${nextNode++}`);
                n.position = new Vec3(opts.position.x, opts.position.y, opts.position.z);
                findNode(scene, opts.parent)!.addChild(n);
                return n.uuid;
            }
            if (target === 'scene' && message === 'remove-node') {
                for (const uuid of opts.uuid) {
                    const n = findNode(scene, uuid);
                    n?.parent?.removeChild(n);
                }
                return true;
            }
            throw new Error(`unexpected ${target}:${message}`);
        },
    },
};

// ------------------------------------------------------------ fake editor

const errors: string[] = [];
const hostLogs: string[] = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
const err0 = console.error.bind(console);
console.error = (...a: any[]) => {
    errors.push(a.map(String).join(' '));
    err0(...a);
};

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
let app: WindowApp;
const main = { slots: {} as Record<string, string | null>, states: {} as Record<string, unknown> };
let selection: string[] = [];
let lastPopup: MenuItem[] = [];
let frames = 0;
const calls: string[] = [];

const host = new WindowHost({
    resolver: {
        node: (u) => findNode(scene, u),
        component: () => null,
        asset: async (u) => (u === enemy.uuid ? enemy : null),
    },
    repaint: () => app?.repaint(),
    close: (slot) => calls.push(`close ${slot}`),
    log: (...a) => hostLogs.push(a.map(String).join(' ')),
});

const SLOT = 'default';
const bridge: WindowBridge = {
    slot: SLOT,
    slotInfo: async () => clone({ windowId: main.slots[SLOT] ?? null, state: (main.slots[SLOT] && main.states[main.slots[SLOT]!]) ?? null, windows: host.list() }),
    listWindows: async () => clone(host.list()),
    open: async (id, state) => clone(await host.open(SLOT, id, clone(state))),
    frame: async (events, ctx) => {
        frames++;
        await sleep(2);
        return clone(await host.frame(SLOT, clone(events), clone(ctx)));
    },
    close: async () => clone(host.close(SLOT)),
    assign: (id) => {
        main.slots[SLOT] = id;
        app.reload();
    },
    openWindow: (id) => calls.push(`open ${id}`),
    saveState: (id, s) => {
        main.states[id] = clone(s);
    },
    release: () => undefined,
    closePanel: () => calls.push('close-panel'),
    selection: () => ({ nodes: selection.slice(), assets: [] }),
    popup: (items) => {
        lastPopup = items;
    },
};

// ----------------------------------------------------------------- checks

const results: string[] = [];
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
    if (!ok) failed++;
    results.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` -> ${detail}` : ''}`);
}
function report(text: string) {
    const out = document.createElement('div');
    out.id = 'result';
    out.textContent = text;
    document.body.appendChild(out);
}

const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const text = (el: Element | null | undefined) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const row = (label: string) => $$('ui-prop.ew-row').find((r) => r.querySelector('ui-label')?.getAttribute('value') === label);
const inner = (el: Element | null | undefined) => (el as any)?.shadowRoot?.querySelector('input,select,textarea') as HTMLInputElement;
const field = (label: string, tag = '.ew-input') => row(label)?.querySelector(tag) as HTMLElement | undefined;
const button = (label: string) => $$('ui-button.ew-button').find((b) => text(b) === label);
const until = async (fn: () => boolean, ms = 3000) => {
    for (let t = 0; t < ms && !fn(); t += 20) await sleep(20);
    await app.idle();
    await sleep(20);
};
function type(el: HTMLElement | undefined, value: string) {
    const i = inner(el);
    i.focus();
    i.value = value;
    i.dispatchEvent(new Event('input'));
    i.blur();
    i.dispatchEvent(new Event('change'));
}

async function interact() {
    await until(() => !!$('.ew-header'));
    check('opens the window', text($('.ew-header-title')) === 'Level Builder', text($('.ew-header-title')));
    check('title control', text($('.ew-title-text')) === 'Level Builder');
    check('object fields', (field('Prefab') as any)?.tagName === 'UI-ASSET' && field('Prefab')!.getAttribute('droppable') === 'cc.Prefab' && field('Parent')!.tagName === 'UI-NODE');
    check('help boxes', $$('.ew-help').length === 2);
    check('buttons disabled until ready', button('Spawn 9')!.hasAttribute('disabled'));

    type(field('Prefab'), enemy.uuid);
    await until(() => $$('.ew-help').length === 1);
    check('asset picked', $$('.ew-help').length === 1 && (field('Prefab') as any).value === enemy.uuid);

    check('Use Selected Node needs a selection', button('Use Selected Node')!.hasAttribute('disabled'));
    selection = ['canvas'];
    app.notify('selection');
    await until(() => !button('Use Selected Node')!.hasAttribute('disabled'));
    button('Use Selected Node')!.click();
    await until(() => $$('.ew-help').length === 0);
    check('parent from selection', (field('Parent') as any).value === 'canvas' && !button('Spawn 9')!.hasAttribute('disabled'));

    const tool = (label: string) => $$('.ew-toolbar-item').find((t) => text(t) === label)!;
    tool('Circle').click();
    await until(() => !!row('Radius'));
    check('toolbar switches fields', !!row('Radius') && !row('Spacing') && !row('Columns'));
    tool('Line').click();
    await until(() => !!row('Spacing'));

    type(field('Count'), '5');
    await until(() => !!button('Spawn 5'));
    check('slider', !!button('Spawn 5'));

    const naming = $$('.ew-foldout-header').find((h) => text(h) === 'Naming')!;
    check('foldout starts closed', !row('Prefix'));
    naming.click();
    await until(() => !!row('Prefix'));
    type(field('Prefix'), 'Enemy');
    await until(() => text(row('Example')?.querySelector('.ew-value')) === 'Enemy_0');
    check('text field + label field', text(row('Example')?.querySelector('.ew-value')) === 'Enemy_0');

    const axes = row('Offset')!.querySelectorAll('ui-num-input');
    type(axes[1] as HTMLElement, '50');
    await app.idle();

    button('Spawn 5')!.click();
    await until(() => !!$$('.ew-label').find((l) => text(l).startsWith('Spawned')), 4000);
    const kids = canvas.children.filter((c) => c.name.startsWith('Enemy_'));
    check('spawned with async repaints', kids.length === 5 && text($$('.ew-label').find((l) => text(l).startsWith('Spawned'))) === 'Spawned 5 × Enemy under Canvas.', `${kids.length}`);
    check('positions', kids.map((k) => `${k.position.x},${k.position.y}`).join(' ') === '-240,50 -120,50 0,50 120,50 240,50', kids.map((k) => `${k.position.x},${k.position.y}`).join(' '));

    const saved: any = main.states['Tools/Level Builder'];
    check('state saved', saved?.fields.count === 5 && saved.fields.namePrefix === 'Enemy' && saved.fields.prefab?.__asset === enemy.uuid && saved.fields.parent?.__node === 'canvas' && saved.fields.offset?.y === 50, JSON.stringify(saved?.fields));
    check('@nonSerialized not saved', saved && !('busy' in saved.fields) && !('status' in saved.fields) && !('progress' in saved.fields));
    check('foldout state saved', saved?.gui['/foldout:Naming'] === true);

    // Clear Children removes every child (the 5 spawned and Logo).
    button('Clear Children')!.click();
    await until(() => canvas.children.length === 0);
    check('clear', canvas.children.length === 0 && !!$$('.ew-label').find((l) => text(l) === 'Removed 6 node(s) from Canvas.'), $$('.ew-label').map(text).join('|'));

    // Scripts recompiled: a new class for the same window.
    @editorWindow('Tools/Level Builder')
    class LevelBuilderV2 extends LevelBuilderWindow {
        onGUI(gui: GUI) {
            gui.label('v2');
            super.onGUI(gui);
        }
    }
    void LevelBuilderV2;
    app.repaint();
    await until(() => text($('.ew-label')) === 'v2');
    check('hot reload keeps fields', text($('.ew-label')) === 'v2' && !!button('Spawn 5') && (field('Prefab') as any).value === enemy.uuid);

    // Header menu: switch window.
    ($('.ew-header-menu') as HTMLElement).click();
    check('header menu', lastPopup.map((i) => i.label || '-').join(',') === 'Reload Window,-,Level Builder,Scene Stats,-,Window List,Close', lastPopup.map((i) => i.label || '-').join(','));
    lastPopup.find((i) => i.label === 'Scene Stats')!.click!();
    await until(() => text($('.ew-header-title')) === 'Scene Stats');
    check('switch window', text($('.ew-header-title')) === 'Scene Stats' && text($('.ew-title-text')) === 'Canvas');
    check('selection tab', text(row('Children')?.querySelector('.ew-value')) === '0' && $$('.ew-foldout-header').some((h) => text(h) === 'Components (2)'));

    $$('.ew-tab').find((t) => text(t) === 'Scene')!.click();
    await until(() => !!row('Nodes'));
    check('scene tab', text(row('Nodes')?.querySelector('.ew-value')) === '2' && text(row('Component types')?.querySelector('.ew-value')) === '3');
    const list = () => $$('.ew-scroll .ew-horizontal').map((h) => text(h));
    check('scroll list', list().join('|') === 'UITransform1|Canvas1|Camera1', list().join('|'));
    type(field('Filter'), 'cam');
    await until(() => list().length === 1);
    check('filter', list().join('|') === 'Camera1', list().join('|'));
    const sel = field('Sort By') as any;
    check('enum popup', sel?.options?.join() === 'Count,Name', sel?.options?.join());

    const before = frames;
    await sleep(1300);
    check('autoRepaint', frames > before, `${frames} vs ${before}`);

    // The window list.
    bridge.assign(null);
    await until(() => !!$('.ew-launcher'));
    check('launcher', $$('.ew-launcher-name').map(text).join() === 'Level Builder,Scene Stats', $$('.ew-launcher-name').map(text).join());
    $$('.ew-launcher-item')[0].click();
    await until(() => text($('.ew-header-title')) === 'Level Builder');
    check('reopened with state', !!button('Spawn 5') && (field('Prefab') as any).value === enemy.uuid);

    // A window that throws.
    @editorWindow('Tools/Broken')
    class Broken extends EditorWindow {
        onGUI(gui: GUI) {
            gui.label('before');
            throw new Error('boom');
        }
    }
    void Broken;
    bridge.assign('Tools/Broken');
    await until(() => !!$('.ew-error'));
    check('errors are shown', text($('.ew-error')).startsWith('onGUI: boom') && text($('.ew-label')) === 'before' && hostLogs.length > 0);

    check('no errors', errors.length === 0, errors.join(' | '));
    report(`${results.join('\n')}\n\n${results.length - failed} passed, ${failed} failed`);
}

async function shot(mode: string) {
    if (mode === 'launcher') {
        main.slots[SLOT] = null;
    } else if (mode === 'stats') {
        main.slots[SLOT] = 'Tools/Scene Stats';
        selection = ['canvas'];
        main.states['Tools/Scene Stats'] = { fields: {}, gui: { '/tabs:Selection|Scene': 1 } };
    } else {
        main.slots[SLOT] = 'Tools/Level Builder';
        selection = ['canvas'];
        main.states['Tools/Level Builder'] = {
            fields: { prefab: { __asset: enemy.uuid }, parent: { __node: 'canvas' }, count: 12, layout: 1, columns: 4, offset: { __t: 'Vec3', x: 0, y: 40, z: 0 } },
            gui: { '/foldout:Naming': true },
        };
    }
    app = createWindowApp(document.getElementById('app')!, bridge);
    await until(() => !!$('.ew-header') || !!$('.ew-launcher-item'));
    await sleep(100);
    document.body.classList.add('ready');
}

const mode = location.hash.slice(1) || 'builder';
if (mode === 'interact') {
    main.slots[SLOT] = 'Tools/Level Builder';
    app = createWindowApp(document.getElementById('app')!, bridge);
    interact().catch((e) => report(`CRASH ${e?.stack || e}\n${results.join('\n')}`));
} else {
    shot(mode);
}
