// ==================================================
// FILE: health.js
// PURPOSE: Expose minimal HTTP health endpoint for Railway
// ==================================================

// ==================================================
// IMPORTS
// ==================================================

import http from "node:http";

// ==================================================
// CONSTANTS / CONFIG
// ==================================================

// ==================================================
// TYPES / SHAPES (JSDoc)
// ==================================================

// ==================================================
// INTERNAL STATE
// ==================================================

let server = null;

// ==================================================
// HELPERS
// ==================================================

function createServer() {
  return http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

// ==================================================
// CORE LOGIC
// ==================================================

function startServer() {
  if (server) return;

  const port = process.env.PORT || DEFAULT_PORT;
  server = createServer();

  server.listen(port, "0.0.0.0", () => {
    console.log(`[health] listening on ${port}`);
  });
}

// ==================================================
// PUBLIC API
// ==================================================

export function startHealthServer() {
  startServer();
}

// ==================================================
// EXPORTS
// ==================================================

