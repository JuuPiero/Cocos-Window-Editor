import assert from 'assert';
import { Color, Node, Prefab, Vec2, Vec3 } from 'cc';
import { GUI, GuiControl, nonSerialized, restore, snapshot, EditorWindow, Resolver } from '../assets/EditorWindow';
import { menuSpot } from '../source/menus';
import { section, test } from './harness';

const ids = (list: GuiControl[]): string[] => list.flatMap((c) => [c.id, ...ids(c.children || [])]);

section('GUI: ids and events');

test('controls get ids from kind, label and position', () => {
    const gui = new GUI();
    gui.button('Go');
    gui.button('Go');
    gui.horizontal(() => {
        gui.button('Go');
        gui.intField('Count', 1);
    });
    gui.button('Other', { id: 'mine' });
    assert.deepStrictEqual(ids(gui.root), ['/button:Go', '/button:Go#1', '/horizontal:', '/horizontal:/button:Go', '/horizontal:/number:Count', '/mine']);
});

test('fields return the user value once; buttons report clicks', () => {
    const events = [
        { id: '/number:Count', type: 'change' as const, value: '7.6' },
        { id: '/button:Go', type: 'click' as const },
    ];
    const gui = new GUI(events);
    assert.strictEqual(gui.intField('Count', 1), 8);
    assert.strictEqual(gui.button('Go'), true);
    assert.strictEqual(gui.used, true);
    assert.strictEqual(events.length, 0);
    const again = new GUI([]);
    assert.strictEqual(again.intField('Count', 8), 8);
    assert.strictEqual(again.button('Go'), false);
    assert.strictEqual(again.used, false);
});

test('conversions and limits', () => {
    const ev = (id: string, value: unknown) => ({ id, type: 'change' as const, value });
    const gui = new GUI([
        ev('/number:I', 500), ev('/number:F', '0.25'), ev('/slider:S', 5), ev('/slider:IS', 3.7),
        ev('/toggle:T', 1), ev('/text:N', 42), ev('/popup:P', '2'), ev('/toolbar:A|B', 1),
    ]);
    assert.strictEqual(gui.intField('I', 1, { max: 100 }), 100);
    assert.strictEqual(gui.floatField('F', 0), 0.25);
    assert.strictEqual(gui.slider('S', 0, 0, 1), 1);
    assert.strictEqual(gui.intSlider('IS', 0, 0, 10), 4);
    assert.strictEqual(gui.toggle('T', false), true);
    assert.strictEqual(gui.textField('N', ''), '42');
    assert.strictEqual(gui.popup('P', 0, ['a', 'b', 'c']), 2);
    assert.strictEqual(gui.toolbar(0, ['A', 'B']), 1);
});

test('enums: numeric and string', () => {
    enum Mode { Easy, Hard = 5 }
    enum Kind { A = 'alpha', B = 'beta' }
    const gui = new GUI([{ id: '/popup:Mode', type: 'change', value: '5' }, { id: '/popup:Kind', type: 'change', value: 'beta' }]);
    assert.strictEqual(gui.enumPopup('Mode', Mode.Easy, Mode), Mode.Hard);
    assert.strictEqual(gui.enumPopup('Kind', Kind.A, Kind), Kind.B);
    assert.deepStrictEqual(gui.root[0].items, [{ name: 'Easy', value: 0 }, { name: 'Hard', value: 5 }]);
});

test('foldouts and tabs keep their state', () => {
    const state: Record<string, any> = {};
    let ran = 0;
    const g1 = new GUI([], state);
    assert.strictEqual(g1.foldout('More', () => ran++), true);
    const g2 = new GUI([{ id: '/foldout:More', type: 'toggle' }], state);
    assert.strictEqual(g2.foldout('More', () => ran++), false);
    assert.strictEqual(ran, 1);
    assert.strictEqual(g2.root[0].children!.length, 0);
    assert.strictEqual(new GUI([], {}).foldout('Closed', () => ran++, { open: false }), false);

    let shown = -1;
    new GUI([{ id: '/tabs:A|B|C', type: 'change', value: 2 }], state).tabs(['A', 'B', 'C'], (i) => (shown = i));
    assert.strictEqual(shown, 2);
    new GUI([], state).tabs(['A', 'B', 'C'], (i) => (shown = i));
    assert.strictEqual(shown, 2);
});

test('disabled scopes', () => {
    const gui = new GUI();
    gui.disabled(true, () => {
        gui.button('X');
        gui.horizontal(() => gui.toggle('Y', false));
    });
    gui.button('Z');
    const [scope, z] = gui.root;
    assert.ok(scope.children![0].disabled && scope.children![1].children![0].disabled);
    assert.ok(!z.disabled);
});

