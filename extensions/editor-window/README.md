# editor-window

Unity-style **editor windows** for Cocos Creator 3.8. You write them as TypeScript classes in your project, with an immediate-mode GUI like Unity's `OnGUI`.

```ts
import { Node, Prefab } from 'cc';
import { EditorWindow, editorWindow, GUI } from 'db://editor-window/EditorWindow';

@editorWindow('Tools/Level Builder')
export class LevelBuilder extends EditorWindow {
    count = 5;
    prefab: Prefab | null = null;
    parent: Node | null = null;

    onGUI(gui: GUI) {
        this.count = gui.intSlider('Count', this.count, 1, 50);
        this.prefab = gui.objectField('Prefab', this.prefab, Prefab);
        this.parent = gui.objectField('Parent', this.parent, Node);
        if (gui.button('Spawn', { color: 'blue' })) this.spawn();
    }

    spawn() { /* ... */ }
}
```

The window shows up in the menu you give it, **Tools → Level Builder** here. It opens in a dockable panel.

## How it works

- `onGUI` runs in the editor's **scene process**, so a window can use `cc` directly (`director.getScene()`, nodes, components) and send editor messages.
- It is immediate mode. Each call describes the whole window: a field returns the new value when the user changed it, and a button returns `true` on the frame it was clicked. After any input, onGUI runs once more so everything shows the new state (Unity's Repaint).
- Window fields are saved. They come back when you reopen the window, when scripts recompile (the window is re-created from the new class), and after an editor restart.

## Opening windows

- Each window gets a menu item from its path: `'Tools/My Window'` → menu **Tools**, item **My Window**.
    - `Window/...` goes to the **Panel** menu, `Extension/...` to the **Extension** menu.
    - A path without a folder goes to **Extension → Editor Windows**.
- **Panel → Editor Windows** lists every window.
- Up to **4 windows** can be open at the same time, each in its own dockable panel. A window that is already open is focused instead of opened again.
- The **⋮** button in a window's header can reload the window, switch the panel to another window, show the list, or close it.

The menu items and the panel tab titles use internal editor APIs. If an editor version doesn't support them, use **Panel → Editor Windows**, and the tabs read "Editor Window".

## EditorWindow

| Member | |
|---|---|
| `onGUI(gui)` | Draws the window. Required. |
| `onEnable()` / `onDisable()` | Opened (or re-created after a script reload) / closing. |
| `onSelectionChange()` | The node or asset selection changed. |
| `onHierarchyChange()` | The open scene changed. |
| `onProjectChange()` | Assets changed. |
| `repaint()` | Redraw soon, e.g. after async work. |
| `close()` | Close the window's panel. |
| `title` | Text in the window header. |

Options: `@editorWindow({ menu: 'Tools/Stats', title: 'Stats', autoRepaint: 500 })`. `autoRepaint` redraws every n ms while the window is visible, like Unity's `OnInspectorUpdate`.

Other exports:
- **`Selection`**: `Selection.activeNode`, `Selection.nodes`, `Selection.assetUuids`. They are up to date in every onGUI.
- **`request(target, message, ...args)`**: `Editor.Message.request`. Project scripts have no editor typings, so use this instead.
- **`@nonSerialized`**: the field is not saved, like `[NonSerialized]`. Use it for temporary state such as progress or status text.

Saved field types: numbers, strings, booleans, arrays, plain objects, `Map`, `Set`, `Vec2/3/4`, `Quat`, `Size`, `Rect`, `Color`, and nodes, components and assets (kept by uuid). Other class instances keep their constructor value.

## GUI

| | |
|---|---|
| Text | `label(text, { bold, italic, size, color, align, wrap })`, `title(text, subtitle?)`, `labelField(label, value)`, `helpBox(message, 'info' \| 'warning' \| 'error' \| 'none')` |
| Buttons | `button(label, { color: 'blue' \| 'red' \| 'green', height, width })` → `true` when clicked; `toolbar(index, labels)` → selected index |
| Fields | `textField`, `textArea`, `intField`, `floatField`, `slider`, `intSlider`, `toggle`, `popup(label, index, options)`, `enumPopup(label, value, Enum)`, `colorField`, `vector2Field`, `vector3Field`, `vector4Field` |
| Objects | `objectField(label, value, Type)` with `Node`, a component class or an asset class. Drag from the Hierarchy / Assets panel, or use the picker. |
| Layout | `horizontal(body)`, `vertical(body)`, `box(title, body)`, `indent(body)`, `space(px)`, `separator()`, `flexibleSpace()` |
| Groups | `foldout(label, body, { open })`, `tabs(labels, (i) => ...)`, `scroll(body, { height })`, `disabled(condition, body)` |
| Other | `progressBar(value01, text?)` |

Every control also takes `{ id, tooltip, disabled }`.

Controls are identified by kind, label and position in their group, like Unity's control ids. If one control can appear at different positions, for example in a list that changes while the user types, give it a stable `{ id }`.

## Changing the scene

Changes made directly to nodes (`node.setPosition(...)`) aren't recorded for undo, and the editor isn't told about them. Use the scene's messages instead. They show up in the Hierarchy and Inspector and can be undone:

```ts
await request('scene', 'create-node', { parent: parent.uuid, assetUuid: prefab.uuid, name: 'Enemy' });
await request('scene', 'set-property', { uuid: node.uuid, path: 'position', dump: { type: 'cc.Vec3', value: { x: 0, y: 1, z: 0 } } });
await request('scene', 'remove-node', { uuid: [node.uuid] });
```

## Demo

The test project has two windows in `assets/editor-windows/`:
- **Tools → Level Builder** spawns a prefab in a line, grid or circle, with progress and undo.
- **Tools → Scene Stats** shows the selected node and what the scene is made of. It refreshes every second.

## Development

```bash
npm install
npm run build      # type-check + bundle to dist/
npm test           # GUI, state and window host tests
npm run preview    # tests/preview/out/preview.html: the demo windows and the panel in a browser
```

After a build, reload `editor-window` in **Extension → Extension Manager**.
