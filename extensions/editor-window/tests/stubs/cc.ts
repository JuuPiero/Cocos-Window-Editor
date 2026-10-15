/** Just enough of 'cc' to run the EditorWindow runtime outside the editor. */
export class Node {
    isValid = true;
    activeInHierarchy = true;
    children: Node[] = [];
    components: Component[] = [];
    parent: Node | null = null;
    position = new Vec3();
    scale = new Vec3(1, 1, 1);
    constructor(public name = 'Node', public uuid = `node-${Math.random().toString(36).slice(2)}`) {}
    addChild(child: Node) {
        child.parent = this;
        this.children.push(child);
        return child;
    }
    removeChild(child: Node) {
        this.children = this.children.filter((c) => c !== child);
        child.parent = null;
    }
    addComponent<T extends Component>(comp: T): T {
        comp.node = this;
        this.components.push(comp);
        return comp;
    }
}

export class Component {
    isValid = true;
    enabled = true;
    node: Node | null = null;
    uuid = `comp-${Math.random().toString(36).slice(2)}`;
}

export const director = {
    scene: null as Node | null,
    getScene() {
        return this.scene;
    },
};

export class Asset {
    isValid = true;
    constructor(public name = 'asset', public uuid = 'asset-uuid') {}
}

export class Prefab extends Asset {}
export class SpriteFrame extends Asset {}

export class Vec2 {
    constructor(public x = 0, public y = 0) {}
}

export class Vec3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
}

export class Vec4 {
    constructor(public x = 0, public y = 0, public z = 0, public w = 0) {}
}

export class Quat {
    constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
}

export class Size {
    constructor(public width = 0, public height = 0) {}
}

export class Rect {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
}

export class Color {
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
}

const names = new Map<any, string>([[Node, 'cc.Node'], [Component, 'cc.Component'], [Asset, 'cc.Asset'], [Prefab, 'cc.Prefab'], [SpriteFrame, 'cc.SpriteFrame']]);

export const js = {
    getClassName(obj: any): string {
        const ctor = typeof obj === 'function' ? obj : obj?.constructor;
        return names.get(ctor) || ctor?.name || '';
    },
};

export function Enum<T>(e: T): T {
    return e;
}

export const _decorator = {
    ccclass: (_name: string) => (ctor: any) => ctor,
    property: (..._args: any[]) => (_target: any, _key: string) => undefined,
};
