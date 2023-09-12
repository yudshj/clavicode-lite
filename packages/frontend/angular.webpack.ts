/**
 * Custom angular webpack configuration
 */
import * as path from "node:path";
import type { Configuration } from "webpack";
import type { CustomWebpackBrowserSchema } from "@angular-builders/custom-webpack";

export default (config: Configuration, options: CustomWebpackBrowserSchema) => {
  config.target = 'web';

  config.resolve ??= {};

  config.resolve.alias = {
    'vscode': path.resolve(__dirname, './node_modules/@codingame/monaco-languageclient/lib/vscode-compatibility')
  };
  config.resolve.fallback = {
    "path": require.resolve("path-browserify"),
    "crypto": false,
    "fs": false,
    "os": false,
    "tls": false,
    "net": false,
    // "process": true,
    "module": false,
    "clearImmediate": false,
    // "setImmediate": true
  }
  config.node = {
    "global": true,
  };
  return config;
}
