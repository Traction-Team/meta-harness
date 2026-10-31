// `pipeline add` needs the same derivation when it creates a missing factory.yaml,
// so `edit` owns the implementation and `init` exposes it for `init` and `import`.
export { deriveFactoryName } from "../edit/paths.js";
