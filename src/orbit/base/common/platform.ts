const LANGUAGE_DEFAULT = 'en';

let _isWindows = false;
let _isMacintosh = false
let _isLinux = false;
let _isLinuxSnap = false;
let _locale: string | undefined = undefined;
let _language: string = LANGUAGE_DEFAULT;
let _translationsConfigFile: string | undefined = undefined;

export interface IProcessEnvironment {
  [key: string]: string | undefined;
}

/**
 * This interface is intentionally not identical to node.js
 * process because it also works in sandboxed environments
 * where the process object is implemented differently. We
 * define the properties here that we need for `platform`
 * to work and nothing else.
 */
export interface INodeProcess {
  platform: string;
  arch: string;
  env: IProcessEnvironment;
  versions?: {
    electron?: string;
  };
  type?: string;
  cwd: () => string;
}

interface NLSConfig {
  locale: string;
  availableLanguages: { [key: string]: string };
  _translationsConfigFile: string;
}

declare const process: INodeProcess;
declare const global: unknown;
declare const self: unknown;
export const globals: any = (typeof self === 'object' ? self : typeof global === 'object' ? global : {});

let nodeProcess: INodeProcess | undefined = undefined;
if (typeof globals.orbit !== 'undefined' && typeof globals.orbit.process !== 'undefined') {
  // Native environment (sandboxed)
  nodeProcess = globals.orbit.process;
} else if (typeof process !== 'undefined') {
  // Native environment (non-sandboxed)
  nodeProcess = process;
}

// Native environment
if (typeof nodeProcess === 'object') {
  _isWindows = (nodeProcess.platform === 'win32');
  _isMacintosh = (nodeProcess.platform === 'darwin');
  _isLinux = (nodeProcess.platform === 'linux');
  _isLinuxSnap = _isLinux && !!nodeProcess.env['SNAP'] && !!nodeProcess.env['SNAP_REVISION'];
  _locale = LANGUAGE_DEFAULT;
  _language = LANGUAGE_DEFAULT;
  const rawNlsConfig = nodeProcess.env['ORBIT_NLS_CONFIG'];
  if (rawNlsConfig) {
    try {
      const nlsConfig: NLSConfig = JSON.parse(rawNlsConfig);
      const resolved = nlsConfig.availableLanguages['*'];
      _locale = nlsConfig.locale;
      // VSCode's default language is 'en'
      _language = resolved ? resolved : LANGUAGE_DEFAULT;
      _translationsConfigFile = nlsConfig._translationsConfigFile;
    } catch (e) {
    }
  }
}
// Unknown environment
else {
  console.error('Unable to resolve platform.');
}

export const enum Platform {
  Web,
  Mac,
  Linux,
  Windows,
  iPhone,
  Android,
}

export function platformToString(platform: Platform) {
  switch (platform) {
    case Platform.Web: return 'Web';
    case Platform.Mac: return 'Mac';
    case Platform.Linux: return 'Linux';
    case Platform.Windows: return 'Windows';
    case Platform.iPhone: return 'iPhone';
    case Platform.Android: return 'Android';
  }
}

export const isWindows = _isWindows;
export const isMacintosh = _isMacintosh;
export const isLinux = _isLinux;
export const isLinuxSnap = _isLinuxSnap;

/**
 * The language used for the user interface.
 */
export const language = _language;

export namespace Language {

  export function value(): string {
    return language;
  }

  export function isDefaultVariant(): boolean {
    if (language.length === 2) {
      return language === 'en';
    } else if (language.length >= 3) {
      return language[0] === 'e' && language[1] === 'n' && language[2] === '-';
    } else {
      return false;
    }
  }

  export function isDefault(): boolean {
    return language === 'en';
  }
}

/**
 * The OS locale or the locale specified by --locale. The format of
 * the string is all lower case (e.g. zh-tw for Tranitional Chineses).
 * The UI is not necessarily shown in the provided locale.
 */
export const locale = _locale;

/**
 * The translations that are available through language packs.
 */
export const translationsConfigFile = _translationsConfigFile;
