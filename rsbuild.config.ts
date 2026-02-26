import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  source: {
    entry: { index: './src/renderer/index.ts' },
    tsconfigPath: './src/renderer/tsconfig.json',
  },
  output: {
    distPath: { root: './lib/renderer' },
    assetPrefix: './',
    target: 'web',
  },
  html: {
    template: './src/renderer/index.html',
  },
  tools: {
    bundlerChain(chain) {
      chain.target('electron-renderer');
    },
    rspack(config) {
      // electron-renderer sets global["webpackHotUpdate..."] which breaks in browser
      // Patch globalObject so HMR runtime uses globalThis instead
      if (config.output) {
        config.output.globalObject = 'globalThis';
      } else {
        config.output = { globalObject: 'globalThis' };
      }
      return config;
    },
  },
  performance: {
    chunkSplit: { strategy: 'all-in-one' },
  },
});
