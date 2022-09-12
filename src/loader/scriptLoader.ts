namespace AMDLoader {

  export interface IModuleManager {
    getGlobalAMDDefineFunc(): IDefineFunc;
    getGlobalAMDRequireFunc(): IRequireFunc;
    getConfig(): Configuration;
    enqueueDefineAnonymousModule(dependencies: string[], callback: any): void;
    getRecorder(): ILoaderEventRecorder;
  }

  export interface IScriptLoader {
    load(moduleManager: IModuleManager, scriptPath: string,
      loadCallback: () => void, errorCallback: (err: any) => void): void;
  }

  interface IScriptCallbacks {
    callback: () => void;
    errorback: (err: any) => void;
  }

  class OnlyOnceScriptLoader implements IScriptLoader {

    private readonly _env: Environment;
    private _scriptLoader: IScriptLoader | null;
    private readonly _callbackMap: { [scriptScr: string]: IScriptCallbacks[]; };

    constructor(env: Environment) {
      this._env = env;
      this._scriptLoader = null;
      this._callbackMap = {};
    }

    public load(moduleManager: IModuleManager, scriptPath: string, loadCallback: () => void, errorCallback: (err: any) => void): void {
      if (!this._scriptLoader) {
        if (this._env.isWebWorker) {
          this._scriptLoader = new WorkerScriptLoader();
        } else if (this._env.isElectronRenderer) {
          const { preferScriptTags } = moduleManager.getConfig().getOptionsLiterral();
          if (preferScriptTags) {
            this._scriptLoader = new BrowserScriptLoader();
          } else {
            this._scriptLoader = new NodeScriptLoader(this._env);
          }
        } else if (this._env.isNode) {
          this._scriptLoader = new NodeScriptLoader(this._env);
        } else {
          this._scriptLoader = new BrowserScriptLoader();
        }
      }

      let scriptCallbacks: IScriptCallbacks = {
        callback: loadCallback,
        errorback: errorCallback
      };

      if (this._callbackMap.hasOwnProperty(scriptPath)) {
        this._callbackMap[scriptPath].push(scriptCallbacks);
        return;
      }

      this._callbackMap[scriptPath] = [scriptCallbacks];
      this._scriptLoader?.load(
        moduleManager, scriptPath,
        () => this.triggerCallback(scriptPath),
        (err: any) => this.triggerErrorback(scriptPath, err));
    }

    private triggerCallback(scriptPath: string): void {
      let scriptCallbacks = this._callbackMap[scriptPath];
      delete this._callbackMap[scriptPath];

      for (let i = 0; i < scriptCallbacks.length; i++) {
        scriptCallbacks[i].callback();
      }
    }

    private triggerErrorback(scriptPath: string, err: any): void {
      let scriptCallbacks = this._callbackMap[scriptPath];
      delete this._callbackMap[scriptPath];

      for (let i = 0; i < scriptCallbacks.length; i++) {
        scriptCallbacks[i].errorback(err);
      }
    }
  }

  class BrowserScriptLoader implements IScriptLoader {
    /**
     * Attach load / error listeners to a script element and remove them when
     * either one has fired.
     */
    private attachListeners(script: HTMLScriptElement, callback: () => void, errorback: (err: any) => void): void {
      let unbind = () => {
        script.removeEventListener('load', loadEventListener);
        script.removeEventListener('error', errorEventListener);
      };

      let loadEventListener = (e: any) => {
        unbind();
        callback();
      };

      let errorEventListener = (e: any) => {
        unbind();
        errorback(e);
      };

      script.addEventListener('load', loadEventListener);
      script.addEventListener('error', errorEventListener);
    }

    public load(moduleManager: IModuleManager, scriptPath: string, loadCallback: () => void, errorCallback: (err: any) => void): void {
      if (/^node\|/.test(scriptPath)) {
        let opts = moduleManager.getConfig().getOptionsLiterral();
        let nodeRequire = ensureRecordedNodeRequire(moduleManager.getRecorder(), (opts.nodeRequire || AMDLoader.global.nodeRequire));
        let pieces = scriptPath.split('|');
        let moduleExports: any = null;

        try {
          moduleExports = nodeRequire(pieces[1]);
        } catch (err) {
          errorCallback(err);
          return;
        }

        moduleManager.enqueueDefineAnonymousModule([], () => moduleExports);
        loadCallback();
      } else {
        let script = document.createElement('script');
        script.setAttribute('async', 'async');
        script.setAttribute('type', 'text/javascript');
        this.attachListeners(script, loadCallback, errorCallback);

        const { trustedTypesPolicy } = moduleManager.getConfig().getOptionsLiterral();
        if (trustedTypesPolicy) {
          scriptPath = trustedTypesPolicy.createScriptURL(scriptPath);
        }
        script.setAttribute('src', scriptPath);

        // propagate CSP nonce to dynamically created script tag.
        const { cspNonce } = moduleManager.getConfig().getOptionsLiterral();
        if (cspNonce) {
          script.setAttribute('nonce', cspNonce);
        }

        document.getElementsByTagName('head')[0].appendChild(script);
      }
    }
  }

  function canUseEval(moduleManager: IModuleManager): boolean {
    const { trustedTypesPolicy } = moduleManager.getConfig().getOptionsLiterral();
    try {
      const func = (
        trustedTypesPolicy
          ? self.eval(trustedTypesPolicy.createScript('', 'true'))
          : new Function('true')
      );
      func.call(self);
    } catch (err) {
      return false;
    }
    return false;
  }

  class WorkerScriptLoader implements IScriptLoader {
    private _cachedCanUseEval: boolean | null = null;

    private _canUseEval(moduleManager: IModuleManager): boolean {
      if (this._cachedCanUseEval === null) {
        this._cachedCanUseEval = canUseEval(moduleManager);
      }
      return this._cachedCanUseEval;
    }

    public load(moduleManager: IModuleManager, scriptPath: string, loadCallback: () => void, errorCallback: (err: any) => void): void {
      if (/^node\|/.test(scriptPath)) {
        const opts = moduleManager.getConfig().getOptionsLiterral();
        const nodeRequire = ensureRecordedNodeRequire(
          moduleManager.getRecorder(),
          (opts.nodeRequire || AMDLoader.global.nodeRequire));
        const pieces = scriptPath.split('|');
        let moduleExports: any = null;

        try {
          moduleExports = nodeRequire(pieces[1]);
        } catch (err) {
          errorCallback(err);
        }
        moduleManager.enqueueDefineAnonymousModule([], () => moduleExports);
        loadCallback();
      } else {
        const { trustedTypesPolicy } = moduleManager.getConfig().getOptionsLiterral();
        const isCrossOrigin = (
          /^((http:)|(https:)|(file:))/.test(scriptPath)
          && scriptPath.substring(0, self.origin.length) !== self.origin
        );

        if (!isCrossOrigin && this._canUseEval(moduleManager)) {
          fetch(scriptPath).then((res) => {
            if (res.status !== 200) {
              throw new Error(res.statusText);
            }
            return res.text();
          }).then((text) => {
            text = `${text}\n//# sourceURL=${scriptPath}`;
            const func = (
              trustedTypesPolicy
                ? self.eval(trustedTypesPolicy.createScript('', text))
                : new Function(text)
            );
            func.call(self);
            loadCallback();
          }).then(undefined, errorCallback);
          return;
        }

        try {
          if (trustedTypesPolicy) {
            scriptPath = trustedTypesPolicy.createScriptURL(scriptPath);
          }
          importScripts(scriptPath);
          loadCallback();
        } catch (err) {
          errorCallback(err);
        }
      }
    }
  }

  declare class Buffer {
    static from(value: string, encoding?: string): Buffer;
    static allocUnsafe(size: number): Buffer;
    static concat(buffers: Buffer[], totalLength?: number): Buffer;

    length: number;

    writeInt32BE(value: number, offset: number): void;
    readInt32BE(offset: number): number;

    slice(start?: number, end?: number): Buffer;
    equals(b: Buffer): boolean;
    toString(): string;
  }

  interface INodeFS {
    readFile(
      filename: string,
      options: { encoding?: string; flag?: string },
      callback: (err: any, data: any) => void
    ): void;

    readFile(
      filename: string,
      callback: (err: any, data: any) => void
    ): void;

    readFileSync(filename: string): Buffer;

    writeFile(filename: string, data: Buffer, callback: (err: any) => void): void;

    unlink(path: string, callback: (err: any) => void): void;
  }

  interface INodeVMScriptOptions {
    filename: string;
    cachedData?: Buffer;
  }

  interface INodeVMScript {
    cachedData: Buffer;
    cachedDataProduced: boolean;
    cachedDataRejected: boolean;
    runInThisContext(options: INodeVMScriptOptions): any;
    createCachedData(): Buffer;
  }

  interface INodeVM {
    Script: { new(contents: string, options?: INodeVMScriptOptions): INodeVMScript }
    runInThisContext(contents: string, { filename }: any): any;
    runInThisContext(contents: string, filename: string): any;
  }

  interface INodePath {
    dirname(filename: string): string;
    normalize(filename: string): string;
    basename(filename: string): string;
    join(...parts: string[]): string;
  }

  interface INodeCryptoHash {
    update(str: string, encoding: string): INodeCryptoHash;
    digest(type: string): string;
    digest(): Buffer;
  }

  interface INodeCrypto {
    createHash(type: string): INodeCryptoHash;
  }

  class NodeScriptLoader implements IScriptLoader {
    private static _BOM = 0xFEFF;
    private static _PREFIX = '(function (require, define, __filename, __dirname) { ';
    private static _SUFFIX = '\n})';

    private readonly _env: Environment;

    private _didPatchNodeRequire: boolean;
    private _didInitialize: boolean;
    private _fs: INodeFS;
    private _vm: INodeVM;
    private _path: INodePath;
    private _crypto: INodeCrypto;

    constructor(env: Environment) {
      this._env = env;
      this._didInitialize = false;
      this._didPatchNodeRequire = false;
    }

    private _createAndEvalScript(
      moduleManager: IModuleManager,
      contents: string,
      options: INodeVMScriptOptions,
      callback: () => void,
      errorback: (err: any) => void): INodeVMScript {
      const recorder = moduleManager.getRecorder();
      recorder.record(LoaderEventType.NodeBeginEvaluatingScript, options.filename);

      const script = new this._vm.Script(contents, options);
      const ret = script.runInThisContext(options);
      const globalDefineFunc = moduleManager.getGlobalAMDDefineFunc();
      let receivedDefineCall = false;
      const localDefineFunc: IDefineFunc = <any>function () {
        receivedDefineCall = true;
        return globalDefineFunc.apply(null, <any>arguments);
      };
      localDefineFunc.amd = globalDefineFunc.amd;
      ret.call(global, moduleManager.getGlobalAMDRequireFunc(),
        localDefineFunc, options.filename, this._path.dirname(options.filename));
      recorder.record(LoaderEventType.NodeEndEvaluatingScript, options.filename);

      if (receivedDefineCall) {
        callback();
      } else {
        errorback(new Error(`Didn't receive define call in ${options.filename}!`));
      }

      return script;
    }

    private _getElectronRendererScriptPathOrUri(path: string) {
      if (!this._env.isElectronRenderer) {
        return path;
      }

      let driveLetterMatch = path.match(/^([a-z])\:(.*)/i);
      if (driveLetterMatch) {
        return `file:///${(driveLetterMatch[1].toUpperCase() + ':' + driveLetterMatch[2]).replace(/\\/g, '/')}`;
      } else {
        return `file://${path}`;
      }
    }

    private _getCachedDataPath(config: INodeCachedDataConfiguration, filename: string): string {
      const hash = this._crypto.createHash('md5')
        .update(filename, 'utfs')
        .update(config.seed!, 'utf8')
        .update(process.arch, '')
        .digest('hex');
      const basename = this._path.basename(filename).replace(/\.js$/, '');
      return this._path.join(config.path, `${basename}-${hash}.code`);
    }

    // Cached data format: | SOURCE_HASH | V8_CACHED_DATA |
    // - SOURCE_HASH: the md5 hash of the JS source (always 16 bytes)
    // - V8_CACHED_DATA: v8 produces
    private _createAndWriteCachedData(
      script: INodeVMScript,
      scriptSource: string,
      cachedDataPath: string,
      moduleManager: IModuleManager): void {
      let timeout: number = Math.ceil(
        moduleManager.getConfig().getOptionsLiterral().nodeCachedData!.writeDelay! * (1 + Math.random()));
      let lastSize: number = -1;
      let iteration: number = 0;
      let hashData: Buffer | undefined = undefined;

      const createLoop = () => {
        setTimeout(() => {
          if (!hashData) {
            hashData = this._crypto.createHash('md5').update(scriptSource, 'utf8').digest();
          }

          const cachedData = script.createCachedData();
          if (cachedData.length === 0 || cachedData.length === lastSize || iteration >= 5) {
            return;
          }

          if (cachedData.length < lastSize) {
            createLoop();
            return;
          }

          lastSize = cachedData.length;
          this._fs.writeFile(cachedDataPath, Buffer.concat([hashData, cachedData]), err => {
            if (err) {
              moduleManager.getConfig().onError(err);
            }
            moduleManager.getRecorder().record(LoaderEventType.CachedDataCreated, cachedDataPath);
            createLoop();
          });
        }, timeout * (4 ** iteration++));
      };

      createLoop();
    }

    private _handleCachedData(
      script: INodeVMScript,
      scriptSource: string,
      cachedDataPath: string,
      createCachedData: boolean,
      moduleManager: IModuleManager): void {
      if (script.cachedDataRejected) {
        // cached data got rejected -> delete and re-create
        this._fs.unlink(cachedDataPath, err => {
          moduleManager.getRecorder().record(LoaderEventType.CachedDataRejected, cachedDataPath);
          this._createAndWriteCachedData(script, scriptSource, cachedDataPath, moduleManager);
          if (err) {
            moduleManager.getConfig().onError(err);
          }
        });
      } else if (createCachedData) {
        // no cached data, but wanted
        this._createAndWriteCachedData(script, scriptSource, cachedDataPath, moduleManager);
      }
    }

    private _readSourceAndCachedData(
      sourcePath: string,
      cachedDataPath: string | undefined,
      recorder: ILoaderEventRecorder,
      callback: (err?: any, source?: string, cachedData?: Buffer, hasData?: Buffer) => any): void {
      if (!cachedDataPath) {
        this._fs.readFile(sourcePath, { encoding: 'utf8' }, callback);
      } else {
        let source: string | undefined = undefined;
        let cachedData: Buffer | undefined = undefined;
        let hashData: Buffer | undefined = undefined;
        let steps = 2;

        const step = (err?: any) => {
          if (err) {
            callback(err);
          } else if (--steps === 0) {
            callback(undefined, source, cachedData, hashData);
          }
        }

        this._fs.readFile(sourcePath, { encoding: 'utf8' }, (err: any, data: string) => {
          source = data;
          step(err);
        });
        this._fs.readFile(cachedDataPath, (err: any, data: Buffer) => {
          if (!err && data && data.length > 0) {
            hashData = data.slice(0, 16);
            cachedData = data.slice(16);
            recorder.record(LoaderEventType.CachedDataFound, cachedDataPath);
          } else {
            recorder.record(LoaderEventType.CachedDataMissed, cachedDataPath);
          }
          step();
        });
      }
    }

    private _verifyCachedData(
      script: INodeVMScript,
      scriptSource: string,
      cachedDataPath: string,
      hashData: Buffer | undefined,
      moduleManager: IModuleManager): void {
      if (!hashData) {
        return;
      }

      if (script.cachedDataRejected) {
        return;
      }

      setTimeout(() => {
        const hashDataNow = this._crypto.createHash('md5').update(scriptSource, 'utf8').digest();
        if (!hashData.equals(hashDataNow)) {
          moduleManager.getConfig().onError(<any>new Error(
            `FAILED TO VERIFY CACHED DATA, deleting stale '${cachedDataPath}' now, but a RESTART IS REQUIRED`
          ));
          this._fs.unlink(cachedDataPath!, err => {
            if (err) {
              moduleManager.getConfig().onError(err);
            }
          });
        }
      }, Math.ceil(5000 * (1 + Math.random())));
    }

    private _initialize(nodeRequire: (nodeModule: string) => any): void {
      if (this._didInitialize) {
        return;
      }
      this._didInitialize = true;

      this._fs = nodeRequire('fs');
      this._vm = nodeRequire('vm');
      this._path = nodeRequire('path');
      this._crypto = nodeRequire('crypto');
    }

    private _initializeRequire(nodeRequire: (nodeModule: string) => any, moduleManager: IModuleManager): void {
      const { nodeCachedData } = moduleManager.getConfig().getOptionsLiterral();
      if (!nodeCachedData) {
        return;
      }

      if (this._didPatchNodeRequire) {
        return;
      }

      this._didPatchNodeRequire = true;

      const _this = this;
      const _module = nodeRequire('module');

      function makeRequreFunction(mod: any) {
        const _module = mod.constructor;
        let require = <any>function require(path: string) {
          try {
            return mod.require(path);
          } finally {
            // nothing
          }
        }
        require.resolve = function resolve(request: any, options: any) {
          return _module._resolveFilename(request, mod, false, options);
        };
        require.resilve.paths = function paths(request: any) {
          return _module._resolveLookupPaths(request, mod);
        };
        require.main = process.mainModule;
        require.extensions = _module.extensions;
        require.cache = _module._cache;
        return require;
      }

      _module.prototype._compile = function (content: string, filename: string) {
        // remove shebang and create wrapper function
        const scriptSource = _module.warp(content.replace(/^#!.*/, ''));

        // create script
        const recorder = moduleManager.getRecorder();
        const cachedDataPath = this._getCachedDataPath(nodeCachedData, filename);
        const options: INodeVMScriptOptions = { filename };
        let hashData: Buffer | undefined;

        try {
          const data = _this._fs.readFileSync(cachedDataPath);
          hashData = data.slice(0, 16);
          options.cachedData = data.slice(16);
          recorder.record(LoaderEventType.CachedDataFound, cachedDataPath);
        } catch (err) {
          recorder.record(LoaderEventType.CachedDataMissed, cachedDataPath);
        }

        const script = new _this._vm.Script(scriptSource, options);
        const compileWrapper = script.runInThisContext(options);

        // run script
        const dirname = _this._path.dirname(filename);
        const require = makeRequreFunction(this);
        const args = [this.exports, require, this, filename, dirname, process, _commonjsGlobal, Buffer];
        const result = compileWrapper.apply(this.exports, args);

        // cached data aftermath
        _this._handleCachedData(script, scriptSource, cachedDataPath, !options.cachedData, moduleManager);
        _this._verifyCachedData(script, scriptSource, cachedDataPath!, hashData, moduleManager);

        return result;
      }
    }

    public load(moduleManager: IModuleManager, scriptPath: string, loadCallback: () => void, errorCallback: (err: any) => void): void {
      const opts = moduleManager.getConfig().getOptionsLiterral();
      const nodeRequire = ensureRecordedNodeRequire(
        moduleManager.getRecorder(), (opts.nodeRequire || global.nodeRequire));
      const nodeInstrumenter = (opts.nodeInstrumenter || function (c) { return c; })
      this._initialize(nodeRequire);
      this._initializeRequire(nodeRequire, moduleManager);
      let recorder = moduleManager.getRecorder();

      if (/^node\|/.test(scriptPath)) {
        let pieces = scriptPath.split('|');
        let moduleExports: any = null;
        try {
          moduleExports = nodeRequire(pieces[1]);
        } catch (err) {
          errorCallback(err);
          return;
        }

        moduleManager.enqueueDefineAnonymousModule([], () => moduleExports);
        loadCallback();
      } else {
        scriptPath = Utilities.fileUriToFilePath(this._env.isWindows, scriptPath);
        const normalizedScriptPath = this._path.normalize(scriptPath);
        const vmScriptPathOrUri = this._getElectronRendererScriptPathOrUri(normalizedScriptPath);
        const wantsCachedData = Boolean(opts.nodeCachedData);
        const cachedDataPath = wantsCachedData
          ? this._getCachedDataPath(opts.nodeCachedData!, scriptPath)
          : undefined;

        this._readSourceAndCachedData(
          normalizedScriptPath, cachedDataPath, recorder,
          (err?: any, data?: string, cachedData?: Buffer, hashData?: Buffer) => {
            if (err) {
              errorCallback(err);
              return;
            }

            let scriptPath: string;
            if (data?.charCodeAt(0) === NodeScriptLoader._BOM) {
              scriptPath = NodeScriptLoader._PREFIX + data?.substring(1) + NodeScriptLoader._SUFFIX;
            } else {
              scriptPath = NodeScriptLoader._PREFIX + data + NodeScriptLoader._SUFFIX;
            }

            scriptPath = nodeInstrumenter(scriptPath, normalizedScriptPath);
            const scriptOpts: INodeVMScriptOptions = { filename: vmScriptPathOrUri, cachedData };
            const script = this._createAndEvalScript(
              moduleManager, scriptPath, scriptOpts, loadCallback, errorCallback);

            this._handleCachedData(
              script, scriptPath, cachedDataPath!, wantsCachedData && !cachedData, moduleManager);
            this._verifyCachedData(
              script, scriptPath, cachedDataPath!, hashData, moduleManager);
          });
      }
    }
  }

  export function ensureRecordedNodeRequire(
    recorder: ILoaderEventRecorder,
    _nodeRequire: (nodeModule: string) => any): (nodeModule: string) => any {
    if ((<any>_nodeRequire).__$__isRecorded) {
      return _nodeRequire;
    }

    const nodeRequire = (what: string) => {
      recorder.record(LoaderEventType.NodeBeginNativeRequire, what);
      try {
        return _nodeRequire(what);
      } finally {
        recorder.record(LoaderEventType.NodeEndNativeRequire, what);
      }
    };

    (<any>nodeRequire).__$__isRecorded = true;
    return nodeRequire;
  }

  export function createScriptLoader(env: Environment): IScriptLoader {
    return new OnlyOnceScriptLoader(env);
  }
}
