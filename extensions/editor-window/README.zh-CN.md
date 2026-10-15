# editor-window

在项目中用 TypeScript 编写 Unity 风格的编辑器窗口（`EditorWindow` + 类似 `OnGUI` 的即时模式 GUI）。

```ts
import { EditorWindow, editorWindow, GUI } from 'db://editor-window/EditorWindow';

@editorWindow('Tools/My Window')
export class MyWindow extends EditorWindow {
    count = 1;
    onGUI(gui: GUI) {
        this.count = gui.intField('Count', this.count);
        if (gui.button('Hello')) console.log('Hello', this.count);
    }
}
```

完整说明见 [README.md](README.md)（英文）。
