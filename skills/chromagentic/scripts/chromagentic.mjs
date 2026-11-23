#!/usr/bin/env node
/*! Chromagentic 0.3.0 | Apache-2.0 | https://github.com/NateBaldwinDesign/Chromagentic
 * Includes colorjs.io (MIT, Lea Verou and Chris Lilley) and code adapted from Adobe Spectrum Studio (Apache-2.0). See NOTICE. */

// src/cli/run.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { parseArgs } from "util";

// node_modules/colorjs.io/src/multiply-matrices.js
function multiplyMatrices(A, B) {
  let m = A.length;
  if (!Array.isArray(A[0])) {
    A = [A];
  }
  if (!Array.isArray(B[0])) {
    B = B.map((x) => [x]);
  }
  let p2 = B[0].length;
  let B_cols = B[0].map((_, i) => B.map((x) => x[i]));
  let product = A.map((row) => B_cols.map((col) => {
    let ret = 0;
    if (!Array.isArray(row)) {
      for (let c of col) {
        ret += row * c;
      }
      return ret;
    }
    for (let i = 0; i < row.length; i++) {
      ret += row[i] * (col[i] || 0);
    }
    return ret;
  }));
  if (m === 1) {
    product = product[0];
  }
  if (p2 === 1) {
    return product.map((x) => x[0]);
  }
  return product;
}

// node_modules/colorjs.io/src/util.js
function isString(str) {
  return type(str) === "string";
}
function type(o) {
  let str = Object.prototype.toString.call(o);
  return (str.match(/^\[object\s+(.*?)\]$/)[1] || "").toLowerCase();
}
function serializeNumber(n2, { precision, unit }) {
  if (isNone(n2)) {
    return "none";
  }
  return toPrecision(n2, precision) + (unit ?? "");
}
function isNone(n2) {
  return Number.isNaN(n2) || n2 instanceof Number && n2?.none;
}
function toPrecision(n2, precision) {
  if (n2 === 0) {
    return 0;
  }
  let integer = ~~n2;
  let digits = 0;
  if (integer && precision) {
    digits = ~~Math.log10(Math.abs(integer)) + 1;
  }
  const multiplier = 10 ** (precision - digits);
  return Math.floor(n2 * multiplier + 0.5) / multiplier;
}
var angleFactor = {
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360
};
function parseFunction(str) {
  if (!str) {
    return;
  }
  str = str.trim();
  const isFunctionRegex = /^([a-z]+)\((.+?)\)$/i;
  const isNumberRegex = /^-?[\d.]+$/;
  const unitValueRegex = /%|deg|g?rad|turn$/;
  const singleArgument = /\/?\s*(none|[-\w.]+(?:%|deg|g?rad|turn)?)/g;
  let parts = str.match(isFunctionRegex);
  if (parts) {
    let args = [];
    parts[2].replace(singleArgument, ($0, rawArg) => {
      let match = rawArg.match(unitValueRegex);
      let arg = rawArg;
      if (match) {
        let unit = match[0];
        let unitlessArg = arg.slice(0, -unit.length);
        if (unit === "%") {
          arg = new Number(unitlessArg / 100);
          arg.type = "<percentage>";
        } else {
          arg = new Number(unitlessArg * angleFactor[unit]);
          arg.type = "<angle>";
          arg.unit = unit;
        }
      } else if (isNumberRegex.test(arg)) {
        arg = new Number(arg);
        arg.type = "<number>";
      } else if (arg === "none") {
        arg = new Number(NaN);
        arg.none = true;
      }
      if ($0.startsWith("/")) {
        arg = arg instanceof Number ? arg : new Number(arg);
        arg.alpha = true;
      }
      if (typeof arg === "object" && arg instanceof Number) {
        arg.raw = rawArg;
      }
      args.push(arg);
    });
    return {
      name: parts[1].toLowerCase(),
      rawName: parts[1],
      rawArgs: parts[2],
      // An argument could be (as of css-color-4):
      // a number, percentage, degrees (hue), ident (in color())
      args
    };
  }
}
function last(arr) {
  return arr[arr.length - 1];
}
function interpolate(start, end, p2) {
  if (isNaN(start)) {
    return end;
  }
  if (isNaN(end)) {
    return start;
  }
  return start + (end - start) * p2;
}
function interpolateInv(start, end, value) {
  return (value - start) / (end - start);
}
function mapRange(from, to2, value) {
  return interpolate(to2[0], to2[1], interpolateInv(from[0], from[1], value));
}
function parseCoordGrammar(coordGrammars) {
  return coordGrammars.map((coordGrammar2) => {
    return coordGrammar2.split("|").map((type2) => {
      type2 = type2.trim();
      let range = type2.match(/^(<[a-z]+>)\[(-?[.\d]+),\s*(-?[.\d]+)\]?$/);
      if (range) {
        let ret = new String(range[1]);
        ret.range = [+range[2], +range[3]];
        return ret;
      }
      return type2;
    });
  });
}
function clamp(min, val, max) {
  return Math.max(Math.min(max, val), min);
}
function copySign(to2, from) {
  return Math.sign(to2) === Math.sign(from) ? to2 : -to2;
}
function spow(base, exp) {
  return copySign(Math.abs(base) ** exp, base);
}
function zdiv(n2, d2) {
  return d2 === 0 ? 0 : n2 / d2;
}
function bisectLeft(arr, value, lo = 0, hi = arr.length) {
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (arr[mid] < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// node_modules/colorjs.io/src/hooks.js
var Hooks = class {
  add(name, callback, first) {
    if (typeof arguments[0] != "string") {
      for (var name in arguments[0]) {
        this.add(name, arguments[0][name], arguments[1]);
      }
      return;
    }
    (Array.isArray(name) ? name : [name]).forEach(function(name2) {
      this[name2] = this[name2] || [];
      if (callback) {
        this[name2][first ? "unshift" : "push"](callback);
      }
    }, this);
  }
  run(name, env) {
    this[name] = this[name] || [];
    this[name].forEach(function(callback) {
      callback.call(env && env.context ? env.context : env, env);
    });
  }
};
var hooks = new Hooks();
var hooks_default = hooks;

// node_modules/colorjs.io/src/adapt.js
var WHITES = {
  // for compatibility, the four-digit chromaticity-derived ones everyone else uses
  D50: [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585],
  D65: [0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329]
};
function getWhite(name) {
  if (Array.isArray(name)) {
    return name;
  }
  return WHITES[name];
}
function adapt(W1, W2, XYZ, options = {}) {
  W1 = getWhite(W1);
  W2 = getWhite(W2);
  if (!W1 || !W2) {
    throw new TypeError(`Missing white point to convert ${!W1 ? "from" : ""}${!W1 && !W2 ? "/" : ""}${!W2 ? "to" : ""}`);
  }
  if (W1 === W2) {
    return XYZ;
  }
  let env = { W1, W2, XYZ, options };
  hooks_default.run("chromatic-adaptation-start", env);
  if (!env.M) {
    if (env.W1 === WHITES.D65 && env.W2 === WHITES.D50) {
      env.M = [
        [1.0479297925449969, 0.022946870601609652, -0.05019226628920524],
        [0.02962780877005599, 0.9904344267538799, -0.017073799063418826],
        [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371]
      ];
    } else if (env.W1 === WHITES.D50 && env.W2 === WHITES.D65) {
      env.M = [
        [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
        [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
        [0.012314014864481998, -0.020507649298898964, 1.330365926242124]
      ];
    }
  }
  hooks_default.run("chromatic-adaptation-end", env);
  if (env.M) {
    return multiplyMatrices(env.M, env.XYZ);
  } else {
    throw new TypeError("Only Bradford CAT with white points D50 and D65 supported for now.");
  }
}

// node_modules/colorjs.io/src/defaults.js
var defaults_default = {
  gamut_mapping: "css",
  precision: 5,
  deltaE: "76",
  // Default deltaE method
  verbose: globalThis?.process?.env?.NODE_ENV?.toLowerCase() !== "test",
  warn: function warn(msg) {
    if (this.verbose) {
      globalThis?.console?.warn?.(msg);
    }
  }
};

// node_modules/colorjs.io/src/parse.js
var noneTypes = /* @__PURE__ */ new Set(["<number>", "<percentage>", "<angle>"]);
function coerceCoords(space, format, name, coords) {
  let types = Object.entries(space.coords).map(([id, coordMeta], i) => {
    let coordGrammar2 = format.coordGrammar[i];
    let arg = coords[i];
    let providedType = arg?.type;
    let type2;
    if (arg.none) {
      type2 = coordGrammar2.find((c) => noneTypes.has(c));
    } else {
      type2 = coordGrammar2.find((c) => c == providedType);
    }
    if (!type2) {
      let coordName = coordMeta.name || id;
      throw new TypeError(`${providedType ?? arg.raw} not allowed for ${coordName} in ${name}()`);
    }
    let fromRange = type2.range;
    if (providedType === "<percentage>") {
      fromRange ||= [0, 1];
    }
    let toRange = coordMeta.range || coordMeta.refRange;
    if (fromRange && toRange) {
      coords[i] = mapRange(fromRange, toRange, coords[i]);
    }
    return type2;
  });
  return types;
}
function parse(str, { meta } = {}) {
  let env = { "str": String(str)?.trim() };
  hooks_default.run("parse-start", env);
  if (env.color) {
    return env.color;
  }
  env.parsed = parseFunction(env.str);
  if (env.parsed) {
    let name = env.parsed.name;
    if (name === "color") {
      let id = env.parsed.args.shift();
      let alternateId = id.startsWith("--") ? id.substring(2) : `--${id}`;
      let ids = [id, alternateId];
      let alpha = env.parsed.rawArgs.indexOf("/") > 0 ? env.parsed.args.pop() : 1;
      for (let space of ColorSpace.all) {
        let colorSpec = space.getFormat("color");
        if (colorSpec) {
          if (ids.includes(colorSpec.id) || colorSpec.ids?.filter((specId) => ids.includes(specId)).length) {
            const coords = Object.keys(space.coords).map((_, i) => env.parsed.args[i] || 0);
            let types;
            if (colorSpec.coordGrammar) {
              types = coerceCoords(space, colorSpec, "color", coords);
            }
            if (meta) {
              Object.assign(meta, { formatId: "color", types });
            }
            if (colorSpec.id.startsWith("--") && !id.startsWith("--")) {
              defaults_default.warn(`${space.name} is a non-standard space and not currently supported in the CSS spec. Use prefixed color(${colorSpec.id}) instead of color(${id}).`);
            }
            if (id.startsWith("--") && !colorSpec.id.startsWith("--")) {
              defaults_default.warn(`${space.name} is a standard space and supported in the CSS spec. Use color(${colorSpec.id}) instead of prefixed color(${id}).`);
            }
            return { spaceId: space.id, coords, alpha };
          }
        }
      }
      let didYouMean = "";
      let registryId = id in ColorSpace.registry ? id : alternateId;
      if (registryId in ColorSpace.registry) {
        let cssId = ColorSpace.registry[registryId].formats?.color?.id;
        if (cssId) {
          didYouMean = `Did you mean color(${cssId})?`;
        }
      }
      throw new TypeError(`Cannot parse color(${id}). ` + (didYouMean || "Missing a plugin?"));
    } else {
      for (let space of ColorSpace.all) {
        let format = space.getFormat(name);
        if (format && format.type === "function") {
          let alpha = 1;
          if (format.lastAlpha || last(env.parsed.args).alpha) {
            alpha = env.parsed.args.pop();
          }
          let coords = env.parsed.args;
          let types;
          if (format.coordGrammar) {
            types = coerceCoords(space, format, name, coords);
          }
          if (meta) {
            Object.assign(meta, { formatId: format.name, types });
          }
          return {
            spaceId: space.id,
            coords,
            alpha
          };
        }
      }
    }
  } else {
    for (let space of ColorSpace.all) {
      for (let formatId in space.formats) {
        let format = space.formats[formatId];
        if (format.type !== "custom") {
          continue;
        }
        if (format.test && !format.test(env.str)) {
          continue;
        }
        let color = format.parse(env.str);
        if (color) {
          color.alpha ??= 1;
          if (meta) {
            meta.formatId = formatId;
          }
          return color;
        }
      }
    }
  }
  throw new TypeError(`Could not parse ${str} as a color. Missing a plugin?`);
}

// node_modules/colorjs.io/src/getColor.js
function getColor(color) {
  if (Array.isArray(color)) {
    return color.map(getColor);
  }
  if (!color) {
    throw new TypeError("Empty color reference");
  }
  if (isString(color)) {
    color = parse(color);
  }
  let space = color.space || color.spaceId;
  if (!(space instanceof ColorSpace)) {
    color.space = ColorSpace.get(space);
  }
  if (color.alpha === void 0) {
    color.alpha = 1;
  }
  return color;
}

// node_modules/colorjs.io/src/space.js
var \u03B5 = 75e-6;
var ColorSpace = class _ColorSpace {
  constructor(options) {
    this.id = options.id;
    this.name = options.name;
    this.base = options.base ? _ColorSpace.get(options.base) : null;
    this.aliases = options.aliases;
    if (this.base) {
      this.fromBase = options.fromBase;
      this.toBase = options.toBase;
    }
    let coords = options.coords ?? this.base.coords;
    for (let name in coords) {
      if (!("name" in coords[name])) {
        coords[name].name = name;
      }
    }
    this.coords = coords;
    let white4 = options.white ?? this.base.white ?? "D65";
    this.white = getWhite(white4);
    this.formats = options.formats ?? {};
    for (let name in this.formats) {
      let format = this.formats[name];
      format.type ||= "function";
      format.name ||= name;
    }
    if (!this.formats.color?.id) {
      this.formats.color = {
        ...this.formats.color ?? {},
        id: options.cssId || this.id
      };
    }
    if (options.gamutSpace) {
      this.gamutSpace = options.gamutSpace === "self" ? this : _ColorSpace.get(options.gamutSpace);
    } else {
      if (this.isPolar) {
        this.gamutSpace = this.base;
      } else {
        this.gamutSpace = this;
      }
    }
    if (this.gamutSpace.isUnbounded) {
      this.inGamut = (coords2, options2) => {
        return true;
      };
    }
    this.referred = options.referred;
    Object.defineProperty(this, "path", {
      value: getPath(this).reverse(),
      writable: false,
      enumerable: true,
      configurable: true
    });
    hooks_default.run("colorspace-init-end", this);
  }
  inGamut(coords, { epsilon = \u03B5 } = {}) {
    if (!this.equals(this.gamutSpace)) {
      coords = this.to(this.gamutSpace, coords);
      return this.gamutSpace.inGamut(coords, { epsilon });
    }
    let coordMeta = Object.values(this.coords);
    return coords.every((c, i) => {
      let meta = coordMeta[i];
      if (meta.type !== "angle" && meta.range) {
        if (Number.isNaN(c)) {
          return true;
        }
        let [min, max] = meta.range;
        return (min === void 0 || c >= min - epsilon) && (max === void 0 || c <= max + epsilon);
      }
      return true;
    });
  }
  get isUnbounded() {
    return Object.values(this.coords).every((coord) => !("range" in coord));
  }
  get cssId() {
    return this.formats?.color?.id || this.id;
  }
  get isPolar() {
    for (let id in this.coords) {
      if (this.coords[id].type === "angle") {
        return true;
      }
    }
    return false;
  }
  getFormat(format) {
    if (typeof format === "object") {
      format = processFormat(format, this);
      return format;
    }
    let ret;
    if (format === "default") {
      ret = Object.values(this.formats)[0];
    } else {
      ret = this.formats[format];
    }
    if (ret) {
      ret = processFormat(ret, this);
      return ret;
    }
    return null;
  }
  /**
   * Check if this color space is the same as another color space reference.
   * Allows proxying color space objects and comparing color spaces with ids.
   * @param {string | ColorSpace} space ColorSpace object or id to compare to
   * @returns {boolean}
   */
  equals(space) {
    if (!space) {
      return false;
    }
    return this === space || this.id === space || this.id === space.id;
  }
  to(space, coords) {
    if (arguments.length === 1) {
      const color = getColor(space);
      [space, coords] = [color.space, color.coords];
    }
    space = _ColorSpace.get(space);
    if (this.equals(space)) {
      return coords;
    }
    coords = coords.map((c) => Number.isNaN(c) ? 0 : c);
    let myPath = this.path;
    let otherPath = space.path;
    let connectionSpace, connectionSpaceIndex;
    for (let i = 0; i < myPath.length; i++) {
      if (myPath[i].equals(otherPath[i])) {
        connectionSpace = myPath[i];
        connectionSpaceIndex = i;
      } else {
        break;
      }
    }
    if (!connectionSpace) {
      throw new Error(`Cannot convert between color spaces ${this} and ${space}: no connection space was found`);
    }
    for (let i = myPath.length - 1; i > connectionSpaceIndex; i--) {
      coords = myPath[i].toBase(coords);
    }
    for (let i = connectionSpaceIndex + 1; i < otherPath.length; i++) {
      coords = otherPath[i].fromBase(coords);
    }
    return coords;
  }
  from(space, coords) {
    if (arguments.length === 1) {
      const color = getColor(space);
      [space, coords] = [color.space, color.coords];
    }
    space = _ColorSpace.get(space);
    return space.to(this, coords);
  }
  toString() {
    return `${this.name} (${this.id})`;
  }
  getMinCoords() {
    let ret = [];
    for (let id in this.coords) {
      let meta = this.coords[id];
      let range = meta.range || meta.refRange;
      ret.push(range?.min ?? 0);
    }
    return ret;
  }
  static registry = {};
  // Returns array of unique color spaces
  static get all() {
    return [...new Set(Object.values(_ColorSpace.registry))];
  }
  static register(id, space) {
    if (arguments.length === 1) {
      space = arguments[0];
      id = space.id;
    }
    space = this.get(space);
    if (this.registry[id] && this.registry[id] !== space) {
      throw new Error(`Duplicate color space registration: '${id}'`);
    }
    this.registry[id] = space;
    if (arguments.length === 1 && space.aliases) {
      for (let alias of space.aliases) {
        this.register(alias, space);
      }
    }
    return space;
  }
  /**
   * Lookup ColorSpace object by name
   * @param {ColorSpace | string} name
   */
  static get(space, ...alternatives) {
    if (!space || space instanceof _ColorSpace) {
      return space;
    }
    let argType = type(space);
    if (argType === "string") {
      let ret = _ColorSpace.registry[space.toLowerCase()];
      if (!ret) {
        throw new TypeError(`No color space found with id = "${space}"`);
      }
      return ret;
    }
    if (alternatives.length) {
      return _ColorSpace.get(...alternatives);
    }
    throw new TypeError(`${space} is not a valid color space`);
  }
  /**
   * Get metadata about a coordinate of a color space
   *
   * @static
   * @param {Array | string} ref
   * @param {ColorSpace | string} [workingSpace]
   * @return {Object}
   */
  static resolveCoord(ref, workingSpace) {
    let coordType = type(ref);
    let space, coord;
    if (coordType === "string") {
      if (ref.includes(".")) {
        [space, coord] = ref.split(".");
      } else {
        [space, coord] = [, ref];
      }
    } else if (Array.isArray(ref)) {
      [space, coord] = ref;
    } else {
      space = ref.space;
      coord = ref.coordId;
    }
    space = _ColorSpace.get(space);
    if (!space) {
      space = workingSpace;
    }
    if (!space) {
      throw new TypeError(`Cannot resolve coordinate reference ${ref}: No color space specified and relative references are not allowed here`);
    }
    coordType = type(coord);
    if (coordType === "number" || coordType === "string" && coord >= 0) {
      let meta = Object.entries(space.coords)[coord];
      if (meta) {
        return { space, id: meta[0], index: coord, ...meta[1] };
      }
    }
    space = _ColorSpace.get(space);
    let normalizedCoord = coord.toLowerCase();
    let i = 0;
    for (let id in space.coords) {
      let meta = space.coords[id];
      if (id.toLowerCase() === normalizedCoord || meta.name?.toLowerCase() === normalizedCoord) {
        return { space, id, index: i, ...meta };
      }
      i++;
    }
    throw new TypeError(`No "${coord}" coordinate found in ${space.name}. Its coordinates are: ${Object.keys(space.coords).join(", ")}`);
  }
  static DEFAULT_FORMAT = {
    type: "functions",
    name: "color"
  };
};
function getPath(space) {
  let ret = [space];
  for (let s = space; s = s.base; ) {
    ret.push(s);
  }
  return ret;
}
function processFormat(format, { coords } = {}) {
  if (format.coords && !format.coordGrammar) {
    format.type ||= "function";
    format.name ||= "color";
    format.coordGrammar = parseCoordGrammar(format.coords);
    let coordFormats = Object.entries(coords).map(([id, coordMeta], i) => {
      let outputType = format.coordGrammar[i][0];
      let fromRange = coordMeta.range || coordMeta.refRange;
      let toRange = outputType.range, suffix = "";
      if (outputType == "<percentage>") {
        toRange = [0, 100];
        suffix = "%";
      } else if (outputType == "<angle>") {
        suffix = "deg";
      }
      return { fromRange, toRange, suffix };
    });
    format.serializeCoords = (coords2, precision) => {
      return coords2.map((c, i) => {
        let { fromRange, toRange, suffix } = coordFormats[i];
        if (fromRange && toRange) {
          c = mapRange(fromRange, toRange, c);
        }
        c = serializeNumber(c, { precision, unit: suffix });
        return c;
      });
    };
  }
  return format;
}

// node_modules/colorjs.io/src/spaces/xyz-d65.js
var xyz_d65_default = new ColorSpace({
  id: "xyz-d65",
  name: "XYZ D65",
  coords: {
    x: { name: "X" },
    y: { name: "Y" },
    z: { name: "Z" }
  },
  white: "D65",
  formats: {
    color: {
      ids: ["xyz-d65", "xyz"]
    }
  },
  aliases: ["xyz"]
});

// node_modules/colorjs.io/src/rgbspace.js
var RGBColorSpace = class extends ColorSpace {
  /**
   * Creates a new RGB ColorSpace.
   * If coords are not specified, they will use the default RGB coords.
   * Instead of `fromBase()` and `toBase()` functions,
   * you can specify to/from XYZ matrices and have `toBase()` and `fromBase()` automatically generated.
   * @param {*} options - Same options as {@link ColorSpace} plus:
   * @param {number[][]} options.toXYZ_M - Matrix to convert to XYZ
   * @param {number[][]} options.fromXYZ_M - Matrix to convert from XYZ
   */
  constructor(options) {
    if (!options.coords) {
      options.coords = {
        r: {
          range: [0, 1],
          name: "Red"
        },
        g: {
          range: [0, 1],
          name: "Green"
        },
        b: {
          range: [0, 1],
          name: "Blue"
        }
      };
    }
    if (!options.base) {
      options.base = xyz_d65_default;
    }
    if (options.toXYZ_M && options.fromXYZ_M) {
      options.toBase ??= (rgb) => {
        let xyz = multiplyMatrices(options.toXYZ_M, rgb);
        if (this.white !== this.base.white) {
          xyz = adapt(this.white, this.base.white, xyz);
        }
        return xyz;
      };
      options.fromBase ??= (xyz) => {
        xyz = adapt(this.base.white, this.white, xyz);
        return multiplyMatrices(options.fromXYZ_M, xyz);
      };
    }
    options.referred ??= "display";
    super(options);
  }
};

// node_modules/colorjs.io/src/getAll.js
function getAll(color, space) {
  color = getColor(color);
  if (!space || color.space.equals(space)) {
    return color.coords.slice();
  }
  space = ColorSpace.get(space);
  return space.from(color);
}

// node_modules/colorjs.io/src/get.js
function get(color, prop) {
  color = getColor(color);
  let { space, index } = ColorSpace.resolveCoord(prop, color.space);
  let coords = getAll(color, space);
  return coords[index];
}

// node_modules/colorjs.io/src/setAll.js
function setAll(color, space, coords) {
  color = getColor(color);
  space = ColorSpace.get(space);
  color.coords = space.to(color.space, coords);
  return color;
}
setAll.returns = "color";

// node_modules/colorjs.io/src/set.js
function set(color, prop, value) {
  color = getColor(color);
  if (arguments.length === 2 && type(arguments[1]) === "object") {
    let object = arguments[1];
    for (let p2 in object) {
      set(color, p2, object[p2]);
    }
  } else {
    if (typeof value === "function") {
      value = value(get(color, prop));
    }
    let { space, index } = ColorSpace.resolveCoord(prop, color.space);
    let coords = getAll(color, space);
    coords[index] = value;
    setAll(color, space, coords);
  }
  return color;
}
set.returns = "color";

// node_modules/colorjs.io/src/spaces/xyz-d50.js
var xyz_d50_default = new ColorSpace({
  id: "xyz-d50",
  name: "XYZ D50",
  white: "D50",
  base: xyz_d65_default,
  fromBase: (coords) => adapt(xyz_d65_default.white, "D50", coords),
  toBase: (coords) => adapt("D50", xyz_d65_default.white, coords)
});

// node_modules/colorjs.io/src/spaces/lab.js
var \u03B52 = 216 / 24389;
var \u03B53 = 24 / 116;
var \u03BA = 24389 / 27;
var white = WHITES.D50;
var lab_default = new ColorSpace({
  id: "lab",
  name: "Lab",
  coords: {
    l: {
      refRange: [0, 100],
      name: "Lightness"
    },
    a: {
      refRange: [-125, 125]
    },
    b: {
      refRange: [-125, 125]
    }
  },
  // Assuming XYZ is relative to D50, convert to CIE Lab
  // from CIE standard, which now defines these as a rational fraction
  white,
  base: xyz_d50_default,
  // Convert D50-adapted XYX to Lab
  //  CIE 15.3:2004 section 8.2.1.1
  fromBase(XYZ) {
    let xyz = XYZ.map((value, i) => value / white[i]);
    let f2 = xyz.map((value) => value > \u03B52 ? Math.cbrt(value) : (\u03BA * value + 16) / 116);
    return [
      116 * f2[1] - 16,
      // L
      500 * (f2[0] - f2[1]),
      // a
      200 * (f2[1] - f2[2])
      // b
    ];
  },
  // Convert Lab to D50-adapted XYZ
  // Same result as CIE 15.3:2004 Appendix D although the derivation is different
  // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
  toBase(Lab) {
    let f2 = [];
    f2[1] = (Lab[0] + 16) / 116;
    f2[0] = Lab[1] / 500 + f2[1];
    f2[2] = f2[1] - Lab[2] / 200;
    let xyz = [
      f2[0] > \u03B53 ? Math.pow(f2[0], 3) : (116 * f2[0] - 16) / \u03BA,
      Lab[0] > 8 ? Math.pow((Lab[0] + 16) / 116, 3) : Lab[0] / \u03BA,
      f2[2] > \u03B53 ? Math.pow(f2[2], 3) : (116 * f2[2] - 16) / \u03BA
    ];
    return xyz.map((value, i) => value * white[i]);
  },
  formats: {
    "lab": {
      coords: ["<number> | <percentage>", "<number> | <percentage>[-1,1]", "<number> | <percentage>[-1,1]"]
    }
  }
});

// node_modules/colorjs.io/src/angles.js
function constrain(angle) {
  return (angle % 360 + 360) % 360;
}

// node_modules/colorjs.io/src/spaces/lch.js
var lch_default = new ColorSpace({
  id: "lch",
  name: "LCH",
  coords: {
    l: {
      refRange: [0, 100],
      name: "Lightness"
    },
    c: {
      refRange: [0, 150],
      name: "Chroma"
    },
    h: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    }
  },
  base: lab_default,
  fromBase(Lab) {
    let [L, a, b2] = Lab;
    let hue;
    const \u03B56 = 0.02;
    if (Math.abs(a) < \u03B56 && Math.abs(b2) < \u03B56) {
      hue = NaN;
    } else {
      hue = Math.atan2(b2, a) * 180 / Math.PI;
    }
    return [
      L,
      // L is still L
      Math.sqrt(a ** 2 + b2 ** 2),
      // Chroma
      constrain(hue)
      // Hue, in degrees [0 to 360)
    ];
  },
  toBase(LCH) {
    let [Lightness, Chroma, Hue] = LCH;
    if (Chroma < 0) {
      Chroma = 0;
    }
    if (isNaN(Hue)) {
      Hue = 0;
    }
    return [
      Lightness,
      // L is still L
      Chroma * Math.cos(Hue * Math.PI / 180),
      // a
      Chroma * Math.sin(Hue * Math.PI / 180)
      // b
    ];
  },
  formats: {
    "lch": {
      coords: ["<number> | <percentage>", "<number> | <percentage>", "<number> | <angle>"]
    }
  }
});

// node_modules/colorjs.io/src/deltaE/deltaE2000.js
var Gfactor = 25 ** 7;
var \u03C0 = Math.PI;
var r2d = 180 / \u03C0;
var d2r = \u03C0 / 180;
function pow7(x) {
  const x2 = x * x;
  const x7 = x2 * x2 * x2 * x;
  return x7;
}
function deltaE2000_default(color, sample, { kL = 1, kC = 1, kH = 1 } = {}) {
  [color, sample] = getColor([color, sample]);
  let [L1, a1, b1] = lab_default.from(color);
  let C1 = lch_default.from(lab_default, [L1, a1, b1])[1];
  let [L2, a2, b2] = lab_default.from(sample);
  let C2 = lch_default.from(lab_default, [L2, a2, b2])[1];
  if (C1 < 0) {
    C1 = 0;
  }
  if (C2 < 0) {
    C2 = 0;
  }
  let Cbar = (C1 + C2) / 2;
  let C7 = pow7(Cbar);
  let G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Gfactor)));
  let adash1 = (1 + G) * a1;
  let adash2 = (1 + G) * a2;
  let Cdash1 = Math.sqrt(adash1 ** 2 + b1 ** 2);
  let Cdash2 = Math.sqrt(adash2 ** 2 + b2 ** 2);
  let h1 = adash1 === 0 && b1 === 0 ? 0 : Math.atan2(b1, adash1);
  let h2 = adash2 === 0 && b2 === 0 ? 0 : Math.atan2(b2, adash2);
  if (h1 < 0) {
    h1 += 2 * \u03C0;
  }
  if (h2 < 0) {
    h2 += 2 * \u03C0;
  }
  h1 *= r2d;
  h2 *= r2d;
  let \u0394L = L2 - L1;
  let \u0394C = Cdash2 - Cdash1;
  let hdiff = h2 - h1;
  let hsum = h1 + h2;
  let habs = Math.abs(hdiff);
  let \u0394h;
  if (Cdash1 * Cdash2 === 0) {
    \u0394h = 0;
  } else if (habs <= 180) {
    \u0394h = hdiff;
  } else if (hdiff > 180) {
    \u0394h = hdiff - 360;
  } else if (hdiff < -180) {
    \u0394h = hdiff + 360;
  } else {
    defaults_default.warn("the unthinkable has happened");
  }
  let \u0394H = 2 * Math.sqrt(Cdash2 * Cdash1) * Math.sin(\u0394h * d2r / 2);
  let Ldash = (L1 + L2) / 2;
  let Cdash = (Cdash1 + Cdash2) / 2;
  let Cdash7 = pow7(Cdash);
  let hdash;
  if (Cdash1 * Cdash2 === 0) {
    hdash = hsum;
  } else if (habs <= 180) {
    hdash = hsum / 2;
  } else if (hsum < 360) {
    hdash = (hsum + 360) / 2;
  } else {
    hdash = (hsum - 360) / 2;
  }
  let lsq = (Ldash - 50) ** 2;
  let SL = 1 + 0.015 * lsq / Math.sqrt(20 + lsq);
  let SC = 1 + 0.045 * Cdash;
  let T = 1;
  T -= 0.17 * Math.cos((hdash - 30) * d2r);
  T += 0.24 * Math.cos(2 * hdash * d2r);
  T += 0.32 * Math.cos((3 * hdash + 6) * d2r);
  T -= 0.2 * Math.cos((4 * hdash - 63) * d2r);
  let SH = 1 + 0.015 * Cdash * T;
  let \u0394\u03B8 = 30 * Math.exp(-1 * ((hdash - 275) / 25) ** 2);
  let RC = 2 * Math.sqrt(Cdash7 / (Cdash7 + Gfactor));
  let RT = -1 * Math.sin(2 * \u0394\u03B8 * d2r) * RC;
  let dE = (\u0394L / (kL * SL)) ** 2;
  dE += (\u0394C / (kC * SC)) ** 2;
  dE += (\u0394H / (kH * SH)) ** 2;
  dE += RT * (\u0394C / (kC * SC)) * (\u0394H / (kH * SH));
  return Math.sqrt(dE);
}

