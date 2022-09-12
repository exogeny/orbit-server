export interface PerformanceMark {
  readonly name: string;
  readonly startTime: number;
}

function _definePolyfillMarks(timeOrigin: number | undefined = undefined) {
  const _data: PerformanceMark[] = [];
  if (typeof timeOrigin === 'number') {
    _data.push({ name: 'orbit/timeOrigin', startTime: timeOrigin });
  }

  function mark(name: string): void {
    _data.push({ name: name, startTime: Date.now() });
  }

  function getMarks(): PerformanceMark[] {
    return _data;
  }

  return { mark, getMarks };
}

function _defineNativePolyfillMarks() {
  function mark(name: string) {
    performance.mark(name);
  }

  function getMarks() {
    let timeOrigin = performance.timeOrigin;
    if (typeof timeOrigin !== 'number') {
      // safari: there is no timeOrigin but in renderers there is the
      // timing-property, see https://bugs.webkit.org/show_bug.cgi?id=174862
      timeOrigin = performance.timing.navigationStart
        || performance.timing.redirectStart
        || performance.timing.fetchStart;
    }
    const result = [{
      name: 'orbit/timeOrigin',
      startTime: Math.round(timeOrigin)
    }];
    for (const entry of performance.getEntriesByType('mark')) {
      result.push({
        name: entry.name,
        startTime: Math.round(timeOrigin + entry.startTime)
      });
    }
    return result;
  }

  return { mark, getMarks };
}

function _define() {
  // Identify browser environment when following property is not present
  // https://nodejs.org/dist/latest-v16.x/docs/api/perf_hooks.html#performancenodetiming
  if (typeof performance === 'object' && typeof performance.mark === 'function' || !performance.nodeTiming) {
    // in a browser context, reuse performance-util

    if (typeof performance.timeOrigin !== 'number' && !performance.timing) {
      // safari & webworker: because there is no timeOrigin and no workaround
      // we use the `Data.now`-based polyfill.
      return _definePolyfillMarks();
    } else {
      // use 'native' performance for mark and getMarks
      return _defineNativePolyfillMarks();
    }
  } else if (typeof process === 'object') {
    // node.js: use the normal polyfill but add the timeOrigin
    // from the node perf_hooks API as every first mark
    const timeOrigin = Math.round(
      (require.nodeRequire || require)('perf_hooks').performance.timeOrigin);
    return _definePolyfillMarks(timeOrigin);
  } else {
    // unknown environment
    console.trace('perf-util loaded in UNKONWN environment.');
    return _definePolyfillMarks();
  }
}

function _factory(sharedObj: any) {
  if (!sharedObj.OrbitPerformanceMarks) {
    sharedObj.OrbitPerformanceMarks = _define();
  }
  return sharedObj.OrbitPerformanceMarks;
}

// eslint-disable-next-line no-var
var sharedObj: any;
if (typeof sharedObj === 'object') {
  // nodejs
  sharedObj = global;
} else if (typeof self === 'object') {
  // browser
  sharedObj = {};
} else {
  sharedObj = {};
}

if (typeof define === 'function') {
  // amd
  define([], function () { return _factory(sharedObj); });
} else if (typeof module === 'object' && typeof module.exports === 'object') {
  // commonjs
  module.exports = _factory(sharedObj);
} else {
  console.trace('perf-util defined in UNKNOWN context (neither requirejs or commonjs');
  sharedObj.perf = _factory(sharedObj);
}
