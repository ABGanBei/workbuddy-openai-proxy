/* workbuddy-gateway server plugin — bundled single file. Do not edit. */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "16.6.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var crypto = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path2 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path2} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (debug || !quiet) {
        const keysCount = Object.keys(parsedAll).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// node_modules/dotenv/lib/env-options.js
var require_env_options = __commonJS({
  "node_modules/dotenv/lib/env-options.js"(exports2, module2) {
    var options = {};
    if (process.env.DOTENV_CONFIG_ENCODING != null) {
      options.encoding = process.env.DOTENV_CONFIG_ENCODING;
    }
    if (process.env.DOTENV_CONFIG_PATH != null) {
      options.path = process.env.DOTENV_CONFIG_PATH;
    }
    if (process.env.DOTENV_CONFIG_QUIET != null) {
      options.quiet = process.env.DOTENV_CONFIG_QUIET;
    }
    if (process.env.DOTENV_CONFIG_DEBUG != null) {
      options.debug = process.env.DOTENV_CONFIG_DEBUG;
    }
    if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
      options.override = process.env.DOTENV_CONFIG_OVERRIDE;
    }
    if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
      options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
    }
    module2.exports = options;
  }
});

// node_modules/dotenv/lib/cli-options.js
var require_cli_options = __commonJS({
  "node_modules/dotenv/lib/cli-options.js"(exports2, module2) {
    var re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
    module2.exports = function optionMatcher(args) {
      const options = args.reduce(function(acc, cur) {
        const matches = cur.match(re);
        if (matches) {
          acc[matches[1]] = matches[2];
        }
        return acc;
      }, {});
      if (!("quiet" in options)) {
        options.quiet = "true";
      }
      return options;
    };
  }
});

// src/utils/logger.ts
function setLogLevel(level) {
  currentLevel = level;
}
function write(level, scope, message, extra) {
  if (ORDER[level] < ORDER[currentLevel]) return;
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (extra !== void 0) {
    let suffix;
    try {
      suffix = typeof extra === "string" ? extra : JSON.stringify(extra);
    } catch {
      suffix = String(extra);
    }
    console.log(`${line} ${suffix}`);
    return;
  }
  console.log(line);
}
function createLogger(scope) {
  return {
    debug: (message, extra) => write("debug", scope, message, extra),
    info: (message, extra) => write("info", scope, message, extra),
    warn: (message, extra) => write("warn", scope, message, extra),
    error: (message, extra) => write("error", scope, message, extra)
  };
}
var ORDER, currentLevel;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    "use strict";
    ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
    currentLevel = "info";
  }
});

// src/workbuddy/at-rest.ts
function encodeUint32(value) {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32BE(value);
  return bytes;
}
function encodeLengthPrefixed(value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([encodeUint32(bytes.length), bytes]);
}
function fieldAad(keyId, suite) {
  if (!/^[0-9a-f]{16}$/u.test(keyId)) throw new Error("workbuddy: envelope keyId is malformed");
  return Buffer.concat([
    AAD_DOMAIN,
    Buffer.from([1]),
    encodeLengthPrefixed(STANDARD_FORMAT_ID["field"]),
    encodeLengthPrefixed(SYMMETRIC_SCHEME),
    encodeUint32(suite),
    encodeLengthPrefixed(keyId),
    Buffer.from([FRAMING_CODE["field"]]),
    // 无 sequence 与 final 标记
    Buffer.from([0]),
    Buffer.from([0])
  ]);
}
function isEncryptedFieldWrapper(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const wrapper = value;
  const keys = Object.keys(wrapper).sort();
  return keys.length === 2 && keys[0] === "$wbEncrypted" && keys[1] === "envelope" && wrapper["$wbEncrypted"] === 1 && typeof wrapper["envelope"] === "string";
}
function deriveAtRestKeyId(key) {
  return (0, import_node_crypto2.createHash)("sha256").update(key).digest("hex").slice(0, 16);
}
function deriveAtRestKey(payloadJson) {
  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("workbuddy: at-rest key payload is not valid JSON");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("workbuddy: at-rest key payload is not an object");
  }
  const secret = payload["atRestSecretKey"];
  if (typeof secret !== "string" || secret === "") {
    throw new Error("workbuddy: at-rest key payload carries no atRestSecretKey");
  }
  return (0, import_node_crypto2.createHash)("sha256").update(secret, "utf8").digest();
}
function openEncryptedField(field, key) {
  let envelope;
  try {
    envelope = JSON.parse(Buffer.from(field.envelope, "base64").toString("utf8"));
  } catch {
    throw new Error("workbuddy: encrypted field envelope is not valid JSON");
  }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    throw new Error("workbuddy: encrypted field envelope is not an object");
  }
  const record = envelope;
  const { suite, keyId, nonce, authTag, ciphertext } = record;
  if (typeof suite !== "number" || typeof keyId !== "string") {
    throw new Error("workbuddy: encrypted field envelope is missing suite or keyId");
  }
  if (typeof nonce !== "string" || typeof authTag !== "string" || typeof ciphertext !== "string") {
    throw new Error("workbuddy: encrypted field envelope is missing nonce, authTag or ciphertext");
  }
  const expectedKeyId = deriveAtRestKeyId(key);
  if (keyId !== expectedKeyId) {
    throw new Error(`workbuddy: encrypted field belongs to key ${keyId}, not the available key ${expectedKeyId}`);
  }
  const decipher = (0, import_node_crypto2.createDecipheriv)("aes-256-gcm", key, Buffer.from(nonce, "base64"), { authTagLength: 16 });
  decipher.setAAD(fieldAad(keyId, suite));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}
function fetchAtRestKeyPayload(executable) {
  return new Promise((resolve, reject) => {
    const source = "try{process.stdout.write(process._linkedBinding('electron_browser_workbuddy_storage').loggerGet())}catch(e){process.exitCode=3;process.stderr.write(String(e&&e.message||e))}";
    (0, import_node_child_process.execFile)(
      executable,
      ["-e", source],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        timeout: KEY_FETCH_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`workbuddy: the desktop app did not provide its at-rest key (${stderr.trim() || error.message})`));
          return;
        }
        const payload = stdout.trim();
        if (payload === "") {
          reject(new Error("workbuddy: the desktop app returned an empty at-rest key payload"));
          return;
        }
        resolve(payload);
      }
    );
  });
}
function queryRegistry(args) {
  try {
    return (0, import_node_child_process.execFileSync)("reg", [...args], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1e4
    });
  } catch {
    return void 0;
  }
}
function normalizeRegistryExecutable(value) {
  let unquoted = value.trim();
  if (unquoted === "") return void 0;
  if (unquoted.startsWith('"')) {
    const closing = unquoted.indexOf('"', 1);
    if (closing === -1) return void 0;
    unquoted = unquoted.slice(1, closing).trim();
  }
  const withoutIndex = unquoted.replace(/,\s*-?\d+\s*$/u, "");
  if (withoutIndex === "") return void 0;
  if (import_node_path2.win32.basename(withoutIndex).toLowerCase() !== APP_EXECUTABLE_NAME.toLowerCase()) return void 0;
  return withoutIndex;
}
function windowsRegistryAppExecutable() {
  const keys = [
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
  ];
  for (const root of keys) {
    const listing = queryRegistry(["query", root, "/s", "/f", "WorkBuddy", "/t", "REG_SZ"]);
    if (listing === void 0) continue;
    for (const rawLine of listing.split(/\r?\n/u)) {
      const icon = /^\s*DisplayIcon\s+REG_SZ\s+(.*?)\s*$/u.exec(rawLine);
      if (icon !== null) {
        const executable = normalizeRegistryExecutable(icon[1]);
        if (executable !== void 0 && (0, import_node_fs2.existsSync)(executable)) return executable;
      }
      const install = /^\s*InstallLocation\s+REG_SZ\s+(.*?)\s*$/u.exec(rawLine);
      if (install !== null) {
        let directory = install[1].trim();
        if (directory.startsWith('"')) {
          const closing = directory.indexOf('"', 1);
          if (closing !== -1) directory = directory.slice(1, closing).trim();
        }
        if (directory !== "") {
          const executable = import_node_path2.win32.join(directory, APP_EXECUTABLE_NAME);
          if ((0, import_node_fs2.existsSync)(executable)) return executable;
        }
      }
    }
  }
  return void 0;
}
function findWorkBuddyAppExecutable() {
  const fromEnv = process.env[WORKBUDDY_APP_EXECUTABLE_ENV]?.trim();
  if (fromEnv !== void 0 && fromEnv !== "" && (0, import_node_fs2.existsSync)(fromEnv)) return fromEnv;
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"] ?? "";
    const programFiles = process.env["ProgramFiles"] ?? "";
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "";
    const candidates = [
      localAppData !== "" ? (0, import_node_path2.join)(localAppData, "Programs", "WorkBuddy", APP_EXECUTABLE_NAME) : "",
      localAppData !== "" ? (0, import_node_path2.join)(localAppData, "WorkBuddy", APP_EXECUTABLE_NAME) : "",
      programFiles !== "" ? (0, import_node_path2.join)(programFiles, "WorkBuddy", APP_EXECUTABLE_NAME) : "",
      programFilesX86 !== "" ? (0, import_node_path2.join)(programFilesX86, "WorkBuddy", APP_EXECUTABLE_NAME) : ""
    ];
    for (const candidate of candidates) {
      if (candidate !== "" && (0, import_node_fs2.existsSync)(candidate)) return candidate;
    }
    const fromRegistry = windowsRegistryAppExecutable();
    if (fromRegistry !== void 0) return fromRegistry;
  }
  if (process.platform === "darwin") {
    const home = process.env["HOME"] ?? "";
    const bundleNames = ["WorkBuddy.app", "WorkBuddy AI.app"];
    const roots = [
      ...home !== "" ? [(0, import_node_path2.join)(home, "Applications")] : [],
      "/Applications"
    ];
    for (const root of roots) {
      for (const name of bundleNames) {
        const executable = (0, import_node_path2.join)(root, name, "Contents", "MacOS", "Electron");
        if ((0, import_node_fs2.existsSync)(executable)) return executable;
      }
    }
  }
  return void 0;
}
function readAtRestKey() {
  if (cachedKey !== void 0) return Promise.resolve(cachedKey);
  inflightKey ??= (async () => {
    const executable = findWorkBuddyAppExecutable();
    if (executable === void 0) return void 0;
    const payload = await fetchAtRestKeyPayload(executable);
    const key = deriveAtRestKey(payload);
    cachedKey = key;
    return key;
  })().finally(() => {
    inflightKey = void 0;
  });
  return inflightKey;
}
var import_node_child_process, import_node_crypto2, import_node_fs2, import_node_path2, FRAMING_CODE, STANDARD_FORMAT_ID, AAD_DOMAIN, SYMMETRIC_SCHEME, WORKBUDDY_APP_EXECUTABLE_ENV, KEY_FETCH_TIMEOUT_MS, APP_EXECUTABLE_NAME, cachedKey, inflightKey;
var init_at_rest = __esm({
  "src/workbuddy/at-rest.ts"() {
    "use strict";
    import_node_child_process = require("node:child_process");
    import_node_crypto2 = require("node:crypto");
    import_node_fs2 = require("node:fs");
    import_node_path2 = require("node:path");
    FRAMING_CODE = {
      file: 1,
      field: 2,
      record: 3,
      stream: 4
    };
    STANDARD_FORMAT_ID = {
      file: "WBEF1",
      field: "WBEV1",
      record: "WBER1",
      stream: "WBES1"
    };
    AAD_DOMAIN = Buffer.from("WB-AAD\0", "ascii");
    SYMMETRIC_SCHEME = "sym-v1";
    WORKBUDDY_APP_EXECUTABLE_ENV = "WORKBUDDY_APP_EXECUTABLE";
    KEY_FETCH_TIMEOUT_MS = 1e4;
    APP_EXECUTABLE_NAME = "WorkBuddy.exe";
  }
});