// node_modules/colorjs.io/src/spaces/oklab.js
var XYZtoLMS_M = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309]
];
var LMStoXYZ_M = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816]
];
var LMStoLab_M = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.42859224204858, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774]
];
var LabtoLMS_M = [
  [1, 0.3963377773761749, 0.2158037573099136],
  [1, -0.1055613458156586, -0.0638541728258133],
  [1, -0.0894841775298119, -1.2914855480194092]
];
var oklab_default = new ColorSpace({
  id: "oklab",
  name: "Oklab",
  coords: {
    l: {
      refRange: [0, 1],
      name: "Lightness"
    },
    a: {
      refRange: [-0.4, 0.4]
    },
    b: {
      refRange: [-0.4, 0.4]
    }
  },
  // Note that XYZ is relative to D65
  white: "D65",
  base: xyz_d65_default,
  fromBase(XYZ) {
    let LMS = multiplyMatrices(XYZtoLMS_M, XYZ);
    let LMSg = LMS.map((val) => Math.cbrt(val));
    return multiplyMatrices(LMStoLab_M, LMSg);
  },
  toBase(OKLab) {
    let LMSg = multiplyMatrices(LabtoLMS_M, OKLab);
    let LMS = LMSg.map((val) => val ** 3);
    return multiplyMatrices(LMStoXYZ_M, LMS);
  },
  formats: {
    "oklab": {
      coords: ["<percentage> | <number>", "<number> | <percentage>[-1,1]", "<number> | <percentage>[-1,1]"]
    }
  }
});

// node_modules/colorjs.io/src/deltaE/deltaEOK.js
function deltaEOK_default(color, sample) {
  [color, sample] = getColor([color, sample]);
  let [L1, a1, b1] = oklab_default.from(color);
  let [L2, a2, b2] = oklab_default.from(sample);
  let \u0394L = L1 - L2;
  let \u0394a = a1 - a2;
  let \u0394b = b1 - b2;
  return Math.sqrt(\u0394L ** 2 + \u0394a ** 2 + \u0394b ** 2);
}

// node_modules/colorjs.io/src/inGamut.js
var \u03B54 = 75e-6;
function inGamut(color, space, { epsilon = \u03B54 } = {}) {
  color = getColor(color);
  if (!space) {
    space = color.space;
  }
  space = ColorSpace.get(space);
  let coords = color.coords;
  if (space !== color.space) {
    coords = space.from(color);
  }
  return space.inGamut(coords, { epsilon });
}

// node_modules/colorjs.io/src/clone.js
function clone(color) {
  return {
    space: color.space,
    coords: color.coords.slice(),
    alpha: color.alpha
  };
}

// node_modules/colorjs.io/src/distance.js
function distance(color1, color2, space = "lab") {
  space = ColorSpace.get(space);
  let coords1 = space.from(color1);
  let coords2 = space.from(color2);
  return Math.sqrt(coords1.reduce((acc, c13, i) => {
    let c23 = coords2[i];
    if (isNaN(c13) || isNaN(c23)) {
      return acc;
    }
    return acc + (c23 - c13) ** 2;
  }, 0));
}

// node_modules/colorjs.io/src/deltaE/deltaE76.js
function deltaE76(color, sample) {
  return distance(color, sample, "lab");
}

// node_modules/colorjs.io/src/deltaE/deltaECMC.js
var \u03C02 = Math.PI;
var d2r2 = \u03C02 / 180;
function deltaECMC_default(color, sample, { l = 2, c = 1 } = {}) {
  [color, sample] = getColor([color, sample]);
  let [L1, a1, b1] = lab_default.from(color);
  let [, C1, H1] = lch_default.from(lab_default, [L1, a1, b1]);
  let [L2, a2, b2] = lab_default.from(sample);
  let C2 = lch_default.from(lab_default, [L2, a2, b2])[1];
  if (C1 < 0) {
    C1 = 0;
  }
  if (C2 < 0) {
    C2 = 0;
  }
  let \u0394L = L1 - L2;
  let \u0394C = C1 - C2;
  let \u0394a = a1 - a2;
  let \u0394b = b1 - b2;
  let H2 = \u0394a ** 2 + \u0394b ** 2 - \u0394C ** 2;
  let SL = 0.511;
  if (L1 >= 16) {
    SL = 0.040975 * L1 / (1 + 0.01765 * L1);
  }
  let SC = 0.0638 * C1 / (1 + 0.0131 * C1) + 0.638;
  let T;
  if (Number.isNaN(H1)) {
    H1 = 0;
  }
  if (H1 >= 164 && H1 <= 345) {
    T = 0.56 + Math.abs(0.2 * Math.cos((H1 + 168) * d2r2));
  } else {
    T = 0.36 + Math.abs(0.4 * Math.cos((H1 + 35) * d2r2));
  }
  let C4 = Math.pow(C1, 4);
  let F = Math.sqrt(C4 / (C4 + 1900));
  let SH = SC * (F * T + 1 - F);
  let dE = (\u0394L / (l * SL)) ** 2;
  dE += (\u0394C / (c * SC)) ** 2;
  dE += H2 / SH ** 2;
  return Math.sqrt(dE);
}

// node_modules/colorjs.io/src/spaces/xyz-abs-d65.js
var Yw = 203;
var xyz_abs_d65_default = new ColorSpace({
  // Absolute CIE XYZ, with a D65 whitepoint,
  // as used in most HDR colorspaces as a starting point.
  // SDR spaces are converted per BT.2048
  // so that diffuse, media white is 203 cd/m²
  id: "xyz-abs-d65",
  cssId: "--xyz-abs-d65",
  name: "Absolute XYZ D65",
  coords: {
    x: {
      refRange: [0, 9504.7],
      name: "Xa"
    },
    y: {
      refRange: [0, 1e4],
      name: "Ya"
    },
    z: {
      refRange: [0, 10888.3],
      name: "Za"
    }
  },
  base: xyz_d65_default,
  fromBase(XYZ) {
    return XYZ.map((v) => Math.max(v * Yw, 0));
  },
  toBase(AbsXYZ) {
    return AbsXYZ.map((v) => Math.max(v / Yw, 0));
  }
});

// node_modules/colorjs.io/src/spaces/jzazbz.js
var b = 1.15;
var g = 0.66;
var n = 2610 / 2 ** 14;
var ninv = 2 ** 14 / 2610;
var c1 = 3424 / 2 ** 12;
var c2 = 2413 / 2 ** 7;
var c3 = 2392 / 2 ** 7;
var p = 1.7 * 2523 / 2 ** 5;
var pinv = 2 ** 5 / (1.7 * 2523);
var d = -0.56;
var d0 = 16295499532821565e-27;
var XYZtoCone_M = [
  [0.41478972, 0.579999, 0.014648],
  [-0.20151, 1.120649, 0.0531008],
  [-0.0166008, 0.2648, 0.6684799]
];
var ConetoXYZ_M = [
  [1.9242264357876067, -1.0047923125953657, 0.037651404030618],
  [0.35031676209499907, 0.7264811939316552, -0.06538442294808501],
  [-0.09098281098284752, -0.3127282905230739, 1.5227665613052603]
];
var ConetoIab_M = [
  [0.5, 0.5, 0],
  [3.524, -4.066708, 0.542708],
  [0.199076, 1.096799, -1.295875]
];
var IabtoCone_M = [
  [1, 0.1386050432715393, 0.05804731615611886],
  [0.9999999999999999, -0.1386050432715393, -0.05804731615611886],
  [0.9999999999999998, -0.09601924202631895, -0.8118918960560388]
];
var jzazbz_default = new ColorSpace({
  id: "jzazbz",
  name: "Jzazbz",
  coords: {
    jz: {
      refRange: [0, 1],
      name: "Jz"
    },
    az: {
      refRange: [-0.5, 0.5]
    },
    bz: {
      refRange: [-0.5, 0.5]
    }
  },
  base: xyz_abs_d65_default,
  fromBase(XYZ) {
    let [Xa, Ya, Za] = XYZ;
    let Xm = b * Xa - (b - 1) * Za;
    let Ym = g * Ya - (g - 1) * Xa;
    let LMS = multiplyMatrices(XYZtoCone_M, [Xm, Ym, Za]);
    let PQLMS = LMS.map(function(val) {
      let num = c1 + c2 * (val / 1e4) ** n;
      let denom = 1 + c3 * (val / 1e4) ** n;
      return (num / denom) ** p;
    });
    let [Iz, az, bz] = multiplyMatrices(ConetoIab_M, PQLMS);
    let Jz = (1 + d) * Iz / (1 + d * Iz) - d0;
    return [Jz, az, bz];
  },
  toBase(Jzazbz) {
    let [Jz, az, bz] = Jzazbz;
    let Iz = (Jz + d0) / (1 + d - d * (Jz + d0));
    let PQLMS = multiplyMatrices(IabtoCone_M, [Iz, az, bz]);
    let LMS = PQLMS.map(function(val) {
      let num = c1 - val ** pinv;
      let denom = c3 * val ** pinv - c2;
      let x = 1e4 * (num / denom) ** ninv;
      return x;
    });
    let [Xm, Ym, Za] = multiplyMatrices(ConetoXYZ_M, LMS);
    let Xa = (Xm + (b - 1) * Za) / b;
    let Ya = (Ym + (g - 1) * Xa) / g;
    return [Xa, Ya, Za];
  },
  formats: {
    // https://drafts.csswg.org/css-color-hdr/#Jzazbz
    "color": {
      coords: ["<number> | <percentage>", "<number> | <percentage>[-1,1]", "<number> | <percentage>[-1,1]"]
    }
  }
});

// node_modules/colorjs.io/src/spaces/jzczhz.js
var jzczhz_default = new ColorSpace({
  id: "jzczhz",
  name: "JzCzHz",
  coords: {
    jz: {
      refRange: [0, 1],
      name: "Jz"
    },
    cz: {
      refRange: [0, 1],
      name: "Chroma"
    },
    hz: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    }
  },
  base: jzazbz_default,
  fromBase(jzazbz) {
    let [Jz, az, bz] = jzazbz;
    let hue;
    const \u03B56 = 2e-4;
    if (Math.abs(az) < \u03B56 && Math.abs(bz) < \u03B56) {
      hue = NaN;
    } else {
      hue = Math.atan2(bz, az) * 180 / Math.PI;
    }
    return [
      Jz,
      // Jz is still Jz
      Math.sqrt(az ** 2 + bz ** 2),
      // Chroma
      constrain(hue)
      // Hue, in degrees [0 to 360)
    ];
  },
  toBase(jzczhz) {
    return [
      jzczhz[0],
      // Jz is still Jz
      jzczhz[1] * Math.cos(jzczhz[2] * Math.PI / 180),
      // az
      jzczhz[1] * Math.sin(jzczhz[2] * Math.PI / 180)
      // bz
    ];
  }
});

// node_modules/colorjs.io/src/deltaE/deltaEJz.js
function deltaEJz_default(color, sample) {
  [color, sample] = getColor([color, sample]);
  let [Jz1, Cz1, Hz1] = jzczhz_default.from(color);
  let [Jz2, Cz2, Hz2] = jzczhz_default.from(sample);
  let \u0394J = Jz1 - Jz2;
  let \u0394C = Cz1 - Cz2;
  if (Number.isNaN(Hz1) && Number.isNaN(Hz2)) {
    Hz1 = 0;
    Hz2 = 0;
  } else if (Number.isNaN(Hz1)) {
    Hz1 = Hz2;
  } else if (Number.isNaN(Hz2)) {
    Hz2 = Hz1;
  }
  let \u0394h = Hz1 - Hz2;
  let \u0394H = 2 * Math.sqrt(Cz1 * Cz2) * Math.sin(\u0394h / 2 * (Math.PI / 180));
  return Math.sqrt(\u0394J ** 2 + \u0394C ** 2 + \u0394H ** 2);
}

// node_modules/colorjs.io/src/spaces/ictcp.js
var c12 = 3424 / 4096;
var c22 = 2413 / 128;
var c32 = 2392 / 128;
var m1 = 2610 / 16384;
var m2 = 2523 / 32;
var im1 = 16384 / 2610;
var im2 = 32 / 2523;
var XYZtoLMS_M2 = [
  [0.3592832590121217, 0.6976051147779502, -0.035891593232029],
  [-0.1920808463704993, 1.100476797037432, 0.0753748658519118],
  [0.0070797844607479, 0.0748396662186362, 0.8433265453898765]
];
var LMStoIPT_M = [
  [2048 / 4096, 2048 / 4096, 0],
  [6610 / 4096, -13613 / 4096, 7003 / 4096],
  [17933 / 4096, -17390 / 4096, -543 / 4096]
];
var IPTtoLMS_M = [
  [0.9999999999999998, 0.0086090370379328, 0.111029625003026],
  [0.9999999999999998, -0.0086090370379328, -0.1110296250030259],
  [0.9999999999999998, 0.5600313357106791, -0.3206271749873188]
];
var LMStoXYZ_M2 = [
  [2.0701522183894223, -1.3263473389671563, 0.2066510476294053],
  [0.3647385209748072, 0.6805660249472273, -0.0453045459220347],
  [-0.0497472075358123, -0.0492609666966131, 1.1880659249923042]
];
var ictcp_default = new ColorSpace({
  id: "ictcp",
  name: "ICTCP",
  // From BT.2100-2 page 7:
  // During production, signal values are expected to exceed the
  // range E′ = [0.0 : 1.0]. This provides processing headroom and avoids
  // signal degradation during cascaded processing. Such values of E′,
  // below 0.0 or exceeding 1.0, should not be clipped during production
  // and exchange.
  // Values below 0.0 should not be clipped in reference displays (even
  // though they represent “negative” light) to allow the black level of
  // the signal (LB) to be properly set using test signals known as “PLUGE”
  coords: {
    i: {
      refRange: [0, 1],
      // Constant luminance,
      name: "I"
    },
    ct: {
      refRange: [-0.5, 0.5],
      // Full BT.2020 gamut in range [-0.5, 0.5]
      name: "CT"
    },
    cp: {
      refRange: [-0.5, 0.5],
      name: "CP"
    }
  },
  base: xyz_abs_d65_default,
  fromBase(XYZ) {
    let LMS = multiplyMatrices(XYZtoLMS_M2, XYZ);
    return LMStoICtCp(LMS);
  },
  toBase(ICtCp) {
    let LMS = ICtCptoLMS(ICtCp);
    return multiplyMatrices(LMStoXYZ_M2, LMS);
  }
});
function LMStoICtCp(LMS) {
  let PQLMS = LMS.map(function(val) {
    let num = c12 + c22 * (val / 1e4) ** m1;
    let denom = 1 + c32 * (val / 1e4) ** m1;
    return (num / denom) ** m2;
  });
  return multiplyMatrices(LMStoIPT_M, PQLMS);
}
function ICtCptoLMS(ICtCp) {
  let PQLMS = multiplyMatrices(IPTtoLMS_M, ICtCp);
  let LMS = PQLMS.map(function(val) {
    let num = Math.max(val ** im2 - c12, 0);
    let denom = c22 - c32 * val ** im2;
    return 1e4 * (num / denom) ** im1;
  });
  return LMS;
}

// node_modules/colorjs.io/src/deltaE/deltaEITP.js
function deltaEITP_default(color, sample) {
  [color, sample] = getColor([color, sample]);
  let [I1, T1, P1] = ictcp_default.from(color);
  let [I2, T2, P2] = ictcp_default.from(sample);
  return 720 * Math.sqrt((I1 - I2) ** 2 + 0.25 * (T1 - T2) ** 2 + (P1 - P2) ** 2);
}

// node_modules/colorjs.io/src/spaces/cam16.js
var white2 = WHITES.D65;
var adaptedCoef = 0.42;
var adaptedCoefInv = 1 / adaptedCoef;
var tau = 2 * Math.PI;
var cat16 = [
  [0.401288, 0.650173, -0.051461],
  [-0.250268, 1.204414, 0.045854],
  [-2079e-6, 0.048952, 0.953127]
];
var cat16Inv = [
  [1.8620678550872327, -1.0112546305316843, 0.14918677544445175],
  [0.38752654323613717, 0.6214474419314753, -0.008973985167612518],
  [-0.015841498849333856, -0.03412293802851557, 1.0499644368778496]
];
var m12 = [
  [460, 451, 288],
  [460, -891, -261],
  [460, -220, -6300]
];
var surroundMap = {
  dark: [0.8, 0.525, 0.8],
  dim: [0.9, 0.59, 0.9],
  average: [1, 0.69, 1]
};
var hueQuadMap = {
  // Red, Yellow, Green, Blue, Red
  h: [20.14, 90, 164.25, 237.53, 380.14],
  e: [0.8, 0.7, 1, 1.2, 0.8],
  H: [0, 100, 200, 300, 400]
};
var rad2deg = 180 / Math.PI;
var deg2rad = Math.PI / 180;
function adapt2(coords, fl) {
  const temp = coords.map((c) => {
    const x = spow(fl * Math.abs(c) * 0.01, adaptedCoef);
    return 400 * copySign(x, c) / (x + 27.13);
  });
  return temp;
}
function unadapt(adapted, fl) {
  const constant = 100 / fl * 27.13 ** adaptedCoefInv;
  return adapted.map((c) => {
    const cabs = Math.abs(c);
    return copySign(constant * spow(cabs / (400 - cabs), adaptedCoefInv), c);
  });
}
function hueQuadrature(h) {
  let hp = constrain(h);
  if (hp <= hueQuadMap.h[0]) {
    hp += 360;
  }
  const i = bisectLeft(hueQuadMap.h, hp) - 1;
  const [hi, hii] = hueQuadMap.h.slice(i, i + 2);
  const [ei, eii] = hueQuadMap.e.slice(i, i + 2);
  const Hi = hueQuadMap.H[i];
  const t = (hp - hi) / ei;
  return Hi + 100 * t / (t + (hii - hp) / eii);
}
function invHueQuadrature(H) {
  let Hp = (H % 400 + 400) % 400;
  const i = Math.floor(0.01 * Hp);
  Hp = Hp % 100;
  const [hi, hii] = hueQuadMap.h.slice(i, i + 2);
  const [ei, eii] = hueQuadMap.e.slice(i, i + 2);
  return constrain(
    (Hp * (eii * hi - ei * hii) - 100 * hi * eii) / (Hp * (eii - ei) - 100 * eii)
  );
}
function environment(refWhite, adaptingLuminance, backgroundLuminance2, surround, discounting) {
  const env = {};
  env.discounting = discounting;
  env.refWhite = refWhite;
  env.surround = surround;
  const xyzW = refWhite.map((c) => {
    return c * 100;
  });
  env.la = adaptingLuminance;
  env.yb = backgroundLuminance2;
  const yw = xyzW[1];
  const rgbW = multiplyMatrices(cat16, xyzW);
  surround = surroundMap[env.surround];
  const f2 = surround[0];
  env.c = surround[1];
  env.nc = surround[2];
  const k = 1 / (5 * env.la + 1);
  const k4 = k ** 4;
  env.fl = k4 * env.la + 0.1 * (1 - k4) * (1 - k4) * Math.cbrt(5 * env.la);
  env.flRoot = env.fl ** 0.25;
  env.n = env.yb / yw;
  env.z = 1.48 + Math.sqrt(env.n);
  env.nbb = 0.725 * env.n ** -0.2;
  env.ncb = env.nbb;
  const d2 = discounting ? 1 : Math.max(
    Math.min(f2 * (1 - 1 / 3.6 * Math.exp((-env.la - 42) / 92)), 1),
    0
  );
  env.dRgb = rgbW.map((c) => {
    return interpolate(1, yw / c, d2);
  });
  env.dRgbInv = env.dRgb.map((c) => {
    return 1 / c;
  });
  const rgbCW = rgbW.map((c, i) => {
    return c * env.dRgb[i];
  });
  const rgbAW = adapt2(rgbCW, env.fl);
  env.aW = env.nbb * (2 * rgbAW[0] + rgbAW[1] + 0.05 * rgbAW[2]);
  return env;
}
var viewingConditions = environment(
  white2,
  64 / Math.PI * 0.2,
  20,
  "average",
  false
);
function fromCam16(cam16, env) {
  if (!(cam16.J !== void 0 ^ cam16.Q !== void 0)) {
    throw new Error("Conversion requires one and only one: 'J' or 'Q'");
  }
  if (!(cam16.C !== void 0 ^ cam16.M !== void 0 ^ cam16.s !== void 0)) {
    throw new Error("Conversion requires one and only one: 'C', 'M' or 's'");
  }
  if (!(cam16.h !== void 0 ^ cam16.H !== void 0)) {
    throw new Error("Conversion requires one and only one: 'h' or 'H'");
  }
  if (cam16.J === 0 || cam16.Q === 0) {
    return [0, 0, 0];
  }
  let hRad = 0;
  if (cam16.h !== void 0) {
    hRad = constrain(cam16.h) * deg2rad;
  } else {
    hRad = invHueQuadrature(cam16.H) * deg2rad;
  }
  const cosh = Math.cos(hRad);
  const sinh = Math.sin(hRad);
  let Jroot = 0;
  if (cam16.J !== void 0) {
    Jroot = spow(cam16.J, 1 / 2) * 0.1;
  } else if (cam16.Q !== void 0) {
    Jroot = 0.25 * env.c * cam16.Q / ((env.aW + 4) * env.flRoot);
  }
  let alpha = 0;
  if (cam16.C !== void 0) {
    alpha = cam16.C / Jroot;
  } else if (cam16.M !== void 0) {
    alpha = cam16.M / env.flRoot / Jroot;
  } else if (cam16.s !== void 0) {
    alpha = 4e-4 * cam16.s ** 2 * (env.aW + 4) / env.c;
  }
  const t = spow(
    alpha * Math.pow(1.64 - Math.pow(0.29, env.n), -0.73),
    10 / 9
  );
  const et = 0.25 * (Math.cos(hRad + 2) + 3.8);
  const A = env.aW * spow(Jroot, 2 / env.c / env.z);
  const p1 = 5e4 / 13 * env.nc * env.ncb * et;
  const p2 = A / env.nbb;
  const r = 23 * (p2 + 0.305) * zdiv(t, 23 * p1 + t * (11 * cosh + 108 * sinh));
  const a = r * cosh;
  const b2 = r * sinh;
  const rgb_c = unadapt(
    multiplyMatrices(m12, [p2, a, b2]).map((c) => {
      return c * 1 / 1403;
    }),
    env.fl
  );
  return multiplyMatrices(
    cat16Inv,
    rgb_c.map((c, i) => {
      return c * env.dRgbInv[i];
    })
  ).map((c) => {
    return c / 100;
  });
}
function toCam16(xyzd65, env) {
  const xyz100 = xyzd65.map((c) => {
    return c * 100;
  });
  const rgbA = adapt2(
    multiplyMatrices(cat16, xyz100).map((c, i) => {
      return c * env.dRgb[i];
    }),
    env.fl
  );
  const a = rgbA[0] + (-12 * rgbA[1] + rgbA[2]) / 11;
  const b2 = (rgbA[0] + rgbA[1] - 2 * rgbA[2]) / 9;
  const hRad = (Math.atan2(b2, a) % tau + tau) % tau;
  const et = 0.25 * (Math.cos(hRad + 2) + 3.8);
  const t = 5e4 / 13 * env.nc * env.ncb * zdiv(
    et * Math.sqrt(a ** 2 + b2 ** 2),
    rgbA[0] + rgbA[1] + 1.05 * rgbA[2] + 0.305
  );
  const alpha = spow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, env.n), 0.73);
  const A = env.nbb * (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]);
  const Jroot = spow(A / env.aW, 0.5 * env.c * env.z);
  const J = 100 * spow(Jroot, 2);
  const Q = 4 / env.c * Jroot * (env.aW + 4) * env.flRoot;
  const C = alpha * Jroot;
  const M = C * env.flRoot;
  const h = constrain(hRad * rad2deg);
  const H = hueQuadrature(h);
  const s = 50 * spow(env.c * alpha / (env.aW + 4), 1 / 2);
  return { J, C, h, s, Q, M, H };
}
var cam16_default = new ColorSpace({
  id: "cam16-jmh",
  cssId: "--cam16-jmh",
  name: "CAM16-JMh",
  coords: {
    j: {
      refRange: [0, 100],
      name: "J"
    },
    m: {
      refRange: [0, 105],
      name: "Colorfulness"
    },
    h: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    }
  },
  base: xyz_d65_default,
  fromBase(xyz) {
    const cam16 = toCam16(xyz, viewingConditions);
    return [cam16.J, cam16.M, cam16.h];
  },
  toBase(cam16) {
    return fromCam16(
      { J: cam16[0], M: cam16[1], h: cam16[2] },
      viewingConditions
    );
  }
});

