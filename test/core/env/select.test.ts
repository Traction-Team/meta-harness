import { describe, expect, test } from "vitest";
import { MetafabError } from "../../../src/errors.js";
import type { EnvConfigEntry, EnvConfigReader } from "../../../src/core/env/git-config.js";
import { envVariableName, resolveSelection, splitValues } from "../../../src/core/env/select.js";
import type { EnvVariable } from "../../../src/core/env/types.js";

const FILE = ".factory/factory.yaml";

function variable(
  name: string,
  values: readonly string[],
  options: { default?: readonly string[]; line?: number } = {},
): EnvVariable {
  const line = options.line ?? 1;
  return {
    name,
    values: values.map((value, index) => ({
      name: value,
      label: `When ${name} is ${value}`,
      line: line + index + 1,
    })),
    ...(options.default === undefined ? {} : { default: [...options.default] }),
    line,
  };
}

const HARNESS = variable("harness", ["opencode", "claude", "amp"], {
  default: ["claude"],
  line: 5,
});
const WORKSPACE = variable("workspace", ["orca", "worktree"], {
  default: ["worktree"],
  line: 12,
});

function reader(entries: EnvConfigEntry[]): EnvConfigReader {
  return async () => ({ entries, warnings: [] });
}

const NO_GIT: EnvConfigReader = async () => {
  throw new Error("Git config must not be read");
};

async function failure(promise: Promise<unknown>): Promise<MetafabError> {
  try {
    await promise;
  } catch (error) {
    return error as MetafabError;
  }
  throw new Error("Expected a MetafabError");
}

function resolved(result: Awaited<ReturnType<typeof resolveSelection>>) {
  return result.variables.map((entry) => ({
    variable: entry.variable,
    values: entry.values,
    source: entry.source,
    ...(entry.scope === undefined ? {} : { scope: entry.scope }),
    ...(entry.from === undefined ? {} : { from: entry.from }),
  }));
}

describe("envVariableName", () => {
  test("upper cases the name and turns hyphens into underscores", () => {
    expect(envVariableName("harness")).toBe("FACTORY_ENV_HARNESS");
    expect(envVariableName("target-os")).toBe("FACTORY_ENV_TARGET_OS");
  });
});

describe("splitValues", () => {
  test("splits on commas, trims, and drops empties and repeats", () => {
    expect(splitValues("opencode, claude ,,opencode")).toEqual(["opencode", "claude"]);
    expect(splitValues("")).toEqual([]);
    expect(splitValues(" , ")).toEqual([]);
    expect(splitValues("amp")).toEqual(["amp"]);
  });
});