// src/workbuddy/auth.ts
function defaultAuthDirs(platform = process.platform, home = (0, import_node_os.homedir)(), env = process.env) {
  if (platform === "darwin") {
    return [(0, import_node_path3.join)(home, "Library", "Application Support", "CodeBuddyExtension", "Data", "Public", "auth")];
  }
  if (platform === "win32") {
    const local = (env["LOCALAPPDATA"]?.trim() || "") !== "" ? env["LOCALAPPDATA"].trim() : (0, import_node_path3.join)(home, "AppData", "Local");
    const roaming = (env["APPDATA"]?.trim() || "") !== "" ? env["APPDATA"].trim() : (0, import_node_path3.join)(home, "AppData", "Roaming");
    return [
      (0, import_node_path3.join)(local, "CodeBuddyExtension", "Data", "Public", "auth"),
      (0, import_node_path3.join)(roaming, "CodeBuddyExtension", "Data", "Public", "auth")
    ];
  }
  if (platform === "linux") {
    const config = (env["XDG_CONFIG_HOME"]?.trim() || "") !== "" ? env["XDG_CONFIG_HOME"].trim() : (0, import_node_path3.join)(home, ".config");
    return [(0, import_node_path3.join)(config, "CodeBuddyExtension", "Data", "Public", "auth")];
  }
  return [];
}
function candidateFilesInDir(dir) {
  if (!(0, import_node_fs3.existsSync)(dir)) return [];
  const out = [];
  try {
    const entries = (0, import_node_fs3.readdirSync)(dir);
    const backups = entries.filter((name) => name.endsWith(".info") && name !== LIVE_FILENAME).sort().reverse();
    const live = (0, import_node_path3.join)(dir, LIVE_FILENAME);
    if ((0, import_node_fs3.existsSync)(live)) out.push(live);
    for (const backup of backups) out.push((0, import_node_path3.join)(dir, backup));
  } catch {
  }
  return out;
}
function expiryToMs(value) {
  if (value <= 0) return 0;
  return value > 1e12 ? value : value * 1e3;
}
function credentialField(value, key) {
  if (typeof value === "string") return value;
  if (!isEncryptedFieldWrapper(value)) return void 0;
  if (key === void 0) return void 0;
  return openEncryptedField(value, key);
}
function optionalField(value, key) {
  if (typeof value === "string") return value === "" ? void 0 : value;
  if (!isEncryptedFieldWrapper(value)) return void 0;
  if (key === void 0) return void 0;
  try {
    return openEncryptedField(value, key);
  } catch {
    return void 0;
  }
}
function parseWorkBuddyAuth(text, filePath, atRestKey) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return void 0;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
  const document = parsed;
  const auth = typeof document["auth"] === "object" && document["auth"] !== null ? document["auth"] : document;
  const identity = typeof document["account"] === "object" && document["account"] !== null ? document["account"] : document;
  let accessToken;
  let refreshToken;
  try {
    accessToken = credentialField(auth["accessToken"], atRestKey);
    refreshToken = credentialField(auth["refreshToken"], atRestKey);
  } catch {
    return void 0;
  }
  if (accessToken === void 0 || accessToken === "") return void 0;
  const expiresAtMs = typeof auth["expiresAt"] === "number" ? expiryToMs(auth["expiresAt"]) : 0;
  const refreshExpiresAtMs = typeof auth["refreshExpiresAt"] === "number" ? expiryToMs(auth["refreshExpiresAt"]) : void 0;
  const enterpriseId = optionalField(identity["enterpriseId"], atRestKey);
  const nickname = optionalField(identity["nickname"], atRestKey);
  const uin = optionalField(identity["uin"], atRestKey);
  const credential = {
    accessToken,
    refreshToken: refreshToken ?? "",
    expiresAtMs,
    ...refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs },
    domain: optionalField(auth["domain"], atRestKey) ?? "",
    uid: optionalField(identity["uid"], atRestKey) ?? "",
    ...enterpriseId === void 0 ? {} : { enterpriseId },
    ...nickname === void 0 ? {} : { nickname },
    ...uin === void 0 ? {} : { uin },
    source: "desktop",
    filePath
  };
  return credential;
}
function hasEncryptedCredentialFields(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  const document = parsed;
  const auth = typeof document["auth"] === "object" && document["auth"] !== null ? document["auth"] : document;
  const identity = typeof document["account"] === "object" && document["account"] !== null ? document["account"] : document;
  return isEncryptedFieldWrapper(auth["accessToken"]) || isEncryptedFieldWrapper(auth["refreshToken"]) || isEncryptedFieldWrapper(identity["nickname"]) || isEncryptedFieldWrapper(identity["uin"]) || isEncryptedFieldWrapper(identity["uid"]) || isEncryptedFieldWrapper(identity["enterpriseId"]) || isEncryptedFieldWrapper(auth["domain"]);
}
function credentialFromEnv() {
  const token = (process.env["WORKBUDDY_TOKEN"] ?? "").trim();
  if (token === "") return void 0;
  const domain = (process.env["WORKBUDDY_DOMAIN"] ?? "").trim() || "www.codebuddy.cn";
  return {
    accessToken: token,
    refreshToken: "",
    expiresAtMs: 0,
    domain,
    uid: "",
    source: "env",
    filePath: ""
  };
}
var import_node_fs3, import_node_os, import_node_path3, log8, WorkBuddyAuthError, LIVE_FILENAME, WorkBuddyAuth;
var init_auth = __esm({
  "src/workbuddy/auth.ts"() {
    "use strict";
    import_node_fs3 = require("node:fs");
    import_node_os = require("node:os");
    import_node_path3 = require("node:path");
    init_at_rest();
    init_logger();
    log8 = createLogger("auth");
    WorkBuddyAuthError = class extends Error {
      /** 'not-found' | 'encrypted' | 'expired' */
      kind;
      constructor(kind, message) {
        super(message);
        this.name = "WorkBuddyAuthError";
        this.kind = kind;
      }
    };
    LIVE_FILENAME = "workbuddy-desktop.info";
    WorkBuddyAuth = class {
      credential;
      lastScanAtMs = 0;
      scanTtlMs;
      explicitFile;
      /** 刷新后的新 token 只保存在这里,不回写磁盘。 */
      inflightRefresh;
      /** 刷新函数由 server 注入(调用 client.refreshToken)。 */
      refreshFn;
      constructor(options = {}) {
        this.explicitFile = options.explicitFile;
        this.scanTtlMs = options.scanTtlMs ?? 6e4;
      }
      /** 扫描本机凭据文件,返回解密后的凭据(不刷新)。 */
      async scan() {
        const fromEnv = credentialFromEnv();
        if (fromEnv !== void 0) {
          this.credential = fromEnv;
          return this.credential;
        }
        const candidates = [];
        if (this.explicitFile !== void 0 && this.explicitFile !== "") {
          if ((0, import_node_fs3.existsSync)(this.explicitFile)) {
            candidates.push(this.explicitFile);
            candidates.push(...candidateFilesInDir((0, import_node_path3.join)(this.explicitFile, "..")).filter(
              (path) => (0, import_node_path3.basename)(path) !== (0, import_node_path3.basename)(this.explicitFile)
            ));
          }
        } else {
          for (const dir of defaultAuthDirs()) candidates.push(...candidateFilesInDir(dir));
        }
        const encryptedTexts = [];
        for (const path of candidates) {
          let text;
          try {
            text = (0, import_node_fs3.readFileSync)(path, "utf8");
          } catch {
            continue;
          }
          if (hasEncryptedCredentialFields(text)) {
            encryptedTexts.push({ path, text });
            continue;
          }
          const credential = parseWorkBuddyAuth(text, path);
          if (credential !== void 0) {
            this.credential = credential;
            this.lastScanAtMs = Date.now();
            return credential;
          }
        }
        if (encryptedTexts.length > 0) {
          let atRestKey;
          try {
            atRestKey = await readAtRestKey();
          } catch (error) {
            log8.warn(`\u83B7\u53D6 WorkBuddy \u89E3\u5BC6\u5BC6\u94A5\u5931\u8D25: ${String(error)}`);
          }
          if (atRestKey === void 0) {
            const paths = encryptedTexts.map((entry) => entry.path).join(", ");
            throw new WorkBuddyAuthError(
              "encrypted",
              `\u672C\u673A WorkBuddy \u767B\u5F55\u51ED\u636E\u5DF2\u52A0\u5BC6,\u9700\u8981\u684C\u9762 App \u5728\u573A\u624D\u80FD\u89E3\u5BC6 (${paths})\u3002\u8BF7\u5B89\u88C5 WorkBuddy \u684C\u9762 App,\u6216\u7528 WORKBUDDY_APP_EXECUTABLE \u6307\u5B9A\u5176\u53EF\u6267\u884C\u6587\u4EF6;\u6216\u76F4\u63A5\u7528 WORKBUDDY_TOKEN \u63D0\u4F9B token\u3002`
            );
          }
          for (const { path, text } of encryptedTexts) {
            const credential = parseWorkBuddyAuth(text, path, atRestKey);
            if (credential !== void 0) {
              this.credential = credential;
              this.lastScanAtMs = Date.now();
              return credential;
            }
          }
        }
        return void 0;
      }
      /** 取得当前凭据;过期时自动刷新(单飞,并发共享同一次刷新)。 */
      async resolve() {
        if (this.credential !== void 0 && this.credential.source === "env") return this.credential;
        if (this.credential === void 0 || Date.now() - this.lastScanAtMs > this.scanTtlMs) {
          await this.scan();
        }
        if (this.credential === void 0) {
          throw new WorkBuddyAuthError(
            "not-found",
            "\u672A\u627E\u5230\u672C\u673A WorkBuddy \u767B\u5F55\u51ED\u636E\u3002\u8BF7\u5148\u5728 WorkBuddy \u684C\u9762 App \u767B\u5F55,\u6216\u901A\u8FC7 WORKBUDDY_TOKEN \u73AF\u5883\u53D8\u91CF\u663E\u5F0F\u63D0\u4F9B token\u3002"
          );
        }
        if (!this.needsRefresh(this.credential)) return this.credential;
        this.inflightRefresh ??= this.refresh(this.credential).finally(() => {
          this.inflightRefresh = void 0;
        });
        return this.inflightRefresh;
      }
      /** token 是否临近过期(默认提前 5 分钟)。 */
      needsRefresh(credential) {
        if (credential.expiresAtMs <= 0) return false;
        if (credential.source === "env") return false;
        return Date.now() + 5 * 6e4 >= credential.expiresAtMs;
      }
      async refresh(credential) {
        if (credential.refreshToken === "") {
          if (credential.expiresAtMs > 0 && credential.expiresAtMs < Date.now() + 3e4) {
            throw new WorkBuddyAuthError("expired", "WorkBuddy \u767B\u5F55\u5DF2\u8FC7\u671F\u4E14\u65E0\u53EF\u7528 refresh token,\u8BF7\u91CD\u65B0\u5728 WorkBuddy App \u767B\u5F55\u3002");
          }
          return credential;
        }
        if (this.refreshFn === void 0) return credential;
        try {
          const outcome = await this.refreshFn(credential);
          const refreshed = {
            ...credential,
            accessToken: outcome.accessToken,
            refreshToken: outcome.refreshToken ?? credential.refreshToken,
            expiresAtMs: outcome.expiresInSec !== void 0 && outcome.expiresInSec > 0 ? Date.now() + outcome.expiresInSec * 1e3 : credential.expiresAtMs,
            ...outcome.domain !== void 0 && outcome.domain !== "" ? { domain: outcome.domain } : {}
          };
          this.credential = refreshed;
          this.lastScanAtMs = Date.now();
          log8.info(`WorkBuddy token \u5DF2\u5237\u65B0(domain=${refreshed.domain})`);
          return refreshed;
        } catch (error) {
          if (credential.expiresAtMs > Date.now() + 3e4) {
            log8.warn(`token \u5237\u65B0\u5931\u8D25,\u7EE7\u7EED\u7528\u65E7 token: ${String(error)}`);
            return credential;
          }
          throw new WorkBuddyAuthError("expired", `WorkBuddy token \u5237\u65B0\u5931\u8D25: ${String(error)}`);
        }
      }
      /** 当前凭据的状态快照(不含 token)。 */
      status() {
        if (this.credential === void 0) return { state: "signed-out" };
        return {
          state: "signed-in",
          domain: this.credential.domain,
          nickname: this.credential.nickname,
          uin: this.credential.uin,
          expiresAtMs: this.credential.expiresAtMs,
          source: this.credential.source
        };
      }
    };
  }
});

// src/workbuddy/legacy-bridge.ts
var legacy_bridge_exports = {};
__export(legacy_bridge_exports, {
  seedLegacyAccounts: () => seedLegacyAccounts
});
async function seedLegacyAccounts(store, explicitFile) {
  try {
    const auth = new WorkBuddyAuth({ explicitFile });
    const credential = await auth.scan();
    if (credential === void 0) {
      log9.info("\u672A\u53D1\u73B0\u65E7\u51ED\u636E(WORKBUDDY_TOKEN / \u684C\u9762\u767B\u5F55),\u8DF3\u8FC7\u6865\u63A5");
      return;
    }
    await store.add({
      domain: credential.domain,
      uid: credential.uid,
      ...credential.nickname === void 0 ? {} : { nickname: credential.nickname },
      ...credential.uin === void 0 ? {} : { uin: credential.uin },
      ...credential.enterpriseId === void 0 ? {} : { enterpriseId: credential.enterpriseId },
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      expiresAtMs: credential.expiresAtMs,
      ...credential.refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs: credential.refreshExpiresAtMs }
    });
    log9.info(`\u65E7\u51ED\u636E\u5DF2\u5E76\u5165\u8D26\u53F7\u6C60: ${credential.nickname ?? credential.uin ?? credential.domain}`);
  } catch (error) {
    log9.warn(`\u65E7\u51ED\u636E\u6865\u63A5\u5931\u8D25(\u53EF\u5FFD\u7565,\u6539\u7528 OAuth \u767B\u5F55): ${String(error)}`);
  }
}
var log9;
var init_legacy_bridge = __esm({
  "src/workbuddy/legacy-bridge.ts"() {
    "use strict";
    init_auth();
    init_logger();
    log9 = createLogger("legacy-bridge");
  }
});

// src/plugin/plugin-entry.ts
var plugin_entry_exports = {};
__export(plugin_entry_exports, {
  exit: () => exit,
  info: () => info,
  init: () => init
});
module.exports = __toCommonJS(plugin_entry_exports);
var import_node_path4 = require("node:path");
var import_node_fs4 = require("node:fs");

// node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign(
      {},
      require_env_options(),
      require_cli_options()(process.argv)
    )
  );
})();

// src/config/config.ts
function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === void 0 || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function strEnv(name, fallback = "") {
  const raw = process.env[name];
  return raw === void 0 ? fallback : raw.trim();
}
function loadConfig() {
  const defaultModels = strEnv("DEFAULT_MODEL", "workbuddy-model").split(",").map((value) => value.trim()).filter((value) => value !== "");
  const logLevel = strEnv("LOG_LEVEL", "info");
  return {
    port: intEnv("PORT", 3e3),
    host: strEnv("HOST", "127.0.0.1"),
    workbuddyToken: strEnv("WORKBUDDY_TOKEN"),
    workbuddyDomain: strEnv("WORKBUDDY_DOMAIN"),
    defaultModels: defaultModels.length > 0 ? defaultModels : ["workbuddy-model"],
    timeoutMs: intEnv("TIMEOUT", 12e4),
    retryDelayMs: intEnv("RETRY_DELAY_MS", 1e3),
    modelCacheTtlMs: intEnv("MODEL_CACHE_TTL_MS", 6e5),
    workbuddyAuthFile: strEnv("WORKBUDDY_AUTH_FILE"),
    workbuddyAppExecutable: strEnv("WORKBUDDY_APP_EXECUTABLE"),
    logLevel
  };
}

// src/plugin/plugin-entry.ts
init_logger();

