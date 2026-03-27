vi.mock("electron", () => ({
app: {
    getVersion: vi.fn().mockReturnValue("1.0.0"),
    quit: vi.fn(),
    dock: { hide: vi.fn(), show: vi.fn() },
    isPackaged: false,
    setAboutPanelOptions: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    showAboutPanel: vi.fn(),
    getPath: vi.fn().mockReturnValue("/tmp/test-user-data"),
  },
  commandLine: { appendSwitch: vi.fn() },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  dialog: {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
  },
  BrowserWindow: Object.assign(
    vi.fn().mockImplementation(() => ({
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      destroy: vi.fn(),
      isVisible: vi.fn().mockReturnValue(false),
      getBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 360, height: 480 }),
      setPosition: vi.fn(),
      setSize: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      webContents: { send: vi.fn() },
    })),
    {
      getAllWindows: vi.fn().mockReturnValue([]),
    }
  ),
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
  })),
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setTitle: vi.fn(),
    setImage: vi.fn(),
    on: vi.fn(),
    getBounds: vi.fn().mockReturnValue({ x: 100, y: 0, width: 22, height: 22 }),
    popUpContextMenu: vi.fn(),
  })),
  Menu: {
    buildFromTemplate: vi.fn().mockReturnValue({}),
  },
  screen: {
    getDisplayNearestPoint: vi.fn().mockReturnValue({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    }),
  },
  nativeImage: {
    createFromPath: vi
      .fn()
      .mockReturnValue({ toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)) }),
    createEmpty: vi.fn().mockReturnValue({
      addRepresentation: vi.fn(),
      setTemplateImage: vi.fn(),
    }),
  },
}));
