import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call');

const SERVICE_NAME = 'org.gnome.shell.extensions.showitem';
const OBJECT_PATH = '/org/gnome/shell/extensions/showitem';
const INTERFACE_NAME = 'org.gnome.shell.extensions.showitem';

const INTERFACE_SCHEMA = `
<node>
    <interface name="${INTERFACE_NAME}">
        <method name="ShowItem">
            <arg type="s" direction="in" name="path"/>
        </method>
    </interface>
</node>
`;

const NAUTILUS_APP_ID = 'org.gnome.Nautilus';

// Delay between focusing a Nautilus window and calling ShowItems, so that Nautilus has
// updated its active window. ShowItems uses the active window if it contains the
// folder.
const ACTIVATION_DELAY_MS = 100;

const NEW_WINDOW_TIMEOUT_MS = 5000;

function delay(ms) {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

function dbusCall(busName, objectPath, interfaceName, method, parameters, replyType) {
    return Gio.DBus.session.call(
        busName, objectPath, interfaceName, method, parameters,
        replyType ? new GLib.VariantType(replyType) : null,
        Gio.DBusCallFlags.NONE, -1, null
    );
}

// Return an object mapping the D-Bus object path of each Nautilus window to the list of
// URIs open in its tabs.
async function getNautilusWindowLocations() {
    const reply = await dbusCall(
        'org.freedesktop.FileManager1',
        '/org/freedesktop/FileManager1',
        'org.freedesktop.DBus.Properties',
        'Get',
        new GLib.Variant('(ss)', ['org.freedesktop.FileManager1', 'OpenWindowsWithLocations']),
        '(v)'
    );
    return reply.recursiveUnpack()[0];
}

// Return the next Nautilus window to be shown, or null if none is shown within
// NEW_WINDOW_TIMEOUT_MS.
function nextNautilusWindow() {
    return new Promise(resolve => {
        const shownIds = new Map();
        const finish = result => {
            global.display.disconnect(createdId);
            for (const [window, id] of shownIds)
                window.disconnect(id);
            if (timeoutId)
                GLib.source_remove(timeoutId);
            resolve(result);
        };
        // A window's WM class is not set when it is created
        const createdId = global.display.connect('window-created', (display, window) => {
            shownIds.set(window, window.connect('shown', () => {
                if (window.get_wm_class() === NAUTILUS_APP_ID)
                    finish(window);
            }));
        });
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, NEW_WINDOW_TIMEOUT_MS, () => {
            timeoutId = 0;
            finish(null);
            return GLib.SOURCE_REMOVE;
        });
    });
}

async function showItem(path) {
    const file = Gio.File.new_for_path(path);
    const folderUri = file.get_parent().get_uri();

    const windowLocations = await getNautilusWindowLocations();
    const workspace = global.workspace_manager.get_active_workspace();
    // In most-recently-used order:
    let window = global.display.get_tab_list(Meta.TabList.NORMAL, workspace).find(w =>
        w.get_wm_class() === NAUTILUS_APP_ID &&
        windowLocations[w.get_gtk_window_object_path()]?.includes(folderUri)
    );

    if (!window) {
        const newWindow = nextNautilusWindow();
        await dbusCall(
            'org.gnome.Nautilus',
            '/org/gnome/Nautilus',
            'org.gtk.Application',
            'Open',
            new GLib.Variant('(assa{sv})', [[folderUri], 'new-window', {}])
        );
        window = await newWindow;
        if (!window)
            return;
    }

    Main.activateWindow(window);
    await delay(ACTIVATION_DELAY_MS);
    await dbusCall(
        'org.freedesktop.FileManager1',
        '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1',
        'ShowItems',
        new GLib.Variant('(ass)', [[file.get_uri()], ''])
    );
}

export default class ShowItemExtension extends Extension {
    enable() {
        this._interface = Gio.DBusExportedObject.wrapJSObject(INTERFACE_SCHEMA, {
            ShowItem: path => {
                showItem(path).catch(e => console.error(`${this.uuid}: ${e}`));
            },
        });
        this._interface.export(Gio.DBus.session, OBJECT_PATH);
        this._nameId = Gio.DBus.session.own_name(
            SERVICE_NAME, Gio.BusNameOwnerFlags.NONE, null, null
        );
    }

    disable() {
        Gio.DBus.session.unown_name(this._nameId);
        this._interface.unexport();
        this._interface = null;
    }
}
