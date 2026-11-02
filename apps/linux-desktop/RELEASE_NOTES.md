Persistent for Linux 0.2.0 improves sign-in, KDE Wayland integration, and native language support.

- Sign in through a regular window with native controls and Settings access. Signing out restores the sign-in window without losing the hosted page.
- Fix blank content after logout and crashes caused by launchers closing their output pipes.
- Open the signed-in flyout near the tray on KDE Wayland, correct late compositor placement, and preserve manual dragging until the next opening.
- Native menus, settings, notifications, and update prompts follow the selected language. Download and installation remain separate approval steps in every language.
- Use the same hosted interface with more compact navigation tabs and improved shared-reminder editing.
- Updated Electron and build/runtime dependencies include security fixes.

Linux downloads are now AppImage only, for x86_64 (Intel/AMD) and ARM64. Existing AppImage installations retain their profiles and installation path when updated. Automatic update checks and Start at sign-in remain available in Settings. GNOME requires AppIndicator support and may require double click to open the flyout; other Wayland compositors control window placement.

Desktop alerts require the app to be running and the computer awake. Android remains the platform with offline scheduled-alarm guarantees.

*AI disclosure: these release notes and the related code were written with the assistance of AI.*
