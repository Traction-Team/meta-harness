import { MetafabError } from "../../errors.js";
import type { ErrorProblem } from "../../errors.js";
import { getSkillNameProblems } from "./names.js";

export interface CreatePath {
  segments: string[];
  relDir: string;
  name: string;
}

function pathProblem(input: string, message: string, fix: string): ErrorProblem {
  return {
    level: "error",
    file: input === "" ? "path" : input,
    message,
    fix,
  };
}

export function normaliseCreatePath(input: string): CreatePath {
  const value = input.replace(/\\/g, "/");

  if (value === "") {
    throw new MetafabError("A path is required.", {
      code: "create-path-invalid",
      problems: [pathProblem(input, "A path is required", "Use a path such as workflows/review-slice")],
    });
  }

  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    const message = "The path must be relative to .factory/";
    throw new MetafabError(message, {
      code: "create-path-invalid",
      problems: [pathProblem(input, message, "Use a path such as workflows/review-slice")],
    });
  }

  const segments = value.split("/").filter((segment) => segment !== "" && segment !== ".");

  if (segments.includes("..")) {
    const message = "The path must not contain ..";
    throw new MetafabError(message, {
      code: "create-path-invalid",
      problems: [pathProblem(input, message, "Use a path such as workflows/review-slice")],
    });
  }

  if (segments[0] === ".factory") segments.shift();

  const hidden = segments.find((segment) => segment.startsWith("."));
  if (hidden !== undefined) {
    const message = `The path must not include the hidden directory "${hidden}".`;
    throw new MetafabError(message, {
      code: "create-path-invalid",
      problems: [
        pathProblem(
          input,
          message,
          "Use a path segment that does not start with a dot, such as skills/hidden-name",
        ),
      ],
    });
  }

  if (segments.length === 0) {
    const message = "The path must name a skill directory";
    throw new MetafabError(message, {
      code: "create-path-invalid",
      problems: [pathProblem(input, message, "Use a path such as workflows/review-slice")],
    });
  }

  const relDir = segments.join("/");
  const name = segments[segments.length - 1]!;
  const nameProblems = getSkillNameProblems(name, relDir);
  if (nameProblems.length > 0) {
    throw new MetafabError(nameProblems[0]!.message, {
      code: "create-name-invalid",
      problems: nameProblems,
    });
  }

  return { segments, relDir, name };
}

export function headingFromName(name: string): string {
  const words = name.replace(/-/g, " ");
  if (words === "") return "";
  return words[0]!.toUpperCase() + words.slice(1);
}

export function deriveFactoryName(dirName: string): string {
  return (
    dirName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "factory"
  );
}