// node_modules/colorjs.io/src/spaces/hct.js
var white3 = WHITES.D65;
var \u03B55 = 216 / 24389;
var \u03BA2 = 24389 / 27;
function toLstar(y) {
  const fy = y > \u03B55 ? Math.cbrt(y) : (\u03BA2 * y + 16) / 116;
  return 116 * fy - 16;
}
function fromLstar(lstar) {
  return lstar > 8 ? Math.pow((lstar + 16) / 116, 3) : lstar / \u03BA2;
}
function fromHct(coords, env) {
  let [h, c, t] = coords;
  let xyz = [];
  let j = 0;
  if (t === 0) {
    return [0, 0, 0];
  }
  let y = fromLstar(t);
  if (t > 0) {
    j = 0.00379058511492914 * t ** 2 + 0.608983189401032 * t + 0.9155088574762233;
  } else {
    j = 9514440756550361e-21 * t ** 2 + 0.08693057439788597 * t - 21.928975842194614;
  }
  const threshold = 2e-12;
  const max_attempts = 15;
  let attempt = 0;
  let last2 = Infinity;
  let best = j;
  while (attempt <= max_attempts) {
    xyz = fromCam16({ J: j, C: c, h }, env);
    const delta = Math.abs(xyz[1] - y);
    if (delta < last2) {
      if (delta <= threshold) {
        return xyz;
      }
      best = j;
      last2 = delta;
    }
    j = j - (xyz[1] - y) * j / (2 * xyz[1]);
    attempt += 1;
  }
  return fromCam16({ J: j, C: c, h }, env);
}
function toHct(xyz, env) {
  const t = toLstar(xyz[1]);
  if (t === 0) {
    return [0, 0, 0];
  }
  const cam16 = toCam16(xyz, viewingConditions2);
  return [constrain(cam16.h), cam16.C, t];
}
var viewingConditions2 = environment(
  white3,
  200 / Math.PI * fromLstar(50),
  fromLstar(50) * 100,
  "average",
  false
);
var hct_default = new ColorSpace({
  id: "hct",
  name: "HCT",
  coords: {
    h: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    },
    c: {
      refRange: [0, 145],
      name: "Colorfulness"
    },
    t: {
      refRange: [0, 100],
      name: "Tone"
    }
  },
  base: xyz_d65_default,
  fromBase(xyz) {
    return toHct(xyz, viewingConditions2);
  },
  toBase(hct) {
    return fromHct(hct, viewingConditions2);
  },
  formats: {
    color: {
      id: "--hct",
      coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"]
    }
  }
});

// node_modules/colorjs.io/src/deltaE/deltaEHCT.js
var rad2deg2 = 180 / Math.PI;
var deg2rad2 = Math.PI / 180;
var ucsCoeff = [1, 7e-3, 0.0228];
function convertUcsAb(coords) {
  if (coords[1] < 0) {
    coords = hct_default.fromBase(hct_default.toBase(coords));
  }
  const M = Math.log(Math.max(1 + ucsCoeff[2] * coords[1] * viewingConditions2.flRoot, 1)) / ucsCoeff[2];
  const hrad = coords[0] * deg2rad2;
  const a = M * Math.cos(hrad);
  const b2 = M * Math.sin(hrad);
  return [coords[2], a, b2];
}
function deltaEHCT_default(color, sample) {
  [color, sample] = getColor([color, sample]);
  let [t1, a1, b1] = convertUcsAb(hct_default.from(color));
  let [t2, a2, b2] = convertUcsAb(hct_default.from(sample));
  return Math.sqrt((t1 - t2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// node_modules/colorjs.io/src/deltaE/index.js
var deltaE_default = {
  deltaE76,
  deltaECMC: deltaECMC_default,
  deltaE2000: deltaE2000_default,
  deltaEJz: deltaEJz_default,
  deltaEITP: deltaEITP_default,
  deltaEOK: deltaEOK_default,
  deltaEHCT: deltaEHCT_default
};

// node_modules/colorjs.io/src/toGamut.js
function calcEpsilon(jnd) {
  const order = !jnd ? 0 : Math.floor(Math.log10(Math.abs(jnd)));
  return Math.max(parseFloat(`1e${order - 2}`), 1e-6);
}
var GMAPPRESET = {
  "hct": {
    method: "hct.c",
    jnd: 2,
    deltaEMethod: "hct",
    blackWhiteClamp: {}
  },
  "hct-tonal": {
    method: "hct.c",
    jnd: 0,
    deltaEMethod: "hct",
    blackWhiteClamp: { channel: "hct.t", min: 0, max: 100 }
  }
};
function toGamut(color, {
  method = defaults_default.gamut_mapping,
  space = void 0,
  deltaEMethod = "",
  jnd = 2,
  blackWhiteClamp = {}
} = {}) {
  color = getColor(color);
  if (isString(arguments[1])) {
    space = arguments[1];
  } else if (!space) {
    space = color.space;
  }
  space = ColorSpace.get(space);
  if (inGamut(color, space, { epsilon: 0 })) {
    return color;
  }
  let spaceColor;
  if (method === "css") {
    spaceColor = toGamutCSS(color, { space });
  } else {
    if (method !== "clip" && !inGamut(color, space)) {
      if (Object.prototype.hasOwnProperty.call(GMAPPRESET, method)) {
        ({ method, jnd, deltaEMethod, blackWhiteClamp } = GMAPPRESET[method]);
      }
      let de = deltaE2000_default;
      if (deltaEMethod !== "") {
        for (let m in deltaE_default) {
          if ("deltae" + deltaEMethod.toLowerCase() === m.toLowerCase()) {
            de = deltaE_default[m];
            break;
          }
        }
      }
      let clipped = toGamut(to(color, space), { method: "clip", space });
      if (de(color, clipped) > jnd) {
        if (Object.keys(blackWhiteClamp).length === 3) {
          let channelMeta = ColorSpace.resolveCoord(blackWhiteClamp.channel);
          let channel = get(to(color, channelMeta.space), channelMeta.id);
          if (isNone(channel)) {
            channel = 0;
          }
          if (channel >= blackWhiteClamp.max) {
            return to({ space: "xyz-d65", coords: WHITES["D65"] }, color.space);
          } else if (channel <= blackWhiteClamp.min) {
            return to({ space: "xyz-d65", coords: [0, 0, 0] }, color.space);
          }
        }
        let coordMeta = ColorSpace.resolveCoord(method);
        let mapSpace = coordMeta.space;
        let coordId = coordMeta.id;
        let mappedColor = to(color, mapSpace);
        mappedColor.coords.forEach((c, i) => {
          if (isNone(c)) {
            mappedColor.coords[i] = 0;
          }
        });
        let bounds = coordMeta.range || coordMeta.refRange;
        let min = bounds[0];
        let \u03B56 = calcEpsilon(jnd);
        let low = min;
        let high = get(mappedColor, coordId);
        while (high - low > \u03B56) {
          let clipped2 = clone(mappedColor);
          clipped2 = toGamut(clipped2, { space, method: "clip" });
          let deltaE2 = de(mappedColor, clipped2);
          if (deltaE2 - jnd < \u03B56) {
            low = get(mappedColor, coordId);
          } else {
            high = get(mappedColor, coordId);
          }
          set(mappedColor, coordId, (low + high) / 2);
        }
        spaceColor = to(mappedColor, space);
      } else {
        spaceColor = clipped;
      }
    } else {
      spaceColor = to(color, space);
    }
    if (method === "clip" || !inGamut(spaceColor, space, { epsilon: 0 })) {
      let bounds = Object.values(space.coords).map((c) => c.range || []);
      spaceColor.coords = spaceColor.coords.map((c, i) => {
        let [min, max] = bounds[i];
        if (min !== void 0) {
          c = Math.max(min, c);
        }
        if (max !== void 0) {
          c = Math.min(c, max);
        }
        return c;
      });
    }
  }
  if (space !== color.space) {
    spaceColor = to(spaceColor, color.space);
  }
  color.coords = spaceColor.coords;
  return color;
}
toGamut.returns = "color";
var COLORS = {
  WHITE: { space: oklab_default, coords: [1, 0, 0] },
  BLACK: { space: oklab_default, coords: [0, 0, 0] }
};
function toGamutCSS(origin, { space } = {}) {
  const JND = 0.02;
  const \u03B56 = 1e-4;
  origin = getColor(origin);
  if (!space) {
    space = origin.space;
  }
  space = ColorSpace.get(space);
  const oklchSpace = ColorSpace.get("oklch");
  if (space.isUnbounded) {
    return to(origin, space);
  }
  const origin_OKLCH = to(origin, oklchSpace);
  let L = origin_OKLCH.coords[0];
  if (L >= 1) {
    const white4 = to(COLORS.WHITE, space);
    white4.alpha = origin.alpha;
    return to(white4, space);
  }
  if (L <= 0) {
    const black = to(COLORS.BLACK, space);
    black.alpha = origin.alpha;
    return to(black, space);
  }
  if (inGamut(origin_OKLCH, space, { epsilon: 0 })) {
    return to(origin_OKLCH, space);
  }
  function clip(_color) {
    const destColor = to(_color, space);
    const spaceCoords = Object.values(space.coords);
    destColor.coords = destColor.coords.map((coord, index) => {
      if ("range" in spaceCoords[index]) {
        const [min2, max2] = spaceCoords[index].range;
        return clamp(min2, coord, max2);
      }
      return coord;
    });
    return destColor;
  }
  let min = 0;
  let max = origin_OKLCH.coords[1];
  let min_inGamut = true;
  let current = clone(origin_OKLCH);
  let clipped = clip(current);
  let E = deltaEOK_default(clipped, current);
  if (E < JND) {
    return clipped;
  }
  while (max - min > \u03B56) {
    const chroma = (min + max) / 2;
    current.coords[1] = chroma;
    if (min_inGamut && inGamut(current, space, { epsilon: 0 })) {
      min = chroma;
    } else {
      clipped = clip(current);
      E = deltaEOK_default(clipped, current);
      if (E < JND) {
        if (JND - E < \u03B56) {
          break;
        } else {
          min_inGamut = false;
          min = chroma;
        }
      } else {
        max = chroma;
      }
    }
  }
  return clipped;
}

// node_modules/colorjs.io/src/to.js
function to(color, space, { inGamut: inGamut2 } = {}) {
  color = getColor(color);
  space = ColorSpace.get(space);
  let coords = space.from(color);
  let ret = { space, coords, alpha: color.alpha };
  if (inGamut2) {
    ret = toGamut(ret, inGamut2 === true ? void 0 : inGamut2);
  }
  return ret;
}
to.returns = "color";

// node_modules/colorjs.io/src/serialize.js
function serialize(color, {
  precision = defaults_default.precision,
  format = "default",
  inGamut: inGamut2 = true,
  ...customOptions
} = {}) {
  let ret;
  color = getColor(color);
  let formatId = format;
  format = color.space.getFormat(format) ?? color.space.getFormat("default") ?? ColorSpace.DEFAULT_FORMAT;
  let coords = color.coords.slice();
  inGamut2 ||= format.toGamut;
  if (inGamut2 && !inGamut(color)) {
    coords = toGamut(clone(color), inGamut2 === true ? void 0 : inGamut2).coords;
  }
  if (format.type === "custom") {
    customOptions.precision = precision;
    if (format.serialize) {
      ret = format.serialize(coords, color.alpha, customOptions);
    } else {
      throw new TypeError(`format ${formatId} can only be used to parse colors, not for serialization`);
    }
  } else {
    let name = format.name || "color";
    if (format.serializeCoords) {
      coords = format.serializeCoords(coords, precision);
    } else {
      if (precision !== null) {
        coords = coords.map((c) => {
          return serializeNumber(c, { precision });
        });
      }
    }
    let args = [...coords];
    if (name === "color") {
      let cssId = format.id || format.ids?.[0] || color.space.id;
      args.unshift(cssId);
    }
    let alpha = color.alpha;
    if (precision !== null) {
      alpha = serializeNumber(alpha, { precision });
    }
    let strAlpha = color.alpha >= 1 || format.noAlpha ? "" : `${format.commas ? "," : " /"} ${alpha}`;
    ret = `${name}(${args.join(format.commas ? ", " : " ")}${strAlpha})`;
  }
  return ret;
}

// node_modules/colorjs.io/src/spaces/rec2020-linear.js
var toXYZ_M = [
  [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0, 0.028072693049087428, 1.060985057710791]
];
var fromXYZ_M = [
  [1.716651187971268, -0.355670783776392, -0.25336628137366],
  [-0.666684351832489, 1.616481236634939, 0.0157685458139111],
  [0.017639857445311, -0.042770613257809, 0.942103121235474]
];
var rec2020_linear_default = new RGBColorSpace({
  id: "rec2020-linear",
  cssId: "--rec2020-linear",
  name: "Linear REC.2020",
  white: "D65",
  toXYZ_M,
  fromXYZ_M
});

// node_modules/colorjs.io/src/spaces/rec2020.js
var \u03B1 = 1.09929682680944;
var \u03B2 = 0.018053968510807;
var rec2020_default = new RGBColorSpace({
  id: "rec2020",
  name: "REC.2020",
  base: rec2020_linear_default,
  // Non-linear transfer function from Rec. ITU-R BT.2020-2 table 4
  toBase(RGB) {
    return RGB.map(function(val) {
      if (val < \u03B2 * 4.5) {
        return val / 4.5;
      }
      return Math.pow((val + \u03B1 - 1) / \u03B1, 1 / 0.45);
    });
  },
  fromBase(RGB) {
    return RGB.map(function(val) {
      if (val >= \u03B2) {
        return \u03B1 * Math.pow(val, 0.45) - (\u03B1 - 1);
      }
      return 4.5 * val;
    });
  }
});

// node_modules/colorjs.io/src/spaces/p3-linear.js
var toXYZ_M2 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976]
];
var fromXYZ_M2 = [
  [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
  [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
  [0.03584583024378447, -0.07617238926804182, 0.9568845240076872]
];
var p3_linear_default = new RGBColorSpace({
  id: "p3-linear",
  cssId: "--display-p3-linear",
  name: "Linear P3",
  white: "D65",
  toXYZ_M: toXYZ_M2,
  fromXYZ_M: fromXYZ_M2
});

// node_modules/colorjs.io/src/spaces/srgb-linear.js
var toXYZ_M3 = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607]
];
var fromXYZ_M3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786]
];
var srgb_linear_default = new RGBColorSpace({
  id: "srgb-linear",
  name: "Linear sRGB",
  white: "D65",
  toXYZ_M: toXYZ_M3,
  fromXYZ_M: fromXYZ_M3
});

// node_modules/colorjs.io/src/keywords.js
var keywords_default = {
  "aliceblue": [240 / 255, 248 / 255, 1],
  "antiquewhite": [250 / 255, 235 / 255, 215 / 255],
  "aqua": [0, 1, 1],
  "aquamarine": [127 / 255, 1, 212 / 255],
  "azure": [240 / 255, 1, 1],
  "beige": [245 / 255, 245 / 255, 220 / 255],
  "bisque": [1, 228 / 255, 196 / 255],
  "black": [0, 0, 0],
  "blanchedalmond": [1, 235 / 255, 205 / 255],
  "blue": [0, 0, 1],
  "blueviolet": [138 / 255, 43 / 255, 226 / 255],
  "brown": [165 / 255, 42 / 255, 42 / 255],
  "burlywood": [222 / 255, 184 / 255, 135 / 255],
  "cadetblue": [95 / 255, 158 / 255, 160 / 255],
  "chartreuse": [127 / 255, 1, 0],
  "chocolate": [210 / 255, 105 / 255, 30 / 255],
  "coral": [1, 127 / 255, 80 / 255],
  "cornflowerblue": [100 / 255, 149 / 255, 237 / 255],
  "cornsilk": [1, 248 / 255, 220 / 255],
  "crimson": [220 / 255, 20 / 255, 60 / 255],
  "cyan": [0, 1, 1],
  "darkblue": [0, 0, 139 / 255],
  "darkcyan": [0, 139 / 255, 139 / 255],
  "darkgoldenrod": [184 / 255, 134 / 255, 11 / 255],
  "darkgray": [169 / 255, 169 / 255, 169 / 255],
  "darkgreen": [0, 100 / 255, 0],
  "darkgrey": [169 / 255, 169 / 255, 169 / 255],
  "darkkhaki": [189 / 255, 183 / 255, 107 / 255],
  "darkmagenta": [139 / 255, 0, 139 / 255],
  "darkolivegreen": [85 / 255, 107 / 255, 47 / 255],
  "darkorange": [1, 140 / 255, 0],
  "darkorchid": [153 / 255, 50 / 255, 204 / 255],
  "darkred": [139 / 255, 0, 0],
  "darksalmon": [233 / 255, 150 / 255, 122 / 255],
  "darkseagreen": [143 / 255, 188 / 255, 143 / 255],
  "darkslateblue": [72 / 255, 61 / 255, 139 / 255],
  "darkslategray": [47 / 255, 79 / 255, 79 / 255],
  "darkslategrey": [47 / 255, 79 / 255, 79 / 255],
  "darkturquoise": [0, 206 / 255, 209 / 255],
  "darkviolet": [148 / 255, 0, 211 / 255],
  "deeppink": [1, 20 / 255, 147 / 255],
  "deepskyblue": [0, 191 / 255, 1],
  "dimgray": [105 / 255, 105 / 255, 105 / 255],
  "dimgrey": [105 / 255, 105 / 255, 105 / 255],
  "dodgerblue": [30 / 255, 144 / 255, 1],
  "firebrick": [178 / 255, 34 / 255, 34 / 255],
  "floralwhite": [1, 250 / 255, 240 / 255],
  "forestgreen": [34 / 255, 139 / 255, 34 / 255],
  "fuchsia": [1, 0, 1],
  "gainsboro": [220 / 255, 220 / 255, 220 / 255],
  "ghostwhite": [248 / 255, 248 / 255, 1],
  "gold": [1, 215 / 255, 0],
  "goldenrod": [218 / 255, 165 / 255, 32 / 255],
  "gray": [128 / 255, 128 / 255, 128 / 255],
  "green": [0, 128 / 255, 0],
  "greenyellow": [173 / 255, 1, 47 / 255],
  "grey": [128 / 255, 128 / 255, 128 / 255],
  "honeydew": [240 / 255, 1, 240 / 255],
  "hotpink": [1, 105 / 255, 180 / 255],
  "indianred": [205 / 255, 92 / 255, 92 / 255],
  "indigo": [75 / 255, 0, 130 / 255],
  "ivory": [1, 1, 240 / 255],
  "khaki": [240 / 255, 230 / 255, 140 / 255],
  "lavender": [230 / 255, 230 / 255, 250 / 255],
  "lavenderblush": [1, 240 / 255, 245 / 255],
  "lawngreen": [124 / 255, 252 / 255, 0],
  "lemonchiffon": [1, 250 / 255, 205 / 255],
  "lightblue": [173 / 255, 216 / 255, 230 / 255],
  "lightcoral": [240 / 255, 128 / 255, 128 / 255],
  "lightcyan": [224 / 255, 1, 1],
  "lightgoldenrodyellow": [250 / 255, 250 / 255, 210 / 255],
  "lightgray": [211 / 255, 211 / 255, 211 / 255],
  "lightgreen": [144 / 255, 238 / 255, 144 / 255],
  "lightgrey": [211 / 255, 211 / 255, 211 / 255],
  "lightpink": [1, 182 / 255, 193 / 255],
  "lightsalmon": [1, 160 / 255, 122 / 255],
  "lightseagreen": [32 / 255, 178 / 255, 170 / 255],
  "lightskyblue": [135 / 255, 206 / 255, 250 / 255],
  "lightslategray": [119 / 255, 136 / 255, 153 / 255],
  "lightslategrey": [119 / 255, 136 / 255, 153 / 255],
  "lightsteelblue": [176 / 255, 196 / 255, 222 / 255],
  "lightyellow": [1, 1, 224 / 255],
  "lime": [0, 1, 0],
  "limegreen": [50 / 255, 205 / 255, 50 / 255],
  "linen": [250 / 255, 240 / 255, 230 / 255],
  "magenta": [1, 0, 1],
  "maroon": [128 / 255, 0, 0],
  "mediumaquamarine": [102 / 255, 205 / 255, 170 / 255],
  "mediumblue": [0, 0, 205 / 255],
  "mediumorchid": [186 / 255, 85 / 255, 211 / 255],
  "mediumpurple": [147 / 255, 112 / 255, 219 / 255],
  "mediumseagreen": [60 / 255, 179 / 255, 113 / 255],
  "mediumslateblue": [123 / 255, 104 / 255, 238 / 255],
  "mediumspringgreen": [0, 250 / 255, 154 / 255],
  "mediumturquoise": [72 / 255, 209 / 255, 204 / 255],
  "mediumvioletred": [199 / 255, 21 / 255, 133 / 255],
  "midnightblue": [25 / 255, 25 / 255, 112 / 255],
  "mintcream": [245 / 255, 1, 250 / 255],
  "mistyrose": [1, 228 / 255, 225 / 255],
  "moccasin": [1, 228 / 255, 181 / 255],
  "navajowhite": [1, 222 / 255, 173 / 255],
  "navy": [0, 0, 128 / 255],
  "oldlace": [253 / 255, 245 / 255, 230 / 255],
  "olive": [128 / 255, 128 / 255, 0],
  "olivedrab": [107 / 255, 142 / 255, 35 / 255],
  "orange": [1, 165 / 255, 0],
  "orangered": [1, 69 / 255, 0],
  "orchid": [218 / 255, 112 / 255, 214 / 255],
  "palegoldenrod": [238 / 255, 232 / 255, 170 / 255],
  "palegreen": [152 / 255, 251 / 255, 152 / 255],
  "paleturquoise": [175 / 255, 238 / 255, 238 / 255],
  "palevioletred": [219 / 255, 112 / 255, 147 / 255],
  "papayawhip": [1, 239 / 255, 213 / 255],
  "peachpuff": [1, 218 / 255, 185 / 255],
  "peru": [205 / 255, 133 / 255, 63 / 255],
  "pink": [1, 192 / 255, 203 / 255],
  "plum": [221 / 255, 160 / 255, 221 / 255],
  "powderblue": [176 / 255, 224 / 255, 230 / 255],
  "purple": [128 / 255, 0, 128 / 255],
  "rebeccapurple": [102 / 255, 51 / 255, 153 / 255],
  "red": [1, 0, 0],
  "rosybrown": [188 / 255, 143 / 255, 143 / 255],
  "royalblue": [65 / 255, 105 / 255, 225 / 255],
  "saddlebrown": [139 / 255, 69 / 255, 19 / 255],
  "salmon": [250 / 255, 128 / 255, 114 / 255],
  "sandybrown": [244 / 255, 164 / 255, 96 / 255],
  "seagreen": [46 / 255, 139 / 255, 87 / 255],
  "seashell": [1, 245 / 255, 238 / 255],
  "sienna": [160 / 255, 82 / 255, 45 / 255],
  "silver": [192 / 255, 192 / 255, 192 / 255],
  "skyblue": [135 / 255, 206 / 255, 235 / 255],
  "slateblue": [106 / 255, 90 / 255, 205 / 255],
  "slategray": [112 / 255, 128 / 255, 144 / 255],
  "slategrey": [112 / 255, 128 / 255, 144 / 255],
  "snow": [1, 250 / 255, 250 / 255],
  "springgreen": [0, 1, 127 / 255],
  "steelblue": [70 / 255, 130 / 255, 180 / 255],
  "tan": [210 / 255, 180 / 255, 140 / 255],
  "teal": [0, 128 / 255, 128 / 255],
  "thistle": [216 / 255, 191 / 255, 216 / 255],
  "tomato": [1, 99 / 255, 71 / 255],
  "turquoise": [64 / 255, 224 / 255, 208 / 255],
  "violet": [238 / 255, 130 / 255, 238 / 255],
  "wheat": [245 / 255, 222 / 255, 179 / 255],
  "white": [1, 1, 1],
  "whitesmoke": [245 / 255, 245 / 255, 245 / 255],
  "yellow": [1, 1, 0],
  "yellowgreen": [154 / 255, 205 / 255, 50 / 255]
};

// node_modules/colorjs.io/src/spaces/srgb.js
var coordGrammar = Array(3).fill("<percentage> | <number>[0, 255]");
var coordGrammarNumber = Array(3).fill("<number>[0, 255]");
var srgb_default = new RGBColorSpace({
  id: "srgb",
  name: "sRGB",
  base: srgb_linear_default,
  fromBase: (rgb) => {
    return rgb.map((val) => {
      let sign = val < 0 ? -1 : 1;
      let abs = val * sign;
      if (abs > 31308e-7) {
        return sign * (1.055 * abs ** (1 / 2.4) - 0.055);
      }
      return 12.92 * val;
    });
  },
  toBase: (rgb) => {
    return rgb.map((val) => {
      let sign = val < 0 ? -1 : 1;
      let abs = val * sign;
      if (abs <= 0.04045) {
        return val / 12.92;
      }
      return sign * ((abs + 0.055) / 1.055) ** 2.4;
    });
  },
  formats: {
    "rgb": {
      coords: coordGrammar
    },
    "rgb_number": {
      name: "rgb",
      commas: true,
      coords: coordGrammarNumber,
      noAlpha: true
    },
    "color": {
      /* use defaults */
    },
    "rgba": {
      coords: coordGrammar,
      commas: true,
      lastAlpha: true
    },
    "rgba_number": {
      name: "rgba",
      commas: true,
      coords: coordGrammarNumber
    },
    "hex": {
      type: "custom",
      toGamut: true,
      test: (str) => /^#([a-f0-9]{3,4}){1,2}$/i.test(str),
      parse(str) {
        if (str.length <= 5) {
          str = str.replace(/[a-f0-9]/gi, "$&$&");
        }
        let rgba = [];
        str.replace(/[a-f0-9]{2}/gi, (component) => {
          rgba.push(parseInt(component, 16) / 255);
        });
        return {
          spaceId: "srgb",
          coords: rgba.slice(0, 3),
          alpha: rgba.slice(3)[0]
        };
      },
      serialize: (coords, alpha, {
        collapse = true
        // collapse to 3-4 digit hex when possible?
      } = {}) => {
        if (alpha < 1) {
          coords.push(alpha);
        }
        coords = coords.map((c) => Math.round(c * 255));
        let collapsible = collapse && coords.every((c) => c % 17 === 0);
        let hex = coords.map((c) => {
          if (collapsible) {
            return (c / 17).toString(16);
          }
          return c.toString(16).padStart(2, "0");
        }).join("");
        return "#" + hex;
      }
    },
    "keyword": {
      type: "custom",
      test: (str) => /^[a-z]+$/i.test(str),
      parse(str) {
        str = str.toLowerCase();
        let ret = { spaceId: "srgb", coords: null, alpha: 1 };
        if (str === "transparent") {
          ret.coords = keywords_default.black;
          ret.alpha = 0;
        } else {
          ret.coords = keywords_default[str];
        }
        if (ret.coords) {
          return ret;
        }
      }
    }
  }
});

// node_modules/colorjs.io/src/spaces/p3.js
var p3_default = new RGBColorSpace({
  id: "p3",
  cssId: "display-p3",
  name: "P3",
  base: p3_linear_default,
  // Gamma encoding/decoding is the same as sRGB
  fromBase: srgb_default.fromBase,
  toBase: srgb_default.toBase
});

// node_modules/colorjs.io/src/spaces/hsl.js
var hsl_default = new ColorSpace({
  id: "hsl",
  name: "HSL",
  coords: {
    h: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    },
    s: {
      range: [0, 100],
      name: "Saturation"
    },
    l: {
      range: [0, 100],
      name: "Lightness"
    }
  },
  base: srgb_default,
  // Adapted from https://drafts.csswg.org/css-color-4/better-rgbToHsl.js
  fromBase: (rgb) => {
    let max = Math.max(...rgb);
    let min = Math.min(...rgb);
    let [r, g2, b2] = rgb;
    let [h, s, l] = [NaN, 0, (min + max) / 2];
    let d2 = max - min;
    if (d2 !== 0) {
      s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
      switch (max) {
        case r:
          h = (g2 - b2) / d2 + (g2 < b2 ? 6 : 0);
          break;
        case g2:
          h = (b2 - r) / d2 + 2;
          break;
        case b2:
          h = (r - g2) / d2 + 4;
      }
      h = h * 60;
    }
    if (s < 0) {
      h += 180;
      s = Math.abs(s);
    }
    if (h >= 360) {
      h -= 360;
    }
    return [h, s * 100, l * 100];
  },
  // Adapted from https://en.wikipedia.org/wiki/HSL_and_HSV#HSL_to_RGB_alternative
  toBase: (hsl) => {
    let [h, s, l] = hsl;
    h = h % 360;
    if (h < 0) {
      h += 360;
    }
    s /= 100;
    l /= 100;
    function f2(n2) {
      let k = (n2 + h / 30) % 12;
      let a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    }
    return [f2(0), f2(8), f2(4)];
  },
  formats: {
    "hsl": {
      coords: ["<number> | <angle>", "<percentage>", "<percentage>"]
    },
    "hsla": {
      coords: ["<number> | <angle>", "<percentage>", "<percentage>"],
      commas: true,
      lastAlpha: true
    }
  }
});

// node_modules/colorjs.io/src/spaces/hsv.js
var hsv_default = new ColorSpace({
  id: "hsv",
  name: "HSV",
  coords: {
    h: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    },
    s: {
      range: [0, 100],
      name: "Saturation"
    },
    v: {
      range: [0, 100],
      name: "Value"
    }
  },
  base: hsl_default,
  // https://en.wikipedia.org/wiki/HSL_and_HSV#Interconversion
  fromBase(hsl) {
    let [h, s, l] = hsl;
    s /= 100;
    l /= 100;
    let v = l + s * Math.min(l, 1 - l);
    return [
      h,
      // h is the same
      v === 0 ? 0 : 200 * (1 - l / v),
      // s
      100 * v
    ];
  },
  // https://en.wikipedia.org/wiki/HSL_and_HSV#Interconversion
  toBase(hsv) {
    let [h, s, v] = hsv;
    s /= 100;
    v /= 100;
    let l = v * (1 - s / 2);
    return [
      h,
      // h is the same
      l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l) * 100,
      l * 100
    ];
  },
  formats: {
    color: {
      id: "--hsv",
      coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"]
    }
  }
});