test('colors, vectors, objects, progress', () => {
    const node = new Node('Player', 'n1');
    const prefab = new Prefab('Enemy', 'p1');
    const gui = new GUI([
        { id: '/color:C', type: 'change', value: [10, 20, 30, 40] },
        { id: '/vec3:V', type: 'change', value: { y: 9 } },
        { id: '/object:Target', type: 'change', value: 'n1', object: 'node', resolved: node },
    ]);
    const c = gui.colorField('C', new Color());
    assert.deepStrictEqual([c.r, c.g, c.b, c.a], [10, 20, 30, 40]);
    const v = gui.vector3Field('V', new Vec3(1, 2, 3));
    assert.deepStrictEqual([v.x, v.y, v.z], [1, 9, 3]);
    assert.strictEqual(gui.objectField('Target', null, Node), node);
    assert.strictEqual(gui.objectField('Prefab', prefab, Prefab), prefab);
    gui.progressBar(1.5, 'Loading');
    const [, , target, pf, progress] = gui.root;
    assert.deepStrictEqual([target.kind, target.type, target.value], ['node', 'cc.Node', 'n1']);
    assert.deepStrictEqual([pf.kind, pf.type, pf.value], ['asset', 'cc.Prefab', 'p1']);
    assert.strictEqual(progress.value, 1);
    const same = new Vec2(1, 2);
    assert.strictEqual(new GUI().vector2Field('Same', same), same);
});

section('state');

class Saved extends EditorWindow {
    count = 3;
    name = 'x';
    pos = new Vec3(1, 2, 3);
    tint = new Color(1, 2, 3, 4);
    tags = new Set(['a']);
    scores = new Map<string, number>([['bob', 2]]);
    data = { list: [1, 2], nested: { ok: true } };
    target: Node | null = null;
    prefab: Prefab | null = null;
    helper = new (class Helper { v = 1; })();
    onGUI() {}
}

test('fields survive a snapshot / restore', async () => {
    const a = new Saved();
    a.count = 9;
    a.pos = new Vec3(4, 5, 6);
    a.tags.add('b');
    a.scores.set('amy', 7);
    a.target = new Node('T', 'node-1');
    a.prefab = new Prefab('P', 'asset-1');
    a.helper.v = 99;
    const snap = JSON.parse(JSON.stringify(snapshot(a, { '/foldout:X': false })));
    const nodes: Record<string, Node> = { 'node-1': a.target };
    const resolver: Resolver = { node: (u) => nodes[u] || null, component: () => null, asset: async (u) => (u === 'asset-1' ? a.prefab : null) };
    const b = new Saved();
    const gui = await restore(b, snap, resolver);
    assert.deepStrictEqual(gui, { '/foldout:X': false });
    assert.strictEqual(b.count, 9);
    assert.ok(b.pos instanceof Vec3 && b.pos.z === 6);
    assert.ok(b.tint instanceof Color && b.tint.a === 4);
    assert.deepStrictEqual([...b.tags], ['a', 'b']);
    assert.deepStrictEqual([...b.scores], [['bob', 2], ['amy', 7]]);
    assert.deepStrictEqual(b.data, { list: [1, 2], nested: { ok: true } });
    assert.strictEqual(b.target, a.target);
    assert.strictEqual(b.prefab, a.prefab);
    assert.strictEqual(b.helper.v, 1, 'class instances keep their constructor value');
    assert.ok(!('title' in snap.fields) && !('__host' in snap.fields));
});

test('@nonSerialized fields are not saved (inherited too)', () => {
    class Base extends EditorWindow {
        @nonSerialized busy = false;
        keep = 1;
        onGUI() {}
    }
    class Child extends Base {
        @nonSerialized progress = 0;
    }
    assert.deepStrictEqual(Object.keys(snapshot(new Child(), {}).fields), ['keep']);
});

test('removed fields are ignored', async () => {
    const b = new Saved();
    await restore(b, { fields: { gone: 1, count: 4 } }, { node: () => null, component: () => null, asset: async () => null });
    assert.strictEqual(b.count, 4);
    assert.ok(!('gone' in b));
});

section('menus');

test('menu paths', () => {
    assert.deepStrictEqual(menuSpot('Tools/Level Builder', 'x'), { path: 'Tools', label: 'Level Builder' });
    assert.deepStrictEqual(menuSpot('Window/Debug/Stats', 'x'), { path: 'i18n:menu.panel/Debug', label: 'Stats' });
    assert.deepStrictEqual(menuSpot('Extension/My Tool', 'x'), { path: 'i18n:menu.extension', label: 'My Tool' });
    assert.deepStrictEqual(menuSpot('', 'Lonely'), { path: 'i18n:menu.extension/Editor Windows', label: 'Lonely' });
});
