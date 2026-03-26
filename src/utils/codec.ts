const fromCharCode = String.fromCharCode;

export function throwSyntaxError(
  bytes: Uint8Array,
  index: number,
  message?: string,
): never {
  const c = bytes[index];
  let line = 1;
  let column = 0;
  for (let i = 0; i < index; i++) {
    if (bytes[i] === 10) {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  throw new SyntaxError(
    message
      ? message
      : index === bytes.length
      ? "Unexpected end of input while parsing JSON"
      : c >= 32 && c <= 126
      ? `Unexpected character ${
        fromCharCode(c)
      } in JSON at position ${index} (line ${line}, column ${column})`
      : `Unexpected byte 0x${
        c.toString(16)
      } in JSON at position ${index} (line ${line}, column ${column})`,
  );
}

export function JSON_parse(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("JSON input must be a Uint8Array");
  }
  const propertyStack: unknown[] = [];
  const objectStack: unknown[] = [];
  const stateStack: number[] = [];
  const length = bytes.length;
  let property: unknown = null;
  let state = 0;
  let object: unknown;
  let i = 0;

  enum State {
    TopLevel,
    Array,
    Object,
  }

  while (i < length) {
    let c = bytes[i++];
    if (c <= 32) {
      continue;
    }
    let value: unknown;

    if (state === State.Object && property === null && c !== 34 && c !== 125) {
      throwSyntaxError(bytes, --i);
    }

    switch (c) {
      case 116: {
        if (
          bytes[i++] !== 114 || bytes[i++] !== 117 || bytes[i++] !== 101
        ) {
          throwSyntaxError(bytes, --i);
        }
        value = true;
        break;
      }
      case 102: {
        if (
          bytes[i++] !== 97
          || bytes[i++] !== 108
          || bytes[i++] !== 115
          || bytes[i++] !== 101
        ) {
          throwSyntaxError(bytes, --i);
        }
        value = false;
        break;
      }
      case 110: {
        if (bytes[i++] !== 117 || bytes[i++] !== 108 || bytes[i++] !== 108) {
          throwSyntaxError(bytes, --i);
        }
        value = null;
        break;
      }
      case 45:
      case 46:
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57: {
        let index = i;
        value = fromCharCode(c);
        c = bytes[i];
        while (true) {
          switch (c) {
            case 43:
            case 45:
            case 46:
            case 48:
            case 49:
            case 50:
            case 51:
            case 52:
            case 53:
            case 54:
            case 55:
            case 56:
            case 57:
            case 101:
            case 69: {
              value += fromCharCode(c);
              c = bytes[++i];
              continue;
            }
          }
          break;
        }
        value = Number(value);
        if (isNaN(value as number)) {
          throwSyntaxError(bytes, --index, "Invalid number");
        }
        break;
      }
      case 34: {
        value = "";
        while (true) {
          if (i >= length) {
            throwSyntaxError(bytes, length);
          }
          c = bytes[i++];
          if (c === 34) {
            break;
          } else if (c === 92) {
            switch (bytes[i++]) {
              case 34:
                value += '"';
                break;
              case 47:
                value += "/";
                break;
              case 92:
                value += "\\";
                break;
              case 98:
                value += "\b";
                break;
              case 102:
                value += "\f";
                break;
              case 110:
                value += "\n";
                break;
              case 114:
                value += "\r";
                break;
              case 116:
                value += "	";
                break;
              case 117: {
                let code = 0;
                for (let j = 0; j < 4; j++) {
                  c = bytes[i++];
                  code <<= 4;
                  if (c >= 48 && c <= 57) code |= c - 48;
                  else if (c >= 97 && c <= 102) code |= c + (10 - 97);
                  else if (c >= 65 && c <= 70) code |= c + (10 - 65);
                  else throwSyntaxError(bytes, --i);
                }
                value += fromCharCode(code);
                break;
              }
              default:
                throwSyntaxError(bytes, --i);
                break;
            }
          } else if (c <= 127) {
            value += fromCharCode(c);
          } else if ((c & 224) === 192) {
            value += fromCharCode((c & 31) << 6 | bytes[i++] & 63);
          } else if ((c & 240) === 224) {
            value += fromCharCode(
              (c & 15) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63,
            );
          } else if ((c & 248) == 240) {
            let codePoint = (c & 7) << 18
              | (bytes[i++] & 63) << 12
              | (bytes[i++] & 63) << 6
              | (bytes[i++] & 63);
            if (codePoint > 65535) {
              codePoint -= 65536;
              value += fromCharCode(
                (codePoint >> 10 & 1023) | 55296,
              );
              codePoint = 56320 | (codePoint & 1023);
            }
            value += fromCharCode(codePoint);
          }
        }
        break;
      }
      case 91: {
        value = [];
        propertyStack.push(property);
        objectStack.push(object);
        stateStack.push(state);
        property = null;
        object = value;
        state = State.Array;
        continue;
      }
      case 123: {
        value = {};
        propertyStack.push(property);
        objectStack.push(object);
        stateStack.push(state);
        property = null;
        object = value;
        state = State.Object;
        continue;
      }
      case 93: {
        if (state !== State.Array) {
          throwSyntaxError(bytes, --i);
        }
        value = object;
        property = propertyStack.pop() as unknown;
        object = objectStack.pop() as unknown;
        state = stateStack.pop() as number;
        break;
      }
      case 125: {
        if (state !== State.Object) {
          throwSyntaxError(bytes, --i);
        }
        value = object;
        property = propertyStack.pop() as unknown;
        object = objectStack.pop() as unknown;
        state = stateStack.pop() as number;
        break;
      }
      default: {
        throwSyntaxError(bytes, --i);
      }
    }

    c = bytes[i];
    while (c <= 32) {
      c = bytes[++i];
    }

    switch (state) {
      case State.TopLevel: {
        if (i === length) {
          return value;
        }
        break;
      }
      case State.Array: {
        (object as unknown[]).push(value);
        if (c === 44) {
          i++;
          continue;
        }
        if (c === 93) {
          continue;
        }
        break;
      }
      case State.Object: {
        if (property === null) {
          property = value;
          if (c === 58) {
            i++;
            continue;
          }
        } else {
          (object as Record<string, unknown>)[property as string] = value;
          property = null;
          if (c === 44) {
            i++;
            continue;
          }
          if (c === 125) {
            continue;
          }
        }
        break;
      }
    }
    break;
  }
  throwSyntaxError(bytes, i);
}

export function parseJSON(bytes: Uint8Array): unknown {
  const decodeUTF8 = getDecodeUTF8();
  let text: string | undefined;
  try {
    text = decodeUTF8(bytes);
  } catch {
    return JSON_parse(bytes);
  }
  return JSON.parse(text!);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function getEncodeUTF8(): (text: string) => Uint8Array {
  return (text: string) => encoder.encode(text);
}

export function getDecodeUTF8(): (bytes: Uint8Array) => string {
  return (bytes: Uint8Array) => decoder.decode(bytes);
}

export function encodeUTF8(text: string): Uint8Array {
  return getEncodeUTF8()(text);
}

export function decodeUTF8(bytes: Uint8Array): string {
  return getDecodeUTF8()(bytes);
}
