import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { Plugin, ResolvedConfig } from 'vite';

import { rswCompile, rswWatch } from './compiler';
import { RswPluginOptions, WasmFileInfo } from './types';
import { debugConfig, checkENV, getCrateName } from './utils';

const wasmMap = new Map<string, WasmFileInfo>();

export function ViteRsw(userOptions: RswPluginOptions): Plugin {
  let config: ResolvedConfig;
  const crateRoot = path.resolve(process.cwd(), userOptions.root || '');
  debugConfig(userOptions);
  checkENV();

  const crateList = userOptions.crates.map(i => getCrateName(i));

  return {
    name: 'vite-plugin-rsw',
    enforce: 'pre',

    configResolved(_config) {
      config = _config;
    },
    configureServer(_server) {
      const root = _server?.config?.root;
      rswCompile(userOptions, crateRoot, undefined, false);
      rswWatch(userOptions, root);
    },
    transform(code, id) {
      if (new RegExp(`(${crateList.join('|')})` + '\\/pkg/.*.js').test(id)) {
        const re = id.indexOf('@') > 0 ? '([@\\/].*)' : '';
        const _path = id.match(new RegExp(`.*(.*${re}([\\/].*){3}).js$`)) as string[];
        const fileId = _path?.[1].replace(/^\//, '') + '_bg.wasm';

        // build wasm file
        if (!wasmMap.has(fileId) && config?.mode !== 'development') {
          const source = fs.readFileSync(path.resolve(crateRoot, fileId));
          const hash = createHash('md5').update(String(source)).digest('hex').substring(0, 8);
          const _name = config?.build?.assetsDir + '/' + path.basename(fileId).replace('.wasm', `.${hash}.wasm`);
          wasmMap.set(fileId, {
            fileName: _name,
            source,
          });
          return code.replace('import.meta.url.replace(/\\.js$/, \'_bg.wasm\');', `fetch('${_name}')`);
        }

        // fix: absolute path
        return code.replace('import.meta.url.replace(/\\.js$/, \'_bg.wasm\');', `fetch('/${fileId}')`);
      }
      return code;
    },
    generateBundle() {
      wasmMap.forEach((i: WasmFileInfo) => {
        this.emitFile({
          fileName: i.fileName,
          type: 'asset',
          source: (i.source as Uint8Array),
        });
      })
    }
  };
}

export default ViteRsw;
