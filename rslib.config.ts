import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'cjs',
      bundle: true,
      dts: false,
      source: {
        entry: { index: './src/main/index.ts' },
      },
      output: {
        distPath: { root: './lib/main' },
        target: 'node',
        filename: {
          js: '[name].cjs',
        },
      },
      tools: {
        bundlerChain(chain) {
          chain.target('electron-main');
        },
        rspack(config) {
          // Append electron external AFTER ElectronTargetPlugin has set its externals
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
          // Configure extension alias for TypeScript imports
          config.resolve = config.resolve ?? {};
          config.resolve.extensionAlias = { '.js': ['.ts', '.js'] };
          return config;
        },
      },
    },
  ],
  source: {
    tsconfigPath: './src/main/tsconfig.json',
  },
});