// src/workbuddy/account-store.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
init_logger();
var log = createLogger("account-store");
var MAX_ACCOUNTS = 5;
var AccountStore = class {
  filePath;
  data;
  /** 串行化写操作,避免并发写撕裂。 */
  writeQueue = Promise.resolve();
  constructor(options) {
    this.filePath = options.filePath;
    this.data = this.load();
  }
  load() {
    try {
      if (!(0, import_node_fs.existsSync)(this.filePath)) return { version: 1, primaryId: null, accounts: [] };
      const raw = (0, import_node_fs.readFileSync)(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) {
        throw new Error("\u8D26\u53F7\u6587\u4EF6\u683C\u5F0F\u4E0D\u8BC6\u522B");
      }
      const accounts = parsed.accounts.filter((account) => {
        return typeof account === "object" && account !== null && typeof account.id === "string" && typeof account.accessToken === "string" && typeof account.domain === "string";
      });
      if (accounts.length > MAX_ACCOUNTS) {
        log.warn(`\u8D26\u53F7\u6587\u4EF6\u5305\u542B ${accounts.length} \u4E2A\u8D26\u53F7,\u622A\u65AD\u5230 ${MAX_ACCOUNTS}`);
        accounts.length = MAX_ACCOUNTS;
      }
      const primaryId = typeof parsed.primaryId === "string" && accounts.some((account) => account.id === parsed.primaryId) ? parsed.primaryId : null;
      return { version: 1, primaryId, accounts };
    } catch (error) {
      log.warn(`\u8D26\u53F7\u6587\u4EF6\u4E0D\u53EF\u8BFB,\u4ECE\u7A7A\u8D26\u53F7\u5F00\u59CB: ${String(error)}`);
      return { version: 1, primaryId: null, accounts: [] };
    }
  }
  /** 原子写盘(临时文件 + rename),串行执行。 */
  persist() {
    const payload = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.then(() => {
      try {
        const dir = (0, import_node_path.dirname)(this.filePath);
        (0, import_node_fs.mkdirSync)(dir, { recursive: true, mode: 448 });
        const tmp = (0, import_node_path.join)(dir, `.accounts.json.${process.pid}.${Date.now()}.tmp`);
        (0, import_node_fs.writeFileSync)(tmp, payload, { encoding: "utf8", mode: 384 });
        (0, import_node_fs.renameSync)(tmp, this.filePath);
        try {
          (0, import_node_fs.chmodSync)(this.filePath, 384);
        } catch {
        }
      } catch (error) {
        log.error(`\u8D26\u53F7\u6587\u4EF6\u5199\u5165\u5931\u8D25: ${String(error)}`);
        throw error;
      }
    });
    return this.writeQueue;
  }
  /** 账号数。 */
  get count() {
    return this.data.accounts.length;
  }
  /** 按 id 找账号(内部用,含 token;勿外泄)。 */
  get(id) {
    return this.data.accounts.find((account) => account.id === id);
  }
  /** 主账号。 */
  get primary() {
    if (this.data.primaryId === null) return this.data.accounts[0];
    return this.data.accounts.find((account) => account.id === this.data.primaryId);
  }
  /** 全部账号(内部)。 */
  all() {
    return this.data.accounts;
  }
  /** 无 token 的账号摘要列表,可直接暴露给前端。 */
  summaries() {
    return this.data.accounts.map((account) => this.summaryOf(account));
  }
  summaryOf(account) {
    return {
      id: account.id,
      domain: account.domain,
      ...account.nickname === void 0 ? {} : { nickname: account.nickname },
      ...account.uin === void 0 ? {} : { uin: account.uin },
      uid: account.uid,
      primary: this.data.primaryId === account.id || this.data.primaryId === null && account === this.data.accounts[0],
      addedAtMs: account.addedAtMs,
      ...account.lastUsedAtMs === void 0 ? {} : { lastUsedAtMs: account.lastUsedAtMs },
      ...account.lastStatus === void 0 ? {} : { lastStatus: account.lastStatus },
      failCount: account.failCount,
      expiringSoon: account.expiresAtMs > 0 && account.expiresAtMs - Date.now() < 5 * 6e4
    };
  }
  /** 添加账号(去重:同 uid+domain 覆盖;满员时报错)。 */
  async add(input) {
    const existing = this.data.accounts.find((account2) => account2.uid === input.uid && account2.domain === input.domain);
    if (existing !== void 0) {
      existing.accessToken = input.accessToken;
      existing.refreshToken = input.refreshToken;
      existing.expiresAtMs = input.expiresAtMs;
      existing.refreshExpiresAtMs = input.refreshExpiresAtMs;
      existing.nickname = input.nickname ?? existing.nickname;
      existing.uin = input.uin ?? existing.uin;
      existing.enterpriseId = input.enterpriseId ?? existing.enterpriseId;
      existing.lastStatus = void 0;
      existing.failCount = 0;
      await this.persist();
      return existing;
    }
    if (this.data.accounts.length >= MAX_ACCOUNTS) {
      throw new Error(`\u6700\u591A\u652F\u6301 ${MAX_ACCOUNTS} \u4E2A\u8D26\u53F7,\u8BF7\u5148\u5220\u9664\u4E00\u4E2A`);
    }
    const id = `acct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const account = {
      id,
      domain: input.domain,
      uid: input.uid,
      ...input.nickname === void 0 ? {} : { nickname: input.nickname },
      ...input.uin === void 0 ? {} : { uin: input.uin },
      ...input.enterpriseId === void 0 ? {} : { enterpriseId: input.enterpriseId },
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAtMs: input.expiresAtMs,
      ...input.refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs: input.refreshExpiresAtMs },
      addedAtMs: Date.now(),
      failCount: 0
    };
    this.data.accounts.push(account);
    if (this.data.primaryId === null && this.data.accounts.length === 1) {
      this.data.primaryId = account.id;
    }
    await this.persist();
    return account;
  }
  /** 删除账号。 */
  async remove(id) {
    const index = this.data.accounts.findIndex((account) => account.id === id);
    if (index === -1) throw new Error("\u8D26\u53F7\u4E0D\u5B58\u5728");
    this.data.accounts.splice(index, 1);
    if (this.data.primaryId === id) {
      this.data.primaryId = this.data.accounts.length > 0 ? this.data.accounts[0].id : null;
    }
    await this.persist();
  }
  /** 设置主账号。 */
  async setPrimary(id) {
    if (!this.data.accounts.some((account) => account.id === id)) throw new Error("\u8D26\u53F7\u4E0D\u5B58\u5728");
    this.data.primaryId = id;
    await this.persist();
  }
  /** 更新一个账号的 token(刷新后)。 */
  async updateTokens(id, patch) {
    const account = this.get(id);
    if (account === void 0) throw new Error("\u8D26\u53F7\u4E0D\u5B58\u5728");
    account.accessToken = patch.accessToken;
    if (patch.refreshToken !== void 0 && patch.refreshToken !== "") account.refreshToken = patch.refreshToken;
    account.expiresAtMs = patch.expiresAtMs;
    if (patch.refreshExpiresAtMs !== void 0) account.refreshExpiresAtMs = patch.refreshExpiresAtMs;
    if (patch.domain !== void 0 && patch.domain !== "") account.domain = patch.domain;
    await this.persist();
  }
  /** 记录一次使用结果(成功清零失败计数;失败记录状态)。 */
  async recordUse(id, outcome) {
    const account = this.get(id);
    if (account === void 0) return;
    if (outcome.ok) {
      account.failCount = 0;
      account.lastUsedAtMs = Date.now();
      if (account.lastStatus?.kind !== "ok" || account.lastStatus.kind === void 0) {
        account.lastStatus = { kind: "ok", atMs: Date.now() };
      }
    } else {
      account.failCount += 1;
      if (outcome.status !== void 0) account.lastStatus = outcome.status;
    }
    await this.persist();
  }
  /** 清空失败计数/状态(手动重置)。 */
  async resetStatus(id) {
    const account = this.get(id);
    if (account === void 0) throw new Error("\u8D26\u53F7\u4E0D\u5B58\u5728");
    account.failCount = 0;
    account.lastStatus = void 0;
    await this.persist();
  }
};

// src/workbuddy/account-pool.ts
init_logger();
var log2 = createLogger("account-pool");
var DEFAULT_COOLDOWN_MS = 30 * 6e4;
function isFailoverWorthy(kind) {
  switch (kind) {
    case "hard_credit":
    case "soft_rate":
    case "session_dead":
    case "server":
      return true;
    case "model_busy":
    case "policy_reject":
    case "not_found":
    case "client":
    default:
      return false;
  }
}
function statusForFailure(kind, message) {
  switch (kind) {
    case "hard_credit":
      return { kind: "out_of_credits", atMs: Date.now(), detail: message.slice(0, 200) };
    case "soft_rate":
      return { kind: "rate_limited", atMs: Date.now(), untilMs: Date.now() + DEFAULT_COOLDOWN_MS, detail: message.slice(0, 200) };
    case "session_dead":
      return { kind: "bad_credential", atMs: Date.now(), detail: message.slice(0, 200) };
    case "server":
      return { kind: "unreachable", atMs: Date.now(), untilMs: Date.now() + DEFAULT_COOLDOWN_MS, detail: message.slice(0, 200) };
    default:
      return { kind: "unreachable", atMs: Date.now(), untilMs: Date.now() + DEFAULT_COOLDOWN_MS, detail: message.slice(0, 200) };
  }
}
var AccountPool = class _AccountPool {
  store;
  client;
  inflightRefresh = /* @__PURE__ */ new Map();
  constructor(options) {
    this.store = options.store;
    this.client = options.client;
  }
  /** StoredAccount → client 需要的 WorkBuddyCredential 形态。 */
  static toCredential(account) {
    return {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAtMs: account.expiresAtMs,
      ...account.refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs: account.refreshExpiresAtMs },
      domain: account.domain,
      uid: account.uid,
      ...account.enterpriseId === void 0 ? {} : { enterpriseId: account.enterpriseId },
      ...account.nickname === void 0 ? {} : { nickname: account.nickname },
      ...account.uin === void 0 ? {} : { uin: account.uin },
      source: "env",
      filePath: ""
    };
  }
  /** 当前可用账号数。 */
  get size() {
    return this.store.count;
  }
  /**
   * 候选账号排序:主账号最前,其余按 addedAtMs;
   * 冷却中的账号排最后(仍保留,作为"实在没人可用"的最后手段)。
   */
  candidates() {
    const all = this.store.all();
    const primary = this.store.primary;
    const primaryId = primary?.id ?? null;
    const active = [];
    const cooling = [];
    for (const account of all) {
      const status = account.lastStatus;
      const coolingDown = status !== void 0 && status.untilMs !== void 0 && status.untilMs > Date.now() && status.kind !== "ok";
      if (coolingDown) {
        cooling.push(account);
      } else {
        active.push(account);
      }
    }
    const sortKey = (account) => account.id === primaryId ? 0 : account.addedAtMs;
    active.sort((a, b) => sortKey(a) - sortKey(b));
    cooling.sort((a, b) => sortKey(a) - sortKey(b));
    return [...active, ...cooling];
  }
  /**
   * 取一个"准备好"的凭据:token 过期前 5 分钟内会自动刷新(单飞)。
   * 刷新失败时旧 token 还有余量就继续用;refresh token 缺失且即将过期则跳过。
   */
  async prepare(account) {
    const needsRefresh = account.expiresAtMs <= 0 || Date.now() + 5 * 6e4 >= account.expiresAtMs;
    if (!needsRefresh) return account;
    if (account.refreshToken === "") {
      if (account.expiresAtMs > 0 && account.expiresAtMs < Date.now() + 3e4) {
        throw new Error("token \u5DF2\u8FC7\u671F\u4E14\u65E0 refresh token");
      }
      return account;
    }
    let inflight = this.inflightRefresh.get(account.id);
    if (inflight === void 0) {
      inflight = this.refresh(account).finally(() => {
        this.inflightRefresh.delete(account.id);
      });
      this.inflightRefresh.set(account.id, inflight);
    }
    return inflight;
  }
  async refresh(account) {
    try {
      const outcome = await this.client.refreshToken(_AccountPool.toCredential(account));
      await this.store.updateTokens(account.id, {
        accessToken: outcome.accessToken,
        ...outcome.refreshToken === void 0 ? {} : { refreshToken: outcome.refreshToken },
        expiresAtMs: outcome.expiresInSec !== void 0 && outcome.expiresInSec > 0 ? Date.now() + outcome.expiresInSec * 1e3 : account.expiresAtMs,
        ...outcome.domain === void 0 ? {} : { domain: outcome.domain }
      });
      const refreshed = this.store.get(account.id) ?? account;
      log2.info(`\u8D26\u53F7 ${refreshed.nickname ?? refreshed.uin ?? refreshed.id} token \u5DF2\u5237\u65B0`);
      return refreshed;
    } catch (error) {
      if (account.expiresAtMs > Date.now() + 3e4) {
        log2.warn(`\u8D26\u53F7 ${account.nickname ?? account.id} token \u5237\u65B0\u5931\u8D25,\u7EE7\u7EED\u7528\u65E7 token: ${String(error)}`);
        return account;
      }
      throw error;
    }
  }
  /** 按 id 直接取凭据(管理页"测试账号"用),带刷新。 */
  async resolveById(id) {
    const account = this.store.get(id);
    if (account === void 0) throw new Error("\u8D26\u53F7\u4E0D\u5B58\u5728");
    return this.prepare(account);
  }
  /** 主账号凭据(手动操作入口,不做 failover)。 */
  async resolvePrimary() {
    const primary = this.store.primary;
    if (primary === void 0) throw new Error("\u6CA1\u6709\u53EF\u7528\u8D26\u53F7,\u8BF7\u5148\u6DFB\u52A0\u5E76\u767B\u5F55\u4E00\u4E2A WorkBuddy \u8D26\u53F7");
    return this.prepare(primary);
  }
  /**
   * 账号池入口:拿一个凭据交给请求;请求失败时按类别换号重试。
   *
   * @param send 用给定账号执行请求,返回 { ok:true, ... } 或
   *             { ok:false, kind, status, message }
   * @returns 成功结果(带 failover 标记)或最后一个失败
   */
  async run(send) {
    const candidates = this.candidates();
    if (candidates.length === 0) {
      return { ok: false, kind: "session_dead", status: 401, message: "\u6CA1\u6709\u53EF\u7528\u8D26\u53F7,\u8BF7\u5148\u6DFB\u52A0\u5E76\u767B\u5F55\u4E00\u4E2A WorkBuddy \u8D26\u53F7", attempts: 0 };
    }
    let lastFailure;
    const triedNames = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const account = candidates[i];
      let prepared;
      try {
        prepared = await this.prepare(account);
      } catch (error) {
        log2.warn(`\u8D26\u53F7 ${account.nickname ?? account.id} \u8DF3\u8FC7: ${String(error)}`);
        continue;
      }
      triedNames.push(prepared.nickname ?? prepared.uin ?? prepared.id);
      const result = await send(prepared);
      if (result.ok) {
        await this.store.recordUse(prepared.id, { ok: true });
        return { ok: true, value: result.value, failover: i > 0 };
      }
      lastFailure = { kind: result.kind, status: result.status, message: result.message };
      await this.store.recordUse(prepared.id, { ok: false, status: statusForFailure(result.kind, result.message) });
      log2.warn(`\u8D26\u53F7 ${prepared.nickname ?? prepared.id} \u8BF7\u6C42\u5931\u8D25(${result.kind}, http ${result.status}),${i + 1 < candidates.length ? "\u5C1D\u8BD5\u4E0B\u4E00\u4E2A\u8D26\u53F7" : "\u65E0\u66F4\u591A\u8D26\u53F7"}`);
      if (!isFailoverWorthy(result.kind)) {
        break;
      }
    }
    return {
      ok: false,
      kind: lastFailure?.kind ?? "server",
      status: lastFailure?.status ?? 502,
      message: lastFailure?.message ?? "\u672A\u77E5\u9519\u8BEF",
      attempts: triedNames.length
    };
  }
};

// src/workbuddy/client.ts
init_logger();
var log3 = createLogger("client");
var CN_CHAT_BASE = "https://copilot.tencent.com";
var CN_BILLING_BASE = "https://www.codebuddy.cn";
var GLOBAL_BASE = "https://www.workbuddy.ai";
var CLIENT_UA = "CLI/2.63.2 CodeBuddy/2.63.2";
var DESKTOP_UA = "WorkBuddy/5.5.2";
var JSON_TIMEOUT_MS = 3e4;
var ERROR_BODY_LIMIT = 4096;
function regionOf(domain) {
  const lowered = domain.trim().toLowerCase();
  if (lowered === "workbuddy.ai" || lowered.endsWith(".workbuddy.ai")) return "global";
  if (lowered === "codebuddy.ai" || lowered.endsWith(".codebuddy.ai")) return "global";
  return "cn";
}
function globalBase(domain) {
  const lowered = domain.trim().toLowerCase();
  if (lowered === "codebuddy.ai" || lowered.endsWith(".codebuddy.ai")) return "https://www.codebuddy.ai";
  return GLOBAL_BASE;
}
function chatBase(credential) {
  return regionOf(credential.domain) === "global" ? globalBase(credential.domain) : CN_CHAT_BASE;
}
function billingBase(credential) {
  return regionOf(credential.domain) === "global" ? globalBase(credential.domain) : CN_BILLING_BASE;
}
function originReferer(credential) {
  return regionOf(credential.domain) === "global" ? globalBase(credential.domain) : CN_BILLING_BASE;
}
function commonHeaders(credential) {
  return {
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": originReferer(credential),
    "Referer": `${originReferer(credential)}/`,
    "User-Agent": CLIENT_UA
  };
}
function chatHeaders(credential) {
  return {
    ...commonHeaders(credential),
    "Content-Type": "application/json",
    // 安全红线:聊天请求绝不携带 refresh token
    ...credential.uid === "" ? { "X-No-User-Id": "1" } : { "X-User-Id": credential.uid },
    ...credential.enterpriseId === void 0 || credential.enterpriseId === "" ? { "X-No-Enterprise-Id": "1" } : { "X-Enterprise-Id": credential.enterpriseId },
    ...credential.domain === "" ? { "X-No-Department-Info": "1" } : { "X-Domain": credential.domain },
    "X-Product": "SaaS"
  };
}
function refreshHeaders(credential) {
  const headers = {
    ...commonHeaders(credential),
    "X-Refresh-Token": credential.refreshToken,
    "X-Auth-Refresh-Source": "workbuddy"
  };
  if (credential.enterpriseId !== void 0 && credential.enterpriseId !== "") {
    headers["X-Enterprise-Id"] = credential.enterpriseId;
  }
  return headers;
}
function billingHeaders(credential) {
  const headers = {
    "Authorization": `Bearer ${credential.accessToken}`,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (credential.uid !== "") headers["X-User-Id"] = credential.uid;
  if (credential.enterpriseId !== void 0 && credential.enterpriseId !== "") {
    headers["X-Enterprise-Id"] = credential.enterpriseId;
    headers["X-Tenant-Id"] = credential.enterpriseId;
  }
  if (credential.domain !== "") headers["X-Domain"] = credential.domain;
  return headers;
}
var WorkBuddyCredentialRejectedError = class extends Error {
  code = "WORKBUDDY_CREDENTIAL_REJECTED";
  status;
  constructor(status) {
    super(`workbuddy: \u767B\u5F55\u51ED\u636E\u88AB\u4E0A\u6E38\u62D2\u7EDD (http ${status}),\u8BF7\u5728 WorkBuddy App \u91CD\u65B0\u767B\u5F55\u3002`);
    this.name = "WorkBuddyCredentialRejectedError";
    this.status = status;
  }
};
var HARD_CREDIT_MARKERS = [
  "insufficient credit",
  "no credit",
  "credit exhausted",
  "credits exhausted",
  "out of credit",
  "quota exceeded",
  "quota exhaust",
  "payment required",
  "credit not enough",
  "not enough credit",
  "credits not enough",
  "\u79EF\u5206\u4E0D\u8DB3",
  "\u989D\u5EA6\u4E0D\u8DB3",
  "\u4F59\u989D\u4E0D\u8DB3",
  "\u79EF\u5206\u7528\u5B8C",
  "\u989D\u5EA6\u7528\u5C3D",
  "\u6CA1\u6709\u79EF\u5206"
];
var CREDITS_EXHAUSTED_CODE = '"code":14018';
var SESSION_DEAD_MARKERS = ["Offline user session not found", "12153"];
var POLICY_REJECT_MARKERS = ["request illegal", '"code":11140'];
var MODEL_BUSY_CODE = '"code":14003';
function classifyUpstreamError(status, body) {
  if (status === 402) return "hard_credit";
  const lower = body.toLowerCase();
  for (const marker of HARD_CREDIT_MARKERS) {
    if (lower.includes(marker.toLowerCase()) || body.includes(marker)) return "hard_credit";
  }
  if (body.includes(CREDITS_EXHAUSTED_CODE)) return "hard_credit";
  for (const marker of SESSION_DEAD_MARKERS) {
    if (body.includes(marker)) return "session_dead";
  }
  for (const marker of POLICY_REJECT_MARKERS) {
    if (body.includes(marker)) return "policy_reject";
  }
  if (body.includes(MODEL_BUSY_CODE)) return "model_busy";
  if (status === 429) return "soft_rate";
  if (status === 404) return "not_found";
  if (status >= 500) return "server";
  if (status >= 400) return "client";
  return "client";
}
function isGatewayAuthRejection(status, text) {
  if (status !== 401 && status !== 403) return false;
  const lower = text.toLowerCase();
  return lower.includes("openresty") || lower.includes("apisix") || lower.includes("authorization required");
}
async function readEnvelope(response) {
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (isGatewayAuthRejection(response.status, text)) {
      throw new WorkBuddyCredentialRejectedError(response.status);
    }
    throw new Error(`workbuddy upstream returned non-JSON (http ${response.status}): ${text.slice(0, 160)}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`workbuddy upstream returned an unexpected document (http ${response.status})`);
  }
  const document = parsed;
  return {
    code: typeof document["code"] === "number" ? document["code"] : 0,
    msg: typeof document["msg"] === "string" ? document["msg"] : "",
    data: "data" in document ? document["data"] : void 0
  };
}
function envelopeError(status, envelope) {
  if ((status === 401 || status === 403) && envelope.code !== 0) {
    return new WorkBuddyCredentialRejectedError(status);
  }
  const detail = envelope.msg !== "" ? `: ${envelope.msg}` : "";
  return new Error(`workbuddy upstream error (http ${status}, code ${envelope.code})${detail}`);
}
function parseCreditMultiplier(value) {
  if (typeof value !== "string") return void 0;
  const match = /x\s*([0-9]*\.?[0-9]+)/iu.exec(value);
  if (match === null) return void 0;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function parseUpstreamModel(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const raw = value;
  const id = typeof raw["id"] === "string" ? raw["id"] : "";
  if (id === "" || raw["disabled"] === true) return void 0;
  const input = typeof raw["maxInputTokens"] === "number" ? raw["maxInputTokens"] : 0;
  const output = typeof raw["maxOutputTokens"] === "number" ? raw["maxOutputTokens"] : 0;
  if (input <= 0 || output <= 0) return void 0;
  const name = typeof raw["name"] === "string" && raw["name"] !== "" ? raw["name"] : id;
  const creditMultiplier = parseCreditMultiplier(raw["credits"]);
  const supportsImages = raw["disabledMultimodal"] === true ? false : typeof raw["supportsImages"] === "boolean" ? raw["supportsImages"] : void 0;
  return {
    id,
    name,
    contextWindow: input,
    maxTokens: output,
    ...creditMultiplier === void 0 ? {} : { creditMultiplier },
    ...supportsImages === void 0 ? {} : { supportsImages },
    ...typeof raw["supportsToolCall"] === "boolean" ? { supportsToolCall: raw["supportsToolCall"] } : {},
    ...typeof raw["descriptionZh"] === "string" && raw["descriptionZh"] !== "" ? { descriptionZh: raw["descriptionZh"] } : {},
    ...typeof raw["descriptionEn"] === "string" && raw["descriptionEn"] !== "" ? { descriptionEn: raw["descriptionEn"] } : {}
  };
}
function selectCliModels(rawModels, agents) {
  const byId = /* @__PURE__ */ new Map();
  for (const model of Array.isArray(rawModels) ? rawModels : []) {
    const parsed = parseUpstreamModel(model);
    if (parsed !== void 0) byId.set(parsed.id, parsed);
  }
  let cliIds;
  for (const agent of Array.isArray(agents) ? agents : []) {
    if (typeof agent === "object" && agent !== null) {
      const wrapped = agent;
      if (wrapped["name"] === "cli" && Array.isArray(wrapped["models"])) {
        cliIds = wrapped["models"].filter((id) => typeof id === "string");
        break;
      }
    }
  }
  const ids = cliIds !== void 0 && cliIds.length > 0 ? cliIds : [...byId.keys()];
  const models = ids.map((id) => byId.get(id)).filter((model) => model !== void 0);
  if (models.length === 0) throw new Error("workbuddy model catalog resolved to an empty list");
  return models;
}
var WorkBuddyClient = class {
  /**
   * 发起聊天请求。成功返回上游的原始 SSE Response,由调用方消费;
   * 失败返回分类后的错误。
   *
   * 本方法刻意不设总超时:一次回答要先预填整个 prompt,
   * 耗时随上下文大小跨数量级变化。超时由调用方注入的
   * AbortSignal(响应首字节超时)与客户端断开取消共同控制。
   */
  async chatStream(credential, bodyJson, signal) {
    let response;
    try {
      response = await fetch(`${chatBase(credential)}/v2/chat/completions`, {
        method: "POST",
        headers: { ...chatHeaders(credential), "Authorization": `Bearer ${credential.accessToken}` },
        body: bodyJson,
        ...signal === void 0 ? {} : { signal }
      });
    } catch (error) {
      return { ok: false, status: 0, kind: "server", message: `transport error: ${String(error)}` };
    }
    if (response.ok) return { ok: true, response };
    const text = (await response.text()).slice(0, ERROR_BODY_LIMIT);
    return {
      ok: false,
      status: response.status,
      kind: classifyUpstreamError(response.status, text),
      message: text
    };
  }
  /** 刷新 access token。 */
  async refreshToken(credential) {
    const response = await fetch(`${chatBase(credential)}/v2/plugin/auth/token/refresh`, {
      method: "POST",
      headers: refreshHeaders(credential),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
    });
    const envelope = await readEnvelope(response);
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
    const data = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
    const accessToken = typeof data["accessToken"] === "string" ? data["accessToken"] : "";
    if (accessToken === "") throw new Error("workbuddy token refresh returned no accessToken; sign in again in the WorkBuddy app");
    const outcome = { accessToken };
    if (typeof data["refreshToken"] === "string" && data["refreshToken"] !== "") outcome.refreshToken = data["refreshToken"];
    if (typeof data["expiresIn"] === "number" && data["expiresIn"] > 0) outcome.expiresInSec = data["expiresIn"];
    if (typeof data["domain"] === "string" && data["domain"] !== "") outcome.domain = data["domain"];
    return outcome;
  }
  /** 查询今日签到状态(只读,不改变账号状态)。 */
  async fetchCheckinStatus(credential) {
    const response = await fetch(`${billingBase(credential)}/v2/billing/meter/checkin-activity-status`, {
      method: "POST",
      headers: billingHeaders(credential),
      body: "{}",
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
    });
    const envelope = await readEnvelope(response);
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
    const data = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
    const numberField = (key) => typeof data[key] === "number" ? data[key] : 0;
    return {
      active: data["active"] === true,
      todayCheckedIn: data["today_checked_in"] === true,
      streakDays: numberField("streak_days"),
      dailyCredit: numberField("daily_credit"),
      todayCredit: numberField("today_credit"),
      isStreakDay: data["is_streak_day"] === true,
      nextStreakDay: numberField("next_streak_day"),
      streakBonusDays: numberField("streak_bonus_days"),
      streakBonusCredit: numberField("streak_bonus_credit")
    };
  }
  /**
   * 查询剩余积分(只读,不消耗积分)。
   * 余额读 cycle 家族的精确字段(官方客户端同款口径),
   * 一次性礼包(已耗尽/已过期)被剔除。
   */
  async fetchCredits(credential) {
    const now = /* @__PURE__ */ new Date();
    const format = (date) => [
      date.getFullYear().toString().padStart(4, "0"),
      (date.getMonth() + 1).toString().padStart(2, "0"),
      date.getDate().toString().padStart(2, "0")
    ].join("-") + " " + [
      date.getHours().toString().padStart(2, "0"),
      date.getMinutes().toString().padStart(2, "0"),
      date.getSeconds().toString().padStart(2, "0")
    ].join(":");
    const response = await fetch(`${billingBase(credential)}/v2/billing/meter/get-user-resource`, {
      method: "POST",
      headers: billingHeaders(credential),
      body: JSON.stringify({
        PageNumber: 1,
        PageSize: 100,
        ProductCode: "p_tcaca",
        Status: [0, 3],
        PackageEndTimeRangeBegin: format(now),
        PackageEndTimeRangeEnd: format(new Date(now.getTime() + 365 * 101 * 24 * 3600 * 1e3))
      }),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS)
    });
    const envelope = await readEnvelope(response);
    if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
    const responseWrapper = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
    const data = typeof responseWrapper["Response"] === "object" && responseWrapper["Response"] !== null ? responseWrapper["Response"] : {};
    const inner = typeof data["Data"] === "object" && data["Data"] !== null ? data["Data"] : {};
    const rawAccounts = Array.isArray(inner["Accounts"]) ? inner["Accounts"] : [];
    let total = 0;
    let nearestExpiryMs;
    let expiringSoon = 0;
    const SOON_MS = 3 * 24 * 60 * 60 * 1e3;
    const parseDate = (raw) => {
      if (typeof raw === "number" && raw > 1e12) return raw;
      if (typeof raw === "string" && raw !== "") {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) return parsed;
      }
      return void 0;
    };
    const packages = [];
    for (const raw of rawAccounts) {
      if (typeof raw !== "object" || raw === null) continue;
      const account = raw;
      const numberField = (key) => typeof account[key] === "number" ? account[key] : 0;
      const preciseField = (key) => {
        const rawValue = account[`${key}Precise`];
        if (typeof rawValue === "string" && rawValue !== "") {
          const parsed = Number.parseFloat(rawValue);
          if (Number.isFinite(parsed)) return parsed;
        }
        if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;
        return numberField(key);
      };
      const monthly = numberField("CapacityType") === 4;
      const size = preciseField("CycleCapacitySize") || preciseField("CapacitySize");
      const hasCycle = account["CycleCapacityRemain"] !== void 0 || account["CycleCapacityRemainPrecise"] !== void 0;
      const remain = hasCycle ? preciseField("CycleCapacityRemain") : preciseField("CapacityRemain");
      const cappedRemain = remain < 0 ? 0 : remain;
      const cycleEndMs = parseDate(account["CycleEndTime"]);
      const expiresAtMs = monthly ? void 0 : parseDate(account["ExpiredTime"]) ?? cycleEndMs;
      const refreshAtMs = monthly ? cycleEndMs === void 0 ? void 0 : cycleEndMs + 1e3 : void 0;
      if (!monthly && (cappedRemain <= 0 || expiresAtMs !== void 0 && expiresAtMs <= Date.now())) {
        continue;
      }
      total += cappedRemain;
      const expiryMs2 = expiresAtMs;
      if (expiryMs2 !== void 0) {
        if (nearestExpiryMs === void 0 || expiryMs2 < nearestExpiryMs) nearestExpiryMs = expiryMs2;
        if (expiryMs2 - Date.now() <= SOON_MS) expiringSoon += cappedRemain;
      }
      packages.push({
        packageName: typeof account["PackageName"] === "string" ? account["PackageName"] : "(unnamed)",
        remain: cappedRemain,
        size,
        monthly,
        ...refreshAtMs === void 0 ? {} : { refreshAtMs },
        ...expiresAtMs === void 0 ? {} : { expiresAtMs }
      });
    }
    return {
      total,
      packages,
      expiringSoon,
      ...nearestExpiryMs === void 0 ? {} : { nearestExpiryMs }
    };
  }
  /**
   * 拉取模型目录。
   * 两区域都优先 /v3/config;CN 失败时回退 /v2/enterprises/personal/models。
   * UA 区分渠道:国际版必须用桌面 UA,国内版用 CLI UA(才有免费模型)。
   */
  async fetchModels(credential, signal) {
    const timeout = signal ?? AbortSignal.timeout(JSON_TIMEOUT_MS);
    const global = regionOf(credential.domain) === "global";
    if (global) {
      const response = await fetch(`${globalBase(credential.domain)}/v3/config`, {
        headers: {
          "Authorization": `Bearer ${credential.accessToken}`,
          "Accept": "application/json",
          ...credential.uid === "" ? {} : { "X-User-Id": credential.uid },
          ...credential.domain === "" ? {} : { "X-Domain": credential.domain },
          "X-Product": "SaaS",
          "X-Requested-With": "XMLHttpRequest",
          "Connection": "close",
          "User-Agent": DESKTOP_UA
        },
        signal: timeout
      });
      const envelope = await readEnvelope(response);
      if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
      const data = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
      return selectCliModels(data["models"], data["agents"]);
    }
    const readCatalog = async (path) => {
      const response = await fetch(`${chatBase(credential)}${path}`, {
        headers: {
          "Authorization": `Bearer ${credential.accessToken}`,
          "Accept": "application/json",
          "Origin": originReferer(credential),
          "Referer": `${originReferer(credential)}/`,
          "User-Agent": CLIENT_UA
        },
        signal: timeout
      });
      const envelope = await readEnvelope(response);
      if (!response.ok || envelope.code !== 0) throw envelopeError(response.status, envelope);
      const data = typeof envelope.data === "object" && envelope.data !== null ? envelope.data : {};
      return selectCliModels(data["models"], data["agents"]);
    };
    try {
      return await readCatalog("/v3/config");
    } catch (error) {
      log3.warn(`CN /v3/config \u5931\u8D25,\u56DE\u9000\u65E7\u76EE\u5F55: ${String(error)}`);
      return readCatalog("/v2/enterprises/personal/models");
    }
  }
};

