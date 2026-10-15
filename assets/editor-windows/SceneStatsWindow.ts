import { Color, director, js, Node } from 'cc';
import { EditorWindow, editorWindow, GUI, Selection } from 'db://editor-window/EditorWindow';

enum Sort {
    Count,
    Name,
}

/** Tools → Scene Stats: the selected node, and what the open scene is made of. Refreshes every second. */
@editorWindow({ menu: 'Tools/Scene Stats', autoRepaint: 1000 })
export class SceneStatsWindow extends EditorWindow {
    filter = '';
    sort = Sort.Count;
    onlyActive = false;
    highlight = new Color(255, 200, 0, 255);

    onGUI(gui: GUI) {
        gui.tabs(['Selection', 'Scene'], (tab) => (tab === 0 ? this.selectionTab(gui) : this.sceneTab(gui)));
    }

    private selectionTab(gui: GUI) {
        const node = Selection.activeNode;
        if (!node) {
            gui.helpBox('Select a node in the Hierarchy.', 'info');
            return;
        }
        gui.title(node.name, pathOf(node));
        gui.labelField('Active', node.activeInHierarchy ? 'Yes' : 'No (in hierarchy)');
        gui.labelField('Children', node.children.length);
        gui.disabled(true, () => {
            gui.vector3Field('Position', node.position);
            gui.vector3Field('Scale', node.scale);
        });
        gui.foldout(`Components (${node.components.length})`, () => {
            for (const comp of node.components) gui.label(js.getClassName(comp), { color: comp.enabled ? undefined : '#888' });
        });
        if (Selection.nodes.length > 1) gui.helpBox(`${Selection.nodes.length} nodes selected; showing the last one.`, 'none');
    }

    private sceneTab(gui: GUI) {
        const scene = director.getScene();
        if (!scene) {
            gui.helpBox('No scene is open.', 'warning');
            return;
        }
        let nodes = 0;
        const byType = new Map<string, number>();
        const walk = (n: Node) => {
            if (this.onlyActive && !n.activeInHierarchy) return;
            nodes++;
            for (const c of n.components) {
                const name = js.getClassName(c);
                byType.set(name, (byType.get(name) || 0) + 1);
            }
            n.children.forEach(walk);
        };
        scene.children.forEach(walk);

        gui.labelField('Nodes', nodes);
        gui.labelField('Component types', byType.size);
        this.onlyActive = gui.toggle('Only Active Nodes', this.onlyActive);
        this.filter = gui.textField('Filter', this.filter, { placeholder: 'Component type' });
        this.sort = gui.enumPopup('Sort By', this.sort, Sort);
        this.highlight = gui.colorField('Highlight', this.highlight);

        const f = this.filter.trim().toLowerCase();
        const rows = [...byType].filter(([name]) => !f || name.toLowerCase().includes(f));
        rows.sort((a, b) => (this.sort === Sort.Count ? b[1] - a[1] : a[0].localeCompare(b[0])));
        const max = rows.reduce((m, r) => Math.max(m, r[1]), 0);
        const hex = `#${[this.highlight.r, this.highlight.g, this.highlight.b].map((v) => `0${v.toString(16)}`.slice(-2)).join('')}`;
        gui.scroll(() => {
            if (!rows.length) gui.label('Nothing matches.', { italic: true });
            for (const [name, n] of rows) {
                gui.horizontal(() => {
                    gui.label(name, { color: n === max ? hex : undefined, bold: n === max });
                    gui.flexibleSpace();
                    gui.label(String(n));
                });
            }
        }, { height: 220 });
    }
}

function pathOf(node: Node): string {
    const names: string[] = [];
    for (let n: Node | null = node; n && n.parent; n = n.parent) names.unshift(n.name);
    return names.join('/');
}
