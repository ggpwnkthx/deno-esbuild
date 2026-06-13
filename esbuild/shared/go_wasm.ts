// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

export {};

interface ErrnoError extends Error {
  code?: string;
}

type ErrnoCallback = (err: ErrnoError | null) => void;
type WriteCallback = (err: ErrnoError | null, bytesWritten?: number) => void;
type ReadCallback = (err: ErrnoError | null, bytesRead?: number) => void;

interface GoWasmFS {
  constants: {
    O_WRONLY: number;
    O_RDWR: number;
    O_CREAT: number;
    O_TRUNC: number;
    O_APPEND: number;
    O_EXCL: number;
    O_DIRECTORY: number;
  };

  writeSync(fd: number, buf: Uint8Array): number;
  write(
    fd: number,
    buf: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
    callback: WriteCallback,
  ): void;

  read(
    fd: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
    callback: ReadCallback,
  ): void;

  chmod(path: string, mode: number, callback: ErrnoCallback): void;
  chown(path: string, uid: number, gid: number, callback: ErrnoCallback): void;
  close(fd: number, callback: ErrnoCallback): void;
  fchmod(fd: number, mode: number, callback: ErrnoCallback): void;
  fchown(fd: number, uid: number, gid: number, callback: ErrnoCallback): void;
  fstat(fd: number, callback: ErrnoCallback): void;
  fsync(fd: number, callback: ErrnoCallback): void;
  ftruncate(fd: number, length: number, callback: ErrnoCallback): void;
  lchown(path: string, uid: number, gid: number, callback: ErrnoCallback): void;
  link(path: string, link: string, callback: ErrnoCallback): void;
  lstat(path: string, callback: ErrnoCallback): void;
  mkdir(path: string, perm: number, callback: ErrnoCallback): void;
  open(
    path: string,
    flags: number,
    mode: number,
    callback: ErrnoCallback,
  ): void;
  readdir(path: string, callback: ErrnoCallback): void;
  readlink(path: string, callback: ErrnoCallback): void;
  rename(from: string, to: string, callback: ErrnoCallback): void;
  rmdir(path: string, callback: ErrnoCallback): void;
  stat(path: string, callback: ErrnoCallback): void;
  symlink(path: string, link: string, callback: ErrnoCallback): void;
  truncate(path: string, length: number, callback: ErrnoCallback): void;
  unlink(path: string, callback: ErrnoCallback): void;
  utimes(
    path: string,
    atime: number | Date,
    mtime: number | Date,
    callback: ErrnoCallback,
  ): void;
}

interface GoWasmProcess {
  getuid(): number;
  getgid(): number;
  geteuid(): number;
  getegid(): number;
  getgroups(): never;
  pid: number;
  ppid: number;
  umask(): never;
  cwd(): never;
  chdir(): never;
}

interface GoWasmPath {
  resolve(...pathSegments: string[]): string;
}

type GoWasmExports = WebAssembly.Exports & {
  mem: WebAssembly.Memory;
  run(argc: number, argv: number): void;
  resume(): void;
  getsp(): number;
};

type GoTestExports = GoWasmExports & {
  testExport0?: () => void;
  testExport?: (a: unknown, b: unknown) => unknown;
};

type GoWasmInstance = WebAssembly.Instance & {
  exports: GoWasmExports;
};

interface PendingEvent {
  id: number;
  this: unknown;
  args: unknown[];
  result?: unknown;
}

interface GoWasmGlobal {
  fs?: GoWasmFS;
  process?: GoWasmProcess;
  path?: GoWasmPath;
  Go?: typeof GoWasmRuntime;

  crypto?: Crypto;
  performance?: Performance;
  TextEncoder?: typeof TextEncoder;
  TextDecoder?: typeof TextDecoder;
}

const goGlobal = globalThis as unknown as GoWasmGlobal;

const enosys = (): ErrnoError => {
  const err = new Error("not implemented") as ErrnoError;
  err.code = "ENOSYS";
  return err;
};

if (!goGlobal.crypto) {
  throw new Error(
    "goGlobal.crypto is not available, polyfill required (crypto.getRandomValues only)",
  );
}

if (!goGlobal.performance) {
  throw new Error(
    "goGlobal.performance is not available, polyfill required (performance.now only)",
  );
}

if (!goGlobal.TextEncoder) {
  throw new Error("goGlobal.TextEncoder is not available, polyfill required");
}