// src/workbuddy/models.ts
init_logger();
var log4 = createLogger("models");
var ModelManager = class {
  client;
  defaultModels;
  cacheTtlMs;
  catalog;
  catalogAtMs = 0;
  catalogInflight;
  constructor(options) {
    this.client = options.client;
    this.defaultModels = options.defaultModels;
    this.cacheTtlMs = options.cacheTtlMs;
  }
  /** 当前模型列表(尽量用缓存;缓存过期时单飞拉取;失败用兜底)。 */
  async list(credential) {
    if (this.catalog !== void 0 && Date.now() - this.catalogAtMs < this.cacheTtlMs) {
      return this.catalog;
    }
    this.catalogInflight ??= this.fetchCatalog(credential).finally(() => {
      this.catalogInflight = void 0;
    });
    try {
      const catalog = await this.catalogInflight;
      this.catalog = catalog;
      this.catalogAtMs = Date.now();
      return catalog;
    } catch (error) {
      log4.warn(`\u6A21\u578B\u76EE\u5F55\u62C9\u53D6\u5931\u8D25,\u4F7F\u7528\u515C\u5E95\u5217\u8868: ${String(error)}`);
      if (this.catalog !== void 0) return this.catalog;
      return this.defaultModels.map((id) => ({ id, name: id, contextWindow: 0, maxTokens: 0 }));
    }
  }
  async fetchCatalog(credential) {
    const models = await this.client.fetchModels(credential);
    log4.info(`\u6A21\u578B\u76EE\u5F55\u5DF2\u66F4\u65B0:${models.length} \u4E2A\u6A21\u578B`);
    return models;
  }
  /** 模型 id 是否在目录中。 */
  async hasModel(id, credential) {
    const models = await this.list(credential);
    return models.some((model) => model.id === id);
  }
  /** 清空缓存(诊断/测试用)。 */
  clear() {
    this.catalog = void 0;
    this.catalogAtMs = 0;
  }
};

