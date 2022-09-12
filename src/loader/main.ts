'use strict';

declare var doNotInitializeLoader: boolean | undefined;
var define;

namespace AMDLoader {
  const env = new Environment();
  let moduleManager: ModuleManager = null!;
  const defineFunc: IDefineFunc = <any>function (id: any, dependencies: any, callback: any): void {
    if (typeof id !== 'string') {
      callback = dependencies;
      dependencies = id;
      id = null;
    }

    if (typeof dependencies !== 'object' || !Array.isArray(dependencies)) {
      callback = dependencies;
      dependencies = null;
    }

    if (!dependencies) {
      dependencies = ['require', 'exports', 'module'];
    }

    if (id) {
      moduleManager.defineModule(id, dependencies, callback, null, null);
    } else {
      moduleManager.enqueueDefineAnonymousModule(dependencies, callback);
    }
  };

  defineFunc.amd = {
    JQuery: true
  };

  const _requireFuncConfig = function (params: IConfigurationOptions, shouldOverwrite: boolean = false): void {
    moduleManager.configure(params, shouldOverwrite);
  };

  const requireFunc: IRequireFunc = <any>function () {
    if (arguments.length === 1) {
      if ((arguments[0] instanceof Object) && !Array.isArray(arguments[0])) {
        _requireFuncConfig(arguments[0]);
        return;
      }

      if (typeof arguments[0] === 'string') {
        return moduleManager.synchronousRequire(arguments[0]);
      }
    }
    if (arguments.length === 2 || arguments.length === 3) {
      if (Array.isArray(arguments[0])) {
        moduleManager.defineModule(
          Utilities.generateAnonymousModule(), arguments[0], arguments[1], arguments[2], null);
        return;
      }
    }
    throw new Error('Unrecognized require call.');
  };
  requireFunc.config = _requireFuncConfig;
  requireFunc.getConfig = function (): IConfigurationOptions {
    return moduleManager.getConfig().getOptionsLiterral();
  };
  requireFunc.reset = function (): void {
    moduleManager = moduleManager.reset();
  };
  requireFunc.getBuildInfo = function (): IBuildModuleInfo[] | null {
    return moduleManager.getBuildInfo();
  }
  requireFunc.getStats = function (): LoaderEvent[] {
    return moduleManager.getLoaderEvents();
  }
  requireFunc.define = defineFunc;

  export function initialize(): void {
    if (typeof global.require !== 'undefined' || typeof require !== 'undefined') {
      const _nodeRequire = (global.require || require);
      if (typeof _nodeRequire === 'function' && typeof _nodeRequire.resolve === 'function') {
        // re-expose node's require function
        const nodeRequire = ensureRecordedNodeRequire(moduleManager.getRecorder(), _nodeRequire);
        global.nodeRequire = nodeRequire;
        (<any>requireFunc).nodeRequire = nodeRequire;
        (<any>requireFunc).__$__nodeRequire = nodeRequire;
      }
    }

    if (env.isNode && !env.isElectronRenderer && !env.isElectronNodeIntegrationWebWorker) {
      module.exports = requireFunc;
      require = <any>requireFunc;
    } else {
      if (!env.isElectronRenderer) {
        global.define = defineFunc;
      }
      global.require = requireFunc;
    }
  }

  if (typeof global.define !== 'function' || !global.define.amd) {
    moduleManager = new ModuleManager(
      env, createScriptLoader(env), defineFunc, requireFunc,
      Utilities.getHighPerformanceTimestamp());

    // The global variable require can configure the loader
    if (typeof global.require !== 'undefined' && typeof global.require !== 'function') {
      requireFunc.config(global.require, false);
    }

    // This define is for the local closure defined in node in the case that the
    // loader is concatented.
    define = function () {
      return defineFunc.apply(null, <any>arguments);
    };
    (<any>define).amd = defineFunc.amd;

    if (typeof doNotInitializeLoader === 'undefined') {
      initialize();
    }
  }
}