if (!goGlobal.TextDecoder) {
  throw new Error("goGlobal.TextDecoder is not available, polyfill required");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

if (!goGlobal.fs) {
  let outputBuf = "";

  goGlobal.fs = {
    constants: {
      O_WRONLY: -1,
      O_RDWR: -1,
      O_CREAT: -1,
      O_TRUNC: -1,
      O_APPEND: -1,
      O_EXCL: -1,
      O_DIRECTORY: -1,
    },

    writeSync(_fd, buf) {
      outputBuf += decoder.decode(buf);

      const nl = outputBuf.lastIndexOf("\n");
      if (nl !== -1) {
        console.log(outputBuf.substring(0, nl));
        outputBuf = outputBuf.substring(nl + 1);
      }

      return buf.length;
    },

    write(fd, buf, offset, length, position, callback) {
      if (offset !== 0 || length !== buf.length || position !== null) {
        callback(enosys());
        return;
      }

      const n = this.writeSync(fd, buf);
      callback(null, n);
    },

    chmod(_path, _mode, callback) {
      callback(enosys());
    },
    chown(_path, _uid, _gid, callback) {
      callback(enosys());
    },
    close(_fd, callback) {
      callback(enosys());
    },
    fchmod(_fd, _mode, callback) {
      callback(enosys());
    },
    fchown(_fd, _uid, _gid, callback) {
      callback(enosys());
    },
    fstat(_fd, callback) {
      callback(enosys());
    },
    fsync(_fd, callback) {
      callback(null);
    },
    ftruncate(_fd, _length, callback) {
      callback(enosys());
    },
    lchown(_path, _uid, _gid, callback) {
      callback(enosys());
    },
    link(_path, _link, callback) {
      callback(enosys());
    },
    lstat(_path, callback) {
      callback(enosys());
    },
    mkdir(_path, _perm, callback) {
      callback(enosys());
    },
    open(_path, _flags, _mode, callback) {
      callback(enosys());
    },
    read(_fd, _buffer, _offset, _length, _position, callback) {
      callback(enosys());
    },
    readdir(_path, callback) {
      callback(enosys());
    },
    readlink(_path, callback) {
      callback(enosys());
    },
    rename(_from, _to, callback) {
      callback(enosys());
    },
    rmdir(_path, callback) {
      callback(enosys());
    },
    stat(_path, callback) {
      callback(enosys());
    },
    symlink(_path, _link, callback) {
      callback(enosys());
    },
    truncate(_path, _length, callback) {
      callback(enosys());
    },
    unlink(_path, callback) {
      callback(enosys());
    },
    utimes(_path, _atime, _mtime, callback) {
      callback(enosys());
    },
  };
}

if (!goGlobal.process) {
  goGlobal.process = {
    getuid() {
      return -1;
    },
    getgid() {
      return -1;
    },
    geteuid() {
      return -1;
    },
    getegid() {
      return -1;
    },
    getgroups() {
      throw enosys();
    },
    pid: -1,
    ppid: -1,
    umask() {
      throw enosys();
    },
    cwd() {
      throw enosys();
    },
    chdir() {
      throw enosys();
    },
  };
}

if (!goGlobal.path) {
  goGlobal.path = {
    resolve(...pathSegments) {
      return pathSegments.join("/");
    },
  };
}

class GoWasmRuntime {
  argv: string[] = ["js"];
  env: Record<string, string> = {};
  exit: (code: number) => void;

  importObject: WebAssembly.Imports;
  exited = false;

  private mem!: DataView;
  private _inst?: GoWasmInstance;
  private _values?: unknown[];
  private _goRefCounts?: number[];
  private _ids?: Map<unknown, number>;
  private _idPool?: number[];
  private _exitPromise: Promise<void>;
  private _resolveExitPromise!: () => void;
  private _pendingEvent: PendingEvent | null = null;
  private _scheduledTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
  private _nextCallbackTimeoutID = 1;

  constructor() {
    this.exit = (code) => {
      if (code !== 0) {
        console.warn("exit code:", code);
      }
    };

    this._exitPromise = new Promise<void>((resolve) => {
      this._resolveExitPromise = resolve;
    });

    const setInt64 = (addr: number, v: number): void => {
      this.mem.setUint32(addr + 0, v, true);
      this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true);
    };

    const getInt64 = (addr: number): number => {
      const low = this.mem.getUint32(addr + 0, true);
      const high = this.mem.getInt32(addr + 4, true);
      return low + high * 4294967296;
    };

    const loadValue = (addr: number): unknown => {
      const f = this.mem.getFloat64(addr, true);
      if (f === 0) {
        return undefined;
      }
      if (!Number.isNaN(f)) {
        return f;
      }

      const id = this.mem.getUint32(addr, true);
      return this._values![id];
    };

    const storeValue = (addr: number, v: unknown): void => {
      const nanHead = 0x7FF80000;

      if (typeof v === "number" && v !== 0) {
        if (Number.isNaN(v)) {
          this.mem.setUint32(addr + 4, nanHead, true);
          this.mem.setUint32(addr, 0, true);
          return;
        }

        this.mem.setFloat64(addr, v, true);
        return;
      }

      if (v === undefined) {
        this.mem.setFloat64(addr, 0, true);
        return;
      }

      let id = this._ids!.get(v);
      if (id === undefined) {
        id = this._idPool!.pop();

        if (id === undefined) {
          id = this._values!.length;
        }

        this._values![id] = v;
        this._goRefCounts![id] = 0;
        this._ids!.set(v, id);
      }

      this._goRefCounts![id]++;

      let typeFlag = 0;
      switch (typeof v) {
        case "object":
          if (v !== null) {
            typeFlag = 1;
          }
          break;

        case "string":
          typeFlag = 2;
          break;

        case "symbol":
          typeFlag = 3;
          break;

        case "function":
          typeFlag = 4;
          break;
      }

      this.mem.setUint32(addr + 4, nanHead | typeFlag, true);
      this.mem.setUint32(addr, id, true);
    };

    const loadSlice = (addr: number): Uint8Array => {
      const array = getInt64(addr + 0);
      const len = getInt64(addr + 8);
      return new Uint8Array(this._inst!.exports.mem.buffer, array, len);
    };

    const loadSliceOfValues = (addr: number): unknown[] => {
      const array = getInt64(addr + 0);
      const len = getInt64(addr + 8);
      const values = new Array<unknown>(len);

      for (let i = 0; i < len; i++) {
        values[i] = loadValue(array + i * 8);
      }

      return values;
    };

    const loadString = (addr: number): string => {
      const saddr = getInt64(addr + 0);
      const len = getInt64(addr + 8);

      return decoder.decode(
        new DataView(this._inst!.exports.mem.buffer, saddr, len),
      );
    };

    const testCallExport = (a: unknown, b: unknown): unknown => {
      const exports = this._inst!.exports as GoTestExports;

      exports.testExport0?.();

      if (!exports.testExport) {
        throw new Error("Go test export is missing");
      }

      return exports.testExport(a, b);
    };

    const timeOrigin = Date.now() - performance.now();

    this.importObject = {
      _gotest: {
        add: (a: number, b: number) => a + b,
        callExport: testCallExport,
      },

      gojs: {
        "runtime.wasmExit": (sp: number): void => {
          sp >>>= 0;

          const code = this.mem.getInt32(sp + 8, true);
          this.exited = true;

          this._inst = undefined;
          this._values = undefined;
          this._goRefCounts = undefined;
          this._ids = undefined;
          this._idPool = undefined;

          this.exit(code);
        },

        "runtime.wasmWrite": (sp: number): void => {
          sp >>>= 0;

          const fd = getInt64(sp + 8);
          const p = getInt64(sp + 16);
          const n = this.mem.getInt32(sp + 24, true);

          goGlobal.fs!.writeSync(
            fd,
            new Uint8Array(this._inst!.exports.mem.buffer, p, n),
          );
        },

        "runtime.resetMemoryDataView": (sp: number): void => {
          sp >>>= 0;
          this.mem = new DataView(this._inst!.exports.mem.buffer);
        },

        "runtime.nanotime1": (sp: number): void => {
          sp >>>= 0;
          setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000);
        },

        "runtime.walltime": (sp: number): void => {
          sp >>>= 0;

          const msec = new Date().getTime();
          setInt64(sp + 8, msec / 1000);
          this.mem.setInt32(sp + 16, (msec % 1000) * 1000000, true);
        },

        "runtime.scheduleTimeoutEvent": (sp: number): void => {
          sp >>>= 0;

          const id = this._nextCallbackTimeoutID;
          this._nextCallbackTimeoutID++;

          this._scheduledTimeouts.set(
            id,
            setTimeout(() => {
              this._resume();

              while (this._scheduledTimeouts.has(id)) {
                console.warn("scheduleTimeoutEvent: missed timeout event");
                this._resume();
              }
            }, getInt64(sp + 8)),
          );

          this.mem.setInt32(sp + 16, id, true);
        },

        "runtime.clearTimeoutEvent": (sp: number): void => {
          sp >>>= 0;

          const id = this.mem.getInt32(sp + 8, true);
          clearTimeout(this._scheduledTimeouts.get(id));
          this._scheduledTimeouts.delete(id);
        },

        "runtime.getRandomData": (sp: number): void => {
          sp >>>= 0;
          crypto.getRandomValues(loadSlice(sp + 8));
        },

        "syscall/js.finalizeRef": (sp: number): void => {
          sp >>>= 0;

          const id = this.mem.getUint32(sp + 8, true);
          this._goRefCounts![id]--;

          if (this._goRefCounts![id] === 0) {
            const v = this._values![id];
            this._values![id] = null;
            this._ids!.delete(v);
            this._idPool!.push(id);
          }
        },

        "syscall/js.stringVal": (sp: number): void => {
          sp >>>= 0;
          storeValue(sp + 24, loadString(sp + 8));
        },

        "syscall/js.valueGet": (sp: number): void => {
          sp >>>= 0;

          const result = Reflect.get(
            loadValue(sp + 8) as object,
            loadString(sp + 16),
          );

          sp = this._inst!.exports.getsp() >>> 0;
          storeValue(sp + 32, result);
        },

        "syscall/js.valueSet": (sp: number): void => {
          sp >>>= 0;

          Reflect.set(
            loadValue(sp + 8) as object,
            loadString(sp + 16),
            loadValue(sp + 32),
          );
        },

        "syscall/js.valueDelete": (sp: number): void => {
          sp >>>= 0;

          Reflect.deleteProperty(
            loadValue(sp + 8) as object,
            loadString(sp + 16),
          );
        },

        "syscall/js.valueIndex": (sp: number): void => {
          sp >>>= 0;

          storeValue(
            sp + 24,
            Reflect.get(loadValue(sp + 8) as object, getInt64(sp + 16)),
          );
        },

        "syscall/js.valueSetIndex": (sp: number): void => {
          sp >>>= 0;

          Reflect.set(
            loadValue(sp + 8) as object,
            getInt64(sp + 16),
            loadValue(sp + 24),
          );
        },

        "syscall/js.valueCall": (sp: number): void => {
          sp >>>= 0;

          try {
            const v = loadValue(sp + 8);
            const m = Reflect.get(v as object, loadString(sp + 16));
            const args = loadSliceOfValues(sp + 32);
            const result = Reflect.apply(
              m as (...args: unknown[]) => unknown,
              v,
              args,
            );

            sp = this._inst!.exports.getsp() >>> 0;
            storeValue(sp + 56, result);
            this.mem.setUint8(sp + 64, 1);
          } catch (err) {
            sp = this._inst!.exports.getsp() >>> 0;
            storeValue(sp + 56, err);
            this.mem.setUint8(sp + 64, 0);
          }
        },

        "syscall/js.valueInvoke": (sp: number): void => {
          sp >>>= 0;

          try {
            const v = loadValue(sp + 8);
            const args = loadSliceOfValues(sp + 16);
            const result = Reflect.apply(
              v as (...args: unknown[]) => unknown,
              undefined,
              args,
            );

            sp = this._inst!.exports.getsp() >>> 0;
            storeValue(sp + 40, result);
            this.mem.setUint8(sp + 48, 1);
          } catch (err) {
            sp = this._inst!.exports.getsp() >>> 0;
            storeValue(sp + 40, err);
            this.mem.setUint8(sp + 48, 0);
          }
        },

        "syscall/js.valueNew": (sp: number): void => {
          sp >>>= 0;

          try {
            const v = loadValue(sp + 8);
            const args = loadSliceOfValues(sp + 16);
            const result = Reflect.construct(
              v as new (...args: unknown[]) => unknown,
              args,
            );

            sp = this._inst!.exports.getsp() >>> 0;
            storeValue(sp + 40, result);
            this.mem.setUint8(sp + 48, 1);
          } catch (err) {
            sp = this._inst!.exports.getsp() >>> 0;
            storeValue(sp + 40, err);
            this.mem.setUint8(sp + 48, 0);
          }
        },

        "syscall/js.valueLength": (sp: number): void => {
          sp >>>= 0;

          const value = loadValue(sp + 8) as { length: unknown };
          setInt64(sp + 16, Number.parseInt(String(value.length), 10));
        },

        "syscall/js.valuePrepareString": (sp: number): void => {
          sp >>>= 0;

          const str = encoder.encode(String(loadValue(sp + 8)));
          storeValue(sp + 16, str);
          setInt64(sp + 24, str.length);
        },

        "syscall/js.valueLoadString": (sp: number): void => {
          sp >>>= 0;

          const str = loadValue(sp + 8) as Uint8Array;
          loadSlice(sp + 16).set(str);
        },

        "syscall/js.valueInstanceOf": (sp: number): void => {
          sp >>>= 0;

          this.mem.setUint8(
            sp + 24,
            loadValue(sp + 8) instanceof
                (loadValue(sp + 16) as new (...args: unknown[]) => unknown)
              ? 1
              : 0,
          );
        },

        "syscall/js.copyBytesToGo": (sp: number): void => {
          sp >>>= 0;

          const dst = loadSlice(sp + 8);
          const src = loadValue(sp + 32);

          if (
            !(src instanceof Uint8Array || src instanceof Uint8ClampedArray)
          ) {
            this.mem.setUint8(sp + 48, 0);
            return;
          }

          const toCopy = src.subarray(0, dst.length);
          dst.set(toCopy);
          setInt64(sp + 40, toCopy.length);
          this.mem.setUint8(sp + 48, 1);
        },

        "syscall/js.copyBytesToJS": (sp: number): void => {
          sp >>>= 0;

          const dst = loadValue(sp + 8);
          const src = loadSlice(sp + 16);

          if (
            !(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)
          ) {
            this.mem.setUint8(sp + 48, 0);
            return;
          }

          const toCopy = src.subarray(0, dst.length);
          dst.set(toCopy);
          setInt64(sp + 40, toCopy.length);
          this.mem.setUint8(sp + 48, 1);
        },

        debug: (value: unknown): void => {
          console.log(value);
        },
      },
    };
  }

  async run(instance: WebAssembly.Instance): Promise<void> {
    if (!(instance instanceof WebAssembly.Instance)) {
      throw new Error("Go.run: WebAssembly.Instance expected");
    }

    this._inst = instance as GoWasmInstance;
    this.mem = new DataView(this._inst.exports.mem.buffer);

    this._values = [
      NaN,
      0,
      null,
      true,
      false,
      goGlobal,
      this,
    ];

    this._goRefCounts = new Array(this._values.length).fill(Infinity);

    this._ids = new Map<unknown, number>([
      [0, 1],
      [null, 2],
      [true, 3],
      [false, 4],
      [goGlobal, 5],
      [this, 6],
    ]);

    this._idPool = [];
    this.exited = false;

    let offset = 4096;

    const strPtr = (str: string): number => {
      const ptr = offset;
      const bytes = encoder.encode(`${str}\0`);

      new Uint8Array(this.mem.buffer, offset, bytes.length).set(bytes);
      offset += bytes.length;

      if (offset % 8 !== 0) {
        offset += 8 - (offset % 8);
      }

      return ptr;
    };

    const argc = this.argv.length;
    const argvPtrs: number[] = [];

    this.argv.forEach((arg) => {
      argvPtrs.push(strPtr(arg));
    });
    argvPtrs.push(0);

    const keys = Object.keys(this.env).sort();
    keys.forEach((key) => {
      argvPtrs.push(strPtr(`${key}=${this.env[key]}`));
    });
    argvPtrs.push(0);

    const argv = offset;
    argvPtrs.forEach((ptr) => {
      this.mem.setUint32(offset, ptr, true);
      this.mem.setUint32(offset + 4, 0, true);
      offset += 8;
    });

    const wasmMinDataAddr = 4096 + 8192;
    if (offset >= wasmMinDataAddr) {
      throw new Error(
        "total length of command line and environment variables exceeds limit",
      );
    }

    this._inst.exports.run(argc, argv);

    if (this.exited) {
      this._resolveExitPromise();
    }

    await this._exitPromise;
  }

  _resume(): void {
    if (this.exited) {
      throw new Error("Go program has already exited");
    }

    this._inst!.exports.resume();

    if (this.exited) {
      this._resolveExitPromise();
    }
  }

  _makeFuncWrapper(id: number): (this: unknown, ...args: unknown[]) => unknown {
    return makeFuncWrapper(this, id);
  }

  _setPendingEvent(event: PendingEvent): void {
    this._pendingEvent = event;
  }
}

function makeFuncWrapper(
  go: GoWasmRuntime,
  id: number,
): (this: unknown, ...args: unknown[]) => unknown {
  return function (this: unknown, ...args: unknown[]): unknown {
    const event: PendingEvent = {
      id,
      this: this,
      args,
    };

    go._setPendingEvent(event);
    go._resume();

    return event.result;
  };
}

goGlobal.Go = GoWasmRuntime;
