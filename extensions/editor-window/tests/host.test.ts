import assert from 'assert';
import { Node, Prefab } from 'cc';
import { EditorWindow, editorWindow, GUI, Selection } from '../assets/EditorWindow';
import { WindowHost } from '../source/host';
import { section, test } from './harness';

const scene = new Node('Scene', 'scene');
const player = scene.addChild(new Node('Player', 'player'));
const enemy = new Prefab('Enemy', 'enemy-prefab');
const repaints: string[] = [];
const closes: string[] = [];
const logs: unknown[][] = [];
const host = new WindowHost({
    resolver: {
        node: (u) => (u === 'player' ? player : null),
        component: () => null,
        asset: async (u) => (u === 'enemy-prefab' ? enemy : null),
    },
    repaint: (s) => repaints.push(s),
    close: (s) => closes.push(s),
    log: (...a) => logs.push(a),
});

const calls: string[] = [];

@editorWindow({ menu: 'Tools/Counter', autoRepaint: 500 })
class Counter extends EditorWindow {
    title = 'My Counter';
    count = 0;
    prefab: Prefab | null = null;
    selected = '';
    onEnable() {
        calls.push('enable');
    }
    onDisable() {
        calls.push('disable');
    }
    onSelectionChange() {
        this.selected = Selection.activeNode?.name || '';
    }
    onGUI(gui: GUI) {
        gui.label(`Count: ${this.count}`);
        if (gui.button('Add')) this.count++;
        this.prefab = gui.objectField('Prefab', this.prefab, Prefab);
        if (this.count > 99) throw new Error('too many');
    }
}

@editorWindow('Plain')
class Plain extends EditorWindow {
    onGUI(gui: GUI) {
        gui.label('plain');
    }
}

const labelOf = (tree: any[]) => tree[0].text;

section('host');

test('lists windows', () => {
    assert.deepStrictEqual(host.list(), [
        { id: 'Plain', menu: 'Plain', title: 'Plain' },
        { id: 'Tools/Counter', menu: 'Tools/Counter', title: 'Counter' },
    ]);
    void Plain;
});

test('unknown windows and empty slots', async () => {
    assert.deepStrictEqual(await host.open('s1', 'Nope'), { ok: false, error: 'There is no window "Nope".' });
    assert.deepStrictEqual(await host.frame('s1'), { missing: true });
});

test('opens, draws, and redraws after input', async () => {
    assert.deepStrictEqual(await host.open('s1', 'Tools/Counter'), { ok: true });
    assert.deepStrictEqual(calls, ['enable']);
    const first = await host.frame('s1');
    assert.strictEqual(first.title, 'My Counter');
    assert.strictEqual(first.autoRepaint, 500);
    assert.strictEqual(labelOf(first.tree!), 'Count: 0');
    assert.ok(first.state, 'the first frame reports the state');
    // The label is drawn before the button: the second pass shows the new count.
    const clicked = await host.frame('s1', [{ id: '/button:Add', type: 'click' }]);
    assert.strictEqual(labelOf(clicked.tree!), 'Count: 1');
    assert.strictEqual(clicked.state.fields.count, 1);
    const idle = await host.frame('s1');
    assert.strictEqual(idle.state, undefined, 'unchanged state is not sent again');
});

test('object fields resolve assets', async () => {
    const r = await host.frame('s1', [{ id: '/object:Prefab', type: 'change', value: 'enemy-prefab', object: 'asset' }]);
    assert.strictEqual(r.tree![2].value, 'enemy-prefab');
    assert.deepStrictEqual(r.state.fields.prefab, { __asset: 'enemy-prefab' });
});

test('selection', async () => {
    const r = await host.frame('s1', [{ type: 'selection' }], { nodes: ['missing', 'player'], assets: ['a1'] });
    assert.deepStrictEqual(Selection.nodes, [player]);
    assert.deepStrictEqual(Selection.assetUuids, ['a1']);
    assert.strictEqual(r.state.fields.selected, 'Player');
});

test('errors in onGUI are reported with what was drawn', async () => {
    const win = (host as any).instances.get('s1').win as Counter;
    win.count = 100;
    const r = await host.frame('s1');
    assert.strictEqual(r.error, 'onGUI: too many');
    assert.strictEqual(r.tree!.length, 3);
    assert.strictEqual(logs.length, 1);
    win.count = 1;
});

test('repaint and close requests', () => {
    const win = (host as any).instances.get('s1').win as Counter;
    win.repaint();
    win.close();
    assert.deepStrictEqual([repaints, closes], [['s1'], ['s1']]);
});

test('recompiled scripts: the window is re-created with its fields', async () => {
    calls.length = 0;
    const reg = (globalThis as any).__editorWindowRegistry;
    @editorWindow({ menu: 'Tools/Counter' })
    class Counter2 extends EditorWindow {
        count = 0;
        prefab: Prefab | null = null;
        extra = 'new field';
        onEnable() {
            calls.push('enable2');
        }
        onGUI(gui: GUI) {
            gui.label(`v2 ${this.count} ${this.prefab?.name}`);
        }
    }
    assert.strictEqual(reg.windows.get('Tools/Counter').ctor, Counter2);
    const r = await host.frame('s1');
    assert.deepStrictEqual(calls, ['disable', 'enable2']);
    assert.strictEqual(labelOf(r.tree!), 'v2 1 Enemy');
    assert.strictEqual(r.title, 'Counter');
});

test('a removed window', async () => {
    const reg = (globalThis as any).__editorWindowRegistry;
    const entry = reg.windows.get('Tools/Counter');
    reg.windows.delete('Tools/Counter');
    const r = await host.frame('s1');
    assert.ok(r.error!.includes('no longer registered'));
    reg.windows.set('Tools/Counter', entry);
});

test('close returns the state', async () => {
    calls.length = 0;
    const saved: any = host.close('s1');
    assert.strictEqual(saved.fields.count, 1);
    assert.deepStrictEqual(await host.frame('s1'), { missing: true });
    assert.deepStrictEqual(await host.open('s1', 'Tools/Counter', saved), { ok: true });
    const r = await host.frame('s1');
    assert.strictEqual(labelOf(r.tree!), 'v2 1 Enemy');
    void Counter;
});
