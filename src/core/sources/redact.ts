const URL_USERINFO = /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s@]+@/g;
const URL_QUERY = /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s?#]+)\?[^\s#'"]*/g;
const URL_FRAGMENT_TOKEN =
  /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s#]+)#[^\s'"]*(?:token|signature|secret|auth|key|credential|access)[^\s'"]*/gi;
const AUTH_SETTING = /(_authToken|_auth|password)\s*[=:]\s*\S+/gi;
const AUTH_HEADER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi;

function isHttpProtocol(protocol: string): boolean {
  return (
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "git+http:" ||
    protocol === "git+https:"
  );
}

// A URL that is safe to write down: no password or token in the userinfo, and
// no query string on an HTTP(S) URL, because a signed query is a credential.
// A bare SSH username stays: ssh needs it to find the key, and it is not a
// secret. Everything that is not a URL (a path, `github:owner/repo`) is kept.
export function stripSourceCredentials(source: string): string {
  const value = source.trim();
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) return value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  if (isHttpProtocol(parsed.protocol)) {
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
  } else {
    parsed.password = "";
  }
  return parsed.toString();
}

export function redact(value: string): string {
  return value
    .replace(URL_USERINFO, "$1***@")
    .replace(URL_QUERY, "$1?<redacted>")
    .replace(URL_FRAGMENT_TOKEN, "$1#<redacted>")
    .replace(AUTH_SETTING, "$1=***")
    .replace(AUTH_HEADER, "$1 ***");
}