// node_modules/colorjs.io/src/spaces/hwb.js
var hwb_default = new ColorSpace({
  id: "hwb",
  name: "HWB",
  coords: {
    h: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    },
    w: {
      range: [0, 100],
      name: "Whiteness"
    },
    b: {
      range: [0, 100],
      name: "Blackness"
    }
  },
  base: hsv_default,
  fromBase(hsv) {
    let [h, s, v] = hsv;
    return [h, v * (100 - s) / 100, 100 - v];
  },
  toBase(hwb) {
    let [h, w, b2] = hwb;
    w /= 100;
    b2 /= 100;
    let sum = w + b2;
    if (sum >= 1) {
      let gray = w / sum;
      return [h, 0, gray * 100];
    }
    let v = 1 - b2;
    let s = v === 0 ? 0 : 1 - w / v;
    return [h, s * 100, v * 100];
  },
  formats: {
    "hwb": {
      coords: ["<number> | <angle>", "<percentage> | <number>", "<percentage> | <number>"]
    }
  }
});

// node_modules/colorjs.io/src/spaces/a98rgb-linear.js
var toXYZ_M4 = [
  [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
  [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
  [0.02703136138641234, 0.07068885253582723, 0.9913375368376388]
];
var fromXYZ_M4 = [
  [2.0415879038107465, -0.5650069742788596, -0.34473135077832956],
  [-0.9692436362808795, 1.8759675015077202, 0.04155505740717557],
  [0.013444280632031142, -0.11836239223101838, 1.0151749943912054]
];
var a98rgb_linear_default = new RGBColorSpace({
  id: "a98rgb-linear",
  cssId: "--a98-rgb-linear",
  name: "Linear Adobe\xAE 98 RGB compatible",
  white: "D65",
  toXYZ_M: toXYZ_M4,
  fromXYZ_M: fromXYZ_M4
});

// node_modules/colorjs.io/src/spaces/a98rgb.js
var a98rgb_default = new RGBColorSpace({
  id: "a98rgb",
  cssId: "a98-rgb",
  name: "Adobe\xAE 98 RGB compatible",
  base: a98rgb_linear_default,
  toBase: (RGB) => RGB.map((val) => Math.pow(Math.abs(val), 563 / 256) * Math.sign(val)),
  fromBase: (RGB) => RGB.map((val) => Math.pow(Math.abs(val), 256 / 563) * Math.sign(val))
});

// node_modules/colorjs.io/src/spaces/prophoto-linear.js
var toXYZ_M5 = [
  [0.7977666449006423, 0.13518129740053308, 0.0313477341283922],
  [0.2880748288194013, 0.711835234241873, 8993693872564e-17],
  [0, 0, 0.8251046025104602]
];
var fromXYZ_M5 = [
  [1.3457868816471583, -0.25557208737979464, -0.05110186497554526],
  [-0.5446307051249019, 1.5082477428451468, 0.02052744743642139],
  [0, 0, 1.2119675456389452]
];
var prophoto_linear_default = new RGBColorSpace({
  id: "prophoto-linear",
  cssId: "--prophoto-rgb-linear",
  name: "Linear ProPhoto",
  white: "D50",
  base: xyz_d50_default,
  toXYZ_M: toXYZ_M5,
  fromXYZ_M: fromXYZ_M5
});

// node_modules/colorjs.io/src/spaces/prophoto.js
var Et = 1 / 512;
var Et2 = 16 / 512;
var prophoto_default = new RGBColorSpace({
  id: "prophoto",
  cssId: "prophoto-rgb",
  name: "ProPhoto",
  base: prophoto_linear_default,
  toBase(RGB) {
    return RGB.map((v) => v < Et2 ? v / 16 : v ** 1.8);
  },
  fromBase(RGB) {
    return RGB.map((v) => v >= Et ? v ** (1 / 1.8) : 16 * v);
  }
});

// node_modules/colorjs.io/src/spaces/oklch.js
var oklch_default = new ColorSpace({
  id: "oklch",
  name: "Oklch",
  coords: {
    l: {
      refRange: [0, 1],
      name: "Lightness"
    },
    c: {
      refRange: [0, 0.4],
      name: "Chroma"
    },
    h: {
      refRange: [0, 360],
      type: "angle",
      name: "Hue"
    }
  },
  white: "D65",
  base: oklab_default,
  fromBase(oklab) {
    let [L, a, b2] = oklab;
    let h;
    const \u03B56 = 2e-4;
    if (Math.abs(a) < \u03B56 && Math.abs(b2) < \u03B56) {
      h = NaN;
    } else {
      h = Math.atan2(b2, a) * 180 / Math.PI;
    }
    return [
      L,
      // OKLab L is still L
      Math.sqrt(a ** 2 + b2 ** 2),
      // Chroma
      constrain(h)
      // Hue, in degrees [0 to 360)
    ];
  },
  // Convert from polar form
  toBase(oklch) {
    let [L, C, h] = oklch;
    let a, b2;
    if (isNaN(h)) {
      a = 0;
      b2 = 0;
    } else {
      a = C * Math.cos(h * Math.PI / 180);
      b2 = C * Math.sin(h * Math.PI / 180);
    }
    return [L, a, b2];
  },
  formats: {
    "oklch": {
      coords: ["<percentage> | <number>", "<number> | <percentage>[0,1]", "<number> | <angle>"]
    }
  }
});

// src/math/color.ts
for (const space of [srgb_default, srgb_linear_default, hsl_default, hwb_default, lab_default, lch_default, oklab_default, oklch_default, p3_default, p3_linear_default, rec2020_default, rec2020_linear_default, a98rgb_default, a98rgb_linear_default, prophoto_default, prophoto_linear_default, xyz_d65_default, xyz_d50_default])
  ColorSpace.register(space);
var Color = class _Color {
  static Space = ColorSpace;
  space;
  coords;
  alpha;
  constructor(color, coords, alpha = 1) {
    const plain = coords ? { space: ColorSpace.get(color), coords: [...coords], alpha } : getColor(color);
    this.space = plain.space;
    this.coords = plain.coords;
    this.alpha = plain.alpha;
  }
  to(space) {
    return new _Color(to(this, space));
  }
  toGamut(options) {
    return new _Color(toGamut(this, options));
  }
  inGamut(space, options) {
    return inGamut(this, space, options);
  }
  clone() {
    return new _Color(clone(this));
  }
  toString(options) {
    return serialize(this, options);
  }
};

// src/math/outputSettings.ts
var COLOR_GAMUTS = ["srgb", "display-p3", "rec2020"];
var COLOR_FORMATS = ["rgb", "oklch", "hex", "hsl"];
function outputGamut(settings) {
  return settings.mapOutputsToSrgb ? "srgb" : settings.authoringGamut;
}
function isColorOutputSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value;
  return Object.keys(record).length === 3 && COLOR_GAMUTS.some((gamut) => gamut === record.authoringGamut) && COLOR_FORMATS.some((format) => format === record.outputFormat) && typeof record.mapOutputsToSrgb === "boolean" && (record.mapOutputsToSrgb || record.authoringGamut === "srgb" || record.outputFormat === "rgb" || record.outputFormat === "oklch");
}
function colorJsSpace(gamut) {
  return gamut === "display-p3" ? "p3" : gamut;
}

// src/math/outputSerialization.ts
var COLOR_OUTPUT_MAPPING_METHOD = "css";
var COLOR_OUTPUT_PRECISION = 2;
function number(value) {
  if (!Number.isFinite(value))
    throw new Error("Color output contains an unavailable channel.");
  const rounded = value.toFixed(COLOR_OUTPUT_PRECISION);
  if (Number(rounded) === 0) return "0";
  return rounded.replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
}
function coordinates(color) {
  const [first, second, third] = color.coords;
  if (first === null || second === null || third === null || ![first, second, third].every((value) => Number.isFinite(Number(value))))
    throw new Error("Color output contains an unavailable channel.");
  return [Number(first), Number(second), Number(third)];
}
function serializeRgb(channels, alpha, settings) {
  if (settings.outputFormat === "hex") {
    const byte = (value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0");
    const opacity = byte(alpha);
    return `#${channels.map(byte).join("")}${opacity === "ff" ? "" : opacity}`;
  }
  const suffix = alpha === 1 ? "" : ` / ${number(alpha)}`;
  const clamped = channels.map((value) => Math.min(1, Math.max(0, value)));
  if (outputGamut(settings) === "srgb") {
    const rgb = clamped.map((value) => Math.round(value * 255)).join(", ");
    return alpha === 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${number(alpha)})`;
  }
  return `color(${outputGamut(settings)} ${clamped.map(number).join(" ")}${suffix})`;
}
function serializeOklch(lightness, chroma, hue, suffix, settings) {
  const roundedLightness = Number(number(lightness * 100)) / 100;
  const roundedHue = Number(number(hue)) % 360;
  const chromaTicks = 25e3;
  let low = 0;
  let high = Math.round(chroma * chromaTicks);
  const space = colorJsSpace(outputGamut(settings));
  const fits = (ticks) => new Color("oklch", [
    roundedLightness,
    ticks / chromaTicks,
    roundedHue
  ]).inGamut(space, { epsilon: 1e-8 });
  if (!fits(high)) {
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(middle)) low = middle;
      else high = middle - 1;
    }
    high = low;
  }
  return `oklch(${number(roundedLightness * 100)}% ${number(high / 100)}% ${high === 0 ? "0" : number(roundedHue)}${suffix})`;
}
var serializedCache = /* @__PURE__ */ new Map();
function serializeLinearOutputColor(linear, settings) {
  const key = `${linear.join(",")}|${JSON.stringify(settings)}`;
  const cached = serializedCache.get(key);
  if (cached !== void 0) return cached;
  const css = serializeLinearUncached(linear, settings);
  serializedCache.set(key, css);
  if (serializedCache.size > 4096) serializedCache.delete(serializedCache.keys().next().value);
  return css;
}
function serializeLinearUncached(linear, settings) {
  const space = colorJsSpace(outputGamut(settings));
  if (isColorOutputSettings(settings) && (settings.outputFormat === "hex" || settings.outputFormat === "rgb") && linear.length === 3 && linear.every(
    (channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1
  )) {
    const channels = Color.Space.get(`${space}-linear`).to(space, [...linear]);
    if (channels.some((channel) => channel === null || !Number.isFinite(channel)))
      throw new Error("Color output contains an unavailable channel.");
    return serializeRgb(channels.map(Number), 1, settings);
  }
  return serializeOutputColor(
    new Color(`${space}-linear`, [...linear]),
    settings
  );
}
function mapOutputColor(source, settings) {
  if (!isColorOutputSettings(settings))
    throw new Error("Invalid color output configuration.");
  const alpha = Number(source.alpha);
  if (source.alpha === null || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new Error("Color output has invalid opacity.");
  }
  const copy = source.clone();
  copy.coords = coordinates(source);
  copy.alpha = alpha;
  const space = colorJsSpace(outputGamut(settings));
  return copy.toGamut({ space, method: COLOR_OUTPUT_MAPPING_METHOD }).to(space);
}
function serializeOutputColor(source, settings) {
  const color = mapOutputColor(source, settings);
  const alpha = settings.outputFormat === "hex" ? Number(color.alpha) : Number(number(Number(color.alpha)));
  const suffix = alpha === 1 ? "" : ` / ${number(alpha)}`;
  if (settings.outputFormat === "hex" || settings.outputFormat === "rgb")
    return serializeRgb(coordinates(color), alpha, settings);
  if (settings.outputFormat === "hsl") {
    const converted2 = color.to("hsl");
    if (!Number.isFinite(converted2.coords[0])) converted2.coords[0] = 0;
    const [hue2, saturation, lightness2] = coordinates(converted2);
    return `hsl(${number(hue2)} ${number(saturation)}% ${number(lightness2)}%${suffix})`;
  }
  const converted = color.to("oklch");
  const rgb = coordinates(color);
  if (Math.max(...rgb) - Math.min(...rgb) < 1e-12) {
    const linear = coordinates(
      color.to(`${colorJsSpace(outputGamut(settings))}-linear`)
    );
    return serializeOklch(Math.cbrt(linear[0]), 0, 0, suffix, settings);
  }
  if (!Number.isFinite(converted.coords[2])) converted.coords[2] = 0;
  const [lightness, chroma, hue] = coordinates(converted);
  return serializeOklch(lightness, chroma, hue, suffix, settings);
}

// src/math/colorMath.ts
var MAX_CHROMA = 0.4;
var RGB_TRANSFER = {
  srgb: {
    linearThreshold: 31308e-7,
    encodedThreshold: 0.04045,
    slope: 12.92,
    factor: 1.055,
    offset: 0.055,
    exponent: 1 / 2.4
  },
  rec2020: {
    linearThreshold: 0.018053968510807,
    encodedThreshold: 0.0812428582986315,
    slope: 4.5,
    factor: 1.09929682680944,
    offset: 0.09929682680944,
    exponent: 0.45
  }
};
function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
function mapLinearRgb(color, transform) {
  return [
    transform(color[0], 0),
    transform(color[1], 1),
    transform(color[2], 2)
  ];
}
function toLinear(channel, gamut = "srgb") {
  const transfer = RGB_TRANSFER[gamut === "rec2020" ? "rec2020" : "srgb"];
  const magnitude = gamut === "rec2020" ? Math.abs(channel) : channel;
  const linear = magnitude <= transfer.encodedThreshold ? magnitude / transfer.slope : ((magnitude + transfer.offset) / transfer.factor) ** (1 / transfer.exponent);
  return gamut === "rec2020" ? Math.sign(channel) * linear : linear;
}
function toGamma(channel, gamut = "srgb") {
  const transfer = RGB_TRANSFER[gamut === "rec2020" ? "rec2020" : "srgb"];
  const magnitude = gamut === "rec2020" ? Math.abs(channel) : channel;
  const encoded = magnitude <= transfer.linearThreshold ? magnitude * transfer.slope : transfer.factor * magnitude ** transfer.exponent - transfer.offset;
  return gamut === "rec2020" ? Math.sign(channel) * encoded : encoded;
}
function convertLinearGamut(color, from, to2) {
  if (from === to2) return color;
  return xyzD65ToLinear(linearToXyzD65(color, from), to2);
}
function linearToXyzD65([red, green, blue], gamut = "srgb") {
  return applyMatrix(TO_XYZ[gamut], [red, green, blue]);
}
function xyzD65ToLinear([x, y, z], gamut = "srgb") {
  return applyMatrix(FROM_XYZ[gamut], [x, y, z]);
}
function linearToHex(color, gamut = "srgb") {
  const srgb = convertLinearGamut(color, gamut, "srgb");
  const channels = srgb.map(
    (channel) => Math.round(clamp01(toGamma(channel)) * 255).toString(16).padStart(2, "0")
  );
  return `#${channels.join("")}`;
}
function colorOutputSettings(output) {
  if (typeof output === "object") return output;
  return {
    authoringGamut: output === "oklch" ? "srgb" : output,
    outputFormat: output === "srgb" ? "hex" : output === "oklch" ? "oklch" : "rgb",
    mapOutputsToSrgb: false
  };
}
function outputColorCss(color, output = "srgb", inputGamut = renderGamutForOutput(output)) {
  const settings = colorOutputSettings(output);
  if (inputGamut === outputGamut(settings))
    return serializeLinearOutputColor(color, settings);
  return serializeOutputColor(
    new Color(`${colorJsSpace(inputGamut)}-linear`, [...color]),
    settings
  );
}
function renderGamutForOutput(output) {
  return typeof output === "object" ? outputGamut(output) : output === "oklch" ? "srgb" : output;
}
function luminance([red, green, blue], gamut = "srgb") {
  if (red === green && green === blue) return red;
  if (gamut === "rec2020")
    return 0.2627002120112671 * red + 0.6779980715188708 * green + 0.05930171646986196 * blue;
  return gamut === "display-p3" ? 0.2289745640697488 * red + 0.6917385218365064 * green + 0.079286914093745 * blue : 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
function contrastRatio(first, second) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
function targetLuminance(background, targetContrast, isDark) {
  return clamp01(
    isDark ? (background + 0.05) / targetContrast - 0.05 : targetContrast * (background + 0.05) - 0.05
  );
}
function linearToOklab([red, green, blue]) {
  const long = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const medium = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const longRoot = Math.cbrt(long);
  const mediumRoot = Math.cbrt(medium);
  const shortRoot = Math.cbrt(short);
  return [
    0.2104542553 * longRoot + 0.793617785 * mediumRoot - 0.0040720468 * shortRoot,
    1.9779984951 * longRoot - 2.428592205 * mediumRoot + 0.4505937099 * shortRoot,
    0.0259040371 * longRoot + 0.7827717662 * mediumRoot - 0.808675766 * shortRoot
  ];
}
function oklabToLinear([lightness, a, b2]) {
  const longRoot = (lightness + 0.3963377774 * a + 0.2158037573 * b2) ** 3;
  const mediumRoot = (lightness - 0.1055613458 * a - 0.0638541728 * b2) ** 3;
  const shortRoot = (lightness - 0.0894841775 * a - 1.291485548 * b2) ** 3;
  return [
    4.0767416621 * longRoot - 3.3077115913 * mediumRoot + 0.2309699292 * shortRoot,
    -1.2684380046 * longRoot + 2.6097574011 * mediumRoot - 0.3413193965 * shortRoot,
    -0.0041960863 * longRoot - 0.7034186147 * mediumRoot + 1.707614701 * shortRoot
  ];
}
function oklabToOklch([lightness, a, b2]) {
  const chroma = Math.hypot(a, b2);
  const hue = (Math.atan2(b2, a) * 180 / Math.PI + 360) % 360;
  return [lightness, chroma, hue];
}
function oklchToOklab([lightness, chroma, hue]) {
  const hueRadians = hue * Math.PI / 180;
  return [
    lightness,
    chroma * Math.cos(hueRadians),
    chroma * Math.sin(hueRadians)
  ];
}
function linearToOklch(color) {
  return oklabToOklch(linearToOklab(color));
}
function oklchToLinear(color) {
  return oklabToLinear(oklchToOklab(color));
}
function isInSrgbGamut(color) {
  return color.every((channel) => channel >= 0 && channel <= 1);
}
function checkedCoordinates(color) {
  const [first, second, third] = color.coords;
  if (first === null || second === null || third === null || ![first, second, third].every(Number.isFinite)) {
    throw new Error("Color conversion returned unavailable channels.");
  }
  return [first, second, third];
}
function colorMatrix(from, to2) {
  return [
    checkedCoordinates(new Color(from, [1, 0, 0]).to(to2)),
    checkedCoordinates(new Color(from, [0, 1, 0]).to(to2)),
    checkedCoordinates(new Color(from, [0, 0, 1]).to(to2))
  ];
}
var TO_XYZ = {
  srgb: colorMatrix("srgb-linear", "xyz-d65"),
  "display-p3": colorMatrix("p3-linear", "xyz-d65"),
  rec2020: colorMatrix("rec2020-linear", "xyz-d65")
};
var FROM_XYZ = {
  srgb: colorMatrix("xyz-d65", "srgb-linear"),
  "display-p3": colorMatrix("xyz-d65", "p3-linear"),
  rec2020: colorMatrix("xyz-d65", "rec2020-linear")
};
function applyMatrix([red, green, blue], [first, second, third]) {
  return [
    red[0] * first + green[0] * second + blue[0] * third,
    red[1] * first + green[1] * second + blue[1] * third,
    red[2] * first + green[2] * second + blue[2] * third
  ];
}
function requiresOutputGamutMapping(output) {
  return typeof output === "object" && output.mapOutputsToSrgb && output.authoringGamut !== "srgb";
}
function gamutClamp(lightness, chroma, hue, gamut = "srgb", preserveAppearance = false) {
  if (lightness <= 0) return [0, 0, 0];
  if (lightness >= 1) return [1, 1, 1];
  if (preserveAppearance) {
    const color = new Color("oklch", [lightness, chroma, hue]);
    return checkedCoordinates(
      color.toGamut({
        space: colorJsSpace(gamut),
        method: COLOR_OUTPUT_MAPPING_METHOD
      }).to(`${colorJsSpace(gamut)}-linear`)
    );
  }
  const inGamut2 = (color) => isInSrgbGamut(convertLinearGamut(color, "srgb", gamut));
  const unbounded = oklchToLinear([lightness, chroma, hue]);
  if (inGamut2(unbounded)) {
    return convertLinearGamut(unbounded, "srgb", gamut);
  }
  let minimum = 0;
  let maximum = chroma;
  for (let iteration = 0; iteration < 22; iteration += 1) {
    const midpoint = (minimum + maximum) / 2;
    if (inGamut2(oklchToLinear([lightness, midpoint, hue]))) {
      minimum = midpoint;
    } else {
      maximum = midpoint;
    }
  }
  return convertLinearGamut(
    oklchToLinear([lightness, minimum, hue]),
    "srgb",
    gamut
  );
}
function interpolateHue(from, to2, fraction) {
  const delta = (to2 - from + 540) % 360 - 180;
  return (from + delta * fraction + 360) % 360;
}
function deltaE(first, second) {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
  );
}

// src/math/outputContrast.ts
var parsedOutputs = /* @__PURE__ */ new Map();
var parsedCharacters = 0;
function parsedOutput(css, gamut) {
  const key = `${gamut}\0${css}`;
  const cached = parsedOutputs.get(key);
  if (cached) return cached;
  const entry = { color: new Color(css) };
  if (key.length > 512) return entry;
  while (parsedOutputs.size >= 4096 || parsedCharacters + key.length > 262144) {
    const oldest = parsedOutputs.keys().next().value;
    if (oldest === void 0) break;
    parsedOutputs.delete(oldest);
    parsedCharacters -= oldest.length;
  }
  parsedOutputs.set(key, entry);
  parsedCharacters += key.length;
  return entry;
}
function parsedOutputLinear(css, gamut) {
  const entry = parsedOutput(css, gamut);
  if (entry.linear) return [...entry.linear];
  const parsed = entry.color;
  if (parsed.space.id === "oklch" && Number(parsed.coords[1]) === 0) {
    const neutral = Number(parsed.coords[0]) ** 3;
    entry.linear = [neutral, neutral, neutral];
    return [neutral, neutral, neutral];
  }
  const color = parsed.to(`${colorJsSpace(gamut)}-linear`);
  const values = color.coords.map(Number);
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw new Error(`Cannot measure output color ${css}.`);
  entry.linear = [values[0], values[1], values[2]];
  return [...entry.linear];
}
function renderedOutputLinear(css, backgroundCss, gamut) {
  const foregroundEntry = parsedOutput(css, gamut), backgroundEntry = parsedOutput(backgroundCss, gamut);
  const foreground = foregroundEntry.color, background = backgroundEntry.color;
  if (Number(background.alpha) !== 1)
    throw new Error("A contrast background must be opaque.");
  const alpha = Number(foreground.alpha);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
    throw new Error("A contrast foreground has invalid opacity.");
  const encodedChannels = (entry) => {
    if (entry.encoded) return entry.encoded;
    const color = entry.color;
    if (color.space.id === "oklch" && Number(color.coords[1]) === 0) {
      const neutral = toGamma(Number(color.coords[0]) ** 3, gamut);
      entry.encoded = [neutral, neutral, neutral];
    } else {
      entry.encoded = color.to(colorJsSpace(gamut)).coords.map(Number);
    }
    return entry.encoded;
  };
  const fg = encodedChannels(foregroundEntry), bg = encodedChannels(backgroundEntry);
  const encoded = fg.map(
    (channel, index) => channel * alpha + bg[index] * (1 - alpha)
  );
  if (!encoded.every(Number.isFinite))
    throw new Error("Cannot measure the composited output color.");
  return [
    toLinear(encoded[0], gamut),
    toLinear(encoded[1], gamut),
    toLinear(encoded[2], gamut)
  ];
}
function measureOutputContrast(css, backgroundCss, gamut) {
  return contrastRatio(
    luminance(renderedOutputLinear(css, backgroundCss, gamut), gamut),
    luminance(parsedOutputLinear(backgroundCss, gamut), gamut)
  );
}
function validateTarget(target) {
  if (!Number.isFinite(target) || target < 1 || target > 21)
    throw new Error("Choose a finite contrast target from 1:1 to 21:1.");
}
function enforceOutputContrast(candidate, backgroundCss, target, settings, isDark, _source) {
  void _source;
  validateTarget(target);
  const gamut = outputGamut(settings);
  const evaluations = /* @__PURE__ */ new Map();
  const evaluate = (linear) => {
    const css = serializeLinearOutputColor(linear, settings);
    const previous = evaluations.get(css);
    if (previous) return previous;
    const result = {
      css,
      linear: parsedOutputLinear(css, gamut),
      measuredContrast: measureOutputContrast(css, backgroundCss, gamut)
    };
    evaluations.set(css, result);
    return result;
  };
  const initial = evaluate(candidate);
  if (initial.measuredContrast >= target) return initial;
  const endpoint = isDark ? [0, 0, 0] : [1, 1, 1];
  let best = evaluate(endpoint);
  if (best.measuredContrast < target) return best;
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 46; iteration += 1) {
    const fraction = (low + high) / 2;
    const result = evaluate(
      mapLinearRgb(
        candidate,
        (channel, index) => channel + fraction * (endpoint[index] - channel)
      )
    );
    if (result.measuredContrast >= target) {
      high = fraction;
      best = result;
    } else low = fraction;
  }
  return best;
}

// src/math/apca.ts
var NORM_BG = 0.56;
var NORM_TXT = 0.57;
var REV_TXT = 0.62;
var REV_BG = 0.65;
var BLK_THRS = 0.022;
var BLK_CLMP = 1.414;
var SCALE = 1.14;
var OFFSET = 0.027;
var LO_CLIP = 0.1;
var DELTA_Y_MIN = 5e-4;
var MAX_APCA = 108;
function apcaLuminance(encoded) {
  const lin = (value) => Math.sign(value) * Math.abs(value) ** 2.4;
  return lin(encoded[0]) * 0.2126729 + lin(encoded[1]) * 0.7151522 + lin(encoded[2]) * 0.072175;
}
function softClamp(y) {
  return y >= BLK_THRS ? y : y + (BLK_THRS - y) ** BLK_CLMP;
}
function apcaFromLuminance(textY, backgroundY, smooth = true) {
  const txt = softClamp(textY);
  const bg = softClamp(backgroundY);
  if (Math.abs(bg - txt) < DELTA_Y_MIN) return 0;
  const raw = bg > txt ? (bg ** NORM_BG - txt ** NORM_TXT) * SCALE : (bg ** REV_BG - txt ** REV_TXT) * SCALE;
  const magnitude = Math.abs(raw);
  const sign = Math.sign(raw);
  if (magnitude < LO_CLIP) {
    return smooth ? sign * magnitude * ((LO_CLIP - OFFSET) / LO_CLIP) * 100 : 0;
  }
  return sign * (magnitude - OFFSET) * 100;
}
function srgbCoords(color) {
  const parsed = typeof color === "string" ? new Color(color) : color;
  return parsed.to("srgb").coords.map((value) => Number(value) || 0);
}
function apcaContrast(text, background, smooth = true) {
  return apcaFromLuminance(
    apcaLuminance(srgbCoords(text)),
    apcaLuminance(srgbCoords(background)),
    smooth
  );
}

// src/scales/scaleInterpolation.ts
function scaleInterpolation(scale) {
  return scale.interpolation ?? "oklch";
}

// src/scales/scaleData.ts
var NEUTRAL_CHROMA = 2;
var RAMP_STEPS = 33;
var ANCHOR_INDICES = [4, 9, 14, 19, 24, 28];
var RGB_ANCHOR_INDICES = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29];
var scaleDataCache = /* @__PURE__ */ new Map();
function scaleCacheKey(scale, output) {
  return `${JSON.stringify(output)}|${scale.id}|${scaleInterpolation(scale)}|${scale.stops.map((stop) => `${stop.lightness},${stop.hue},${stop.chroma}`).join(";")}`;
}
function sortStops(stops) {
  return [...stops].sort((first, second) => first.lightness - second.lightness);
}
function scaleHueChromaAt(stops, lightness) {
  const sortedStops = sortStops(stops);
  if (sortedStops.length === 0) {
    throw new Error("A color scale requires at least one stop.");
  }
  const first = sortedStops[0];
  const last2 = sortedStops.at(-1);
  if (lightness <= first.lightness || sortedStops.length === 1) {
    return { hue: first.hue, chroma: first.chroma };
  }
  if (lightness >= last2.lightness) {
    return { hue: last2.hue, chroma: last2.chroma };
  }
  const upperIndex = sortedStops.findIndex(
    (stop) => stop.lightness >= lightness
  );
  const lower = sortedStops[upperIndex - 1];
  const upper = sortedStops[upperIndex];
  const span = upper.lightness - lower.lightness;
  const fraction = span === 0 ? 0 : (lightness - lower.lightness) / span;
  return {
    hue: interpolateHue(lower.hue, upper.hue, fraction),
    chroma: lower.chroma + (upper.chroma - lower.chroma) * fraction
  };
}
function stopLinear(stop, gamut, preserveAppearance) {
  return gamutClamp(
    clamp01(stop.lightness),
    stop.chroma / 100 * MAX_CHROMA,
    stop.hue,
    gamut,
    preserveAppearance
  );
}
function rgbLinearAtLightness(stops, lightness, gamut, preserveAppearance) {
  const points = [
    { lightness: 0, gamma: [0, 0, 0] },
    ...sortStops(stops).map((stop) => ({
      lightness: clamp01(stop.lightness),
      gamma: stopLinear(stop, gamut, preserveAppearance).map(
        (channel) => toGamma(channel, gamut)
      )
    })),
    { lightness: 1, gamma: [1, 1, 1] }
  ];
  const target = clamp01(lightness);
  const upperIndex = Math.max(
    1,
    points.findIndex((point) => point.lightness >= target)
  );
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const span = upper.lightness - lower.lightness;
  const fraction = span <= 0 ? 1 : (target - lower.lightness) / span;
  return lower.gamma.map(
    (channel, index) => toLinear(channel + (upper.gamma[index] - channel) * fraction, gamut)
  );
}
function scaleLinearAtLightness(scale, lightness, gamut, preserveAppearance) {
  if (scaleInterpolation(scale) === "rgb") {
    const linear2 = rgbLinearAtLightness(
      scale.stops,
      lightness,
      gamut,
      preserveAppearance
    );
    const [, chroma2, hue2] = linearToOklch(
      convertLinearGamut(linear2, gamut, "srgb")
    );
    return {
      linear: linear2,
      hue: Number.isFinite(hue2) ? hue2 : 0,
      chroma: chroma2 / MAX_CHROMA * 100
    };
  }
  const { hue, chroma } = scaleHueChromaAt(scale.stops, lightness);
  const linear = gamutClamp(
    clamp01(lightness),
    chroma / 100 * MAX_CHROMA,
    hue,
    gamut,
    preserveAppearance
  );
  return { linear, hue, chroma };
}
function resolveScaleColorAtLightness(scale, lightness, output = "srgb") {
  const gamut = renderGamutForOutput(output);
  const resolvedLightness = clamp01(lightness);
  const { linear, hue, chroma } = scaleLinearAtLightness(
    scale,
    resolvedLightness,
    gamut,
    requiresOutputGamutMapping(output)
  );
  return {
    linear,
    css: outputColorCss(linear, output, gamut),
    hex: linearToHex(linear, gamut),
    lightness: resolvedLightness,
    hue,
    chroma,
    gamut
  };
}
function buildRamp(scale, output = "srgb") {
  const gamut = renderGamutForOutput(output);
  const minimumLightness = Math.min(
    ...scale.stops.map((stop) => stop.lightness),
    0
  );
  const maximumLightness = Math.max(
    ...scale.stops.map((stop) => stop.lightness),
    1
  );
  return Array.from({ length: RAMP_STEPS }, (_, index) => {
    const lightness = minimumLightness + (maximumLightness - minimumLightness) * index / (RAMP_STEPS - 1);
    const { linear } = scaleLinearAtLightness(
      scale,
      lightness,
      gamut,
      requiresOutputGamutMapping(output)
    );
    return {
      lightness,
      linear,
      luminance: luminance(linear, gamut),
      hex: linearToHex(linear, gamut),
      css: outputColorCss(linear, output, gamut)
    };
  }).sort((first, second) => first.luminance - second.luminance);
}
function rampAnchors(ramp, keyColors = []) {
  const indices = keyColors.length > 0 ? RGB_ANCHOR_INDICES : ANCHOR_INDICES;
  const samples = [
    { luminance: 0, linear: [0, 0, 0] },
    ...keyColors,
    ...indices.map((index) => ({
      luminance: ramp[index].luminance,
      linear: ramp[index].linear
    })),
    { luminance: 1, linear: [1, 1, 1] }
  ];
  samples.sort((first, second) => first.luminance - second.luminance);
  return samples.filter(
    (anchor, index) => index === 0 || anchor.luminance - samples[index - 1].luminance >= 1e-4
  );
}
function readAnchors(anchors, targetLuminance2) {
  const target = clamp01(targetLuminance2);
  if (target <= anchors[0].luminance) {
    return anchors[0].linear;
  }
  const last2 = anchors.at(-1);
  if (target >= last2.luminance) {
    return last2.linear;
  }
  const upperIndex = anchors.findIndex((anchor) => anchor.luminance >= target);
  const lower = anchors[upperIndex - 1];
  const upper = anchors[upperIndex];
  const fraction = (target - lower.luminance) / (upper.luminance - lower.luminance);
  return [
    lower.linear[0] + (upper.linear[0] - lower.linear[0]) * fraction,
    lower.linear[1] + (upper.linear[1] - lower.linear[1]) * fraction,
    lower.linear[2] + (upper.linear[2] - lower.linear[2]) * fraction
  ];
}
function buildScaleData(scale, output = "srgb") {
  const gamut = renderGamutForOutput(output);
  const cacheKey = scaleCacheKey(scale, output);
  const cached = scaleDataCache.get(cacheKey);
  if (cached) {
    if (cached.scale === scale) return cached;
    const current = { ...cached, scale };
    scaleDataCache.set(cacheKey, current);
    return current;
  }
  const ramp = buildRamp(scale, output);
  const keyColors = scaleInterpolation(scale) === "rgb" ? scale.stops.map((stop) => {
    const linear = stopLinear(
      stop,
      gamut,
      requiresOutputGamutMapping(output)
    );
    return { luminance: luminance(linear, gamut), linear };
  }) : [];
  const anchors = rampAnchors(ramp, keyColors);
  const neutral = scale.stops.every((stop) => stop.chroma < NEUTRAL_CHROMA);
  const result = {
    scale,
    neutral,
    ramp,
    anchors,
    gamut,
    output
  };
  scaleDataCache.set(cacheKey, result);
  if (scaleDataCache.size > 256) {
    const oldestKey = scaleDataCache.keys().next().value;
    if (oldestKey) scaleDataCache.delete(oldestKey);
  }
  return result;
}

