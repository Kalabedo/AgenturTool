/**
 * Das Menü.
 *
 * Bewusst knapp: Was die Anwendung kann, steht in der Oberfläche. Ins Menü
 * gehört nur, was von außerhalb der Oberfläche kommen muss — das Backup,
 * der Weg zum Datenordner und die üblichen Fenstergriffe, die ein
 * Mac-Programm ohne Nachdenken bereitstellen sollte.
 */
import { Menu, app, dialog, shell, type MenuItemConstructorOptions } from 'electron';

export interface MenuOptions {
  dataDir: string;
  onBackup: () => Promise<void>;
  /**
   * „Nach Updates suchen …".
   *
   * Im Menü und nicht nur in den Einstellungen: Wer wissen will, ob es
   * etwas Neues gibt, soll nicht erst durch die Anwendung navigieren
   * müssen — und auf einem Mac sucht man diesen Punkt zuerst im
   * Programmmenü.
   */
  onCheckForUpdates: () => Promise<void>;
}

export function buildMenu(options: MenuOptions): void {
  const isMac = process.platform === 'darwin';

  // Ein Menüpunkt kann nicht auf ein Versprechen warten; ohne diesen
  // Fänger bliebe ein Fehler beim Öffnen des Downloads eine unbeachtete
  // Ablehnung im Protokoll, und im Menü geschähe schlicht nichts.
  const checkForUpdates = (): void => {
    void options.onCheckForUpdates().catch((error: unknown) => {
      dialog.showErrorBox(
        'Die Updateprüfung ist fehlgeschlagen',
        error instanceof Error ? error.message : String(error),
      );
    });
  };

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { label: 'Nach Updates suchen …', click: checkForUpdates },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : [];

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: 'Ablage',
      submenu: [
        {
          label: 'Backup erstellen …',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            void options.onBackup().catch((error: unknown) => {
              dialog.showErrorBox(
                'Backup fehlgeschlagen',
                error instanceof Error ? error.message : String(error),
              );
            });
          },
        },
        {
          label: 'Datenordner zeigen',
          click: () => {
            void shell.openPath(options.dataDir);
          },
        },
        // Auf einem Mac steht der Punkt im Programmmenü, wo er hingehört;
        // hier wäre er doppelt.
        ...(isMac
          ? []
          : [
              { type: 'separator' } as MenuItemConstructorOptions,
              {
                label: 'Nach Updates suchen …',
                click: checkForUpdates,
              } as MenuItemConstructorOptions,
            ]),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Fenster', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
