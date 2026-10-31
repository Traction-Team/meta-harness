/**
 * picomatch ships no types. `package.json` does not declare the dependency
 * either, so the publish workflow needs it added there; this declaration only
 * covers the call this repository makes.
 */
declare module "picomatch" {
  export interface PicomatchOptions {
    dot?: boolean;
    nocase?: boolean;
    bash?: boolean;
  }

  export interface Matcher {
    (input: string): boolean;
  }

  function picomatch(glob: string | readonly string[], options?: PicomatchOptions): Matcher;

  export default picomatch;
}
