/** Where a window's menu item goes ("Tools/Level Builder" -> menu "Tools", item "Level Builder"). */
export interface MenuSpot {
    path: string;
    label: string;
}

/** Unity menu names -> Cocos main menus. */
const TOP_MENUS: Record<string, string> = {
    window: 'i18n:menu.panel',
    panel: 'i18n:menu.panel',
    extension: 'i18n:menu.extension',
    extensions: 'i18n:menu.extension',
    developer: 'i18n:menu.develop',
    help: 'i18n:menu.help',
};

export const DEFAULT_MENU = 'i18n:menu.extension/Editor Windows';

export function menuSpot(menu: string, title: string): MenuSpot {
    const parts = (menu || '').split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return { path: DEFAULT_MENU, label: parts[0] || title };
    const label = parts.pop()!;
    const top = TOP_MENUS[parts[0].toLowerCase()];
    if (top) parts[0] = top;
    return { path: parts.join('/'), label };
}
