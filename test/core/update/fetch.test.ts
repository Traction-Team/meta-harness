import { describe, expect, test } from "vitest";
import { ExitCode, MetafabError } from "../../../src/errors.js";
import { recordedBaseGone } from "../../../src/core/update/fetch.js";

function failure(code: string, message: string, cause?: unknown): MetafabError {
  return new MetafabError(message, { exitCode: ExitCode.FetchFailed, code, cause, problems: [] });
}

describe("recordedBaseGone", () => {
  test("a Git ref or commit removed from the source is a gone base", () => {
    const gone = failure(
      "fetch-not-found",
      'Cannot resolve Git source https://example.com/fab.git: ref "0123456" was not found',
    );
    expect(recordedBaseGone(gone)).toBe(true);
  });

  test("an npm version absent from the registry is a gone base", () => {
    const gone = failure(
      "fetch-failed",
      'Cannot resolve npm package "fab": no version matches "1.0.0"',
    );
    expect(recordedBaseGone(gone)).toBe(true);
  });

  test("an npm package or version the registry reports as missing is a gone base", () => {
    const gone = failure("fetch-failed", 'Cannot resolve npm package "fab"', {
      stderr: "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/fab",
    });
    expect(recordedBaseGone(gone)).toBe(true);
  });

  test("an unreachable remote is not a gone base", () => {
    const network = failure(
      "fetch-failed",
      "Cannot clone Git source https://example.com/fab.git: fatal: unable to access: Could not resolve host",
    );
    expect(recordedBaseGone(network)).toBe(false);
  });

  test("rejected credentials are not a gone base", () => {
    const auth = failure(
      "fetch-failed",
      "Cannot clone Git source https://example.com/fab.git: Authentication failed",
    );
    expect(recordedBaseGone(auth)).toBe(false);
  });

  test("a cache or filesystem failure while exporting is not a gone base", () => {
    const cache = failure(
      "fetch-failed",
      "Cannot export .factory from https://example.com/fab.git#0123456 byte for byte: ENOTDIR: not a directory, mkdir '/cache/info'",
    );
    expect(recordedBaseGone(cache)).toBe(false);
  });

  test("an invalid fab and an unclassified error are not a gone base", () => {
    expect(recordedBaseGone(failure("invalid-fab", "Invalid fab from example.com"))).toBe(false);
    expect(recordedBaseGone(new Error("ENOENT"))).toBe(false);
    expect(recordedBaseGone(undefined)).toBe(false);
  });
});