// src/gateway.ts
function createGateway(options) {
  const store = new AccountStore({ filePath: options.accountsFile });
  const client = new WorkBuddyClient();
  const pool = new AccountPool({ store, client });
  const models = new ModelManager({
    client,
    defaultModels: options.config.defaultModels,
    cacheTtlMs: options.config.modelCacheTtlMs
  });
  return { store, client, pool, models };
}

// src/openai/routes.ts
init_logger();

// src/workbuddy/oauth.ts
var import_node_crypto = require("node:crypto");
var CN_BILLING_BASE2 = "https://www.codebuddy.cn";
var GLOBAL_BILLING_BASE = "https://www.workbuddy.ai";
var API_PREFIX = "/v2/plugin";
var OAUTH_LOGIN_TIMEOUT_SECONDS = 600;
var sessions = /* @__PURE__ */ new Map();
function normalizeBase(base) {
  return base.trim().replace(/\/+$/, "");
}
function oauthBillingBase(region, explicitBase) {
  if (region === "cn") return CN_BILLING_BASE2;
  const trimmed = explicitBase?.trim();
  if (trimmed !== void 0 && trimmed !== "") return normalizeBase(trimmed);
  return GLOBAL_BILLING_BASE;
}
async function readJson(response) {
  try {
    const text = await response.text();
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
  }
  return void 0;
}
function envelopeData(document) {
  const data = document["data"];
  return typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
}
function firstString(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
function optionalString(source, keys) {
  const value = firstString(source, keys);
  return value === "" ? void 0 : value;
}
function expiryMs(source, absoluteKeys, ttlKeys) {
  for (const key of absoluteKeys) {
    const value = source[key];
    if (typeof value === "number" && value > 0) {
      return value > 1e12 ? value : value * 1e3;
    }
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      const parsed = Number(value);
      return parsed > 1e12 ? parsed : parsed * 1e3;
    }
  }
  for (const key of ttlKeys) {
    const value = source[key];
    if (typeof value === "number" && value > 0) return Date.now() + value * 1e3;
  }
  return void 0;
}
async function oauthStart(region, options) {
  const base = normalizeBase(oauthBillingBase(region, options?.base));
  const doFetch = options?.fetchImpl ?? fetch;
  let response;
  try {
    response = await doFetch(`${base}${API_PREFIX}/auth/state?platform=workbuddy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(3e4)
    });
  } catch (error) {
    return { error: `\u65E0\u6CD5\u8FDE\u63A5 ${base} \u53D1\u8D77\u767B\u5F55 (${error instanceof Error ? error.message : String(error)})` };
  }
  const document = await readJson(response);
  if (document === void 0) {
    return { error: `\u767B\u5F55\u670D\u52A1\u8FD4\u56DE\u4E86\u975E JSON \u54CD\u5E94 (http ${response.status})` };
  }
  const data = envelopeData(document);
  const state = firstString(data, ["state", "State"]);
  if (state === "") {
    return { error: `\u767B\u5F55\u670D\u52A1\u6CA1\u6709\u7B7E\u53D1 state (http ${response.status})` };
  }
  const authUrl = firstString(data, ["authUrl", "auth_url", "url", "Url"]) || `${base}/login?state=${encodeURIComponent(state)}`;
  const loginId = `wbo_${(0, import_node_crypto.randomUUID)().replaceAll("-", "")}`;
  sessions.set(loginId, {
    region,
    base,
    state,
    expiresAtMs: Date.now() + OAUTH_LOGIN_TIMEOUT_SECONDS * 1e3,
    done: false
  });
  return { loginId, verificationUri: authUrl, expiresIn: OAUTH_LOGIN_TIMEOUT_SECONDS };
}
function terminalOf(session) {
  if (session.result !== void 0) return { done: true, account: session.result };
  return { done: true, error: session.error ?? "\u767B\u5F55\u5DF2\u7ED3\u675F\u4F46\u6CA1\u6709\u7ED3\u679C" };
}
async function oauthPoll(loginId, region, options) {
  const session = sessions.get(loginId);
  if (session === void 0) return { done: true, error: "\u767B\u5F55\u4F1A\u8BDD\u4E0D\u5B58\u5728,\u8BF7\u91CD\u65B0\u53D1\u8D77" };
  if (session.region !== region) return { done: true, error: "\u767B\u5F55\u4F1A\u8BDD\u5C5E\u4E8E\u53E6\u4E00\u4E2A\u533A\u57DF" };
  if (session.done) return terminalOf(session);
  if (Date.now() > session.expiresAtMs) {
    session.done = true;
    session.error = "\u767B\u5F55\u8D85\u65F6,\u8BF7\u91CD\u65B0\u53D1\u8D77";
    sessions.delete(loginId);
    return { done: true, error: session.error };
  }
  const doFetch = options?.fetchImpl ?? fetch;
  let response;
  try {
    response = await doFetch(`${session.base}${API_PREFIX}/auth/token?state=${encodeURIComponent(session.state)}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(3e4)
    });
  } catch {
    return { done: false };
  }
  const document = await readJson(response);
  if (document === void 0) return { done: false };
  const code = typeof document["code"] === "number" ? document["code"] : -1;
  if (code !== 0 && code !== 200) return { done: false };
  const data = envelopeData(document);
  const accessToken = firstString(data, ["accessToken", "access_token", "AccessToken"]);
  if (accessToken === "") return { done: false };
  session.done = true;
  try {
    const account = await collectAccount(session, accessToken, data, doFetch);
    sessions.delete(loginId);
    return { done: true, account };
  } catch (error) {
    session.error = error instanceof Error ? error.message : String(error);
    sessions.delete(loginId);
    return { done: true, error: session.error };
  }
}
async function collectAccount(session, accessToken, tokenData, doFetch) {
  const headers = { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" };
  const domain = firstString(tokenData, ["domain", "Domain"]);
  if (domain !== "") headers["X-Domain"] = domain;
  let profile = {};
  try {
    const response = await doFetch(`${session.base}${API_PREFIX}/login/account`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3e4)
    });
    const document = await readJson(response);
    if (document !== void 0) profile = envelopeData(document);
  } catch {
  }
  const uid = firstString(profile, ["uid", "Uid", "userId", "UserID"]);
  const nickname = optionalString(profile, ["nickname", "NickName", "ScreenName"]);
  const uin = optionalString(profile, ["uin", "Uin"]);
  const enterpriseId = optionalString(profile, ["enterpriseId", "EnterpriseId"]);
  const expiresAtMs = expiryMs(tokenData, ["expiresAt", "expires_at"], ["expiresIn", "expires_in"]) ?? 0;
  const refreshExpiresAtMs = expiryMs(tokenData, ["refreshExpiresAt", "refresh_expires_at"], ["refreshExpiresIn", "refresh_expires_in"]);
  const refresh = firstString(tokenData, ["refreshToken", "refresh_token", "RefreshToken"]);
  return {
    accessToken,
    refreshToken: refresh,
    expiresAtMs,
    ...refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs },
    // token 自带的 domain 优先:它决定哪扇网关接受这把凭据。
    domain: domain !== "" ? domain : firstString(profile, ["domain", "Domain"]),
    uid,
    ...nickname === void 0 ? {} : { nickname },
    ...uin === void 0 ? {} : { uin },
    ...enterpriseId === void 0 ? {} : { enterpriseId }
  };
}

