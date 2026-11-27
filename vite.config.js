import { defineConfig } from "vite";
import { handleProgress } from "./server/progress.js";

// Serve the same API locally that the hosting functions use in production.
function installProgressRoute(server) {
  server.middlewares.use("/api/progress", async (req, res, next) => {
    try {
      const request = new Request("http://localhost/api/progress", {
        method: req.method,
        headers: req.headers,
        body: req.method === "POST" ? req : undefined,
        duplex: "half",
      });
      const response = await handleProgress(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (error) {
      next(error);
    }
  });
}

export default defineConfig({
  base: "./",
  plugins: [{
    name: "local-progress-api",
    configureServer: installProgressRoute,
    configurePreviewServer: installProgressRoute,
  }],
  build: {
    rolldownOptions: {
      input: {
        main: "index.html",
        game: "game.html",
      },
    },
  },
});
