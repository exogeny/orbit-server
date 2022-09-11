declare module 'vinyl' {
  import fs = require('fs');

  class File {
    constructor(options?: {
      cwd?: string;
      base?: string;
      path?: string;
      history?: string;
      stat?: fs.Stats;
      contents?: Buffer | NodeJS.ReadWriteStream;
    });

    public cwd: string;
    public base: string;
    basename: string;
    public path: string;
    public stat: fs.Stats;
    public contents: Buffer | NodeJS.ReadWriteStream;
    public relative: string;

    public isBuffer(): boolean;
    public isStream(): boolean;
    public isNull(): boolean;
    public isDirectory(): boolean;
    public clone(opts?: { contents?: boolean }): File;
    public pipe<T extends NodeJS.ReadWriteStream>(
      stream: T,
      opts?: {
        end?: boolean;
      }
    ): T;
    public inspect(): string;
  }

  namespace File { }

  export = File;
}