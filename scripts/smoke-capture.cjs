const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const http = require("node:http");
const net = require("node:net");
const zlib = require("node:zlib");

const DEBUG_PORT = Number(process.env.CAPTURE_SMOKE_PORT ?? 9336);
const TARGET_WHITE_RATIO_LIMIT = 0.95;
const TARGET_NON_WHITE_RATIO_MIN = 0.01;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonFromDebugEndpoint(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: DEBUG_PORT,
        path: pathname,
        timeout: 1500
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Timed out reading Chromium debug endpoint."));
    });
  });
}

async function waitForTarget(predicate, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const targets = await readJsonFromDebugEndpoint("/json/list");
      const match = targets.find(predicate);

      if (match) {
        return match;
      }
    } catch {
      // The debug endpoint is not ready immediately after Electron starts.
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for Electron debug target.");
}

async function evaluateWithRetry(cdp, params, attempts = 2) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await cdp.send("Runtime.evaluate", params);
    } catch (error) {
      lastError = error;
      if (!String(error?.message ?? error).includes("Execution context was destroyed")) {
        throw error;
      }

      await delay(750);
    }
  }

  throw lastError;
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = new URL(this.webSocketUrl);

      this.socket = net.connect(Number(url.port), url.hostname, () => {
        const key = crypto.randomBytes(16).toString("base64");
        const request = [
          `GET ${url.pathname}${url.search} HTTP/1.1`,
          `Host: ${url.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "Origin: devtools://devtools",
          "",
          ""
        ].join("\r\n");

        this.socket.write(request);
      });

      let handshakeBuffer = Buffer.alloc(0);
      const onHandshakeData = (chunk) => {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");

        if (headerEnd < 0) {
          return;
        }

        this.socket.removeListener("data", onHandshakeData);
        const responseHeader = handshakeBuffer.slice(0, headerEnd + 4).toString("latin1");

        if (!/^HTTP\/1\.1 101\b/.test(responseHeader)) {
          reject(new Error(`WebSocket handshake failed: ${responseHeader}`));
          return;
        }

        this.buffer = handshakeBuffer.slice(headerEnd + 4);
        this.socket.on("data", (nextChunk) => this.onData(nextChunk));

        if (this.buffer.length > 0) {
          this.onData(Buffer.alloc(0));
        }

        resolve();
      };

      this.socket.on("data", onHandshakeData);
      this.socket.once("error", reject);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(this.createClientFrame(payload));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket?.end();
  }

  createClientFrame(text) {
    const payload = Buffer.from(text);
    let header;

    if (payload.length < 126) {
      header = Buffer.alloc(6);
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(8);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(14);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }

    header[0] = 0x81;

    const mask = crypto.randomBytes(4);
    mask.copy(header, header.length - 4);

    const maskedPayload = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index++) {
      maskedPayload[index] = payload[index] ^ mask[index % 4];
    }

    return Buffer.concat([header, maskedPayload]);
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) {
          return;
        }

        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) {
          return;
        }

        const largeLength = this.buffer.readBigUInt64BE(2);
        if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("WebSocket frame is too large.");
        }

        payloadLength = Number(largeLength);
        offset = 10;
      }

      const isMasked = (secondByte & 0x80) !== 0;
      const maskOffset = offset;
      if (isMasked) {
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLength) {
        return;
      }

      let payload = this.buffer.slice(offset, offset + payloadLength);
      if (isMasked) {
        const mask = this.buffer.slice(maskOffset, maskOffset + 4);
        payload = Buffer.from(payload.map((value, index) => value ^ mask[index % 4]));
      }

      this.buffer = this.buffer.slice(offset + payloadLength);

      const opcode = firstByte & 0x0f;
      if (opcode !== 1) {
        continue;
      }

      const message = JSON.parse(payload.toString("utf8"));
      if (!message.id || !this.pending.has(message.id)) {
        continue;
      }

      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    }
  }
}

function parsePngPixelStats(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  let rawOffset = 0;
  let previousRow = Buffer.alloc(stride);
  let white = 0;
  let transparent = 0;
  let nonWhite = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    const row = Buffer.from(raw.slice(rawOffset, rawOffset + stride));
    rawOffset += stride;

    unfilterPngRow(row, previousRow, channels, filter);

    for (let index = 0; index < row.length; index += channels) {
      const red = row[index];
      const green = row[index + 1];
      const blue = row[index + 2];
      const alpha = channels === 4 ? row[index + 3] : 255;

      if (alpha < 10) {
        transparent++;
      } else if (red > 245 && green > 245 && blue > 245) {
        white++;
      } else {
        nonWhite++;
      }
    }

    previousRow = row;
  }

  const total = width * height;
  return {
    width,
    height,
    total,
    white,
    transparent,
    nonWhite,
    whiteRatio: white / total,
    nonWhiteRatio: nonWhite / total
  };
}

function unfilterPngRow(row, previousRow, channels, filter) {
  for (let index = 0; index < row.length; index++) {
    const left = index >= channels ? row[index - channels] : 0;
    const up = previousRow[index] ?? 0;
    const upperLeft = index >= channels ? previousRow[index - channels] ?? 0 : 0;

    if (filter === 1) {
      row[index] = (row[index] + left) & 255;
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 255;
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
    } else if (filter === 4) {
      row[index] = (row[index] + paethPredictor(left, up, upperLeft)) & 255;
    }
  }
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const distanceToLeft = Math.abs(estimate - left);
  const distanceToUp = Math.abs(estimate - up);
  const distanceToUpperLeft = Math.abs(estimate - upperLeft);

  if (distanceToLeft <= distanceToUp && distanceToLeft <= distanceToUpperLeft) {
    return left;
  }

  if (distanceToUp <= distanceToUpperLeft) {
    return up;
  }

  return upperLeft;
}

function launchElectron() {
  const pnpmCli = process.env.npm_execpath;

  if (!pnpmCli) {
    throw new Error("npm_execpath is not available. Run this script through pnpm.");
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  return spawn(
    process.execPath,
    [pnpmCli, "run", "start"],
    {
      cwd: process.cwd(),
      env: {
        ...env,
        ELECTRON_ENABLE_LOGGING: "1",
        SHOT_TRANSLATE_REMOTE_DEBUGGING_PORT: String(DEBUG_PORT)
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

function stopProcessTree(child) {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore"
    });
    return;
  }

  child.kill();
}

async function run() {
  const electron = launchElectron();
  let electronOutput = "";
  let mainCdp = null;
  let captureCdp = null;

  electron.stdout.on("data", (data) => {
    electronOutput += data.toString();
  });
  electron.stderr.on("data", (data) => {
    electronOutput += data.toString();
  });

  try {
    const mainTarget = await waitForTarget((target) => target.type === "page" && /#\/$/.test(target.url));
    mainCdp = new CdpClient(mainTarget.webSocketDebuggerUrl);
    await mainCdp.connect();
    await delay(1000);

    await evaluateWithRetry(mainCdp, {
      expression: "void window.shotTranslate.startCapture(); true",
      awaitPromise: false,
      returnByValue: true
    });

    const captureTarget = await waitForTarget(
      (target) => target.type === "page" && /#\/capture$/.test(target.url),
      10000
    );
    captureCdp = new CdpClient(captureTarget.webSocketDebuggerUrl);
    await captureCdp.connect();
    await captureCdp.send("Page.enable");

    const backgroundLoaded = await captureCdp.send("Runtime.evaluate", {
      expression:
        "new Promise(resolve => { let tries = 0; const check = () => { const el = document.querySelector('div[style*=background-image]'); if (el || tries++ > 40) resolve(Boolean(el)); else setTimeout(check, 250); }; check(); })",
      awaitPromise: true,
      returnByValue: true
    });

    await delay(800);

    const screenshot = await captureCdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    const stats = parsePngPixelStats(Buffer.from(screenshot.data, "base64"));
    const ok =
      backgroundLoaded.result?.value === true &&
      stats.whiteRatio < TARGET_WHITE_RATIO_LIMIT &&
      stats.nonWhiteRatio > TARGET_NON_WHITE_RATIO_MIN;

    console.log(
      JSON.stringify(
        {
          ok,
          backgroundLoaded: backgroundLoaded.result?.value === true,
          thresholds: {
            maxWhiteRatio: TARGET_WHITE_RATIO_LIMIT,
            minNonWhiteRatio: TARGET_NON_WHITE_RATIO_MIN
          },
          stats
        },
        null,
        2
      )
    );

    if (!ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("SMOKE_FAILED", error?.stack ?? error);
    console.error(electronOutput.slice(-4000));
    process.exitCode = 1;
  } finally {
    try {
      captureCdp?.close();
      mainCdp?.close();
    } finally {
      stopProcessTree(electron);
    }
  }
}

run();