// src/modes/polarity.ts
var DEFAULT_CONTRAST_REFERENCE = "light";
var DEFAULT_POLARITY_COMPENSATION = 0;
var MAX_POLARITY_OFFSET = 12;
var ROLLOFF_EXPONENT = 2;
var LOW_EXPANSION = 3;
var MIN_RATIO = 1;
var MAX_RATIO = 21;
function clampRatio(ratio) {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}
function lightnessFromLuminance(y) {
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : 24389 / 27 * y;
}
function luminanceFromLightness(lightness) {
  return lightness > 8 ? ((lightness + 16) / 116) ** 3 : lightness * 27 / 24389;
}
function darkLightnessDelta(ratio) {
  return lightnessFromLuminance(0.05 * (clampRatio(ratio) - 1));
}
function ratioFromDarkLightnessDelta(delta) {
  return clampRatio(
    1 + luminanceFromLightness(Math.min(100, Math.max(0, delta))) / 0.05
  );
}
function boost(delta, offset) {
  return delta + offset * (1 - Math.exp(-delta / LOW_EXPANSION)) * (1 - (delta / 100) ** ROLLOFF_EXPONENT);
}
function unboost(target, offset) {
  let low = 0;
  let high = 100;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (boost(middle, offset) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
function contrastReference(document) {
  return document.settings.contrastReference ?? DEFAULT_CONTRAST_REFERENCE;
}
function polarityCompensation(document) {
  return document.settings.polarityCompensation ?? DEFAULT_POLARITY_COMPENSATION;
}
var DEFAULT_CONTRAST_MULTIPLIER = 1;
var MAX_CONTRAST_MULTIPLIER = 3;
function contrastMultiplier(document) {
  return document.settings.contrastMultiplier ?? DEFAULT_CONTRAST_MULTIPLIER;
}
function multiplyContrast(ratio, multiplier) {
  return clampRatio((clampRatio(ratio) - 1) * Math.max(0, multiplier) + 1);
}
function applyContrastMultiplier(document) {
  const multiplier = contrastMultiplier(document);
  if (multiplier === 1) return document;
  return {
    ...document,
    contrasts: document.contrasts.map((contrast2) => ({
      ...contrast2,
      value: multiplyContrast(contrast2.value, multiplier)
    })),
    surfaces: document.surfaces.map(
      (surface) => surface.base || surface.contrast === void 0 ? surface : {
        ...surface,
        contrast: multiplyContrast(surface.contrast, multiplier)
      }
    )
  };
}
function compensatedContrast(ratio, strength, reference) {
  const offset = Math.min(1, Math.max(0, strength)) * MAX_POLARITY_OFFSET;
  if (offset === 0) return clampRatio(ratio);
  const delta = darkLightnessDelta(ratio);
  return ratioFromDarkLightnessDelta(
    reference === "light" ? boost(delta, offset) : unboost(delta, offset)
  );
}
function polarityWeight(backgroundLuminance2, reference) {
  const lightness = Math.min(100, Math.max(0, lightnessFromLuminance(backgroundLuminance2))) / 100;
  return reference === "light" ? 1 - lightness : lightness;
}
function oppositeContrast(contrast2, context) {
  return contrast2.oppositeValue ?? compensatedContrast(contrast2.value, context.strength, context.reference);
}
function effectiveContrast(contrast2, context) {
  const authored = clampRatio(contrast2.value);
  if (context.weight <= 0) return authored;
  const opposite = oppositeContrast(contrast2, context);
  if (context.weight >= 1) return clampRatio(opposite);
  return clampRatio(
    Math.exp(
      Math.log(authored) + context.weight * (Math.log(opposite) - Math.log(authored))
    )
  );
}
function backgroundLuminance(document) {
  const scale = document.scales.find((item) => item.id === document.backgroundScaleId) ?? document.scales[0];
  const background = resolveScaleColorAtLightness(
    scale,
    document.backgroundLightness,
    document.settings.colorOutput
  );
  return luminance(
    background.linear,
    renderGamutForOutput(document.settings.colorOutput)
  );
}
function polarityContext(document) {
  const reference = contrastReference(document);
  return {
    weight: polarityWeight(backgroundLuminance(document), reference),
    strength: polarityCompensation(document),
    reference
  };
}
function applyPolarityCompensation(document) {
  const context = polarityContext(document);
  const hasOpposites = document.contrasts.some(
    (contrast2) => contrast2.oppositeValue !== void 0
  );
  if (context.weight === 0 || context.strength === 0 && !hasOpposites)
    return document;
  return {
    ...document,
    contrasts: document.contrasts.map((contrast2) => ({
      ...contrast2,
      value: effectiveContrast(contrast2, context)
    })),
    surfaces: document.surfaces.map(
      (surface) => surface.base || surface.contrast === void 0 ? surface : {
        ...surface,
        contrast: effectiveContrast({ value: surface.contrast }, context)
      }
    )
  };
}

// src/scales/colorAtContrast.ts
var generationCache = /* @__PURE__ */ new WeakMap();
function createGeneratedColor(linear, backgroundLuminance2, scaleData) {
  return {
    linear,
    hex: linearToHex(linear, scaleData.gamut),
    css: outputColorCss(linear, scaleData.output, scaleData.gamut),
    measuredContrast: contrastRatio(
      luminance(linear, scaleData.gamut),
      backgroundLuminance2
    )
  };
}
function generateColors(scaleData, background, targetContrast, sideOverride) {
  const cacheKey = JSON.stringify([background, targetContrast, sideOverride]);
  const cache = generationCache.get(scaleData.anchors) ?? /* @__PURE__ */ new Map();
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const backgroundCss = outputColorCss(
    background,
    scaleData.output,
    scaleData.gamut
  );
  if (typeof scaleData.output === "object")
    background = parsedOutputLinear(backgroundCss, scaleData.gamut);
  const backgroundLuminance2 = luminance(background, scaleData.gamut);
  const isDark = sideOverride ?? backgroundLuminance2 > 0.1791;
  const desiredLuminance = targetLuminance(
    backgroundLuminance2,
    targetContrast,
    isDark
  );
  const extremity = scaleData.neutral ? 1 : clamp01((1 - targetContrast) / 11);
  const endpoint = isDark ? 0 : 1;
  const sourceLuminance = clamp01(
    desiredLuminance + extremity * (endpoint - desiredLuminance)
  );
  const source = readAnchors(scaleData.anchors, sourceLuminance);
  const sourceDifference = isDark ? Math.min(
    luminance(source, scaleData.gamut) - backgroundLuminance2,
    -1e-4
  ) : Math.max(
    luminance(source, scaleData.gamut) - backgroundLuminance2,
    1e-4
  );
  const alpha = clamp01(
    (desiredLuminance - backgroundLuminance2) / sourceDifference
  );
  const dynamicLinear = mapLinearRgb(
    source,
    (channel, index) => alpha * channel + (1 - alpha) * background[index]
  );
  const opaqueLinear = readAnchors(scaleData.anchors, desiredLuminance);
  const final = (linear) => {
    if (typeof scaleData.output !== "object")
      return createGeneratedColor(linear, backgroundLuminance2, scaleData);
    const result2 = enforceOutputContrast(
      linear,
      backgroundCss,
      targetContrast,
      scaleData.output,
      isDark,
      scaleData.scale.name
    );
    return { ...result2, hex: linearToHex(result2.linear, scaleData.gamut) };
  };
  let dynamic;
  let opaque;
  const resolveOpaque = () => opaque ??= final(opaqueLinear);
  const result = {
    targetContrast,
    targetLuminance: desiredLuminance,
    sourceLuminance,
    alpha,
    isDark,
    sourceLinear: source,
    get dynamic() {
      return dynamic ??= final(dynamicLinear);
    },
    get opaque() {
      return resolveOpaque();
    },
    get chromaDeltaE() {
      return deltaE(
        linearToOklab(
          convertLinearGamut(result.dynamic.linear, scaleData.gamut, "srgb")
        ),
        linearToOklab(
          convertLinearGamut(resolveOpaque().linear, scaleData.gamut, "srgb")
        )
      );
    }
  };
  cache.set(cacheKey, result);
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  generationCache.set(scaleData.anchors, cache);
  return result;
}

// src/scales/apcaGeneration.ts
function encodeSrgb(channel) {
  const t = RGB_TRANSFER.srgb;
  const magnitude = Math.abs(channel);
  const encoded = magnitude <= t.linearThreshold ? magnitude * t.slope : t.factor * magnitude ** t.exponent - t.offset;
  return Math.sign(channel) * encoded;
}
function apcaLuminanceOfLinear(linear, gamut) {
  return apcaLuminance(convertLinearGamut(linear, gamut, "srgb").map(encodeSrgb));
}
function apcaPrefersDark(background, gamut) {
  const bgY = apcaLuminanceOfLinear(background, gamut);
  return Math.abs(apcaFromLuminance(0, bgY)) >= Math.abs(apcaFromLuminance(1, bgY));
}
function generateApcaColor(scaleData, background, backgroundCss, target, settings, isDark) {
  const gamut = outputGamut(settings);
  const bgY = apcaLuminanceOfLinear(background, gamut);
  const bgLum = luminance(background, gamut);
  const at = (fraction2) => {
    const lum = bgLum + fraction2 * ((isDark ? 0 : 1) - bgLum);
    return readAnchors(scaleData.anchors, lum);
  };
  const fast = (linear) => Math.abs(apcaFromLuminance(apcaLuminanceOfLinear(linear, gamut), bgY));
  const measure = (linear) => {
    const css = serializeLinearOutputColor(linear, settings);
    return { css, linear: parsedOutputLinear(css, gamut), measuredContrast: Math.abs(apcaContrast(css, backgroundCss)) };
  };
  let low = 0;
  let high = 1;
  if (fast(at(1)) < target) {
    const endpoint = isDark ? [0, 0, 0] : [1, 1, 1];
    return { ...measure(endpoint), isDark };
  }
  for (let i = 0; i < 40; i += 1) {
    const middle = (low + high) / 2;
    if (fast(at(middle)) >= target) high = middle;
    else low = middle;
  }
  let fraction = high;
  let result = measure(at(fraction));
  for (let i = 0; i < 60 && result.measuredContrast < target && fraction < 1; i += 1) {
    fraction = Math.min(1, fraction + 2e-3);
    result = measure(at(fraction));
  }
  if (result.measuredContrast < target) {
    const endpoint = isDark ? [0, 0, 0] : [1, 1, 1];
    const towardEnd = mapLinearRgb(result.linear, (c, i) => c + 0.5 * (endpoint[i] - c));
    const fallback = measure(towardEnd);
    if (fallback.measuredContrast >= target) result = fallback;
  }
  return { ...result, isDark };
}

// src/theme/surfaceGeneration.ts
function goesLight(surface, reference, gamut) {
  return !surface.forceDark && (surface.contrast ?? 1) <= 1.05 / (luminance(reference, gamut) + 0.05);
}
function deriveBaseSurface(surface, reference, gamut) {
  const contrast2 = surface.contrast ?? 1;
  const referenceLuminance = luminance(reference, gamut);
  if (goesLight(surface, reference, gamut)) {
    const maximum = Math.max(...reference, 1e-6);
    const target2 = contrast2 * (referenceLuminance + 0.05) - 0.05;
    const alpha = clamp01(
      (target2 - referenceLuminance) / Math.max(referenceLuminance / maximum - referenceLuminance, 1e-6)
    );
    return mapLinearRgb(
      reference,
      (channel) => clamp01(channel + alpha * (channel / maximum - channel))
    );
  }
  const target = (referenceLuminance + 0.05) / contrast2 - 0.05;
  const factor = target / Math.max(referenceLuminance, 1e-6);
  return mapLinearRgb(reference, (channel) => clamp01(factor * channel));
}
function surfaceLinear(surface, document, parent) {
  const gamut = renderGamutForOutput(document.settings.colorOutput);
  const base = resolvedBackgroundLinear(document);
  if (surface.base) return base;
  const reference = surface.reference === "base" || !parent ? base : parent;
  if (!surface.sourceScaleId && (!surface.source || surface.source === "base")) {
    const referenceCss = outputColorCss(
      reference,
      document.settings.colorOutput,
      gamut
    );
    const actualReference = parsedOutputLinear(referenceCss, gamut);
    return enforceOutputContrast(
      deriveBaseSurface(surface, actualReference, gamut),
      referenceCss,
      surface.contrast ?? 1,
      document.settings.colorOutput,
      !goesLight(surface, actualReference, gamut),
      surface.name
    ).linear;
  }
  const scale = document.scales.find(
    (candidate) => surface.sourceScaleId ? candidate.id === surface.sourceScaleId : candidate.name === surface.source
  );
  if (!scale)
    throw new Error(`Surface ${surface.id} has an unresolved tint source.`);
  return generateColors(
    buildScaleData(scale, document.settings.colorOutput),
    reference,
    surface.contrast ?? 1,
    !goesLight(surface, reference, gamut)
  ).dynamic.linear;
}
function resolvedBackgroundLinear(document) {
  const scale = document.scales.find((item) => item.id === document.backgroundScaleId) ?? document.scales[0];
  return resolveScaleColorAtLightness(
    scale,
    document.backgroundLightness,
    document.settings.colorOutput
  ).linear;
}

// src/math/cvd.ts
var VISIONS = ["normal", "protan", "deutan", "tritan"];
var MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-3882e-6, -0.048116, 1.051998]
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881]
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [4733e-6, 0.691367, 0.3039]
  ]
};
function simulateCvd(color, vision) {
  const input = [clamp01(color[0]), clamp01(color[1]), clamp01(color[2])];
  if (vision === "normal") return input;
  const m = MACHADO[vision];
  return m.map((row) => clamp01(row[0] * input[0] + row[1] * input[1] + row[2] * input[2]));
}
var D65 = linearToXyzD65([1, 1, 1]);
var labF = (t) => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
function labOfLinear(color) {
  const [x, y, z] = linearToXyzD65(color).map((v, i) => labF(v / D65[i]));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
var rad = Math.PI / 180;
function deltaE2000([l1, a1, b1], [l2, a2, b2]) {
  const c13 = Math.hypot(a1, b1);
  const c23 = Math.hypot(a2, b2);
  const cBar7 = ((c13 + c23) / 2) ** 7;
  const g2 = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const ap1 = a1 * (1 + g2);
  const ap2 = a2 * (1 + g2);
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hueOf = (b3, a) => b3 === 0 && a === 0 ? 0 : (Math.atan2(b3, a) / rad + 360) % 360;
  const hp1 = hueOf(b1, ap1);
  const hp2 = hueOf(b2, ap2);
  const dL = l2 - l1;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(dh / 2 * rad);
  const lBar = (l1 + l2) / 2;
  const cBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) <= 180) hBar = (hp1 + hp2) / 2;
    else hBar = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  }
  const t = 1 - 0.17 * Math.cos((hBar - 30) * rad) + 0.24 * Math.cos(2 * hBar * rad) + 0.32 * Math.cos((3 * hBar + 6) * rad) - 0.2 * Math.cos((4 * hBar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarP7 = cBar ** 7;
  const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
  const sl = 1 + 0.015 * (lBar - 50) ** 2 / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBar;
  const sh = 1 + 0.015 * cBar * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt(
    (dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh)
  );
}

// src/theme/feedbackHues.ts
var FEEDBACK_HUES = {
  error: [10, 45],
  warning: [50, 100],
  success: [125, 165],
  info: [225, 265]
};
var FEEDBACK_LIGHTNESS = { error: 0.6, warning: 0.78, success: 0.65, info: 0.6 };
var FEEDBACK_LIGHTNESS_RANGE = {
  error: [0.4, 0.85],
  warning: [0.3, 0.95],
  success: [0.2, 0.98],
  info: [0.2, 0.98]
};
var lightEnough = (name, lightness) => {
  const [lo, hi] = FEEDBACK_LIGHTNESS_RANGE[name] ?? [0.02, 0.98];
  return lightness >= lo && lightness <= hi;
};
var MIN_FEEDBACK_DELTA_E = 11;
var MIN_CHROMA = 0.08;
var MAX_CHROMA2 = 0.3;
var wrap = (hue) => (hue % 360 + 360) % 360;
function harmonizeFeedback(brand, names = Object.keys(FEEDBACK_HUES)) {
  const [, c, h] = new Color(brand).to("oklch").coords.map((v) => Number(v) || 0);
  const chroma = Math.min(MAX_CHROMA2, Math.max(MIN_CHROMA, c));
  const result = {};
  for (const name of names) {
    const range = FEEDBACK_HUES[name];
    if (!range) continue;
    const center = (range[0] + range[1]) / 2;
    let best = center;
    let bestDistance = Infinity;
    for (let n2 = 0; n2 < 12; n2 += 1) {
      const hue = wrap(h + n2 * 30);
      const distance3 = Math.abs(hue - center);
      if (hue >= range[0] && hue <= range[1] && distance3 < bestDistance) [best, bestDistance] = [hue, distance3];
    }
    result[name] = [FEEDBACK_LIGHTNESS[name], chroma, Number(best.toFixed(2))];
  }
  return result;
}
function report(labs, required) {
  const names = Object.keys(labs);
  const failing = [];
  let worst;
  for (let i = 0; i < names.length; i += 1)
    for (let j = i + 1; j < names.length; j += 1)
      for (const vision of VISIONS) {
        const deltaE2 = Number(deltaE2000(labs[names[i]][vision], labs[names[j]][vision]).toFixed(2));
        const pair = { a: names[i], b: names[j], vision, deltaE: deltaE2 };
        if (!worst || deltaE2 < worst.deltaE) worst = pair;
        if (deltaE2 < required) failing.push(pair);
      }
  return { pass: failing.length === 0, required, ...worst && { worst }, failing };
}
var visionLabs = (linear) => Object.fromEntries(VISIONS.map((v) => [v, labOfLinear(simulateCvd(linear, v))]));
function checkCvd(colors, required = MIN_FEEDBACK_DELTA_E) {
  const labs = {};
  for (const [name, css] of Object.entries(colors)) {
    const linear = new Color(css).to("srgb-linear").coords.map((v) => Number(v) || 0);
    labs[name] = visionLabs(linear);
  }
  return report(labs, required);
}
var minDeltaE = (a, b2) => Math.min(...VISIONS.map((v) => deltaE2000(a[v], b2[v])));
function searchLightness(start, options, step, required) {
  const names = Object.keys(start);
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6].filter((v, i, a) => a.indexOf(v) === i);
  const options_ = names.map(
    (name) => offsets.map((k) => {
      const [l, c, h] = start[name];
      const value = [l + k * step, c, h];
      return { k, value };
    }).filter(({ k, value }) => k === 0 || lightEnough(name, value[0]) && value[0] > 0.02 && value[0] < 0.98 && options.accepts(name, value)).map(({ k, value }) => ({ k, value, labs: visionLabs(options.realize(value)) }))
  );
  const table = /* @__PURE__ */ new Map();
  const pairMin = (i, a, j, b2) => {
    const key = `${i}.${a}.${j}.${b2}`;
    let value = table.get(key);
    if (value === void 0) table.set(key, value = minDeltaE(options_[i][a].labs, options_[j][b2].labs));
    return value;
  };
  let best;
  const pick = [];
  const walk = (index, min, cost) => {
    if (best?.pass && cost >= best.cost) return;
    if (index === names.length) {
      const pass = min >= required;
      if (!best || pass && (!best.pass || cost < best.cost) || !pass && !best.pass && min > best.min)
        best = { pick: [...pick], pass, cost, min };
      return;
    }
    for (let a = 0; a < options_[index].length; a += 1) {
      let m = min;
      for (let j = 0; j < index; j += 1) m = Math.min(m, pairMin(j, pick[j], index, a));
      if (best?.pass && m < required) continue;
      pick[index] = a;
      walk(index + 1, m, cost + Math.abs(options_[index][a].k));
    }
  };
  walk(0, Infinity, 0);
  return Object.fromEntries(names.map((name, i) => [name, options_[i][best.pick[i]].value]));
}
function separateFeedback(start, options) {
  const required = options.required ?? MIN_FEEDBACK_DELTA_E;
  const step = options.lightnessStep ?? 0.05;
  const colors = searchLightness(start, options, step, required);
  const labs = {};
  for (const [name, value] of Object.entries(colors)) labs[name] = visionLabs(options.realize(value));
  const shortfall = (set2) => report(set2, required).failing.reduce((sum, pair) => sum + (required - pair.deltaE), 0);
  const ranges = (name) => FEEDBACK_HUES[name] ?? [start[name][2] - 15, start[name][2] + 15];
  let current = shortfall(labs);
  for (let move = 0; move < (options.maxMoves ?? 60) && current > 0; move += 1) {
    const involved = new Set(report(labs, required).failing.flatMap((p2) => [p2.a, p2.b]));
    let applied = false;
    for (const kind of ["hue", "chroma", "lightness"]) {
      let best;
      for (const name of involved) {
        const [l, c, h] = colors[name];
        const [lo, hi] = ranges(name);
        const candidates = kind === "hue" ? [[l, c, h + 4], [l, c, h - 4]] : kind === "chroma" ? [[l, c * 1.1, h], [l, c * 0.9, h]] : [[l + step / 2, c, h], [l - step / 2, c, h]];
        for (const value of candidates) {
          if (value[0] <= 0.02 || value[0] >= 0.98 || !lightEnough(name, value[0]) || value[2] < lo || value[2] > hi || value[1] < 0.03) continue;
          if (!options.accepts(name, value)) continue;
          const trial = { ...labs, [name]: visionLabs(options.realize(value)) };
          const score = shortfall(trial);
          if (score < current - 1e-6 && (!best || score < best.score)) best = { name, value, labs: trial[name], score };
        }
      }
      if (best) {
        colors[best.name] = best.value;
        labs[best.name] = best.labs;
        current = best.score;
        applied = true;
        break;
      }
    }
    if (!applied) break;
  }
  const changed = Object.keys(colors).filter((name) => colors[name].some((v, i) => Math.abs(v - start[name][i]) > 1e-9));
  return { colors, report: report(labs, required), changed };
}

