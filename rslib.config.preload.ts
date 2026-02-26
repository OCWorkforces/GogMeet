import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'cjs',
      bundle: true,
      dts: false,
      source: {
        entry: { index: './src/preload/index.ts' },
      },
      output: {
        distPath: { root: './lib/preload' },
        filename: { js: 'index.cjs' },
        target: 'node',
      },
      tools: {
        bundlerChain(chain) {
          chain.target('electron-preload');
        },
        rspack(config) {
          // electron must never be bundled in preload
          const existing = config.externals ?? [];
          const arr = Array.isArray(existing) ? existing : [existing];
          arr.push(function(ctx, callback) {
            const req = ctx.request ?? '';
            if (req === 'electron' || req.startsWith('electron/')) {
              return callback(undefined, `commonjs ${req}`);
            }
            callback();
          });
          config.externals = arr;
          return config;
        },
      },
      resolve: {
        extensionAlias: {
          '.js': ['.ts', '.js'],
        },
      },
    },
  ],
  source: {
    tsconfigPath: './src/preload/tsconfig.json',
  },
});
