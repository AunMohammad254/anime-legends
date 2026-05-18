export default {
  root: ".",
  build: {
    target: "es2015",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: {
        main: "index.html",
        game: "game.html",
      },
      output: {
        manualChunks: {
          "game-core": [
            "./src/core/Physics.js",
            "./src/core/Renderer.js",
            "./src/core/SpatialGrid.js",
          ],
          "game-entities": [
            "./src/entities/Character.js",
            "./src/entities/Projectile.js",
          ],
          "game-systems": [
            "./src/audio/AudioManager.js",
            "./src/vfx/ParticleSystem.js",
          ],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
};
