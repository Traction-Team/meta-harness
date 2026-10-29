const URL_USERINFO = /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s@]+@/g;
const URL_QUERY = /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s?#]+)\?[^\s#'"]*/g;
const URL_FRAGMENT_TOKEN =
  /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s#]+)#[^\s'"]*(?:token|signature|secret|auth|key|credential|access)[^\s'"]*/gi;
const AUTH_SETTING = /(_authToken|_auth|password)\s*[=:]\s*\S+/gi;
const AUTH_HEADER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi;
const SOURCE_SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;

const HTTP_PROTOCOLS = new Set(["http:", "https:", "git+http:", "git+https:"]);

function isHttpProtocol(protocol: string): boolean {
  return HTTP_PROTOCOLS.has(protocol.toLowerCase());
}

// Where the authority (the `host` part) ends: the first `/`, `?` or `#` after
// the scheme. Everything before it is userinfo plus host.
function authorityEnd(value: string, start: number): number {
  let end = value.length;
  for (const delimiter of ["/", "?", "#"]) {
    const index = value.indexOf(delimiter, start);
    if (index !== -1 && index < end) end = index;
  }
  return end;
}

// A URL that is safe to write down: no password or token in the userinfo, and
// no query string on an HTTP(S) URL, because a signed query is a credential.
// A bare SSH username stays: ssh needs it to find the key, and it is not a
// secret. Everything that is not a URL (a path, `github:owner/repo`) is kept.
//
// The rewrite is done by cutting the secret out of the original text, never by
// re-serialising a parsed URL: `new URL()` normalises what it keeps, and a
// Windows `file://C:\a\b.git` would come back as `file:///C:/a/b.git`, so a
// recorded source or a mirror cache key would change for no reason. A source
// with nothing to remove is returned exactly as it was given.
export function stripSourceCredentials(source: string): string {
  const scheme = SOURCE_SCHEME.exec(source);
  if (scheme === null) return source;

  const http = isHttpProtocol(`${scheme[1]}:`);
  const start = scheme[0].length;
  // The last `@` of the authority separates userinfo from the host.
  const at = source.lastIndexOf("@", authorityEnd(source, start) - 1);

  let value = source;
  if (at !== -1 && at >= start) {
    const colon = source.indexOf(":", start);
    if (http) {
      // HTTP(S) userinfo is a credential: even a bare username can be a token.
      value = source.slice(0, start) + source.slice(at + 1);
    } else if (colon !== -1 && colon < at) {
      // Elsewhere only the password is secret; ssh still needs the username.
      // A password with no username leaves no `@` behind.
      value = source.slice(0, colon) + (colon === start ? source.slice(at + 1) : source.slice(at));
    }
  }

  if (!http) return value;

  const end = authorityEnd(value, start);
  const question = value.indexOf("?", end);
  const hash = value.indexOf("#", end);
  if (question === -1 || (hash !== -1 && hash < question)) return value;
  return value.slice(0, question) + (hash === -1 ? "" : value.slice(hash));
}

export function redact(value: string): string {
  return value
    .replace(URL_USERINFO, "$1***@")
    .replace(URL_QUERY, "$1?<redacted>")
    .replace(URL_FRAGMENT_TOKEN, "$1#<redacted>")
    .replace(AUTH_SETTING, "$1=***")
    .replace(AUTH_HEADER, "$1 ***");
}