// src/openai/chatCompletion.ts
init_logger();

// src/openai/stream.ts
function buildChatCompletion(model, content, finishReason, usage) {
  return JSON.stringify({
    id: `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason
      }
    ],
    usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  });
}
function dataPayload(frame) {
  for (const line of frame.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed.startsWith("data:")) continue;
    return trimmed.slice("data:".length).trim();
  }
  return void 0;
}
function contentOf(payload) {
  try {
    const chunk = JSON.parse(payload);
    const choices = chunk["choices"];
    const choice = Array.isArray(choices) ? choices[0] : void 0;
    if (typeof choice !== "object" || choice === null) return { content: "", finishReason: "" };
    const record = choice;
    const delta = record["delta"];
    const deltaRecord = typeof delta === "object" && delta !== null ? delta : {};
    const content = typeof deltaRecord["content"] === "string" ? deltaRecord["content"] : "";
    const finishReason = typeof record["finish_reason"] === "string" ? record["finish_reason"] : "";
    return { content, finishReason };
  } catch {
    return { content: "", finishReason: "" };
  }
}
async function pipeUpstreamSse(source, onFrame, options = {}) {
  const { collectText = false, logger } = options;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let collected = "";
  let finishReason = "";
  let sawDone = false;
  const dispatchFrame = (frame) => {
    if (frame.trim() === "") return;
    const payload = dataPayload(frame);
    if (payload === "[DONE]") {
      sawDone = true;
      onFrame(frame.endsWith("\n\n") ? frame : `${frame}

`);
      return;
    }
    if (payload !== void 0 && collectText) {
      const { content, finishReason: reason } = contentOf(payload);
      if (content !== "") collected += content;
      if (reason !== "") finishReason = reason;
    }
    onFrame(frame.endsWith("\n\n") ? frame : `${frame}

`);
  };
  try {
    for await (const chunk of source) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, newline + 2);
        buffer = buffer.slice(newline + 2);
        dispatchFrame(frame);
      }
    }
    if (buffer.trim() !== "") dispatchFrame(buffer);
  } catch (error) {
    logger?.warn(`\u4E0A\u6E38\u6D41\u4E2D\u65AD: ${String(error)}`);
  }
  if (!sawDone) {
    onFrame("data: [DONE]\n\n");
  }
  return { text: collected, finishReason, sawDone };
}

// src/openai/chatCompletion.ts
var log5 = createLogger("chat");
function openAiError(status, message, type, code = null) {
  return { status, body: { error: { message, type, code } } };
}
function validateBody(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: openAiError(400, "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61", "invalid_request_error") };
  }
  const obj = body;
  const model = obj["model"];
  if (typeof model !== "string" || model.trim() === "") {
    return { ok: false, error: openAiError(400, "\u7F3A\u5C11 model \u5B57\u6BB5", "invalid_request_error") };
  }
  const messages = obj["messages"];
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: openAiError(400, "messages \u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4", "invalid_request_error") };
  }
  for (const message of messages) {
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      return { ok: false, error: openAiError(400, "messages \u4E2D\u5B58\u5728\u975E\u6CD5\u6761\u76EE", "invalid_request_error") };
    }
    const role = message["role"];
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "developer") {
      return { ok: false, error: openAiError(400, `\u4E0D\u652F\u6301\u7684 message \u89D2\u8272: ${String(role)}`, "invalid_request_error") };
    }
    const content = message["content"];
    if (typeof content !== "string" && !Array.isArray(content)) {
      return { ok: false, error: openAiError(400, "message content \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u6570\u7EC4", "invalid_request_error") };
    }
  }
  if (obj["temperature"] !== void 0 && (typeof obj["temperature"] !== "number" || !Number.isFinite(obj["temperature"]))) {
    return { ok: false, error: openAiError(400, "temperature \u5FC5\u987B\u662F\u6570\u5B57", "invalid_request_error") };
  }
  if (obj["max_tokens"] !== void 0 && (typeof obj["max_tokens"] !== "number" || !Number.isInteger(obj["max_tokens"]) || obj["max_tokens"] <= 0)) {
    return { ok: false, error: openAiError(400, "max_tokens \u5FC5\u987B\u662F\u6B63\u6574\u6570", "invalid_request_error") };
  }
  const stream = obj["stream"] === true;
  return { ok: true, model: model.trim(), stream, bodyObj: obj };
}
function errorForUpstreamKind(kind, status, message) {
  switch (kind) {
    case "hard_credit":
      return openAiError(402, `WorkBuddy \u79EF\u5206\u4E0D\u8DB3: ${message}`, "insufficient_quota", "insufficient_quota");
    case "soft_rate":
    case "model_busy":
      return openAiError(429, `WorkBuddy \u9650\u6D41: ${message}`, "rate_limit_error", "rate_limit_exceeded");
    case "session_dead":
      return openAiError(401, "WorkBuddy \u767B\u5F55\u5DF2\u5931\u6548,\u8BF7\u5728\u7BA1\u7406\u9875\u91CD\u65B0\u767B\u5F55", "authentication_error", "invalid_api_key");
    case "policy_reject":
      return openAiError(403, `WorkBuddy \u5185\u5BB9\u7B56\u7565\u62D2\u7EDD: ${message}`, "invalid_request_error", "policy_reject");
    case "not_found":
      return openAiError(404, "\u6A21\u578B\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u7528", "invalid_request_error", "model_not_found");
    case "server":
      return openAiError(502, `WorkBuddy \u4E0A\u6E38\u9519\u8BEF: ${message}`, "api_error", "upstream_error");
    default:
      return openAiError(400, `WorkBuddy \u8BF7\u6C42\u88AB\u62D2\u7EDD: ${message}`, "invalid_request_error", "upstream_rejected");
  }
}
function prepareChatBody(source, fallbackSystemPrompt) {
  const obj = JSON.parse(JSON.stringify(source));
  obj["stream"] = true;
  if (Array.isArray(obj["messages"])) {
    for (const value of obj["messages"]) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
      const message = value;
      if (message["role"] === "developer") message["role"] = "system";
    }
  }
  ensureSystemHead(obj, fallbackSystemPrompt);
  normalizeToolChoice(obj);
  return JSON.stringify(obj);
}
function ensureSystemHead(obj, fallback) {
  const messages = obj["messages"];
  if (!Array.isArray(messages) || messages.length === 0) return;
  const head = messages[0];
  if (typeof head !== "object" || head === null || Array.isArray(head)) return;
  const role = head["role"];
  if (typeof role === "string" && role.trim().toLowerCase() === "system") return;
  messages.unshift({ role: "system", content: fallback });
}
function normalizeToolChoice(obj) {
  const present = "tool_choice" in obj;
  if (!present) return;
  const choice = obj["tool_choice"];
  if (typeof choice === "string") {
    if (choice.trim().toLowerCase() === "none") {
      delete obj["tool_choice"];
      delete obj["tools"];
      delete obj["functions"];
    }
    return;
  }
  if (typeof choice === "object" && choice !== null && !Array.isArray(choice)) {
    const wrapped = choice;
    const type = typeof wrapped["type"] === "string" ? wrapped["type"].trim().toLowerCase() : "";
    if (type === "none") {
      delete obj["tool_choice"];
      delete obj["tools"];
      delete obj["functions"];
    } else if (type === "auto" || type === "required") {
      obj["tool_choice"] = type;
    } else if (type === "function") {
      const fn = typeof wrapped["function"] === "object" && wrapped["function"] !== null ? wrapped["function"] : void 0;
      let name = typeof fn?.["name"] === "string" ? fn["name"] : "";
      if (name === "" && typeof wrapped["name"] === "string") name = wrapped["name"];
      name = name.trim();
      obj["tool_choice"] = name !== "" ? name : "auto";
    } else {
      delete obj["tool_choice"];
    }
    return;
  }
  delete obj["tool_choice"];
}
function sendJson(res, status, body) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
async function handleChatCompletion(reqBody, res, deps) {
  const { pool, client, models, config } = deps;
  const validated = validateBody(reqBody);
  if (!validated.ok) {
    sendJson(res, validated.error.status, validated.error.body);
    return;
  }
  const { model, stream, bodyObj } = validated;
  try {
    const primary = await pool.resolvePrimary();
    const exists = await models.hasModel(model, AccountPool.toCredential(primary));
    if (!exists) {
      const err = openAiError(404, `\u6A21\u578B '${model}' \u4E0D\u5B58\u5728\u6216\u5F53\u524D\u4E0D\u53EF\u7528\u3002\u53EF\u7528\u6A21\u578B\u89C1 GET /v1/models\u3002`, "invalid_request_error", "model_not_found");
      sendJson(res, err.status, err.body);
      return;
    }
  } catch (error) {
    log5.warn(`\u6A21\u578B\u6821\u9A8C\u8DF3\u8FC7(\u76EE\u5F55\u6216\u8D26\u53F7\u4E0D\u53EF\u7528): ${String(error)}`);
  }
  const fallbackSystemPrompt = "You are a helpful assistant.";
  const upstreamBody = prepareChatBody(bodyObj, fallbackSystemPrompt);
  const poolResult = await pool.run(async (account) => {
    const credential = AccountPool.toCredential(account);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`\u9996\u5B57\u8282\u8D85\u65F6(${config.timeoutMs}ms)`)),
      config.timeoutMs
    );
    try {
      const result = await client.chatStream(credential, upstreamBody, controller.signal);
      if (result.ok) return { ok: true, value: result.response };
      return { ok: false, kind: result.kind, status: result.status, message: result.message };
    } finally {
      clearTimeout(timer);
    }
  });
  if (!poolResult.ok) {
    const mapped = errorForUpstreamKind(poolResult.kind, poolResult.status, poolResult.message);
    sendJson(res, mapped.status, mapped.body);
    return;
  }
  if (poolResult.failover) {
    log5.info("\u672C\u6B21\u8BF7\u6C42\u7531\u5907\u7528\u8D26\u53F7\u63A5\u7BA1");
  }
  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    const onFrame = (frame) => {
      if (!res.writableEnded) res.write(frame);
    };
    try {
      await pipeUpstreamSse(poolResult.value.body, onFrame, { logger: log5 });
    } finally {
      if (!res.writableEnded) res.end();
    }
    return;
  }
  const summary = await pipeUpstreamSse(
    poolResult.value.body,
    () => {
    },
    { collectText: true, logger: log5 }
  );
  sendJson(res, 200, JSON.parse(buildChatCompletion(model, summary.text, summary.finishReason || "stop")));
}

// src/openai/routes.ts
var log6 = createLogger("routes");
function readJsonBody(req) {
  const raw = req.body;
  if (raw !== void 0 && typeof raw !== "string") return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      return JSON.parse(raw);
    } catch {
      return void 0;
    }
  }
  return {};
}
function sendError(res, status, message) {
  res.status(status).json({ error: { message } });
}
function registerGatewayRoutes(target, deps) {
  const { pool, client, store, models, config } = deps;
  target.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      service: "workbuddy-openai-proxy",
      accounts: store.summaries()
    });
  });
  target.get("/v1/models", async (_req, res) => {
    try {
      const primary = await pool.resolvePrimary();
      const list = await models.list(AccountPool.toCredential(primary));
      res.json({
        object: "list",
        data: list.map((model) => ({
          id: model.id,
          object: "model",
          created: 0,
          owned_by: "workbuddy",
          ...model.contextWindow > 0 ? { context_window: model.contextWindow } : {},
          ...model.maxTokens > 0 ? { max_output_tokens: model.maxTokens } : {}
        }))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log6.error(`\u6A21\u578B\u5217\u8868\u5931\u8D25: ${message}`);
      res.status(401).json({ error: { message, type: "authentication_error", code: "workbuddy_auth_failed" } });
    }
  });
  target.post("/v1/chat/completions", async (req, res) => {
    try {
      await handleChatCompletion(readJsonBody(req), res, { pool, client, models, config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log6.error(`\u804A\u5929\u8BF7\u6C42\u5904\u7406\u5931\u8D25: ${message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: `\u5185\u90E8\u9519\u8BEF: ${message}`, type: "api_error", code: null } });
      } else {
        res.end();
      }
    }
  });
  target.get("/api/accounts", (_req, res) => {
    res.json({
      maxAccounts: MAX_ACCOUNTS,
      accounts: store.summaries()
    });
  });
  target.post("/api/accounts/login", async (req, res) => {
    const body = readJsonBody(req);
    const regionRaw = typeof body["region"] === "string" ? body["region"] : "cn";
    const region = regionRaw === "global" ? "global" : "cn";
    const base = typeof body["base"] === "string" && body["base"].trim() !== "" ? body["base"] : void 0;
    const result = await oauthStart(region, { base });
    if ("error" in result) {
      sendError(res, 502, result.error);
      return;
    }
    res.json(result);
  });
  target.get("/api/accounts/login/:id", async (req, res) => {
    const { id } = req.params;
    const regionRaw = typeof req.query["region"] === "string" ? req.query["region"] : "cn";
    const region = regionRaw === "global" ? "global" : "cn";
    const result = await oauthPoll(id, region);
    if (!result.done) {
      res.json({ done: false });
      return;
    }
    if ("error" in result) {
      sendError(res, 401, result.error);
      return;
    }
    try {
      const account = await store.add({
        domain: result.account.domain,
        uid: result.account.uid,
        ...result.account.nickname === void 0 ? {} : { nickname: result.account.nickname },
        ...result.account.uin === void 0 ? {} : { uin: result.account.uin },
        ...result.account.enterpriseId === void 0 ? {} : { enterpriseId: result.account.enterpriseId },
        accessToken: result.account.accessToken,
        refreshToken: result.account.refreshToken,
        expiresAtMs: result.account.expiresAtMs,
        ...result.account.refreshExpiresAtMs === void 0 ? {} : { refreshExpiresAtMs: result.account.refreshExpiresAtMs }
      });
      log6.info(`\u8D26\u53F7\u5DF2\u5165\u5E93: ${account.nickname ?? account.uin ?? account.id} (${regionOf(account.domain)})`);
      res.json({ done: true, added: true, accounts: store.summaries() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(res, 400, message);
    }
  });
  target.delete("/api/accounts/:id", async (req, res) => {
    try {
      await store.remove(req.params.id);
      res.json({ ok: true, accounts: store.summaries() });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : String(error));
    }
  });
  target.post("/api/accounts/:id/primary", async (req, res) => {
    try {
      await store.setPrimary(req.params.id);
      res.json({ ok: true, accounts: store.summaries() });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : String(error));
    }
  });
  target.post("/api/accounts/:id/test", async (req, res) => {
    const { id } = req.params;
    try {
      const account = await pool.resolveById(id);
      const credential = AccountPool.toCredential(account);
      const checkin = await client.fetchCheckinStatus(credential);
      let credits;
      try {
        const creditInfo = await client.fetchCredits(credential);
        credits = { total: creditInfo.total, expiringSoon: creditInfo.expiringSoon };
      } catch (error) {
        log6.warn(`\u8D26\u53F7 ${account.nickname ?? account.id} \u79EF\u5206\u67E5\u8BE2\u5931\u8D25: ${String(error)}`);
      }
      await store.recordUse(id, { ok: true });
      res.json({ ok: true, checkin, credits });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.recordUse(id, {
        ok: false,
        status: { kind: "bad_credential", atMs: Date.now(), detail: message.slice(0, 200) }
      });
      sendError(res, 502, message);
    }
  });
  if (deps.uiPage !== void 0) {
    target.get("/ui", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(deps.uiPage());
    });
  }
  target.get("/internal-endpoint", (_req, res) => {
    res.json({
      baseUrl: deps.internalBaseUrl ?? null,
      hint: "\u628A baseUrl \u586B\u8FDB\u9152\u9986:Chat Completion \u2192 Custom (OpenAI-compatible) \u2192 Custom Endpoint"
    });
  });
}

