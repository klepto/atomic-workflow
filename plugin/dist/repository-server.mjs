// src/repository-server.main.ts
import { parseArgs } from "node:util";

// src/serve-repository.socket.ts
import { rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
var FIRST_ATTACH_TIMEOUT = 1e4;
var socketServeRepository = async (address) => {
  const server = createServer();
  const closed = new Promise((resolve) => server.once("close", () => resolve()));
  let attached = 0;
  let firstAttachTimer;
  server.on("connection", (socket) => {
    clearTimeout(firstAttachTimer);
    attached += 1;
    socket.on("error", () => {
    });
    socket.once("close", () => {
      attached -= 1;
      if (attached === 0) server.close();
    });
  });
  await listenReclaiming(server, address);
  firstAttachTimer = setTimeout(() => server.close(), FIRST_ATTACH_TIMEOUT);
  await closed;
};
var listenReclaiming = async (server, address) => {
  const error = await listenCatching(server, address);
  if (error === void 0) return;
  if (error.code !== "EADDRINUSE" || process.platform === "win32" || await isServed(address)) throw error;
  await rm(address, { force: true });
  const retryError = await listenCatching(server, address);
  if (retryError !== void 0) throw retryError;
};
var listenCatching = (server, address) => {
  return new Promise((resolve) => {
    server.once("error", resolve);
    server.listen(address, () => {
      server.off("error", resolve);
      resolve(void 0);
    });
  });
};
var isServed = (address) => {
  return new Promise((resolve) => {
    const socket = createConnection(address);
    socket.once("error", () => resolve(false));
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
  });
};

// src/serve-repository.ts
var ServeRepository = socketServeRepository;

// src/repository-server.main.ts
var main = async () => {
  const { values } = parseArgs({ options: { address: { type: "string" } } });
  if (values.address === void 0) throw new Error("The argument --address <address> is missing");
  await ServeRepository(values.address);
};
await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}
`);
  process.exitCode = 1;
});