// src/theme/roles.ts
var ROLE_KINDS = ["text", "icon", "border", "accent", "feedback", "tint", "on"];
var ROLE_TIERS = ["subtle", "strong", "strongest"];
var ROLE_STATES = ["hover", "active", "selected", "focus"];
var FEEDBACK_NAMES = ["error", "success", "warning", "info"];
var ROLE_FLOORS = {
  wcag2: { text: 4.5, icon: 3, border: 3, accent: 3, feedback: 4.5, tint: 1, on: 4.5 },
  apca: { text: 60, icon: 45, border: 45, accent: 45, feedback: 60, tint: 0, on: 60 }
};
var TIER_CONTRAST = {
  wcag2: { subtle: 4.5, strong: 7.5, strongest: 12 },
  apca: { subtle: 60, strong: 75, strongest: 90 }
};
var TINT_CONTRAST = { wcag2: 1.15, apca: 7.5 };
function inferKind(name) {
  const lower = name.toLowerCase();
  if (/(^|-)on-/.test(lower)) return "on";
  if (/^text(-|$)/.test(lower)) return "text";
  if (/^icon(-|$)/.test(lower)) return "icon";
  if (/(border|outline|divider|focus-ring)/.test(lower)) return "border";
  if (/(background|tint|-bg$)/.test(lower)) return "tint";
  if (FEEDBACK_NAMES.includes(lower)) return "feedback";
  return "accent";
}
function inferTier(name) {
  if (name === "text" || name.endsWith("-strongest")) return "strongest";
  if (name.endsWith("-strong")) return "strong";
  if (name.endsWith("-subtle")) return "subtle";
  return void 0;
}
function pairOf(name) {
  const match = /(?:^|-)on-(.+)$/.exec(name);
  return match?.[1];
}
function normalizeRoleSpec(problems, name, spec, formula, scaleNames, defaultScale) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    problems.push(`roles.${name} must be a color reference like "gray.1400", an object like { "tier": "subtle" }, or null.`);
    return void 0;
  }
  const max = formula === "apca" ? 108 : 21;
  const kind = spec.kind ?? inferKind(name);
  if (!ROLE_KINDS.includes(kind)) {
    problems.push(`roles.${name}.kind must be one of ${ROLE_KINDS.join(", ")}.`);
    return void 0;
  }
  if (spec.tier !== void 0 && !ROLE_TIERS.includes(spec.tier))
    problems.push(`roles.${name}.tier must be one of ${ROLE_TIERS.join(", ")}.`);
  for (const key of ["contrast", "min"]) {
    const value = spec[key];
    if (value !== void 0 && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max))
      problems.push(`roles.${name}.${key} must be a contrast from 0 to ${max} for ${formula}.`);
  }
  if (spec.states !== void 0) {
    if (!Array.isArray(spec.states) || spec.states.some((s) => !ROLE_STATES.includes(s)))
      problems.push(`roles.${name}.states must be a list using ${ROLE_STATES.join(", ")}.`);
    else if (kind === "on" || kind === "tint") problems.push(`roles.${name} is a ${kind} role and can't have states.`);
  }
  const scale = spec.color ?? defaultScale(kind);
  if (kind !== "on") {
    if (spec.color !== void 0 && !scaleNames.has(spec.color))
      problems.push(`roles.${name}.color "${spec.color}" must be the name of one of your colors.`);
    else if (!scale && scaleNames.size > 0) problems.push(`roles.${name} needs a color, for example { "color": "brand" }.`);
  }
  const floor = Math.max(ROLE_FLOORS[formula][kind], spec.min ?? 0);
  const tier = kind === "text" ? spec.tier ?? inferTier(name) ?? "subtle" : spec.tier;
  let contrast2 = spec.contrast;
  if (contrast2 === void 0 && tier) contrast2 = TIER_CONTRAST[formula][tier];
  if (contrast2 === void 0 && kind === "tint") contrast2 = TINT_CONTRAST[formula];
  if (contrast2 === void 0 && kind !== "accent" && kind !== "on") contrast2 = floor;
  const pair = kind === "on" ? pairOf(name) : void 0;
  if (kind === "on" && !pair) problems.push(`roles.${name} is an on-color, so its name needs to say what it sits on, like "text-on-accent".`);
  return {
    name,
    kind,
    ...kind !== "on" && scale && { scale },
    ...contrast2 !== void 0 && { contrast: Math.max(contrast2, kind === "tint" ? 0 : floor) },
    floor,
    ...tier && { tier },
    ...pair && { pair }
  };
}
function expandStates(roles, specs) {
  const result = {};
  for (const [name, role] of Object.entries(roles)) {
    result[name] = role;
    (specs[name]?.states ?? []).forEach((state, index) => {
      const stateName = `${name}-${state}`;
      if (roles[stateName]) return;
      const added = { ...role, name: stateName, base: name, step: index + 1 };
      delete added.tier;
      result[stateName] = added;
    });
  }
  return result;
}

// src/theme/config.ts
var ThemeConfigError = class extends Error {
  constructor(problems) {
    super(`Invalid theme settings:
- ${problems.join("\n- ")}`);
    this.problems = problems;
    this.name = "ThemeConfigError";
  }
  problems;
};
var DEFAULT_WCAG_STEPS = [
  1.06,
  1.15,
  1.32,
  1.6,
  2,
  2.6,
  3.22,
  3.95,
  4.79,
  6.29,
  7.9,
  10,
  12.3,
  14.8,
  17,
  19.5
];
var DEFAULT_APCA_STEPS = [3, 7.5, 15, 27, 39, 51, 60, 67, 73, 82, 88, 93, 98, 102, 104, 105.5];
var DEFAULT_POLARITY = 0.1;
var DEFAULT_SURFACES = {
  raised: { contrast: 1.1, reference: "parent" },
  floating: { contrast: 1.6, reference: "base" }
};
var DEFAULT_MODES = {
  light: { backgroundLightness: 1 },
  dark: { backgroundLightness: 0.15 },
  "light-high-contrast": { backgroundLightness: 1, contrastMultiplier: 1.5 },
  "dark-high-contrast": { backgroundLightness: 0.15, contrastMultiplier: 1.5 },
  "light-low-contrast": { backgroundLightness: 1, contrastMultiplier: 0.8 },
  "dark-low-contrast": { backgroundLightness: 0.15, contrastMultiplier: 0.8 }
};
var DEFAULT_STATUS = {
  success: "green",
  warning: "orange",
  error: "red",
  info: "blue"
};
var BUILT_IN_SCALES = {
  gray: [[0.5692623996686854, 0, 0]],
  red: [[0.675, 30.1, 53.3], [0.5779, 30.4, 51.1], [0.3001, 31.5, 25.5]],
  orange: [[0.7736, 65.1, 43.4], [0.7319, 53, 46.5], [0.49, 42.3, 36.7]],
  green: [[0.7335, 154.2, 44.5], [0.3528, 165.7, 18.4], [0.9011, 156.6, 20]],
  blue: [[0.7893, 258.6, 25.6], [0.5335, 266.7, 59.7], [0.3224, 265.9, 38.9], [0.2409, 268.7, 21.8]]
};
var BASE_SURFACE = "background";
var NAME = /^[a-z0-9][a-z0-9-]*$/i;
var MEDIA = /^[a-z0-9\s():,.-]+$/i;
var GAMUTS = ["srgb", "display-p3", "rec2020"];
var FORMATS = ["oklch", "rgb", "hex", "hsl"];
var CONFIG_KEYS = {
  top: ["$schema", "colors", "background", "steps", "surfaces", "roles", "spacing", "status", "modes", "defaultMode", "formula", "polarityCompensation", "interpolation", "output"],
  color: ["keys", "interpolation"],
  background: ["color", "lightness"],
  step: ["contrast", "opposite"],
  surface: ["contrast", "reference", "color"],
  roleRef: ["ref", "kind"],
  role: ["kind", "color", "contrast", "min", "tier", "states"],
  mode: ["backgroundLightness", "contrastMultiplier", "polarityCompensation", "media"],
  output: ["gamut", "format"]
};
var KEY_HOMES = {
  mode: "each mode, like modes.dark",
  background: "background",
  output: "output",
  role: "a role, like roles.accent",
  surface: "a surface, like surfaces.raised"
};
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function editDistance(a, b2) {
  let row = Array.from({ length: b2.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b2.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b2[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b2.length];
}
function checkKeys(problems, path, value, allowed, hintHome = true) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (allowed.includes(key)) continue;
    const close = allowed.find((name) => name.toLowerCase() === key.toLowerCase() || editDistance(name.toLowerCase(), key.toLowerCase()) <= 2);
    const where = path ? ` in ${path}` : "";
    const home = !hintHome ? void 0 : Object.entries(KEY_HOMES).find(([section]) => CONFIG_KEYS[section].includes(key))?.[1];
    problems.push(
      close ? `Unknown setting "${key}"${where}. Did you mean "${close}"?` : home ? `Unknown setting "${key}"${where}. It belongs in ${home}.` : `Unknown setting "${key}"${where}. Allowed: ${allowed.join(", ")}.`
    );
  }
}
function checkAllKeys(problems, config) {
  const each = (section, path, allowed) => {
    if (!isObject(section)) return;
    for (const [name, value] of Object.entries(section))
      checkKeys(problems, `${path}.${name}`, value, typeof allowed === "function" ? allowed(value) : allowed, path !== "roles");
  };
  checkKeys(problems, "", config, CONFIG_KEYS.top);
  each(config.colors, "colors", CONFIG_KEYS.color);
  checkKeys(problems, "background", config.background, CONFIG_KEYS.background);
  if (!Array.isArray(config.steps)) each(config.steps, "steps", CONFIG_KEYS.step);
  each(config.surfaces, "surfaces", CONFIG_KEYS.surface);
  each(config.roles, "roles", (value) => isRef(value) ? CONFIG_KEYS.roleRef : CONFIG_KEYS.role);
  each(config.modes, "modes", CONFIG_KEYS.mode);
  checkKeys(problems, "output", config.output, CONFIG_KEYS.output);
}
function keyColorStop(css, id) {
  const [lightness, chroma, hue] = new Color(css).to("oklch").coords.map((value) => Number(value));
  const safeChroma = Number.isFinite(chroma) ? chroma : 0;
  return {
    id,
    lightness: Math.min(1, Math.max(0, lightness)),
    chroma: safeChroma / MAX_CHROMA * 100,
    hue: Number.isFinite(hue) && safeChroma > 1e-6 ? hue : 0
  };
}
function isRef(value) {
  return typeof value === "string" || typeof value === "object" && value !== null && "ref" in value;
}
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function inRange(problems, label, value, min, max) {
  if (value === void 0) return;
  if (!isNumber(value) || value < min || value > max) {
    problems.push(`${label} must be a number from ${min} to ${max} (got ${JSON.stringify(value)}).`);
  }
}
function parseKeys(problems, name, input, fallback) {
  const keys = typeof input === "string" ? [input] : Array.isArray(input) ? input : input?.keys;
  const list2 = typeof keys === "string" ? [keys] : keys;
  let interpolation = fallback;
  if (input && typeof input === "object" && !Array.isArray(input) && input.interpolation !== void 0) {
    if (input.interpolation !== "oklch" && input.interpolation !== "rgb") {
      problems.push(`colors.${name}.interpolation must be "oklch" or "rgb".`);
    } else interpolation = input.interpolation;
  }
  if (!Array.isArray(list2) || list2.length === 0) {
    problems.push(`colors.${name} needs at least one key color, such as "#0066ff".`);
    return void 0;
  }
  const stops = [];
  list2.forEach((css, index) => {
    try {
      if (typeof css !== "string") throw new Error();
      stops.push(keyColorStop(css, `${name}-${index}`));
    } catch {
      problems.push(`colors.${name}: "${String(css)}" is not a valid CSS color.`);
    }
  });
  return stops.length === list2.length ? { stops, interpolation } : void 0;
}
function inferMedia(name) {
  const words = name.toLowerCase().split(/[-_\s]+/);
  const queries = [];
  if (words.includes("dark")) queries.push("(prefers-color-scheme: dark)");
  const contrastWord = words.includes("contrast");
  if (contrastWord && words.some((w) => ["high", "more", "increased", "max"].includes(w)))
    queries.push("(prefers-contrast: more)");
  else if (contrastWord && words.some((w) => ["low", "less", "reduced", "min"].includes(w)))
    queries.push("(prefers-contrast: less)");
  return queries.length > 0 ? queries.join(" and ") : void 0;
}
function closestStep(steps, defaults, index) {
  const wanted = defaults[index];
  return steps.reduce(
    (best, step) => Math.abs(step.contrast - wanted) < Math.abs(best.contrast - wanted) ? step : best
  ).name;
}
function validName(problems, label, name) {
  if (NAME.test(name)) return true;
  problems.push(`${label} name "${name}" can only use letters, numbers, and dashes.`);
  return false;
}
function isNeutral(scale) {
  return scale.stops.every((stop) => stop.chroma < 2);
}
function addBuiltIn(scales, name, interpolation) {
  scales.push({
    name,
    stops: BUILT_IN_SCALES[name].map(([lightness, hue, chroma], i) => ({ id: `${name}-${i}`, lightness, hue, chroma })),
    interpolation: name === "gray" ? interpolation : "rgb",
    builtIn: true
  });
}
function normalizeColors(problems, config, interpolation) {
  const scales = [];
  const colors = config.colors;
  if (!colors || typeof colors !== "object" || Array.isArray(colors) || Object.keys(colors).length === 0) {
    problems.push(`colors needs at least one named color, for example { "brand": "#0066ff" }.`);
    return scales;
  }
  for (const [name, input] of Object.entries(colors)) {
    if (!validName(problems, "Color", name)) continue;
    const parsed = parseKeys(problems, name, input, interpolation);
    if (parsed) scales.push({ name, ...parsed, builtIn: false });
  }
  return scales;
}
function pickBackground(problems, config, scales, interpolation) {
  let backgroundScale = config.background?.color;
  if (backgroundScale !== void 0 && !scales.some((s) => s.name === backgroundScale)) {
    problems.push(`background.color "${backgroundScale}" must be the name of one of your colors.`);
  }
  if (backgroundScale === void 0) {
    backgroundScale = scales.find(isNeutral)?.name;
    if (!backgroundScale && scales.length > 0) {
      backgroundScale = "gray";
      if (!scales.some((s) => s.name === "gray")) addBuiltIn(scales, "gray", interpolation);
    }
  }
  inRange(problems, "background.lightness", config.background?.lightness, 0, 1);
  return backgroundScale;
}
function normalizeStatus(problems, config, scales, backgroundScale, roleFirst, interpolation) {
  const statusRoles = {};
  const wantStatus = config.status === void 0 ? !roleFirst : config.status !== false;
  if (!wantStatus) return statusRoles;
  const brand = scales.find((s) => !s.builtIn && !isNeutral(s) && s.name !== backgroundScale);
  const harmonized = roleFirst && config.status === true && brand ? Object.fromEntries(
    Object.entries(harmonizeFeedback(`oklch(${brand.stops[0].lightness} ${brand.stops[0].chroma / 100 * MAX_CHROMA} ${brand.stops[0].hue})`)).map(([name, [l, c, h]]) => [name, `oklch(${l} ${c.toFixed(4)} ${h})`])
  ) : void 0;
  const status = harmonized ?? (config.status === void 0 || config.status === true ? DEFAULT_STATUS : config.status);
  if (typeof status !== "object" || Array.isArray(status)) {
    problems.push("status must be true, false, or an object.");
    return statusRoles;
  }
  for (const [role, value] of Object.entries(status)) {
    if (!validName(problems, "Status", role)) continue;
    if (scales.some((s) => s.name === value)) statusRoles[role] = value;
    else if (BUILT_IN_SCALES[value]) {
      addBuiltIn(scales, value, interpolation);
      statusRoles[role] = value;
    } else {
      const parsed = parseKeys(problems, role, value, interpolation);
      if (!parsed) continue;
      const scaleName = `status-${role}`;
      if (scales.some((s) => s.name === scaleName)) problems.push(`status.${role} conflicts with a color named "${scaleName}".`);
      else {
        scales.push({ name: scaleName, ...parsed, builtIn: false });
        statusRoles[role] = scaleName;
      }
    }
  }
  return statusRoles;
}
function normalizeSteps(problems, config, formula) {
  const stepDefaults = formula === "apca" ? DEFAULT_APCA_STEPS : DEFAULT_WCAG_STEPS;
  const maxContrast = formula === "apca" ? MAX_APCA : 21;
  const minContrast = formula === "apca" ? 0 : 1;
  const rawSteps = Array.isArray(config.steps) ? config.steps.map((value, i) => [String((i + 1) * 100), value]) : config.steps && typeof config.steps === "object" ? Object.entries(config.steps) : stepDefaults.map((value, i) => [String((i + 1) * 100), value]);
  if (config.steps !== void 0 && config.steps !== true && (typeof config.steps !== "object" || config.steps === null))
    problems.push("steps must be true (the default full scale), a list of contrasts, or named steps.");
  else if (config.steps !== void 0 && rawSteps.length === 0) problems.push("steps needs at least one contrast value.");
  const steps = [];
  for (const [name, input] of rawSteps) {
    const contrast2 = typeof input === "object" && input !== null ? input.contrast : input;
    const opposite = typeof input === "object" && input !== null ? input.opposite : void 0;
    validName(problems, "Step", name);
    if (!isNumber(contrast2) || contrast2 < minContrast || contrast2 > maxContrast) {
      problems.push(`steps.${name} must be a contrast from ${minContrast} to ${maxContrast} for ${formula} (got ${JSON.stringify(contrast2)}).`);
      continue;
    }
    if (opposite !== void 0) {
      if (formula === "apca") problems.push(`steps.${name}.opposite only applies to the wcag2 formula.`);
      inRange(problems, `steps.${name}.opposite`, opposite, 1, 21);
    }
    steps.push({ name, contrast: contrast2, ...opposite !== void 0 && { opposite } });
  }
  return { steps, stepDefaults };
}
function normalizeSurfaces(problems, config, scales) {
  const surfaces = [];
  for (const [name, input] of Object.entries(config.surfaces ?? DEFAULT_SURFACES)) {
    validName(problems, "Surface", name);
    if (name === BASE_SURFACE) {
      problems.push(`"${BASE_SURFACE}" is the base surface and is always included; pick another surface name.`);
      continue;
    }
    if (!input || typeof input !== "object") {
      problems.push(`surfaces.${name} must be an object like { "contrast": 1.1 }.`);
      continue;
    }
    inRange(problems, `surfaces.${name}.contrast`, input.contrast, 1, 21);
    if (input.contrast === void 0) problems.push(`surfaces.${name}.contrast is required.`);
    if (input.reference !== void 0 && input.reference !== "base" && input.reference !== "parent")
      problems.push(`surfaces.${name}.reference must be "base" or "parent".`);
    if (input.color !== void 0 && !scales.some((s) => s.name === input.color))
      problems.push(`surfaces.${name}.color "${input.color}" must be the name of one of your colors.`);
    surfaces.push({ name, contrast: input.contrast, reference: input.reference ?? "parent", color: input.color });
  }
  return surfaces;
}
function normalizeModes(problems, config) {
  const modeInput = config.modes ?? DEFAULT_MODES;
  const modes = [];
  if (typeof modeInput !== "object" || Object.keys(modeInput).length === 0) problems.push("modes needs at least one mode.");
  const defaultMode = config.defaultMode ?? Object.keys(modeInput)[0];
  if (config.defaultMode !== void 0 && !(config.defaultMode in modeInput))
    problems.push(`defaultMode "${config.defaultMode}" is not one of your modes.`);
  for (const [name, mode] of Object.entries(modeInput)) {
    validName(problems, "Mode", name);
    const m = mode ?? {};
    inRange(problems, `modes.${name}.backgroundLightness`, m.backgroundLightness, 0, 1);
    inRange(problems, `modes.${name}.contrastMultiplier`, m.contrastMultiplier, 0, MAX_CONTRAST_MULTIPLIER);
    inRange(problems, `modes.${name}.polarityCompensation`, m.polarityCompensation, 0, 1);
    if (m.media !== void 0 && m.media !== false && (typeof m.media !== "string" || !MEDIA.test(m.media) || /url\(/i.test(m.media)))
      problems.push(`modes.${name}.media must be a CSS media query like "(prefers-color-scheme: dark)", or false.`);
    const media = name === defaultMode ? void 0 : m.media === false ? void 0 : m.media ?? inferMedia(name);
    modes.push({
      name,
      backgroundLightness: m.backgroundLightness ?? config.background?.lightness ?? 1,
      contrastMultiplier: m.contrastMultiplier ?? 1,
      polarityCompensation: m.polarityCompensation ?? config.polarityCompensation ?? DEFAULT_POLARITY,
      ...media && { media }
    });
  }
  return { modes, defaultMode };
}
function defaultRoles({ roleFirst, neutral, statusRoles, steps, stepDefaults }, accentScale) {
  const defaults = {};
  if (roleFirst) {
    Object.assign(defaults, { text: {}, "text-subtle": {}, border: {} });
    if (accentScale) Object.assign(defaults, { accent: { color: accentScale, states: ["hover", "active"] }, "text-on-accent": {} });
    for (const [role, scale] of Object.entries(statusRoles)) {
      defaults[role] = { kind: "feedback", color: scale };
      defaults[`${role}-background`] = { kind: "tint", color: scale };
    }
  } else if (steps.length > 0 && neutral) {
    const at = (index) => closestStep(steps, stepDefaults, index);
    Object.assign(defaults, {
      text: `${neutral}.${at(13)}`,
      "text-subtle": `${neutral}.${at(9)}`,
      "text-disabled": `${neutral}.${at(5)}`,
      border: `${neutral}.${at(3)}`,
      "border-strong": `${neutral}.${at(6)}`
    });
    if (accentScale)
      Object.assign(defaults, {
        accent: `${accentScale}.${at(8)}`,
        "accent-hover": `${accentScale}.${at(9)}`,
        "accent-active": `${accentScale}.${at(10)}`,
        "text-on-accent": `surface.${BASE_SURFACE}`
      });
    for (const [role, scale] of Object.entries(statusRoles)) {
      defaults[role] = `${scale}.${at(8)}`;
      defaults[`${role}-background`] = `${scale}.${at(0)}`;
      defaults[`${role}-border`] = `${scale}.${at(6)}`;
    }
  }
  return defaults;
}
function normalizeRoles(problems, config, inputs) {
  const { formula, scales, neutral, statusRoles, steps, surfaces } = inputs;
  const statusScales = new Set(Object.values(statusRoles));
  const accentScale = (scales.find((s) => !s.builtIn && !isNeutral(s) && !statusScales.has(s.name) && s.name !== neutral) ?? scales.find((s) => !s.builtIn && !isNeutral(s) && !statusScales.has(s.name)) ?? scales.find((s) => !s.builtIn && !isNeutral(s)))?.name;
  const merged = defaultRoles(inputs, accentScale);
  const userRoles = config.roles ?? {};
  if (typeof userRoles !== "object" || Array.isArray(userRoles)) problems.push("roles must be an object.");
  else
    for (const [role, value] of Object.entries(userRoles)) {
      validName(problems, "Role", role);
      if (value === null) delete merged[role];
      else merged[role] = value;
    }
  for (const role of Object.keys(merged)) {
    const pair = pairOf(role);
    if (typeof merged[role] !== "object" || isRef(merged[role]) || role in userRoles || !pair) continue;
    if (!(pair in merged)) delete merged[role];
    else if (isRef(merged[pair])) merged[role] = `surface.${BASE_SURFACE}`;
  }
  const scaleNames = new Set(scales.map((s) => s.name));
  const stepNames = new Set(steps.map((s) => s.name));
  const surfaceNames = /* @__PURE__ */ new Set([BASE_SURFACE, ...surfaces.map((s) => s.name)]);
  const available = `Your scales are: ${scales.map((s) => s.name).join(", ") || "none"}.`;
  const defaultScale = (kind) => kind === "accent" ? accentScale ?? neutral : kind === "feedback" ? void 0 : neutral;
  const normalized = {};
  const specs = {};
  const referencedSteps = /* @__PURE__ */ new Set();
  for (const [role, value] of Object.entries(merged)) {
    if (isRef(value)) {
      const ref = typeof value === "string" ? value : value.ref;
      const kind = typeof value === "string" ? inferKind(role) : value.kind ?? inferKind(role);
      if (typeof value === "object" && !ROLE_KINDS.includes(kind)) problems.push(`roles.${role}.kind must be one of ${ROLE_KINDS.join(", ")}.`);
      const [group, item, extra] = typeof ref === "string" ? ref.split(".") : [];
      const valid = extra === void 0 && (group === "surface" ? surfaceNames.has(item) : scaleNames.has(group) && stepNames.has(item));
      if (!valid)
        problems.push(`roles.${role} "${String(ref)}" must point to a color step like "${neutral ?? "gray"}.${steps.at(-3)?.name ?? "1400"}" or a surface like "surface.${BASE_SURFACE}". ${available}`);
      else if (group !== "surface") referencedSteps.add(item);
      const checked = role in userRoles && group !== "surface" && kind !== "on" && !/disabled/i.test(role);
      normalized[role] = { name: role, kind, ref, floor: checked ? ROLE_FLOORS[formula]?.[kind] ?? 0 : 0 };
    } else {
      const result = normalizeRoleSpec(problems, role, value, formula, scaleNames, defaultScale);
      if (result) {
        normalized[role] = result;
        specs[role] = value;
      }
    }
  }
  const roles = expandStates(normalized, specs);
  for (const role of Object.values(roles))
    if (role.pair && (!roles[role.pair] || roles[role.pair].kind === "on" || roles[role.pair].ref))
      problems.push(`roles.${role.name} sits on "${role.pair}", which must be a generated role (not a reference or another on-color).`);
  return { roles, referencedSteps };
}
function checkNameCollisions(problems, scales, roles) {
  const used = /* @__PURE__ */ new Map();
  const claim = (key, owner) => {
    const previous = used.get(key);
    if (previous) problems.push(`The name "${key}" is used by both ${previous} and ${owner}; rename one of them.`);
    else used.set(key, owner);
  };
  claim("surface", "the surface group");
  scales.forEach((s) => claim(s.name, `color "${s.name}"`));
  Object.keys(roles).forEach((role) => claim(role, `role "${role}"`));
}
function normalizeConfig(config) {
  const problems = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new ThemeConfigError(["The theme settings must be an object."]);
  }
  checkAllKeys(problems, config);
  const formula = config.formula ?? "wcag2";
  if (formula !== "wcag2" && formula !== "apca") problems.push(`formula must be "wcag2" or "apca".`);
  const gamut = config.output?.gamut ?? "rec2020";
  const format = config.output?.format ?? "oklch";
  if (!GAMUTS.includes(gamut)) problems.push(`output.gamut must be one of ${GAMUTS.join(", ")}.`);
  if (!FORMATS.includes(format)) problems.push(`output.format must be one of ${FORMATS.join(", ")}.`);
  if ((format === "hex" || format === "hsl") && gamut !== "srgb")
    problems.push(`output.format "${format}" only works with output.gamut "srgb". Use "oklch" or "rgb" for wide gamuts.`);
  const interpolation = config.interpolation ?? "oklch";
  if (interpolation !== "oklch" && interpolation !== "rgb") problems.push(`interpolation must be "oklch" or "rgb".`);
  inRange(problems, "polarityCompensation", config.polarityCompensation, 0, 1);
  const roleFirst = config.steps === void 0;
  const scales = normalizeColors(problems, config, interpolation);
  const backgroundScale = pickBackground(problems, config, scales, interpolation);
  const statusRoles = normalizeStatus(problems, config, scales, backgroundScale, roleFirst, interpolation);
  const { steps, stepDefaults } = normalizeSteps(problems, config, formula);
  const surfaces = normalizeSurfaces(problems, config, scales);
  const { modes, defaultMode } = normalizeModes(problems, config);
  const { roles, referencedSteps } = normalizeRoles(problems, config, {
    formula,
    roleFirst,
    scales,
    neutral: backgroundScale,
    statusRoles,
    steps,
    stepDefaults,
    surfaces
  });
  if (config.spacing !== void 0 && config.spacing !== false && (!isNumber(config.spacing) || config.spacing < 0.01 || config.spacing > 0.2))
    problems.push("spacing must be false or a lightness step from 0.01 to 0.2.");
  checkNameCollisions(problems, scales, roles);
  if (problems.length > 0) throw new ThemeConfigError(problems);
  return {
    formula,
    gamut,
    format,
    scales,
    backgroundScale,
    steps,
    surfaces,
    roles,
    modes,
    defaultMode,
    roleFirst,
    outputSteps: roleFirst ? steps.map((s) => s.name).filter((name) => referencedSteps.has(name)) : steps.map((s) => s.name),
    spacing: config.spacing
  };
}