// src/openai/ui.ts
function renderUiPage(basePath, internalBaseUrl) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WorkBuddy Gateway \u7BA1\u7406</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 16px 40px;
    font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #14161a; color: #e8eaf0;
    line-height: 1.5;
  }
  h1 { font-size: 1.25rem; margin: 16px 0 4px; }
  .sub { color: #8a93a3; font-size: .8rem; margin-bottom: 16px; word-break: break-all; }
  .card {
    background: #1d2128; border: 1px solid #2a303a; border-radius: 10px;
    padding: 12px 14px; margin-bottom: 12px;
  }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 6px 0; }
  .grow { flex: 1; min-width: 0; }
  button {
    background: #2b3442; color: #e8eaf0; border: 1px solid #3a4556;
    border-radius: 8px; padding: 8px 12px; font-size: .9rem; cursor: pointer;
  }
  button:active { background: #39455a; }
  button.primary { background: #3565c8; border-color: #3565c8; color: #fff; }
  button.danger { background: #7d2f35; border-color: #8d3940; }
  button:disabled { opacity: .45; cursor: default; }
  select {
    background: #2b3442; color: #e8eaf0; border: 1px solid #3a4556;
    border-radius: 8px; padding: 8px 10px; font-size: .9rem;
  }
  .badge {
    display: inline-block; padding: 1px 8px; border-radius: 999px;
    font-size: .75rem; background: #2b3442; color: #aeb8c6; margin-right: 4px;
  }
  .badge.ok { background: #1f4d33; color: #7fe0a8; }
  .badge.bad { background: #5b2227; color: #ff9da6; }
  .badge.primary { background: #274a8f; color: #a8c8ff; }
  .account-name { font-weight: 600; }
  .meta { color: #8a93a3; font-size: .8rem; }
  .status-line { color: #b9c2cf; font-size: .85rem; }
  #loginBox { border-left: 3px solid #3565c8; }
  .link { color: #7fb0ff; word-break: break-all; }
  a.link { text-decoration: none; }
  .url-box {
    background: #10131a; border: 1px solid #2a303a; border-radius: 8px;
    padding: 8px 10px; font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: .82rem; color: #9fe0b8; word-break: break-all; user-select: all;
  }
  .hidden { display: none; }
  .cfg-table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; }
  .cfg-table td { padding: 6px 4px; vertical-align: top; border-bottom: 1px solid #232932; }
  .cfg-table tr:last-child td { border-bottom: none; }
  .cfg-key { color: #8a93a3; font-size: .82rem; width: 88px; white-space: nowrap; }
  .cfg-val { font-size: .85rem; }
  .copy-btn {
    padding: 4px 10px; font-size: .78rem; margin-left: 6px;
    background: #263041; border-color: #35435a;
  }
  .copy-btn.done { background: #1f4d33; border-color: #2a6b47; color: #9fe0b8; }
  code {
    background: #10131a; border: 1px solid #2a303a; border-radius: 5px;
    padding: 1px 6px; font-size: .82rem; color: #cfe3ff;
  }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #4a5568; border-top-color: #7fb0ff; border-radius: 50%; animation: spin 1s linear infinite; vertical-align: -2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<h1>WorkBuddy Gateway</h1>
<div class="sub" id="serviceInfo">\u6B63\u5728\u52A0\u8F7D\u2026</div>

<div class="card" style="border-left:3px solid #1f4d33">
  <div class="status-line"><b>\u2460 \u628A\u4E0B\u9762\u8FD9\u4E9B\u586B\u8FDB\u9152\u9986\u7684 API \u8BBE\u7F6E</b><br>
    <span class="meta">\u9152\u9986\u9875\u9762 \u2192 \u9876\u90E8 \u{1F50C} \u56FE\u6807(API \u8FDE\u63A5)\u2192 \u6309\u4E0B\u8868\u9010\u9879\u586B</span></div>
  <table class="cfg-table">
    <tr>
      <td class="cfg-key">API</td>
      <td class="cfg-val">\u804A\u5929\u8865\u5168(Chat Completion)</td>
    </tr>
    <tr>
      <td class="cfg-key">\u804A\u5929\u8865\u5168\u6765\u6E90</td>
      <td class="cfg-val">\u81EA\u5B9A\u4E49(\u517C\u5BB9 OpenAI)</td>
    </tr>
    <tr>
      <td class="cfg-key">\u81EA\u5B9A\u4E49\u7AEF\u70B9<br>(\u57FA\u7840 URL)</td>
      <td class="cfg-val">
        <span class="url-box" id="openaiBaseUrl">\u2014</span>
        <button class="copy-btn" id="copyBaseUrl">\u590D\u5236</button>
      </td>
    </tr>
    <tr>
      <td class="cfg-key">\u81EA\u5B9A\u4E49 API \u5BC6\u94A5</td>
      <td class="cfg-val"><code id="apiKeyHint">sk-x</code>
        <button class="copy-btn" id="copyApiKey">\u590D\u5236</button>
        <span class="meta">\u672C\u63D2\u4EF6\u4E0D\u6821\u9A8C,\u586B\u4EFB\u610F\u975E\u7A7A\u503C\u5373\u53EF</span></td>
    </tr>
    <tr>
      <td class="cfg-key">\u6A21\u578B</td>
      <td class="cfg-val">\u70B9\u300C\u53EF\u7528\u6A21\u578B\u300D\u53F3\u4FA7\u7684 \u27F3 \u5237\u65B0\u6309\u94AE,\u4ECE\u5217\u8868\u91CC\u9009(\u5982 <code>glm-5.3</code>)</td>
    </tr>
    <tr>
      <td class="cfg-key">\u6D41\u5F0F\u4F20\u8F93</td>
      <td class="cfg-val">\u5F00\u542F(\u6253\u5B57\u673A\u6548\u679C)</td>
    </tr>
  </table>
  <div class="meta" id="endpointNote"></div>
</div>

<div class="card" id="loginBox">
  <div class="status-line"><b>\u2461 \u6DFB\u52A0 WorkBuddy \u8D26\u53F7</b></div>
  <div class="row">
    <select id="regionSelect">
      <option value="cn">\u56FD\u5185\u7248 (codebuddy.cn)</option>
      <option value="global">\u56FD\u9645\u7248 (workbuddy.ai)</option>
    </select>
    <button id="btnAdd" class="primary">+ \u6DFB\u52A0\u8D26\u53F7</button>
  </div>
  <div id="loginProgress" class="status-line hidden"></div>
</div>

<div class="card">
  <div class="row"><span class="account-name">\u8D26\u53F7\u5217\u8868</span><span class="grow"></span><span class="meta" id="accountCount"></span></div>
  <div id="accountList"><div class="status-line">\u6682\u65E0\u8D26\u53F7,\u70B9\u4E0A\u65B9"\u6DFB\u52A0\u8D26\u53F7"\u767B\u5F55\u3002</div></div>
</div>

<script>
(function () {
  var BASE = ${JSON.stringify(basePath)};
  var OPENAI_BASE = ${JSON.stringify(internalBaseUrl ?? "")};
  var accounts = [];
  var csrfToken = '';

  // SillyTavern \u7684 POST \u5FC5\u987B\u5E26 X-CSRF-Token,\u5426\u5219 403(HTML)\u3002
  function fetchCsrfToken() {
    return fetch('/csrf-token', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { csrfToken = (d && d.token) || ''; })
      .catch(function () { csrfToken = ''; });
  }

  function api(path, opts) {
    var options = Object.assign({}, opts);
    var headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    options.headers = headers;
    return fetch(BASE + path, options).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = JSON.parse(text); }
        catch (e) {
          // \u975E JSON:\u591A\u534A\u662F CSRF/\u767D\u540D\u5355\u62E6\u622A\u7684 HTML \u9875
          throw new Error('\u670D\u52A1\u7AEF\u8FD4\u56DE\u975E JSON(' + res.status + ')\u3002'
            + (res.status === 403 ? '\u53EF\u80FD\u662F CSRF \u6821\u9A8C\u5931\u8D25,\u8BF7\u5237\u65B0\u672C\u9875\u91CD\u8BD5\u3002' : text.slice(0, 120)));
        }
        if (!res.ok) {
          var msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function el(id) { return document.getElementById(id); }

  function fmtMoney(n) { return n === undefined || n === null ? '\u2014' : Number(n).toFixed(2); }

  function statusBadge(a) {
    var s = a.lastStatus;
    if (!s) return '<span class="badge">\u672A\u6D4B\u8BD5</span>';
    var map = {
      ok: '<span class="badge ok">\u53EF\u7528</span>',
      bad_credential: '<span class="badge bad">\u767B\u5F55\u5931\u6548</span>',
      out_of_credits: '<span class="badge bad">\u79EF\u5206\u4E0D\u8DB3</span>',
      rate_limited: '<span class="badge bad">\u9650\u6D41</span>',
      unreachable: '<span class="badge bad">\u4E0D\u53EF\u8FBE</span>',
    };
    var until = s.untilMs && s.untilMs > Date.now()
      ? ' (\u51B7\u5374 ' + Math.ceil((s.untilMs - Date.now()) / 60000) + ' \u5206\u949F)' : '';
    return (map[s.kind] || '<span class="badge">\u672A\u77E5</span>') + until;
  }

  function render() {
    el('accountCount').textContent = accounts.length + ' / 5';
    var box = el('accountList');
    if (accounts.length === 0) {
      box.innerHTML = '<div class="status-line">\u6682\u65E0\u8D26\u53F7,\u70B9\u4E0A\u65B9"\u6DFB\u52A0\u8D26\u53F7"\u767B\u5F55\u3002</div>';
      return;
    }
    box.innerHTML = accounts.map(function (a) {
      var name = a.nickname || a.uin || a.uid || a.id;
      var region = a.domain && (a.domain.indexOf('workbuddy.ai') !== -1 || a.domain.indexOf('codebuddy.ai') !== -1) ? '\u56FD\u9645' : '\u56FD\u5185';
      return '<div class="card" style="margin:8px 0">'
        + '<div class="row">'
        + '<span class="account-name">' + name + '</span>'
        + (a.primary ? '<span class="badge primary">\u4E3B\u8D26\u53F7</span>' : '<button data-id="' + a.id + '" class="set-primary">\u8BBE\u4E3A\u4E3B\u8D26\u53F7</button>')
        + '<span class="badge">' + region + '</span>'
        + statusBadge(a)
        + '<span class="grow"></span>'
        + '<button data-id="' + a.id + '" class="test">\u6D4B\u8BD5</button>'
        + '<button data-id="' + a.id + '" class="delete danger">\u5220\u9664</button>'
        + '</div>'
        + '<div class="meta">\u79EF\u5206: ' + (a.credits !== undefined ? fmtMoney(a.credits.total) : '\u2014')
        + (a.credits && a.credits.expiringSoon > 0 ? ' \xB7 3\u5929\u5185\u8FC7\u671F ' + fmtMoney(a.credits.expiringSoon) : '')
        + (a.expiringSoon ? ' \xB7 <span style="color:#ff9da6">token\u5373\u5C06\u8FC7\u671F</span>' : '')
        + ' \xB7 \u57DF: ' + (a.domain || '\u2014') + '</div>'
        + (a.failCount > 0 ? '<div class="meta" style="color:#ff9da6">\u8FDE\u7EED\u5931\u8D25 ' + a.failCount + ' \u6B21' + (a.lastStatus && a.lastStatus.detail ? ': ' + a.lastStatus.detail.slice(0, 120) : '') + '</div>' : '')
        + '</div>';
    }).join('');
    box.querySelectorAll('.set-primary').forEach(function (btn) {
      btn.onclick = function () { setPrimary(btn.getAttribute('data-id')); };
    });
    box.querySelectorAll('.test').forEach(function (btn) {
      btn.onclick = function () { testAccount(btn.getAttribute('data-id'), btn); };
    });
    box.querySelectorAll('.delete').forEach(function (btn) {
      btn.onclick = function () {
        if (confirm('\u786E\u5B9A\u5220\u9664\u8BE5\u8D26\u53F7?\u51ED\u636E\u5C06\u4ECE\u672C\u673A\u79FB\u9664\u3002')) removeAccount(btn.getAttribute('data-id'));
      };
    });
  }

  function refresh() {
    return api('/api/accounts').then(function (d) {
      accounts = d.accounts || [];
      render();
    }).catch(function (e) {
      el('accountList').innerHTML = '<div class="status-line" style="color:#ff9da6">\u52A0\u8F7D\u5931\u8D25: ' + e.message + '</div>';
    });
  }

  function setPrimary(id) {
    api('/api/accounts/' + id + '/primary', { method: 'POST' }).then(refresh).catch(function (e) { alert('\u5931\u8D25: ' + e.message); });
  }

  function testAccount(id, btn) {
    btn.disabled = true; btn.textContent = '\u6D4B\u8BD5\u4E2D\u2026';
    api('/api/accounts/' + id + '/test', { method: 'POST' })
      .then(function (d) {
        alert(d.ok ? '\u8D26\u53F7\u53EF\u7528\u3002\u79EF\u5206: ' + fmtMoney(d.credits && d.credits.total) : '\u5931\u8D25');
      })
      .catch(function (e) { alert('\u5931\u8D25: ' + e.message); })
      .finally(function () { btn.disabled = false; btn.textContent = '\u6D4B\u8BD5'; refresh(); });
  }

  function removeAccount(id) {
    api('/api/accounts/' + id, { method: 'DELETE' }).then(refresh).catch(function (e) { alert('\u5220\u9664\u5931\u8D25: ' + e.message); });
  }

  el('btnAdd').onclick = function () {
    var region = el('regionSelect').value;
    var progress = el('loginProgress');
    el('btnAdd').disabled = true;
    progress.classList.remove('hidden');
    progress.innerHTML = '<span class="spinner"></span> \u6B63\u5728\u7533\u8BF7\u767B\u5F55\u4F1A\u8BDD\u2026';
    api('/api/accounts/login', { method: 'POST', body: JSON.stringify({ region: region }) })
      .then(function (d) {
        progress.innerHTML = '\u8BF7\u5728\u6253\u5F00\u7684\u65B0\u9875\u9762\u5B8C\u6210\u624B\u673A\u53F7\u9A8C\u8BC1\u7801\u767B\u5F55,\u5B8C\u6210\u540E\u672C\u9875\u4F1A\u81EA\u52A8\u5237\u65B0\u3002'
          + '<br><a class="link" href="' + d.verificationUri + '" target="_blank" rel="noopener">\u70B9\u6B64\u6253\u5F00 WorkBuddy \u767B\u5F55\u9875</a>';
        window.open(d.verificationUri, '_blank', 'noopener');
        var poll = function () {
          api('/api/accounts/login/' + d.loginId + '?region=' + encodeURIComponent(region))
            .then(function (p) {
              if (p.done === false) { setTimeout(poll, 3000); return; }
              progress.innerHTML = '<span class="badge ok">\u767B\u5F55\u6210\u529F</span>';
              el('btnAdd').disabled = false;
              refresh();
            })
            .catch(function (e) {
              progress.innerHTML = '<span style="color:#ff9da6">\u767B\u5F55\u5931\u8D25: ' + e.message + '</span>';
              el('btnAdd').disabled = false;
            });
        };
        setTimeout(poll, 2500);
      })
      .catch(function (e) {
        progress.innerHTML = '<span style="color:#ff9da6">' + e.message + '</span>';
        el('btnAdd').disabled = false;
      });
  };

  // \u590D\u5236\u6309\u94AE:\u624B\u673A\u4E0A\u6CA1\u6709\u65B9\u4FBF\u7684\u9009\u62E9\u64CD\u4F5C,\u4E00\u952E\u590D\u5236\u6700\u5B9E\u7528
  function wireCopy(btnId, textOf) {
    var btn = el(btnId);
    if (!btn) return;
    btn.onclick = function () {
      var text = textOf();
      if (!text) { alert('\u5730\u5740\u5C1A\u672A\u5C31\u7EEA,\u8BF7\u5237\u65B0\u9875\u9762'); return; }
      var done = function () {
        var old = btn.textContent;
        btn.textContent = '\u5DF2\u590D\u5236';
        btn.classList.add('done');
        setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
      } else {
        fallbackCopy(text, done);
      }
    };
  }
  // \u517C\u5BB9\u975E HTTPS / \u65E7 WebView:\u7528\u4E34\u65F6 textarea \u9009\u4E2D\u590D\u5236
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('\u590D\u5236\u5931\u8D25,\u8BF7\u624B\u52A8\u957F\u6309\u9009\u4E2D: ' + text); }
    document.body.removeChild(ta);
  }

  // \u521D\u59CB\u5316:\u5148\u62FF CSRF token,\u518D\u52A0\u8F7D\u6570\u636E
  fetchCsrfToken().then(function () {
    var endpoint = OPENAI_BASE || (BASE + '/v1');
    el('openaiBaseUrl').textContent = endpoint;
    el('serviceInfo').textContent = '\u7BA1\u7406\u9875: ' + BASE + ' \xB7 OpenAI \u7AEF\u70B9: ' + endpoint;
    el('endpointNote').innerHTML = OPENAI_BASE
      ? '\u8BF4\u660E:\u8FD9\u4E2A\u5730\u5740\u7531\u63D2\u4EF6\u81EA\u5EFA,\u4EC5\u76D1\u542C\u672C\u673A(127.0.0.1),\u4E13\u4F9B\u9152\u9986\u540E\u7AEF\u8C03\u7528 \u2014\u2014 '
        + '\u4E0D\u8981\u586B\u9152\u9986\u81EA\u5DF1\u7684 8000 \u7AEF\u53E3,\u90A3\u4E2A\u7AEF\u53E3\u4E0A\u7684 POST \u4F1A\u88AB CSRF \u62E6\u622A\u800C\u8FD4\u56DE 403\u3002'
      : '\u8BF4\u660E:\u672C\u9875\u9762\u672A\u62FF\u5230\u5185\u90E8\u7AEF\u70B9\u5730\u5740(\u53EF\u80FD\u63D2\u4EF6\u7248\u672C\u8F83\u65E7),\u8BF7\u67E5\u770B\u542F\u52A8\u65E5\u5FD7\u91CC '
        + '\u300C\u9152\u9986 API \u8BBE\u7F6E\u91CC\u586B\u8FD9\u4E2A Base URL\u300D\u90A3\u4E00\u884C\u3002';
    wireCopy('copyBaseUrl', function () { return endpoint; });
    wireCopy('copyApiKey', function () { return 'sk-x'; });
    refresh();
    setInterval(refresh, 60000);
  });
})();
</script>
</body>
</html>`;
}

// src/plugin/internal-server.ts
var import_node_http = require("node:http");
init_logger();
var log7 = createLogger("internal-server");
var DEFAULT_INTERNAL_PORT = 8001;
var PORT_SCAN_RANGE = 12;
async function readJsonBody2(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function sendJson2(res, status, body) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
async function startInternalServer(options) {
  const { gateway, config } = options;
  const startPort = options.preferredPort ?? DEFAULT_INTERNAL_PORT;
  const server = (0, import_node_http.createServer)((req, res) => {
    void handle(req, res);
  });
  async function handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (req.method === "GET" && path === "/healthz") {
        sendJson2(res, 200, {
          ok: true,
          service: "workbuddy-gateway",
          accounts: gateway.store.summaries()
        });
        return;
      }
      if (req.method === "GET" && path === "/v1/models") {
        let primary;
        try {
          primary = await gateway.pool.resolvePrimary();
        } catch (error) {
          sendJson2(res, 401, {
            error: {
              message: error instanceof Error ? error.message : String(error),
              type: "authentication_error",
              code: "workbuddy_auth_failed"
            }
          });
          return;
        }
        const list = await gateway.models.list(AccountPool.toCredential(primary));
        sendJson2(res, 200, {
          object: "list",
          data: list.map((model) => ({
            id: model.id,
            object: "model",
            created: 0,
            owned_by: "workbuddy",
            ...model.contextWindow > 0 ? { context_window: model.contextWindow } : {},
            ...model.maxTokens > 0 ? { max_output_tokens: model.maxTokens } : {}
          }))
        });
        return;
      }
      if (req.method === "POST" && path === "/v1/chat/completions") {
        const body = await readJsonBody2(req);
        await handleChatCompletion(body, res, {
          pool: gateway.pool,
          client: gateway.client,
          models: gateway.models,
          config
        });
        return;
      }
      sendJson2(res, 404, { error: { message: `Not Found: ${req.method} ${path}`, type: "invalid_request_error" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log7.error(`\u5185\u90E8\u7AEF\u70B9\u5904\u7406\u5931\u8D25 ${req.method} ${path}: ${message}`);
      sendJson2(res, 500, { error: { message: `\u5185\u90E8\u9519\u8BEF: ${message}`, type: "api_error", code: null } });
    }
  }
  let boundPort = 0;
  let lastError;
  for (let offset = 0; offset < PORT_SCAN_RANGE; offset += 1) {
    const candidate = startPort + offset;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(candidate, "127.0.0.1");
      });
      boundPort = candidate;
      break;
    } catch (error) {
      lastError = error;
      log7.warn(`\u7AEF\u53E3 ${candidate} \u4E0D\u53EF\u7528,\u5C1D\u8BD5\u4E0B\u4E00\u4E2A`);
    }
  }
  if (boundPort === 0) {
    throw new Error(`\u65E0\u6CD5\u5728 ${startPort}~${startPort + PORT_SCAN_RANGE - 1} \u627E\u5230\u7A7A\u95F2\u7AEF\u53E3: ${String(lastError)}`);
  }
  const baseUrl = `http://127.0.0.1:${boundPort}/v1`;
  log7.info(`\u5185\u90E8 OpenAI \u7AEF\u70B9\u5DF2\u542F\u52A8: ${baseUrl}(\u4EC5\u672C\u673A\u56DE\u73AF)`);
  return {
    port: boundPort,
    baseUrl,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
    })
  };
}

// src/plugin/plugin-entry.ts
var internalServer;
function findStRoot(startDir) {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    if ((0, import_node_fs4.existsSync)((0, import_node_path4.join)(dir, "config.yaml")) || (0, import_node_fs4.existsSync)((0, import_node_path4.join)(dir, "server.js"))) return dir;
    const parent = (0, import_node_path4.dirname)(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
async function init(router) {
  const stRoot = findStRoot((0, import_node_path4.dirname)(__filename));
  const dataRoot = process.env["WORKBUDDY_GATEWAY_DATA"] ?? (stRoot !== void 0 ? (0, import_node_path4.join)(stRoot, "data", "workbuddy-gateway") : (0, import_node_path4.join)((0, import_node_path4.dirname)(__filename), "data"));
  const config = loadConfig();
  setLogLevel(config.logLevel);
  const gateway = createGateway({
    config,
    accountsFile: (0, import_node_path4.join)(dataRoot, "accounts.json")
  });
  if (internalServer === void 0) {
    const envPort = Number.parseInt(process.env["WORKBUDDY_GATEWAY_PORT"] ?? "", 10);
    internalServer = await startInternalServer({
      gateway,
      config,
      preferredPort: Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_INTERNAL_PORT
    });
  }
  registerGatewayRoutes(router, {
    pool: gateway.pool,
    client: gateway.client,
    store: gateway.store,
    models: gateway.models,
    config,
    // 第二个参数必须传:管理页要把它展示给用户,让用户复制进酒馆 API 设置
    uiPage: () => renderUiPage("/api/plugins/workbuddy-gateway", internalServer?.baseUrl),
    internalBaseUrl: internalServer.baseUrl
  });
  void Promise.resolve().then(() => (init_legacy_bridge(), legacy_bridge_exports)).then(
    ({ seedLegacyAccounts: seedLegacyAccounts2 }) => seedLegacyAccounts2(gateway.store, config.workbuddyAuthFile || void 0)
  );
  console.log("[workbuddy-gateway] ready \u2014 mounted at /api/plugins/workbuddy-gateway");
  console.log("[workbuddy-gateway] \u7BA1\u7406\u9875: http://127.0.0.1:8000/api/plugins/workbuddy-gateway/ui");
  console.log(`[workbuddy-gateway] >>> \u9152\u9986 API \u8BBE\u7F6E\u91CC\u586B\u8FD9\u4E2A Base URL: ${internalServer.baseUrl}`);
  console.log("[workbuddy-gateway]     (Chat Completion \u2192 Custom (OpenAI-compatible) \u2192 Custom Endpoint)");
}
async function exit() {
  if (internalServer !== void 0) {
    await internalServer.close();
    internalServer = void 0;
  }
  console.log("[workbuddy-gateway] exit");
}
var info = {
  id: "workbuddy-gateway",
  name: "WorkBuddy Gateway",
  description: "\u628A WorkBuddy \u8D26\u53F7\u63A5\u5165 SillyTavern \u7684 OpenAI \u517C\u5BB9\u7F51\u5173:\u591A\u8D26\u53F7\u7BA1\u7406\u3001OAuth \u767B\u5F55\u3001\u8D26\u53F7\u6C60\u81EA\u52A8\u5207\u6362\u3002"
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  exit,
  info,
  init
});
