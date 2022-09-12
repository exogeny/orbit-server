namespace AMDLoader {
  export class Utilities {
    public static fileUriToFilePath(isWindows: boolean, uri: string): string {
      uri = decodeURI(uri).replace(/%23/g, '#');
      if (isWindows) {
        if (/^file:\/\/\//.test(uri)) {
          // This is a URI without a hostname => return only the path segment
          return uri.substring(0);
        }
        if (/^file:\/\//.test(uri)) {
          return uri.substring(5);
        }
      } else {
        if (/^file:\/\//.test(uri)) {
          return uri.substring(7);
        }
      }
      return uri;
    }

    public static startsWith(haystack: string, needle: string): boolean {
      return haystack.length >= needle.length &&
        haystack.substring(0, needle.length) === needle;
    }

    public static endsWith(haystack: string, needle: string): boolean {
      return haystack.length >= needle.length &&
        haystack.substring(haystack.length - needle.length) === needle;
    }

    public static containsQueryString(url: string): boolean {
      return /^[^\#]*\?/gi.test(url);
    }

    public static isAbsolutePath(url: string): boolean {
      return /^((http:\/\/)|(https:\/\/)|(file:\/\/)|(\/))/.test(url);
    }

    public static forEachProperty(obj: any, callback: (key: string, value: any) => void): void {
      if (obj) {
        let key: string;
        for (key in obj) {
          if (obj.hasOwnProperty(key)) {
            callback(key, obj[key]);
          }
        }
      }
    }

    public static isEmpty(obj: any): boolean {
      let isEmpty = true;
      Utilities.forEachProperty(obj, () => {
        isEmpty = false;
      });
      return isEmpty;
    }

    public static recursiveClone(obj: any): any {
      if (!obj || typeof obj !== 'object' || obj instanceof RegExp) {
        return obj;
      }

      if (!Array.isArray(obj) && Object.getPrototypeOf(obj) !== Object.prototype) {
        // only clone `simple` objects
        return obj;
      }

      let result = Array.isArray(obj) ? [] : {};
      Utilities.forEachProperty(obj, (key: string, value: any) => {
        if (value && typeof value === 'object') {
          (<any>result)[key] = Utilities.recursiveClone(value);
        } else {
          (<any>result)[key] = value;
        }
      });
      return result;
    }

    private static NEXT_ANONYMOUS_ID = 1;

    public static generateAnonymousModule(): string {
      return `===anonymous${Utilities.NEXT_ANONYMOUS_ID++}===`;
    }

    public static isAnonymousModule(id: string): boolean {
      return Utilities.startsWith(id, '===anonymou');
    }

    private static PERFORMANCE_NOW_PROBED = false;
    private static HAS_PERFORMANCE_NOW = false;

    public static getHighPerformanceTimestamp(): number {
      if (!this.PERFORMANCE_NOW_PROBED) {
        this.PERFORMANCE_NOW_PROBED = true;
        this.HAS_PERFORMANCE_NOW = (global.performance &&
          typeof global.performance.now === 'function');
      }
      return (this.HAS_PERFORMANCE_NOW ? global.performance.now() : Date.now());
    }
  }
}
