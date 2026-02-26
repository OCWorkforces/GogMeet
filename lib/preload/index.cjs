"use strict";
var __webpack_exports__ = {};
const external_electron_namespaceObject = require("electron");
const IPC_CHANNELS = {
    CALENDAR_GET_EVENTS: 'calendar:get-events',
    CALENDAR_REQUEST_PERMISSION: 'calendar:request-permission',
    CALENDAR_PERMISSION_STATUS: 'calendar:permission-status',
    WINDOW_MINIMIZE_TO_TRAY: 'window:minimize-to-tray',
    WINDOW_RESTORE: 'window:restore',
    APP_OPEN_EXTERNAL: 'app:open-external',
    APP_GET_VERSION: 'app:get-version'
};
const api = {
    calendar: {
        getEvents: ()=>external_electron_namespaceObject.ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_GET_EVENTS),
        requestPermission: ()=>external_electron_namespaceObject.ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_REQUEST_PERMISSION),
        getPermissionStatus: ()=>external_electron_namespaceObject.ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_PERMISSION_STATUS)
    },
    window: {
        minimizeToTray: ()=>external_electron_namespaceObject.ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE_TO_TRAY),
        restore: ()=>external_electron_namespaceObject.ipcRenderer.send(IPC_CHANNELS.WINDOW_RESTORE)
    },
    app: {
        openExternal: (url)=>external_electron_namespaceObject.ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
        getVersion: ()=>external_electron_namespaceObject.ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION)
    }
};
external_electron_namespaceObject.contextBridge.exposeInMainWorld('api', api);
for(var __rspack_i in __webpack_exports__)exports[__rspack_i] = __webpack_exports__[__rspack_i];
Object.defineProperty(exports, '__esModule', {
    value: true
});