describe("resolveSelection", () => {
  test("--env wins over every other source", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      options: ["harness=amp"],
      processEnv: { FACTORY_ENV_HARNESS: "claude" },
      readConfig: reader([{ scope: "global", variable: "harness", value: "opencode" }]),
    });

    expect(resolved(result)).toEqual([{ variable: "harness", values: ["amp"], source: "option" }]);
    expect(result.selection.get("harness")).toEqual(["amp"]);
    expect(result.warnings).toEqual([]);
  });

  test("FACTORY_ENV_<VAR> wins when --env names nothing for the variable", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      processEnv: { FACTORY_ENV_HARNESS: "claude" },
      readConfig: reader([{ scope: "global", variable: "harness", value: "opencode" }]),
    });

    expect(resolved(result)).toEqual([
      { variable: "harness", values: ["claude"], source: "environment", from: "FACTORY_ENV_HARNESS" },
    ]);
  });

  test("Git config wins when --env and the environment name nothing", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      processEnv: {},
      readConfig: reader([{ scope: "global", variable: "harness", value: "opencode" }]),
    });

    expect(resolved(result)).toEqual([
      { variable: "harness", values: ["opencode"], source: "git", scope: "global" },
    ]);
  });

  test("the declared default wins when nothing else names a value", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      processEnv: {},
      readConfig: reader([]),
    });

    expect(resolved(result)).toEqual([{ variable: "harness", values: ["claude"], source: "default" }]);
  });

  test("every value is selected when the variable has no default", async () => {
    const editor = variable("editor", ["vim", "vscode"], { line: 20 });
    const result = await resolveSelection([editor], {
      root: "/repo",
      processEnv: {},
      readConfig: reader([]),
    });

    expect(resolved(result)).toEqual([
      { variable: "editor", values: ["vim", "vscode"], source: "all" },
    ]);
  });

  test("values come back in declaration order, whatever order they are given in", async () => {
    const first = await resolveSelection([HARNESS], {
      root: "/repo",
      options: ["harness=claude,opencode"],
      processEnv: {},
      readConfig: reader([]),
    });
    const second = await resolveSelection([HARNESS], {
      root: "/repo",
      options: ["harness=opencode, claude ,,opencode"],
      processEnv: {},
      readConfig: reader([]),
    });

    expect(first.variables[0]?.values).toEqual(["opencode", "claude"]);
    expect(second.variables[0]?.values).toEqual(["opencode", "claude"]);
  });

  test("the highest-priority Git scope decides, and its entries combine", async () => {
    const entries: EnvConfigEntry[] = [
      { scope: "system", variable: "harness", value: "opencode" },
      { scope: "global", variable: "harness", value: "claude" },
      { scope: "local", variable: "harness", value: "amp" },
      { scope: "local", variable: "harness", value: "opencode" },
      { scope: "worktree", variable: "harness", value: "claude" },
    ];

    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      processEnv: {},
      readConfig: reader(entries),
    });

    expect(resolved(result)).toEqual([
      { variable: "harness", values: ["claude"], source: "git", scope: "worktree" },
    ]);
  });

  test("each undeclared value is ignored with a warning naming its source", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      options: ["harness=vs"],
      processEnv: { FACTORY_ENV_HARNESS: "emacs" },
      readConfig: reader([{ scope: "local", variable: "harness", value: "nope" }]),
    });

    expect(resolved(result)).toEqual([{ variable: "harness", values: ["claude"], source: "default" }]);
    expect(result.warnings).toEqual([
      {
        level: "warning",
        file: FILE,
        line: 5,
        message: 'Ignored "vs" from --env harness=vs: harness does not declare it',
        fix: "Declared values: opencode, claude, amp",
      },
      {
        level: "warning",
        file: FILE,
        line: 5,
        message: 'Ignored "emacs" from FACTORY_ENV_HARNESS: harness does not declare it',
        fix: "Declared values: opencode, claude, amp",
      },
      {
        level: "warning",
        file: FILE,
        line: 5,
        message:
          'Ignored "nope" from factory.env.harness in local Git config: harness does not declare it',
        fix: "Declared values: opencode, claude, amp",
      },
    ]);
  });

  test("--env harness= warns and the next source applies", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      options: ["harness="],
      processEnv: {},
      readConfig: reader([]),
    });

    expect(resolved(result)).toEqual([{ variable: "harness", values: ["claude"], source: "default" }]);
    expect(result.warnings).toEqual([
      {
        level: "warning",
        file: FILE,
        line: 5,
        message: "--env harness= names no value",
        fix: "Write --env harness=<values>, such as --env harness=opencode",
      },
    ]);
  });

  test("an empty FACTORY_ENV_<VAR> falls through without a warning", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      processEnv: { FACTORY_ENV_HARNESS: "" },
      readConfig: reader([]),
    });

    expect(resolved(result)).toEqual([{ variable: "harness", values: ["claude"], source: "default" }]);
    expect(result.warnings).toEqual([]);
  });

  test("sources for undeclared variables are never read and never warn", async () => {
    const result = await resolveSelection([HARNESS], {
      root: "/repo",
      processEnv: { FACTORY_ENV_OTHER: "vs" },
      readConfig: reader([{ scope: "local", variable: "other", value: "emacs" }]),
    });

    expect(resolved(result)).toEqual([{ variable: "harness", values: ["claude"], source: "default" }]);
    expect(result.warnings).toEqual([]);
  });

  test("a factory with no variables resolves to an empty selection without Git", async () => {
    const result = await resolveSelection([], { root: "/repo", readConfig: NO_GIT });

    expect(result).toEqual({ variables: [], selection: new Map(), warnings: [] });
  });

  test("--env on a factory with no variables is the unknown-variable error", async () => {
    const error = await failure(
      resolveSelection([], { root: "/repo", options: ["harness=amp"], readConfig: NO_GIT }),
    );

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.exitCode).toBe(1);
    expect(error.problems).toEqual([
      {
        level: "error",
        file: FILE,
        message: '--env names unknown variable "harness"',
        fix: "This factory declares no environment variables",
      },
    ]);
  });

  test("every bad --env argument is reported in one error with exit 1", async () => {
    const error = await failure(
      resolveSelection([HARNESS, WORKSPACE], {
        root: "/repo",
        options: ["harnesse=amp", "novalue", "harness=amp", "harness=claude"],
        readConfig: NO_GIT,
      }),
    );

    expect(error).toBeInstanceOf(MetafabError);
    expect(error.exitCode).toBe(1);
    expect(error.problems).toEqual([
      {
        level: "error",
        file: FILE,
        message: '--env names unknown variable "harnesse"',
        fix: 'Did you mean "harness"?',
      },
      {
        level: "error",
        file: FILE,
        message: '--env needs <variable>=<values>: "novalue"',
        fix: "Write --env <variable>=<values>, such as --env harness=opencode",
      },
      {
        level: "error",
        file: FILE,
        line: 5,
        message: '--env names "harness" twice',
        fix: "Pass --env harness=<values> once",
      },
    ]);
  });
});
