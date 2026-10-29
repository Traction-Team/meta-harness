import { describe, expect, test } from "vitest";
import { withEnv } from "../../../src/core/sources/index.js";

function namesMatching(env: NodeJS.ProcessEnv, name: string): string[] {
  return Object.keys(env).filter((key) => key.toLowerCase() === name.toLowerCase());
}

describe("withEnv", () => {
  test("replaces an inherited setting that differs only in case", () => {
    const env = withEnv(
      { NPM_CONFIG_CACHE: "runner-cache", Path: "C:\\Windows\\system32" },
      { npm_config_cache: "isolated-cache" },
    );

    expect(namesMatching(env, "npm_config_cache")).toEqual(["npm_config_cache"]);
    expect(env.npm_config_cache).toBe("isolated-cache");
  });

  test("drops every case variant of an override", () => {
    const env = withEnv(
      { npm_config_registry: "lower", Npm_Config_Registry: "mixed", NPM_CONFIG_REGISTRY: "upper" },
      { npm_config_registry: "override" },
    );

    expect(namesMatching(env, "npm_config_registry")).toEqual(["npm_config_registry"]);
    expect(env.npm_config_registry).toBe("override");
  });

  test("keeps unrelated settings with their original names", () => {
    const base = { Path: "C:\\Windows\\system32", GIT_TERMINAL_PROMPT: "1" };
    const env = withEnv(base, { npm_config_userconfig: "C:\\Temp\\npmrc" });

    expect(env.Path).toBe("C:\\Windows\\system32");
    expect(env.GIT_TERMINAL_PROMPT).toBe("1");
    expect(env.npm_config_userconfig).toBe("C:\\Temp\\npmrc");
  });

  test("adds an override the base does not have", () => {
    const env = withEnv({ HOME: "/home/metafab" }, { GIT_TERMINAL_PROMPT: "0" });

    expect(env).toEqual({ HOME: "/home/metafab", GIT_TERMINAL_PROMPT: "0" });
  });

  test("does not mutate the base environment", () => {
    const base: NodeJS.ProcessEnv = { NPM_CONFIG_CACHE: "runner-cache" };
    withEnv(base, { npm_config_cache: "isolated-cache" });

    expect(base).toEqual({ NPM_CONFIG_CACHE: "runner-cache" });
  });

  test("ignores undefined values", () => {
    const env = withEnv({ NPM_CONFIG_CACHE: "runner-cache", PATH: "/bin" }, { npm_config_cache: undefined });

    expect(env).toEqual({ NPM_CONFIG_CACHE: "runner-cache", PATH: "/bin" });
  });
});
