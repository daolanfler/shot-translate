import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";

let initialized = false;

export function initLogger() {
  if (initialized) {
    return;
  }
  initialized = true;

  log.initialize();
  log.transports.file.resolvePathFn = () => path.join(app.getPath("userData"), "logs", "main.log");
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.level = "info";
  log.transports.console.level = "debug";

  // Route ad-hoc console.* calls in services into the same sinks.
  Object.assign(console, log.functions);

  process.on("uncaughtException", (error) => {
    log.error("Uncaught exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("Unhandled rejection", reason);
  });
}

export { log };
