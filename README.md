# show-item

GNOME shell extension providing a D-Bus method to show a file in Nautilus on the current
workspace.

The standard `org.freedesktop.FileManager1.ShowItems` D-Bus method, which text editors and
other applications use to show a file in the file manager, opens the file's folder in a
new tab of the most recently active Nautilus window if no window has the folder open. That
window may be on a different workspace. Applications cannot do better than this on
Wayland, because they cannot list windows, determine which workspace a window is on, or
focus other applications' windows.

This extension provides a `ShowItem` method that does the following:

* If a Nautilus window on the current workspace has the file's folder open in any tab,
  focus that window, switch to that tab, and select the file. If there are several such
  windows, use the most recently used one.
* Otherwise, open a new Nautilus window on the current workspace showing the file's
  folder, focus it, and select the file.

It never opens a new tab.

## Usage

Call the method with the absolute path of the file:

```bash
gdbus call --session \
    --dest org.gnome.shell.extensions.showitem \
    --object-path /org/gnome/shell/extensions/showitem \
    --method org.gnome.shell.extensions.showitem.ShowItem \
    /path/to/file
```

or with `dbus-send`:

```bash
dbus-send --session --type=method_call \
    --dest=org.gnome.shell.extensions.showitem \
    /org/gnome/shell/extensions/showitem \
    org.gnome.shell.extensions.showitem.ShowItem \
    string:/path/to/file
```

The method returns immediately, before Nautilus has shown the file.

## Install

I haven't applied to have this extension on `extensions.gnome.org`. If you want to use
it, you can install from git like so:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
cd ~/.local/share/gnome-shell/extensions
git clone https://github.com/chrisjbillington/gnome-shell-extension-show-item show-item\@chrisjbillington.github.com/
```
Then enable from the GNOME extensions app. You may need to log out and in again before
GNOME extensions recognises it.

If you don't have the gnome extensions app, you'll need to install it, e.g. for
Debian-based distros:

```bash
sudo apt install gnome-shell-extensions
```

Intended for GNOME shell versions 49–51, but only tested with GNOME shell and Nautilus 51.