// src/theme/values.ts
var SAFETY = 1.0002;
var round = (value, places) => Number(value.toFixed(places));
var floor4 = (value) => Math.floor(value * 1e4 + 1e-7) / 1e4;
function hexOf(css) {
  const srgb = new Color(css).toGamut({ space: "srgb", method: "css" }).to("srgb");
  return `#${srgb.coords.map((c) => Math.round(Math.min(1, Math.max(0, Number(c) || 0)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function oklchOf(css) {
  const [l, c, h] = new Color(css).to("oklch").coords.map(Number);
  const chroma = Number.isFinite(c) ? c : 0;
  return [round(l, 4), round(chroma, 4), chroma < 1e-4 || !Number.isFinite(h) ? 0 : round(h, 2)];
}
function colorValue(css, contrast2, target) {
  const capped = contrast2 + 1e-6 < target;
  return {
    css,
    hex: hexOf(css),
    oklch: oklchOf(css),
    contrast: floor4(contrast2),
    target: round(target, 4),
    ...capped && { capped: true }
  };
}
function describeTarget(formula, value) {
  return formula === "apca" ? `Lc ${round(value, 1)}` : `${round(value, 2)}:1`;
}
function strengthenHex(hex, against, minimum, measure) {
  if (measure(hex, against) + 1e-6 >= minimum) return hex;
  const [l, c, h] = new Color(hex).to("oklch").coords.map((v) => Number(v) || 0);
  const darker = Number(new Color(against).to("oklch").coords[0]) > l;
  for (let i = 1; i <= 200; i += 1) {
    const lightness = darker ? l - i * 2e-3 : l + i * 2e-3;
    if (lightness < 0 || lightness > 1) break;
    const candidate = hexOf(new Color("oklch", [lightness, c, h]).toString());
    if (measure(candidate, against) >= minimum * SAFETY) return candidate;
  }
  return void 0;
}

// src/theme/spacing.ts
var DEFAULT_STEP = 0.05;
var MIN_STEP = 0.035;
var MAX_STEP = 0.07;
function lightnessScale(background, gamut, formula, dark) {
  const bgY = luminance(background, gamut);
  const backgroundL = Math.cbrt(Math.max(0, bgY));
  const bgApca = formula === "apca" ? apcaLuminanceOfLinear(background, gamut) : 0;
  const maxDistance = dark ? backgroundL : 1 - backgroundL;
  const contrastAt = (distance3) => {
    const l = Math.min(1, Math.max(0, backgroundL + (dark ? -1 : 1) * Math.min(distance3, maxDistance)));
    const y = l ** 3;
    return formula === "apca" ? Math.abs(apcaFromLuminance(apcaLuminanceOfLinear([y, y, y], "srgb"), bgApca)) : contrastRatio(y, bgY);
  };
  const distanceFor = (target) => {
    if (contrastAt(maxDistance) <= target) return maxDistance;
    let low = 0;
    let high = maxDistance;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (contrastAt(mid) < target) low = mid;
      else high = mid;
    }
    return high;
  };
  return { backgroundL, dark, maxDistance, contrastAt, distanceFor };
}
function snapWith(items, step, maxDistance) {
  const sorted = [...items].sort((a, b2) => a.distance - b2.distance);
  const distances = {};
  let cost = 0;
  let previous;
  for (const item of sorted) {
    let k = Math.max(1, Math.round(item.distance / step), Math.ceil(item.floor / step - 1e-9));
    if (previous) k = Math.max(k, item.distance > previous.distance + 1e-6 ? previous.k + 1 : previous.k);
    const distance3 = Math.min(k * step, maxDistance);
    distances[item.id] = distance3;
    cost += Math.abs(distance3 - item.distance);
    previous = { k, distance: item.distance };
  }
  return { cost, distances };
}
function snapToSteps(items, maxDistance, fixedStep) {
  const steps = [];
  if (fixedStep !== void 0) steps.push(fixedStep);
  else for (let s = MIN_STEP; s <= MAX_STEP + 1e-9; s += 25e-4) steps.push(Number(s.toFixed(4)));
  let best = { step: steps[0], ...snapWith(items, steps[0], maxDistance) };
  for (const step of steps.slice(1)) {
    const result = snapWith(items, step, maxDistance);
    if (result.cost <= best.cost + 1e-9) best = { step, ...result };
  }
  return { step: best.step, distances: best.distances };
}

// src/theme/roleGeneration.ts
function roleTools(roles, ctx) {
  const { formula, gamut } = ctx;
  const max = formula === "apca" ? MAX_APCA : 21;
  const dark = formula === "apca" ? ctx.apcaDark : luminance(ctx.background, gamut) > 0.1791;
  const scale = lightnessScale(ctx.background, gamut, formula, dark);
  const floorOf = (role) => Math.min(max, Math.max(role.floor, ctx.adjust(role.floor)));
  const statesOf = (name) => roles.filter((r) => r.base === name).sort((a, b2) => (a.step ?? 0) - (b2.step ?? 0));
  const onFloor = (pair) => {
    const on = roles.find((r) => r.kind === "on" && r.pair === pair);
    const floor = on?.floor ?? ROLE_FLOORS[formula].on;
    return Math.min(max, Math.max(floor, ctx.adjust(floor)));
  };
  const cache = /* @__PURE__ */ new Map();
  const gen = (scaleName, target) => {
    const aim = Math.min(max, target * SAFETY);
    const key = `${scaleName}|${aim}`;
    let swatch = cache.get(key);
    if (!swatch) {
      const data = ctx.scaleData(scaleName);
      if (formula === "apca") {
        const g2 = generateApcaColor(data, ctx.background, ctx.backgroundCss, aim, ctx.output, ctx.apcaDark);
        swatch = { css: g2.css, linear: g2.linear, contrast: g2.measuredContrast };
      } else {
        const g2 = generateColors(data, ctx.background, aim).opaque;
        swatch = { css: g2.css, linear: g2.linear, contrast: g2.measuredContrast };
      }
      cache.set(key, swatch);
    }
    return swatch;
  };
  const onOptions = [
    { css: ctx.backgroundCss, linear: ctx.background },
    { css: outputColorCss([1, 1, 1], ctx.output), linear: [1, 1, 1] },
    ctx.darkest
  ];
  const fast = (text, surface) => formula === "apca" ? Math.abs(apcaFromLuminance(apcaLuminanceOfLinear(text, gamut), apcaLuminanceOfLinear(surface, gamut))) : contrastRatio(luminance(text, gamut), luminance(surface, gamut));
  const measure = (text, surface) => formula === "apca" ? Math.abs(apcaContrast(text, surface)) : measureOutputContrast(text, surface, gamut);
  const pickOn = (surfaces, minimum) => {
    const scored = onOptions.map((option) => ({
      option,
      min: Math.min(...surfaces.map((s) => fast(option.linear, s.linear)))
    }));
    const passes = (min) => min >= minimum * SAFETY;
    if (passes(scored[0].min)) return { ...scored[0], passes: true };
    const best = scored.slice(1).sort((a, b2) => b2.min - a.min)[0];
    return { ...best, passes: passes(best.min) };
  };
  return { max, scale, floorOf, statesOf, onFloor, gen, fast, measure, pickOn };
}
function separateFeedbackRoles(generated, ctx, tools, step, painted) {
  const { gamut } = ctx;
  const { floorOf, fast, pickOn, onFloor, measure } = tools;
  const { values, swatches, missed } = painted;
  const feedbackRoles = generated.filter((r) => r.kind === "feedback" && !r.base && swatches[r.name]);
  if (feedbackRoles.length < 2) return void 0;
  const realize = ([l, c, h]) => gamutClamp(l, c, h, gamut);
  const result = separateFeedback(
    Object.fromEntries(feedbackRoles.map((r) => [r.name, [...linearToOklch(convertLinearGamut(swatches[r.name].linear, gamut, "srgb"))]])),
    {
      realize: (value) => convertLinearGamut(realize(value), gamut, "srgb"),
      accepts: (name, value) => {
        const role = feedbackRoles.find((r) => r.name === name);
        const linear = realize(value);
        if (fast(linear, ctx.background) < floorOf(role) * SAFETY) return false;
        const hasOn = generated.some((r) => r.kind === "on" && r.pair === name);
        return !hasOn || pickOn([{ css: "", linear, contrast: 0 }], onFloor(name)).passes;
      },
      lightnessStep: step
    }
  );
  for (const name of result.changed) {
    const role = feedbackRoles.find((r) => r.name === name);
    const linear = realize(result.colors[name]);
    const css = outputColorCss(linear, ctx.output);
    const contrast2 = measure(css, ctx.backgroundCss);
    swatches[name] = { css, linear, contrast: contrast2 };
    const target = contrast2 >= values[name].target ? values[name].target : floorOf(role);
    values[name] = { ...values[name], ...colorValue(css, contrast2, target) };
    if (contrast2 >= target) delete values[name].capped;
    if (contrast2 + 1e-6 < floorOf(role)) missed.push({ role: name, target: floorOf(role), contrast: contrast2 });
  }
  return { ...result.report, changed: result.changed };
}
function pickOnColors(generated, tools, painted) {
  const { floorOf, statesOf, pickOn, measure } = tools;
  const { values, swatches, missed } = painted;
  for (const role of generated) {
    if (role.kind !== "on") continue;
    const surfaces = [role.pair, ...statesOf(role.pair).map((s) => s.name)].filter((name) => swatches[name]);
    const minimum = floorOf(role);
    const pick = pickOn(surfaces.map((name) => swatches[name]), minimum);
    const measured = Math.min(...surfaces.map((name) => measure(pick.option.css, swatches[name].css)));
    values[role.name] = { ...colorValue(pick.option.css, measured, minimum), minimum: round(minimum, 4), against: role.pair };
    if (measured + 1e-6 < minimum) missed.push({ role: role.name, target: minimum, contrast: measured });
  }
}
function generateRoles(roles, ctx) {
  const tools = roleTools(roles, ctx);
  const { max, scale, floorOf, statesOf, onFloor, gen, pickOn } = tools;
  const generated = roles.filter((r) => !r.ref);
  const requested = {};
  for (const role of generated) {
    if (role.base || role.kind === "on" || role.contrast === void 0) continue;
    requested[role.name] = role.kind === "tint" ? Math.min(max, ctx.adjust(role.contrast)) : Math.min(max, Math.max(floorOf(role), ctx.adjust(role.contrast)));
  }
  const distances = {};
  for (const [name, target] of Object.entries(requested)) distances[name] = scale.distanceFor(target);
  const original = { ...distances };
  const accents = generated.filter((r) => r.kind === "accent" && !r.base && r.contrast === void 0);
  const searchAccent = (role, candidates, step2) => {
    const brand = ctx.keyLightness(role.scale);
    const states = statesOf(role.name);
    const minimum = onFloor(role.name);
    const floor = floorOf(role);
    let best;
    let fallback;
    for (const distance3 of candidates) {
      const base = gen(role.scale, Math.max(floor, scale.contrastAt(distance3)));
      const surfaces = [base, ...states.map((s) => gen(s.scale, Math.max(floor, scale.contrastAt(distance3 + (s.step ?? 0) * step2))))];
      const on = pickOn(surfaces, minimum);
      const cost = Math.abs(oklchOf(base.css)[0] - brand);
      if (on.passes && (!best || cost < best.cost)) best = { distance: distance3, cost };
      if (!fallback || on.min > fallback.min) fallback = { distance: distance3, min: on.min };
    }
    return (best ?? fallback)?.distance ?? scale.distanceFor(floor);
  };
  const grid2 = (from, step2) => {
    const list2 = [];
    for (let d2 = from; d2 <= scale.maxDistance + 1e-9; d2 += step2) list2.push(d2);
    return list2.length > 0 ? list2 : [scale.maxDistance];
  };
  let step = typeof ctx.spacing === "number" ? ctx.spacing : DEFAULT_STEP;
  for (const accent of accents) {
    distances[accent.name] = searchAccent(accent, grid2(scale.distanceFor(floorOf(accent)), 5e-3), step);
    original[accent.name] = distances[accent.name];
    requested[accent.name] = Math.max(floorOf(accent), scale.contrastAt(distances[accent.name]));
  }
  const spaced = generated.filter((r) => !r.base && r.kind !== "on" && r.kind !== "tint" && r.name in distances);
  if (ctx.spacing !== false && spaced.length > 0) {
    const result = snapToSteps(
      spaced.map((r) => ({ id: r.name, distance: distances[r.name], floor: scale.distanceFor(floorOf(r)) })),
      scale.maxDistance,
      typeof ctx.spacing === "number" ? ctx.spacing : void 0
    );
    step = result.step;
    Object.assign(distances, result.distances);
    for (const accent of accents) {
      const first = Math.ceil(scale.distanceFor(floorOf(accent)) / step - 1e-9) * step;
      distances[accent.name] = searchAccent(accent, grid2(first, step), step);
    }
  }
  const values = {};
  const swatches = {};
  const adjustments = [];
  const missed = [];
  for (const role of generated) {
    if (role.kind === "on") continue;
    const floor = floorOf(role);
    let target;
    if (role.base) target = Math.max(floor, scale.contrastAt(distances[role.base] + (role.step ?? 0) * step));
    else if (Math.abs(distances[role.name] - original[role.name]) < 1e-9 && role.kind !== "accent") target = requested[role.name];
    else target = role.kind === "tint" ? requested[role.name] : Math.max(floor, scale.contrastAt(distances[role.name]));
    const swatch = gen(role.scale, target);
    swatches[role.name] = swatch;
    values[role.name] = {
      ...colorValue(swatch.css, swatch.contrast, target),
      scale: role.scale,
      ...role.kind !== "tint" && { minimum: round(floor, 4) }
    };
    if (role.kind !== "tint" && swatch.contrast + 1e-6 < floor) missed.push({ role: role.name, target: floor, contrast: swatch.contrast });
    if (!role.base && Math.abs(target - requested[role.name]) > 5e-3 * requested[role.name])
      adjustments.push({ role: role.name, requested: round(requested[role.name], 2), used: round(target, 2) });
  }
  const painted = { values, swatches, missed };
  const feedback = separateFeedbackRoles(generated, ctx, tools, step, painted);
  pickOnColors(generated, tools, painted);
  return { values, step, adjustments, missed, ...feedback && { feedback } };
}

// src/theme/generateTheme.ts
function engineDocument(n2, mode, output, scales) {
  const surfaces = [
    { id: BASE_SURFACE, name: BASE_SURFACE, base: true },
    ...n2.surfaces.map((s) => ({
      id: s.name,
      name: s.name,
      reference: s.reference,
      contrast: s.contrast,
      ...s.color ? { sourceScaleId: s.color } : { source: "base" }
    }))
  ];
  const document = {
    backgroundScaleId: n2.backgroundScale,
    backgroundLightness: mode.backgroundLightness,
    scales,
    contrasts: n2.formula === "wcag2" ? n2.steps.map((step) => ({
      id: step.name,
      value: step.contrast,
      ...step.opposite !== void 0 && { oppositeValue: step.opposite }
    })) : [],
    surfaces,
    settings: {
      colorOutput: output,
      contrastReference: "light",
      polarityCompensation: mode.polarityCompensation,
      contrastMultiplier: mode.contrastMultiplier
    }
  };
  const context = polarityContext(document);
  const adjust = n2.formula === "apca" ? (value) => Math.min(MAX_APCA, value * mode.contrastMultiplier) : (value) => multiplyContrast(effectiveContrast({ value }, context), mode.contrastMultiplier);
  return { document: applyContrastMultiplier(applyPolarityCompensation(document)), adjust };
}
function generateTheme(config) {
  const n2 = normalizeConfig(config);
  const output = { authoringGamut: n2.gamut, outputFormat: n2.format, mapOutputsToSrgb: false };
  const gamut = n2.gamut;
  const scales = n2.scales.map((s) => ({
    id: s.name,
    name: s.name,
    stops: s.stops,
    interpolation: s.interpolation
  }));
  const warnings = [];
  const notes = [];
  const issues = [];
  const report2 = (level, code, mode, colors, message) => {
    (level === "warning" ? warnings : notes).push(message);
    issues.push({ level, code, mode, colors, message });
  };
  const adjustments = [];
  const modes = {};
  const outputSteps = new Set(n2.outputSteps);
  const generatedRoles = Object.values(n2.roles).filter((role) => !role.ref);
  const keyLightness = (name) => n2.scales.find((s) => s.name === name)?.stops[0]?.lightness ?? 0.5;
  const scaleData = (name) => buildScaleData(scales.find((s) => s.id === name), output);
  let darkest;
  for (const mode of n2.modes) {
    const { document, adjust } = engineDocument(n2, mode, output, scales);
    const backgroundCss = outputColorCss(resolvedBackgroundLinear(document), output);
    const background = parsedOutputLinear(backgroundCss, gamut);
    const apcaDark = n2.formula === "apca" ? apcaPrefersDark(background, gamut) : false;
    const missed = [];
    const missedNames = [];
    let maxedOut = 0;
    const scaleValues = {};
    for (const scale of scales) {
      const data = buildScaleData(scale, output);
      const values = {};
      n2.steps.forEach((step, index) => {
        if (!outputSteps.has(step.name)) return;
        let value;
        if (n2.formula === "apca") {
          const target = Math.min(MAX_APCA, step.contrast * mode.contrastMultiplier);
          const generated2 = generateApcaColor(data, background, backgroundCss, Math.min(MAX_APCA, target * SAFETY), output, apcaDark);
          value = colorValue(generated2.css, generated2.measuredContrast, target);
        } else {
          const target = document.contrasts[index].value;
          const aim = Math.min(21, target * SAFETY);
          const generated2 = generateColors(data, background, aim).opaque;
          value = colorValue(generated2.css, generated2.measuredContrast, target);
        }
        const isEndpoint = value.oklch[1] === 0 && (value.oklch[0] >= 0.9999 || value.oklch[0] <= 1e-4);
        if (value.capped && isEndpoint && mode.contrastMultiplier > 1) maxedOut += 1;
        else if (value.capped) {
          missedNames.push(`${scale.name}.${step.name}`);
          missed.push(`${scale.name}.${step.name} (wanted ${describeTarget(n2.formula, value.target)}, got ${describeTarget(n2.formula, value.contrast)})`);
        }
        values[step.name] = value;
      });
      if (Object.keys(values).length > 0) scaleValues[scale.name] = values;
    }
    const surfaceValues = {};
    let parent;
    let parentCss = backgroundCss;
    for (const surface of document.surfaces) {
      const linear = surfaceLinear(surface, document, parent);
      const css = outputColorCss(linear, output);
      const referenceCss = surface.base ? css : surface.reference === "base" ? backgroundCss : parentCss;
      const target = surface.contrast ?? 1;
      const value = colorValue(css, measureOutputContrast(css, referenceCss, gamut), target);
      if (value.capped) missed.push(`surface.${surface.name} (wanted ${round(target, 2)}:1, got ${value.contrast}:1)`);
      surfaceValues[surface.name] = value;
      parent = linear;
      parentCss = css;
    }
    let generated;
    if (generatedRoles.length > 0) {
      if (!darkest) {
        const g2 = generateColors(scaleData(n2.backgroundScale), [1, 1, 1], 21).opaque;
        darkest = { css: g2.css, linear: g2.linear };
      }
      generated = generateRoles(generatedRoles, {
        formula: n2.formula,
        output,
        gamut,
        background,
        backgroundCss,
        apcaDark,
        scaleData,
        keyLightness,
        adjust,
        darkest,
        spacing: n2.spacing
      });
      for (const item of generated.missed) {
        missedNames.push(item.role);
        missed.push(`${item.role} (needs at least ${describeTarget(n2.formula, item.target)}, got ${describeTarget(n2.formula, item.contrast)})`);
      }
      for (const item of generated.adjustments) adjustments.push({ mode: mode.name, ...item });
      const cvd = generated.feedback;
      if (cvd && !cvd.pass && cvd.worst)
        report2(
          "warning",
          "feedback-too-similar",
          mode.name,
          [cvd.worst.a, cvd.worst.b],
          `In "${mode.name}" mode, the feedback colors ${cvd.worst.a} and ${cvd.worst.b} are too similar${cvd.worst.vision === "normal" ? "" : ` for people with ${cvd.worst.vision} color vision`} (difference ${cvd.worst.deltaE}, needs ${cvd.required}). Try a different brand color, or set the feedback colors yourself in "status".`
        );
    }
    const roles = {};
    const maxContrast = n2.formula === "apca" ? MAX_APCA : 21;
    const weakRefs = [];
    const weakRefNames = /* @__PURE__ */ new Set();
    for (const [name, role] of Object.entries(n2.roles)) {
      if (!role.ref) {
        roles[name] = generated.values[name];
        continue;
      }
      const [group, item] = role.ref.split(".");
      const source = group === "surface" ? surfaceValues[item] : scaleValues[group][item];
      if (role.floor <= 0) {
        roles[name] = { ...source, ref: role.ref };
        continue;
      }
      const minimum = Math.min(maxContrast, Math.max(role.floor, adjust(role.floor)));
      roles[name] = { ...source, ref: role.ref, minimum: round(minimum, 4) };
      if (source.contrast + 1e-6 < minimum) {
        weakRefNames.add(name);
        weakRefs.push(`${name} \u2192 ${role.ref} (needs at least ${describeTarget(n2.formula, minimum)} for ${role.kind}, got ${describeTarget(n2.formula, source.contrast)})`);
      }
    }
    if (weakRefs.length > 0)
      report2(
        "warning",
        "reference-below-minimum",
        mode.name,
        [...weakRefNames],
        `In "${mode.name}" mode, ${weakRefs.length} role${weakRefs.length === 1 ? " points" : "s point"} to a step below the minimum contrast for its kind: ${weakRefs.slice(0, 4).join("; ")}${weakRefs.length > 4 ? `; and ${weakRefs.length - 4} more` : ""}. Point it to a stronger step, or if it is decorative, write it as { "ref": "...", "kind": "tint" }.`
      );
    const measureHex = (hex, against) => n2.formula === "apca" ? Math.abs(apcaContrast(hex, against)) : measureOutputContrast(hex, against, "srgb");
    const hexMissed = [];
    const hexMissedNames = [];
    const byPair = Object.entries(roles).sort(([, a], [, b2]) => Number(Boolean(a.against)) - Number(Boolean(b2.against)));
    for (const [name, value] of byPair) {
      if (value.minimum === void 0 || weakRefNames.has(name)) continue;
      const against = value.against ? roles[value.against]?.hex : surfaceValues[BASE_SURFACE].hex;
      if (!against) continue;
      const fixed = value.ref ? void 0 : strengthenHex(value.hex, against, value.minimum, measureHex);
      if (fixed) {
        value.hex = fixed;
        continue;
      }
      const pair = value.against ? roles[value.against] : void 0;
      if (pair && !pair.ref && pair.minimum !== void 0) {
        const moved = strengthenHex(pair.hex, value.hex, value.minimum, measureHex);
        if (moved && measureHex(moved, surfaceValues[BASE_SURFACE].hex) + 1e-6 >= pair.minimum) {
          pair.hex = moved;
          continue;
        }
      }
      const contrast2 = measureHex(value.hex, against);
      if (contrast2 + 1e-6 < value.minimum) {
        hexMissedNames.push(name);
        hexMissed.push(`${name} (${value.hex}: ${describeTarget(n2.formula, Math.floor(contrast2 * 100) / 100)}, needs ${describeTarget(n2.formula, value.minimum)})`);
      }
    }
    if (hexMissed.length > 0)
      report2(
        "warning",
        "hex-below-minimum",
        mode.name,
        hexMissedNames,
        `In "${mode.name}" mode, the sRGB hex fallback for ${hexMissed.length} role${hexMissed.length === 1 ? "" : "s"} falls below the minimum contrast: ${hexMissed.slice(0, 4).join("; ")}${hexMissed.length > 4 ? `; and ${hexMissed.length - 4} more` : ""}. Use the "css" values, or set "output.gamut" to "srgb" if you must ship hex.`
      );
    if (missed.length > 0) {
      const shown = missed.slice(0, 4).join("; ");
      const more = missed.length > 4 ? `; and ${missed.length - 4} more` : "";
      report2(
        "warning",
        "target-missed",
        mode.name,
        missedNames,
        `In "${mode.name}" mode, ${missed.length} color${missed.length === 1 ? "" : "s"} could not reach the contrast target, so the closest possible color was used: ${shown}${more}. To fix this, lower those targets or the contrast multiplier, or move the background lightness closer to white or black.`
      );
    }
    if (maxedOut > 0) {
      report2(
        "note",
        "maxed-out",
        mode.name,
        [],
        `In "${mode.name}" mode, the contrast multiplier asked for more contrast than is possible on ${maxedOut} step${maxedOut === 1 ? "" : "s"}, so ${maxedOut === 1 ? "it uses" : "they use"} the strongest color available (pure black or white). This is expected for high-contrast modes.`
      );
    }
    modes[mode.name] = {
      name: mode.name,
      settings: {
        backgroundLightness: mode.backgroundLightness,
        contrastMultiplier: mode.contrastMultiplier,
        polarityCompensation: mode.polarityCompensation
      },
      ...mode.media && { media: mode.media },
      background: surfaceValues[BASE_SURFACE],
      scales: scaleValues,
      surfaces: surfaceValues,
      roles,
      ...generated && { spacing: generated.step },
      ...generated?.feedback && { feedback: generated.feedback }
    };
  }
  return {
    formula: n2.formula,
    gamut,
    format: n2.format,
    defaultMode: n2.defaultMode,
    steps: n2.outputSteps,
    modes,
    adjustments,
    warnings,
    notes,
    issues
  };
}

// src/output/css.ts
function roleTarget(ref, prefix) {
  const [group, item] = ref.split(".");
  return group === "surface" ? `--${prefix}-surface-${item}` : `--${prefix}-${group}-${item}`;
}
function cssVariables(mode, prefix = "color") {
  if (typeof prefix !== "string" || !/^[a-z][a-z0-9-]*$/i.test(prefix))
    throw new Error(`The CSS variable prefix must start with a letter and use only letters, numbers, and dashes (got ${JSON.stringify(prefix)}).`);
  const vars = {};
  for (const [scale, steps] of Object.entries(mode.scales))
    for (const [step, value] of Object.entries(steps)) vars[`--${prefix}-${scale}-${step}`] = value.css;
  for (const [name, value] of Object.entries(mode.surfaces)) vars[`--${prefix}-surface-${name}`] = value.css;
  for (const [role, value] of Object.entries(mode.roles))
    vars[`--${prefix}-${role}`] = value.ref ? `var(${roleTarget(value.ref, prefix)})` : value.css;
  return vars;
}
function declarations(mode, prefix, indent, colorScheme = true) {
  const lines = colorScheme ? [`${indent}color-scheme: ${mode.settings.backgroundLightness < 0.5 ? "dark" : "light"};`] : [];
  for (const [name, value] of Object.entries(cssVariables(mode, prefix))) lines.push(`${indent}${name}: ${value};`);
  return lines.join("\n");
}
var block = (selector, body, indent = "") => `${indent}${selector} {
${body}
${indent}}`;
var scheme = (mode) => mode.settings.backgroundLightness < 0.5 ? "dark" : "light";
function contrastLevel(mode) {
  if (mode.media?.includes("prefers-contrast: more")) return "more";
  if (mode.media?.includes("prefers-contrast: less")) return "less";
  const words = mode.name.toLowerCase().split(/[-_\s]+/);
  if (!words.includes("contrast")) return void 0;
  if (words.some((w) => ["high", "more", "increased", "max"].includes(w))) return "more";
  if (words.some((w) => ["low", "less", "reduced", "min"].includes(w))) return "less";
  return void 0;
}
function toCss(theme, options = {}) {
  const prefix = options.prefix ?? "color";
  const parts = [`/* Generated by chromagentic. Contrast formula: ${theme.formula}. Gamut: ${theme.gamut}. */`];
  const defaultMode = theme.modes[theme.defaultMode];
  if (options.tailwind) {
    parts.push(block("@theme", declarations(defaultMode, prefix, "  ", false)));
    parts.push(block(":root", `  color-scheme: ${scheme(defaultMode)};`));
    parts.push(block(`[data-theme="${theme.defaultMode}"]`, declarations(defaultMode, prefix, "  ")));
  } else {
    parts.push(block(`:root, [data-theme="${theme.defaultMode}"]`, declarations(defaultMode, prefix, "  ")));
  }
  const modes = Object.values(theme.modes);
  const others = modes.filter((mode) => mode.name !== theme.defaultMode);
  const baseOf = (mode) => {
    const candidates = modes.filter((m) => m !== mode && !contrastLevel(m) && scheme(m) === scheme(mode));
    return candidates.find((m) => mode.name.startsWith(`${m.name}-`)) ?? candidates[0];
  };
  const variants = others.filter((mode) => contrastLevel(mode) && baseOf(mode));
  const auto = (mode) => variants.includes(mode) ? ":root:not([data-theme]):not([data-contrast])" : ":root:not([data-theme])";
  const withMedia = others.filter((mode) => mode.media).sort((a, b2) => a.media.split(" and ").length - b2.media.split(" and ").length);
  for (const mode of withMedia)
    parts.push(block(`@media ${mode.media}`, block(auto(mode), declarations(mode, prefix, "    "), "  ")));
  for (const mode of others) {
    const pair = variants.includes(mode) ? `, [data-theme="${baseOf(mode).name}"][data-contrast="${contrastLevel(mode)}"]` : "";
    parts.push(block(`[data-theme="${mode.name}"]${pair}`, declarations(mode, prefix, "  ")));
  }
  for (const mode of [...variants].sort((a, b2) => Number(scheme(a) === "dark") - Number(scheme(b2) === "dark"))) {
    const level = contrastLevel(mode);
    const base = baseOf(mode);
    const chosen = `:root:not([data-theme])[data-contrast="${level}"]`;
    parts.push(
      scheme(mode) === "dark" ? block("@media (prefers-color-scheme: dark)", block(chosen, declarations(mode, prefix, "    "), "  ")) : block(chosen, declarations(mode, prefix, "  "))
    );
    parts.push(block(`@media (prefers-contrast: ${level})`, block(`[data-theme="${base.name}"]:not([data-contrast])`, declarations(mode, prefix, "    "), "  ")));
  }
  return `${parts.join("\n\n")}
`;
}

// src/output/dtcg.ts
var SPACE = {
  oklch: { colorjs: "oklch", dtcg: "oklch" },
  srgb: { colorjs: "srgb", dtcg: "srgb" },
  "display-p3": { colorjs: "p3", dtcg: "display-p3" },
  rec2020: { colorjs: "rec2020", dtcg: "rec2020" }
};
function token(value, theme) {
  const space = theme.format === "oklch" ? SPACE.oklch : SPACE[theme.gamut];
  const components = new Color(value.css).to(space.colorjs).coords.map((c, i) => {
    const n2 = Number(c);
    if (!Number.isFinite(n2)) return 0;
    return Number(n2.toFixed(i === 2 && space.dtcg === "oklch" ? 2 : 5));
  });
  return {
    $type: "color",
    $value: { colorSpace: space.dtcg, components, hex: value.hex },
    $extensions: {
      chromagentic: { contrast: value.contrast, target: value.target, formula: theme.formula, ...value.capped && { capped: true } }
    }
  };
}
function toDtcg(theme, modeName = theme.defaultMode) {
  const mode = theme.modes[modeName];
  if (!mode) throw new Error(`Mode "${modeName}" does not exist. Modes: ${Object.keys(theme.modes).join(", ")}.`);
  const color = {};
  for (const [scale, steps] of Object.entries(mode.scales)) {
    const group = {};
    for (const [step, value] of Object.entries(steps)) group[step] = token(value, theme);
    color[scale] = group;
  }
  const surface = {};
  for (const [name, value] of Object.entries(mode.surfaces)) surface[name] = token(value, theme);
  color.surface = surface;
  for (const [role, value] of Object.entries(mode.roles))
    color[role] = value.ref ? { $type: "color", $value: `{color.${value.ref}}` } : token(value, theme);
  return { $description: `chromagentic "${mode.name}" mode`, color };
}
function toDtcgModes(theme) {
  return Object.fromEntries(Object.keys(theme.modes).map((name) => [name, toDtcg(theme, name)]));
}

// src/output/platform.ts
var WIDE = "Modern browsers and design tokens support wide-gamut OKLCH, so colors keep their full range and older screens map them down automatically.";
var P3 = "This platform is built around Display P3, so colors are limited to P3 and written as P3 red, green, and blue values.";
var SRGB = "This technology only reliably supports sRGB, so colors are mapped into sRGB and written as hex.";
var TABLE = {
  web: { gamut: "rec2020", format: "oklch", reason: WIDE },
  css: { gamut: "rec2020", format: "oklch", reason: WIDE },
  tailwind: { gamut: "rec2020", format: "oklch", reason: WIDE },
  dtcg: { gamut: "rec2020", format: "oklch", reason: WIDE },
  ios: { gamut: "display-p3", format: "rgb", reason: P3 },
  swiftui: { gamut: "display-p3", format: "rgb", reason: P3 },
  uikit: { gamut: "display-p3", format: "rgb", reason: P3 },
  macos: { gamut: "display-p3", format: "rgb", reason: P3 },
  visionos: { gamut: "display-p3", format: "rgb", reason: P3 },
  android: { gamut: "display-p3", format: "rgb", reason: P3 },
  compose: { gamut: "display-p3", format: "rgb", reason: P3 },
  flutter: { gamut: "srgb", format: "hex", reason: SRGB },
  "react-native": { gamut: "srgb", format: "hex", reason: SRGB },
  email: { gamut: "srgb", format: "hex", reason: SRGB },
  legacy: { gamut: "srgb", format: "hex", reason: SRGB }
};
var PLATFORMS = Object.keys(TABLE);
function platformOutput(platform) {
  const entry = TABLE[platform];
  if (!entry) throw new Error(`Unknown platform "${platform}". Choose one of: ${PLATFORMS.join(", ")}.`);
  return { ...entry };
}

// src/describe/words.ts
var f = (name, nouns, meanings, effects, usage, extra = {}) => ({
  name,
  nouns: nouns.split(", "),
  meanings: meanings.split(", "),
  effects: effects.split(", "),
  usage: usage.split(", "),
  ...extra
});
var FAMILIES = {
  red: f("red", "red, cherry, ruby, tomato, scarlet", "passion, energy, love, urgency, courage, excitement, danger", "excite, energize, alert, stimulate", "sales, food, sports, alerts, action", { light: ["coral", "salmon"], dark: ["maroon", "wine", "burgundy"], earthy: true }),
  orange: f("orange", "orange, tangerine, pumpkin, apricot, amber", "enthusiasm, warmth, creativity, friendliness, fun, adventure, playful, cozy, autumn", "energize, cheer, invite, excite", "food, kids, entertainment, sports, action", { light: ["peach"], dark: ["rust", "copper"], earthy: true }),
  yellow: f("yellow", "yellow, gold, sunflower, lemon, sunshine", "happiness, optimism, joy, attention, caution, summer", "cheer, energize, uplift, attract", "highlights, kids, food, summer, caution", { light: ["butter", "cream"], dark: ["mustard"], earthy: true }),
  green: f("green", "green, leaf, grass, emerald, fern", "nature, growth, health, freshness, balance, renewal, harmony, ecology", "calm, refresh, restore, reassure", "environment, health, finance, wellness, outdoors, organic", { light: ["mint", "lime"], dark: ["forest", "pine"], earthy: true }),
  teal: f("teal", "teal, turquoise, aqua, cyan, lagoon", "clarity, calm, healing, balance, ocean, sophistication, modern", "calm, refresh, soothe", "health, wellness, technology, spa, travel", { light: ["seafoam"], dark: ["petrol"] }),
  blue: f("blue", "blue, sky, ocean, sapphire, cobalt", "trust, calm, stability, dependability, intelligence, peace, professionalism, security, loyalty, modern", "calm, reassure, focus, cool", "finance, technology, healthcare, corporate, banking, links", { light: ["ice"], dark: ["navy", "midnight"] }),
  purple: f("purple", "purple, violet, plum, amethyst, iris", "luxury, royalty, creativity, mystery, wisdom, spirituality, imagination", "inspire, intrigue, soothe", "beauty, luxury, creative, wellness, premium", { light: ["lavender", "lilac"], dark: ["eggplant", "aubergine"] }),
  pink: f("pink", "pink, rose, magenta, fuchsia, raspberry", "romance, playfulness, tenderness, sweetness, fun, compassion, youth, playful", "soothe, delight, charm, excite", "beauty, fashion, kids, sweets, cosmetics", { light: ["blush", "petal"], dark: ["berry"] }),
  brown: f("brown", "brown, chocolate, coffee, wood, earth, clay, chestnut, terracotta", "earth, nature, stability, comfort, reliability, warmth, rustic, grounded, cozy, autumn", "ground, comfort, reassure", "coffee, food, outdoors, furniture, bakery, organic", { earthy: true }),
  olive: f("olive", "olive, khaki, moss, sage, earth", "nature, peace, earth, tradition, grounded, autumn", "ground, calm", "outdoors, organic, food, fashion", { earthy: true }),
  tan: f("tan", "tan, sand, beige, oat, wheat, latte, earth", "simplicity, warmth, comfort, earth, natural, softness, cozy", "calm, ground, soften", "backgrounds, interiors, fashion, organic, bakery", { earthy: true }),
  black: f("black", "black, ink, charcoal, coal, night", "power, elegance, sophistication, formality, mystery, luxury, authority", "contrast, focus, intimidate", "luxury, fashion, typography, technology"),
  grey: f("grey", "grey, gray, stone, slate, ash, silver, concrete, fog", "neutrality, balance, professionalism, restraint, calm, modern, minimal", "neutralize, balance, recede", "backgrounds, interfaces, typography, corporate"),
  white: f("white", "white, snow, cloud, paper, porcelain", "purity, simplicity, cleanliness, clarity, peace, minimalism", "open, refresh, clarify", "backgrounds, healthcare, minimal, weddings")
};
var inHue = (h, from, to2) => from <= to2 ? h >= from && h < to2 : h >= from || h < to2;
function familyOf(l, c, h) {
  if (c < 0.025) return l < 0.3 ? FAMILIES.black : l > 0.93 ? FAMILIES.white : FAMILIES.grey;
  if (inHue(h, 15, 38)) return l < 0.6 && c < 0.13 ? FAMILIES.brown : l >= 0.8 ? FAMILIES.pink : FAMILIES.red;
  if (inHue(h, 38, 75)) return l < 0.6 ? FAMILIES.brown : l >= 0.75 && c < 0.08 ? FAMILIES.tan : FAMILIES.orange;
  if (inHue(h, 75, 115)) return l < 0.65 ? FAMILIES.olive : l >= 0.75 && c < 0.08 ? FAMILIES.tan : FAMILIES.yellow;
  if (inHue(h, 115, 170)) return FAMILIES.green;
  if (inHue(h, 170, 220)) return FAMILIES.teal;
  if (inHue(h, 220, 285)) return FAMILIES.blue;
  if (inHue(h, 285, 335)) return FAMILIES.purple;
  return FAMILIES.pink;
}
function temperatureOf(c, h) {
  if (c < 0.025) return "neutral";
  if (inHue(h, 330, 105)) return "warm";
  if (inHue(h, 150, 290)) return "cool";
  return "neutral";
}
var ADJECTIVES = [
  ["bright", (l, c) => l >= 0.6 && c >= 0.12],
  ["vivid", (_, c) => c >= 0.15],
  ["brilliant", (l, c) => l >= 0.6 && c >= 0.18],
  ["saturated", (_, c) => c >= 0.18],
  ["rich", (l, c) => c >= 0.1 && l >= 0.35 && l < 0.7],
  ["deep", (l, c) => l < 0.45 && c >= 0.06],
  ["dark", (l) => l < 0.45],
  ["light", (l) => l >= 0.75],
  ["pale", (l, c) => l >= 0.82 && c <= 0.1],
  ["pastel", (l, c) => l >= 0.78 && c >= 0.04 && c < 0.14],
  ["soft", (l, c) => l >= 0.65 && c >= 0.025 && c < 0.12],
  ["muted", (l, c) => l < 0.82 && c >= 0.025 && c < 0.09],
  ["dusty", (l, c) => l >= 0.5 && l < 0.8 && c >= 0.03 && c < 0.08],
  ["mellow", (l, c, _, t) => t === "warm" && l >= 0.55 && l < 0.85 && c >= 0.04 && c < 0.12],
  ["earthy", (l, c, family) => !!family.earthy && l >= 0.35 && l < 0.75 && c >= 0.03 && c < 0.14],
  ["calm", (l, c, family) => ["green", "teal", "blue", "olive"].includes(family.name) && c < 0.13 || l >= 0.6 && c < 0.08],
  ["fresh", (l, c, family) => ["green", "teal"].includes(family.name) && l >= 0.65 && c >= 0.08],
  ["energetic", (_, c, __, t) => t === "warm" && c >= 0.15],
  ["playful", (l, c, family) => ["red", "orange", "yellow", "pink", "purple", "green"].includes(family.name) && l >= 0.6 && c >= 0.12],
  ["cozy", (l, c, _, t) => t === "warm" && l >= 0.35 && l < 0.7 && c >= 0.04 && c < 0.14],
  ["moody", (l, c) => l < 0.4 && c < 0.1],
  ["neutral", (_, c) => c < 0.025]
];
function adjectivesOf(l, c, family, temperature) {
  return ADJECTIVES.filter(([, test]) => test(l, c, family, temperature)).map(([word]) => word);
}

// src/describe/describe.ts
var STOPWORDS = new Set(
  "a an and are as at be but by colors colour colours color feel feeling for from give has have i in into is it its like look looks make me more most my of on or our please so some that the theme this to very want we website site app with".split(
    " "
  )
);
var SUFFIXES = ["iness", "ness", "ing", "ful", "ous", "ish", "ity", "ly", "ed", "es", "s", "y"];
function stem(word) {
  for (const suffix of SUFFIXES)
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  return word;
}
function wordsMatch(a, b2) {
  if (a === b2) return true;
  const sa = stem(a);
  const sb = stem(b2);
  return sa === sb || sa.length >= 5 && sb.length >= 5 && sa.slice(0, 5) === sb.slice(0, 5);
}
function promptWords(prompt) {
  const seen = /* @__PURE__ */ new Set();
  for (const word of prompt.toLowerCase().split(/[^a-z]+/))
    if (word.length > 1 && !STOPWORDS.has(word)) seen.add(word);
  return [...seen];
}
var tokens = (phrase) => phrase.toLowerCase().split(/[^a-z]+/).filter(Boolean);
function list(words) {
  return words.length < 2 ? words[0] ?? "" : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
function wordsFor(l, c, h) {
  const family = familyOf(l, c, h);
  const temperature = temperatureOf(c, h);
  const nouns = [...l >= 0.78 && family.light || l < 0.45 && family.dark || [], ...family.nouns];
  const words = adjectivesOf(l, c, family, temperature);
  if (words.length === 0) words.push(family.name);
  return {
    summary: list(words.slice(0, 3)),
    words,
    nouns,
    meanings: family.meanings,
    effects: family.effects,
    usage: family.usage,
    temperature: [temperature]
  };
}
function describeColor(color) {
  const [l, c, h] = new Color(color).toGamut({ space: "srgb", method: "css" }).to("oklch").coords.map((v) => Number(v) || 0);
  return wordsFor(l, c, h);
}
var grid;
function colorGrid() {
  if (grid) return grid;
  grid = [];
  for (let l = 0.35; l <= 0.9001; l += 0.05)
    for (let c = 0.03; c <= 0.2701; c += 0.03)
      for (let h = 0; h < 360; h += 15) {
        const color = new Color("oklch", [l, c, h]);
        if (!color.inGamut("srgb")) continue;
        const css = `oklch(${round(l * 100, 2)}% ${round(c, 3)} ${h})`;
        const d2 = wordsFor(l, c, h);
        const words = (items) => new Set(items.flatMap(tokens));
        const lab = color.to("oklab").coords.map(Number);
        grid.push({
          css,
          oklch: [round(l, 4), round(c, 4), h],
          lab,
          categories: [
            { weight: 1, tokens: words(d2.words.slice(0, 3)) },
            { weight: 3, tokens: words(d2.words) },
            { weight: 3, tokens: words(d2.nouns) },
            { weight: 2, tokens: words([...d2.meanings, ...d2.effects, ...d2.usage, ...d2.temperature]) }
          ],
          summary: d2.summary
        });
      }
  return grid;
}
function scoreWord(entry, word) {
  let total = 0;
  for (const category of entry.categories) {
    for (const token2 of category.tokens)
      if (wordsMatch(word, token2)) {
        total += category.weight;
        break;
      }
  }
  return total;
}
var median = (values) => {
  const sorted = [...values].sort((a, b2) => a - b2);
  return sorted[Math.floor(sorted.length / 2)];
};
function sortTiesByTypicality(items) {
  let start = 0;
  while (start < items.length) {
    let end = start;
    while (end < items.length && items[end].score === items[start].score && items[end].matched.length === items[start].matched.length)
      end += 1;
    const group = items.slice(start, end);
    const l = median(group.map((item) => item.entry.oklch[0]));
    const c = median(group.map((item) => item.entry.oklch[1]));
    const away = (entry) => Math.hypot(entry.oklch[0] - l, (entry.oklch[1] - c) * 2);
    group.sort((a, b2) => away(a.entry) - away(b2.entry));
    items.splice(start, group.length, ...group);
    start = end;
  }
}
var distance2 = (a, b2) => Math.hypot(a.lab[0] - b2.lab[0], a.lab[1] - b2.lab[1], a.lab[2] - b2.lab[2]);
function suggestColors(prompt, options = {}) {
  const count = Math.max(1, Math.floor(options.count ?? 6));
  const words = promptWords(prompt);
  const matchedWords = /* @__PURE__ */ new Set();
  const entries = colorGrid();
  const scored = entries.map((entry) => {
    const matched = [];
    let score = 0;
    for (const word of words) {
      const value = scoreWord(entry, word);
      if (value > 0) {
        matched.push(word);
        matchedWords.add(word);
        score += value;
      }
    }
    return { entry, matched, score };
  }).filter((item) => item.score > 0).sort((a, b2) => b2.matched.length - a.matched.length || b2.score - a.score);
  sortTiesByTypicality(scored);
  const picks = [];
  for (const item of scored) {
    if (picks.length >= count) break;
    if (picks.every((pick) => distance2(pick.entry, item.entry) > 0.06)) picks.push(item);
  }
  return {
    colors: picks.map(({ entry, matched, score }) => ({
      css: entry.css,
      hex: new Color(entry.css).to("srgb").toString({ format: "hex", collapse: false }),
      oklch: entry.oklch,
      score,
      matched,
      summary: entry.summary
    })),
    matchedWords: words.filter((word) => matchedWords.has(word)),
    unmatchedWords: words.filter((word) => !matchedWords.has(word))
  };
}

// src/math/contrast.ts
function linearSrgb(color) {
  const coords = new Color(color).to("srgb-linear").coords.map((value) => Number(value) || 0);
  return [coords[0], coords[1], coords[2]];
}
function wcagContrast(first, second) {
  return contrastRatio(luminance(linearSrgb(first)), luminance(linearSrgb(second)));
}
function contrast(foreground, background, formula = "wcag2") {
  return formula === "apca" ? Math.abs(apcaContrast(foreground, background)) : wcagContrast(foreground, background);
}

// src/theme/feedbackColors.ts
function feedbackColors(brand, options = {}) {
  const theme = generateTheme({ ...options, colors: { brand }, status: true, roles: { accent: null } });
  const modes = {};
  for (const [name, mode] of Object.entries(theme.modes)) {
    const colors = {};
    for (const role of FEEDBACK_NAMES) {
      const { css, hex, oklch, contrast: contrast2, target, capped } = mode.roles[role];
      colors[role] = { css, hex, oklch, contrast: contrast2, target, ...capped && { capped } };
    }
    modes[name] = { colors, ...mode.feedback && { check: mode.feedback } };
  }
  return { modes, warnings: theme.warnings, issues: theme.issues };
}

// src/cli/run.ts
var EXIT = { ok: 0, input: 2, failed: 3 };
var HELP = `chromagentic: accessible, perceptual UI color for AI agents

Usage:
  chromagentic generate <theme.json | -> [--format css|tailwind|dtcg|json] [--platform <name>] [--out <path>] [--strict]
      Generate colors for every mode from a settings file ("-" reads it from standard input).
      Prints to the screen unless --out is given.
      --format    css (default), tailwind (Tailwind v4 @theme), dtcg (design tokens), or json (everything)
      --platform  pick the gamut and format for a platform: ${PLATFORMS.join(", ")}
      --out       file to write; for dtcg, a folder that gets one <mode>.tokens.json per mode
      --strict    fail if there are any warnings: missed targets or minimums. Notes never fail.

  chromagentic validate <theme.json | -> [--strict]   Check a settings file and list warnings, without printing colors
  chromagentic suggest "<words>" [--count 6]     Candidate key colors for words like "calm and earthy"
  chromagentic describe <color>                  Describe a color in plain words
  chromagentic contrast <text> <background> [--formula wcag2|apca]   Measure contrast
  chromagentic feedback <brand> [--formula wcag2|apca]
      Error, success, warning, and info colors that match the brand, for every default mode,
      checked so each pair stays distinct for color-blind users (protan, deutan, tritan)
  chromagentic check-cvd <name=color>... [--min 11]
      Check that colors stay distinct (CIEDE2000) in typical vision and each color-blind simulation.

  Add --json to any command to get one JSON object on standard output:
      { ok, engineVersion, errors, warnings, notes, output }
  Exit codes: 0 success, 2 bad input or settings, 3 a check failed (--strict or check-cvd).

  chromagentic --help | --version
`;
var CliError = class extends Error {
};
var Output = class {
  constructor(io, json) {
    this.io = io;
    this.json = json;
  }
  io;
  json;
  result;
  warnings = [];
  notes = [];
  files = [];
  failure;
  data(value, text = `${JSON.stringify(value, null, 2)}
`) {
    this.result = value;
    if (!this.json) this.io.stdout(text);
  }
  warn(item) {
    this.warnings.push(item);
    if (!this.json) this.io.stderr(`Warning: ${item.message}
`);
  }
  note(item) {
    this.notes.push(item);
    if (!this.json) this.io.stderr(`Note: ${item.message}
`);
  }
  wrote(path, message) {
    this.files.push(path);
    if (!this.json) this.io.stderr(message);
  }
  info(message) {
    if (!this.json) this.io.stderr(message);
  }
  fail(message) {
    this.failure = message;
    if (!this.json) this.io.stderr(message);
  }
};
var toMessage = ({ code, mode, colors, message }) => ({ code, mode, colors, message });
async function readConfig(path, io) {
  let text;
  const label = path === "-" ? "standard input" : `"${path}"`;
  try {
    if (path === "-") {
      if (!io.stdin) throw new Error();
      text = await io.stdin();
    } else text = await readFile(resolve(io.cwd, path), "utf8");
  } catch {
    throw new CliError(`Can't read the settings file ${label}. Check the path and try again.`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`The settings file ${label} is not valid JSON: ${error.message}`);
  }
}
function reportTheme(theme, out, strict) {
  for (const issue of theme.issues) (issue.level === "warning" ? out.warn : out.note).call(out, toMessage(issue));
  const moved = /* @__PURE__ */ new Map();
  for (const a of theme.adjustments) moved.set(a.role, [...moved.get(a.role) ?? [], `${a.mode} ${a.requested}\u2192${a.used}`]);
  if (moved.size > 0)
    out.note({
      code: "targets-moved",
      message: `To keep contrast steps even, these targets moved: ${[...moved].map(([role, list2]) => `${role} (${list2.join(", ")})`).join("; ")}.`
    });
  if (strict && theme.warnings.length > 0)
    out.fail(`Failed --strict: ${theme.warnings.length} warning${theme.warnings.length === 1 ? "" : "s"} above.
`);
}
async function generate(args, io, out) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      format: { type: "string", default: "css" },
      platform: { type: "string" },
      out: { type: "string" },
      strict: { type: "boolean", default: false }
    }
  });
  if (positionals.length !== 1) throw new CliError("Give one settings file, for example: chromagentic generate theme.json");
  const format = values.format;
  if (!["css", "tailwind", "dtcg", "json"].includes(format))
    throw new CliError(`--format must be css, tailwind, dtcg, or json (got "${format}").`);
  const config = await readConfig(positionals[0], io);
  if (values.platform) {
    if (!PLATFORMS.includes(values.platform))
      throw new CliError(`Unknown platform "${values.platform}". Choose one of: ${PLATFORMS.join(", ")}.`);
    const { gamut, format: colorFormat } = platformOutput(values.platform);
    const chosen = { gamut, format: colorFormat };
    const replaced = ["gamut", "format"].filter((key) => config.output?.[key] !== void 0 && config.output[key] !== chosen[key]);
    if (replaced.length > 0)
      out.note({
        code: "platform-override",
        message: `--platform ${values.platform} replaces ${replaced.map((key) => `output.${key} "${config.output[key]}"`).join(" and ")} from the settings file with gamut "${gamut}" and format "${colorFormat}".`
      });
    config.output = { ...config.output, gamut, format: colorFormat };
  }
  const theme = generateTheme(config);
  reportTheme(theme, out, values.strict);
  const outPath = values.out ? resolve(io.cwd, values.out) : void 0;
  if (format === "dtcg") {
    const documents = toDtcgModes(theme);
    if (outPath) {
      await mkdir(outPath, { recursive: true });
      for (const [mode, document] of Object.entries(documents)) {
        const file = join(outPath, `${mode}.tokens.json`);
        await writeFile(file, `${JSON.stringify(document, null, 2)}
`);
        out.files.push(file);
      }
      out.info(`Wrote ${Object.keys(documents).length} token files to ${values.out}
`);
    } else out.data(documents);
  } else {
    const result = format === "json" ? { engineVersion: io.version, ...theme } : toCss(theme, { tailwind: format === "tailwind" });
    const text = typeof result === "string" ? result : `${JSON.stringify(result, null, 2)}
`;
    if (outPath) {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, text);
      out.wrote(outPath, `Wrote ${values.out}
`);
    } else out.data(result, text);
  }
}
async function validate(args, io, out) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { strict: { type: "boolean", default: false } } });
  if (positionals.length !== 1) throw new CliError("Give one settings file, for example: chromagentic validate theme.json");
  const theme = generateTheme(await readConfig(positionals[0], io));
  reportTheme(theme, out, values.strict);
  const modes = Object.keys(theme.modes);
  const roles = Object.keys(theme.modes[theme.defaultMode].roles);
  out.data(
    { modes, roles, warnings: theme.warnings.length },
    `The settings are valid: ${modes.length} mode${modes.length === 1 ? "" : "s"} (${modes.join(", ")}) and ${roles.length} role${roles.length === 1 ? "" : "s"}${theme.warnings.length > 0 ? `, with ${theme.warnings.length} warning${theme.warnings.length === 1 ? "" : "s"}` : ""}.
`
  );
}
function suggest(args, out) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { count: { type: "string" } } });
  if (positionals.length === 0) throw new CliError('Give some words, for example: chromagentic suggest "calm and earthy"');
  const count = values.count === void 0 ? void 0 : Number(values.count);
  if (count !== void 0 && !(count >= 1)) throw new CliError("--count must be a number of 1 or more.");
  const result = suggestColors(positionals.join(" "), { count });
  out.data(result);
  if (result.colors.length === 0)
    out.note({ code: "no-match", message: "No colors matched those words. Try more common descriptive words such as bright, calm, warm, or elegant." });
}
function parseColorArgs(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`That doesn't look like a CSS color. ${error.message}`);
  }
}
function describeCommand(args, out) {
  if (args.length === 0) throw new CliError("Give a color, for example: chromagentic describe #ff5a00");
  out.data(parseColorArgs(() => describeColor(args.join(" "))));
}
function parseFormula(value) {
  if (value !== "wcag2" && value !== "apca") throw new CliError(`--formula must be wcag2 or apca (got "${value}").`);
  return value;
}
function contrastCommand(args, out) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { formula: { type: "string", default: "wcag2" } } });
  if (positionals.length !== 2) throw new CliError("Give two colors, for example: chromagentic contrast #333 #fff");
  const formula = parseFormula(values.formula);
  const value = parseColorArgs(() => contrast(positionals[0], positionals[1], formula));
  const rounded = formula === "apca" ? Number(value.toFixed(1)) : Math.floor(value * 100) / 100;
  const text = formula === "apca" ? `Lc ${rounded.toFixed(1)}` : `${rounded.toFixed(2)}:1`;
  out.data({ formula, contrast: rounded, text }, `${text}
`);
}
function feedbackCommand(args, out) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { formula: { type: "string", default: "wcag2" } } });
  if (positionals.length !== 1) throw new CliError("Give one brand color, for example: chromagentic feedback #0066ff");
  const formula = parseFormula(values.formula);
  const result = parseColorArgs(() => feedbackColors(positionals[0], { formula }));
  for (const issue of result.issues) (issue.level === "warning" ? out.warn : out.note).call(out, toMessage(issue));
  out.data(result.modes);
}
function checkCvdCommand(args, out) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { min: { type: "string" } } });
  if (positionals.length < 2) throw new CliError("Give two or more colors, for example: chromagentic check-cvd error=#d32f2f success=#2e7d32");
  const required = values.min === void 0 ? MIN_FEEDBACK_DELTA_E : Number(values.min);
  if (!(required > 0)) throw new CliError("--min must be a number above 0.");
  const colors = {};
  positionals.forEach((item, index) => {
    const at = item.indexOf("=");
    colors[at > 0 ? item.slice(0, at) : `color${index + 1}`] = at > 0 ? item.slice(at + 1) : item;
  });
  const result = parseColorArgs(() => checkCvd(colors, required));
  out.data(result);
  if (!result.pass) out.fail(`${result.failing.length} pair${result.failing.length === 1 ? " is" : "s are"} too similar (needs a difference of ${required}).
`);
}
function inputError(error) {
  if (error instanceof ThemeConfigError) return [error.message];
  if (error instanceof CliError) return [error.message];
  if (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS"))
    return [`${error.message}
Run "chromagentic --help" for usage.`];
  return void 0;
}
async function run(argv, io) {
  const json = argv.includes("--json");
  const [command, ...rest] = argv.filter((arg) => arg !== "--json");
  const out = new Output(io, json);
  let errors = [];
  try {
    switch (command) {
      case "generate":
        await generate(rest, io, out);
        break;
      case "validate":
        await validate(rest, io, out);
        break;
      case "suggest":
        suggest(rest, out);
        break;
      case "describe":
        describeCommand(rest, out);
        break;
      case "contrast":
        contrastCommand(rest, out);
        break;
      case "feedback":
        feedbackCommand(rest, out);
        break;
      case "check-cvd":
        checkCvdCommand(rest, out);
        break;
      case "--version":
      case "-v":
        out.data({ version: io.version ?? "unknown" }, `${io.version ?? "unknown"}
`);
        break;
      case void 0:
      case "help":
      case "--help":
      case "-h":
        out.data({ help: HELP }, HELP);
        break;
      default:
        throw new CliError(`Unknown command "${command}". Run "chromagentic --help" for the list of commands.`);
    }
  } catch (error) {
    const problems = inputError(error);
    if (!problems) throw error;
    errors = error instanceof ThemeConfigError ? error.problems : problems;
    if (!json) io.stderr(`${problems[0]}
`);
  }
  const code = errors.length > 0 ? EXIT.input : out.failure ? EXIT.failed : EXIT.ok;
  if (json) {
    const report2 = {
      ok: code === EXIT.ok,
      engineVersion: io.version ?? "unknown",
      errors: errors.map((message) => ({ message })),
      ...out.failure && { failed: out.failure.trim() },
      warnings: out.warnings,
      notes: out.notes,
      ...out.files.length > 0 && { files: out.files },
      ...out.result !== void 0 && { output: out.result }
    };
    io.stdout(`${JSON.stringify(report2, null, 2)}
`);
  }
  return code;
}

// src/cli/index.ts
run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  version: "0.3.0",
  stdin: async () => {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`Something went wrong: ${error instanceof Error ? error.stack : String(error)}
`);
    process.exitCode = 1;
  }
);
