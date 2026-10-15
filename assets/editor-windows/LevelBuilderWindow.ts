import { Node, Prefab, Vec3 } from 'cc';
import { EditorWindow, editorWindow, GUI, nonSerialized, request, Selection } from 'db://editor-window/EditorWindow';

enum Layout {
    Line,
    Grid,
    Circle,
}

/** Tools → Level Builder: spawns copies of a prefab in the open scene (undoable). */
@editorWindow('Tools/Level Builder')
export class LevelBuilderWindow extends EditorWindow {
    prefab: Prefab | null = null;
    parent: Node | null = null;
    layout = Layout.Grid;
    count = 9;
    spacing = 120;
    columns = 3;
    radius = 200;
    offset = new Vec3();
    namePrefix = 'Item';

    @nonSerialized busy = false;
    @nonSerialized progress = 0;
    @nonSerialized status = '';

    onGUI(gui: GUI) {
        gui.title('Level Builder', 'Spawns copies of a prefab in the open scene');
        this.prefab = gui.objectField('Prefab', this.prefab, Prefab);
        this.parent = gui.objectField('Parent', this.parent, Node);
        gui.horizontal(() => {
            gui.flexibleSpace();
            if (gui.button('Use Selected Node', { width: 140, disabled: !Selection.activeNode })) this.parent = Selection.activeNode;
        });

        gui.space(6);
        this.layout = gui.toolbar(this.layout, ['Line', 'Grid', 'Circle']);
        this.count = gui.intSlider('Count', this.count, 1, 100);
        if (this.layout === Layout.Circle) this.radius = gui.floatField('Radius', this.radius, { min: 0, step: 10 });
        else this.spacing = gui.floatField('Spacing', this.spacing, { min: 0, step: 10 });
        if (this.layout === Layout.Grid) this.columns = gui.intSlider('Columns', this.columns, 1, 20);
        this.offset = gui.vector3Field('Offset', this.offset);

        gui.foldout('Naming', () => {
            this.namePrefix = gui.textField('Prefix', this.namePrefix);
            gui.labelField('Example', `${this.namePrefix}_0`);
        }, { open: false });

        if (!this.prefab) gui.helpBox('Pick a prefab to spawn (drag one from the Assets panel).', 'warning');
        if (!this.parent) gui.helpBox('Pick a parent node, or select one in the Hierarchy and press Use Selected Node.', 'info');

        gui.space(8);
        gui.disabled(!this.prefab || !this.parent || this.busy, () => {
            gui.horizontal(() => {
                if (gui.button(`Spawn ${this.count}`, { color: 'blue', height: 28 })) this.spawn();
                if (gui.button('Clear Children', { color: 'red', height: 28 })) this.clear();
            });
        });
        if (this.busy) gui.progressBar(this.progress, `Spawning… ${Math.round(this.progress * 100)}%`);
        if (this.status) gui.label(this.status, { italic: true, wrap: true });
    }

    private positions(): Vec3[] {
        const out: Vec3[] = [];
        const o = this.offset;
        for (let i = 0; i < this.count; i++) {
            if (this.layout === Layout.Line) {
                out.push(new Vec3((i - (this.count - 1) / 2) * this.spacing + o.x, o.y, o.z));
            } else if (this.layout === Layout.Grid) {
                const rows = Math.ceil(this.count / this.columns);
                const col = i % this.columns;
                const row = Math.floor(i / this.columns);
                out.push(new Vec3((col - (this.columns - 1) / 2) * this.spacing + o.x, ((rows - 1) / 2 - row) * this.spacing + o.y, o.z));
            } else {
                const a = (i / this.count) * Math.PI * 2;
                out.push(new Vec3(Math.cos(a) * this.radius + o.x, Math.sin(a) * this.radius + o.y, o.z));
            }
        }
        return out;
    }

    private async spawn() {
        const prefab = this.prefab;
        const parent = this.parent;
        if (!prefab || !parent) return;
        this.busy = true;
        this.progress = 0;
        this.status = '';
        const points = this.positions();
        try {
            for (let i = 0; i < points.length; i++) {
                // Through the scene's own message: shows up in the Hierarchy and can be undone.
                await request('scene', 'create-node', {
                    parent: parent.uuid,
                    assetUuid: prefab.uuid,
                    name: `${this.namePrefix}_${i}`,
                    position: { x: points[i].x, y: points[i].y, z: points[i].z },
                });
                this.progress = (i + 1) / points.length;
                this.repaint();
            }
            this.status = `Spawned ${points.length} × ${prefab.name} under ${parent.name}.`;
        } catch (e) {
            this.status = `Spawning failed: ${(e as Error)?.message || e}`;
        } finally {
            this.busy = false;
            this.repaint();
        }
    }

    private async clear() {
        const parent = this.parent;
        if (!parent) return;
        const uuids = parent.children.map((c) => c.uuid);
        if (uuids.length) await request('scene', 'remove-node', { uuid: uuids });
        this.status = `Removed ${uuids.length} node(s) from ${parent.name}.`;
        this.repaint();
    }
}
