const URL_USERINFO = /\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s@]+@/g;
const URL_QUERY = /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s?#]+)\?[^\s#'"]*/g;
const URL_FRAGMENT_TOKEN =
  /([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s#]+)#[^\s'"]*(?:token|signature|secret|auth|key|credential|access)[^\s'"]*/gi;
const AUTH_SETTING = /(_authToken|_auth|password)\s*[=:]\s*\S+/gi;
const AUTH_HEADER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi;

export function redact(value: string): string {
  return value
    .replace(URL_USERINFO, "$1***@")
    .replace(URL_QUERY, "$1?<redacted>")
    .replace(URL_FRAGMENT_TOKEN, "$1#<redacted>")
    .replace(AUTH_SETTING, "$1=***")
    .replace(AUTH_HEADER, "$1 ***");
}
