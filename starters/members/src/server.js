// Starts the app. Reads --port and --hostname (Farbaek's preview passes them), then PORT, then 3000.
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createStore } from "./store.js";

function flag(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(flag("port", process.env.PORT || 3000));
const hostname = flag("hostname", "0.0.0.0");
const store = await createStore(process.env.DATA_DIR || "data");
const server = createServer(createApp({ store }));
server.listen(port, hostname, () => {
  console.log("Fieldnote on http://" + hostname + ":" + port + " (data in " + store.file + ")");
});
