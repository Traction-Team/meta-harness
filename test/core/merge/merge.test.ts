import { describe, expect, test } from "vitest";
import { mergePath } from "../../../src/core/merge.js";
import type { MergeInput, MergeOptions } from "../../../src/core/merge.js";

const LABELS = { base: "1.0.0", upstream: "1.1.0" };

function text(content: string, mode = 0o644): MergeInput {
  return { content: Buffer.from(content), mode };
}

function binary(bytes: readonly number[], mode = 0o644): MergeInput {
  return { content: Buffer.from(bytes), mode };
}

function merge(
  base: MergeInput | undefined,
  yours: MergeInput | undefined,
  theirs: MergeInput | undefined,
  options: MergeOptions = {},
) {
  return mergePath(base, yours, theirs, LABELS, options);
}

describe("mergePath: the merge table", () => {
  test("unchanged from base, unchanged from base: keep the file", () => {
    expect(merge(text("a\n"), text("a\n"), text("a\n"))).toEqual({ action: "keep" });
  });

  test("unchanged from base, changed: use theirs", () => {
    expect(merge(text("a\n"), text("a\n"), text("b\n"))).toEqual({
      action: "take-theirs",
      content: Buffer.from("b\n"),
      mode: 0o644,
    });
  });

  test("changed, unchanged from base: keep yours", () => {
    expect(merge(text("a\n"), text("b\n"), text("a\n"))).toEqual({ action: "keep" });
  });

  test("changed, same change as yours: keep the shared result", () => {
    expect(merge(text("a\n"), text("b\n"), text("b\n"))).toEqual({ action: "keep" });
  });

  test("changed, different change: merge lines and mark the overlap", () => {
    const result = merge(
      text("one\ntwo\nthree\n"),
      text("one\nYOURS\nthree\n"),
      text("one\nTHEIRS\nthree\n"),
    );

    expect(result).toEqual({
      action: "conflict",
      content: Buffer.from(
        "one\n" +
          "<<<<<<< yours\n" +
          "YOURS\n" +
          "||||||| base 1.0.0\n" +
          "two\n" +
          "=======\n" +
          "THEIRS\n" +
          ">>>>>>> upstream 1.1.0\n" +
          "three\n",
      ),
      mode: 0o644,
    });
  });

  test("new local file, no upstream file: keep yours", () => {
    expect(merge(undefined, text("local\n"), undefined)).toEqual({ action: "keep" });
  });

  test("no local file, new upstream file: add theirs", () => {
    expect(merge(undefined, undefined, text("new\n", 0o755))).toEqual({
      action: "add",
      content: Buffer.from("new\n"),
      mode: 0o755,
    });
  });

  test("new local file, different new upstream file: keep yours and write a side file", () => {
    expect(merge(undefined, text("mine\n"), text("theirs\n", 0o755))).toEqual({
      action: "side-file",
      upstream: Buffer.from("theirs\n"),
      upstreamMode: 0o755,
      reason: "new-local",
    });
  });

  test("unchanged from base, removed: remove the file", () => {
    expect(merge(text("a\n"), text("a\n"), undefined)).toEqual({ action: "remove" });
  });

  test("changed, removed: keep yours and report the upstream removal", () => {
    expect(merge(text("a\n"), text("b\n"), undefined)).toEqual({
      action: "keep",
      note: "upstream-removed",
    });
  });

  test("removed, unchanged from base: keep it removed", () => {
    expect(merge(text("a\n"), undefined, text("a\n"))).toEqual({ action: "remove" });
  });

  test("removed, changed: keep it removed and report the upstream change", () => {
    expect(merge(text("a\n"), undefined, text("b\n"))).toEqual({
      action: "remove",
      note: "upstream-changed-removed",
    });
  });
});

describe("mergePath: clean text merges", () => {
  test("merges non-overlapping changes into one file", () => {
    expect(
      merge(text("one\ntwo\nthree\n"), text("ONE\ntwo\nthree\n"), text("one\ntwo\nTHREE\n")),
    ).toEqual({
      action: "write",
      content: Buffer.from("ONE\ntwo\nTHREE\n"),
      mode: 0o644,
    });
  });

  test("keeps a file whose last line has no trailing newline", () => {
    expect(merge(text("a\nb"), text("a\nb"), text("a\nb"))).toEqual({ action: "keep" });
  });
});

describe("mergePath: binary files", () => {
  test("a binary conflict keeps yours and returns theirs as a side file", () => {
    expect(merge(binary([0x00, 0x01]), binary([0x00, 0x02]), binary([0x00, 0x03], 0o755))).toEqual(
      {
        action: "side-file",
        upstream: Buffer.from([0x00, 0x03]),
        upstreamMode: 0o755,
        reason: "binary",
      },
    );
  });
});

describe("mergePath: line endings", () => {
  test("treats a CRLF-only change as unchanged", () => {
    expect(merge(text("a\r\nb\r\n"), text("a\nb\n"), text("a\r\nb\r\n"))).toEqual({
      action: "keep",
    });
  });

  test("compares CRLF and LF when choosing theirs", () => {
    expect(merge(text("a\r\n"), text("a\r\n"), text("b\n"))).toEqual({
      action: "take-theirs",
      content: Buffer.from("b\n"),
      mode: 0o644,
    });
  });
});

describe("mergePath: permission bits", () => {
  test("an executable-bit-only change counts as a change", () => {
    // Yours only sets the executable bit; theirs only changes the content.
    // A mode-only change is not "unchanged", so this is a line merge.
    expect(merge(text("a\n", 0o644), text("a\n", 0o755), text("b\n", 0o644))).toEqual({
      action: "write",
      content: Buffer.from("b\n"),
      mode: 0o755,
    });
  });

  test("takes the mode from the side that changed it", () => {
    expect(merge(text("a\n", 0o644), text("a\n", 0o644), text("a\n", 0o755))).toEqual({
      action: "take-theirs",
      content: Buffer.from("a\n"),
      mode: 0o755,
    });
  });
});

describe("mergePath: base unavailable", () => {
  test("a text conflict has no base section", () => {
    expect(merge(text("mine\n"), text("mine\n"), text("theirs\n"), { baseUnavailable: true })).toEqual(
      {
        action: "conflict",
        content: Buffer.from(
          "<<<<<<< yours\nmine\n=======\ntheirs\n>>>>>>> upstream 1.1.0\n",
        ),
        mode: 0o644,
      },
    );
  });

  test("equal files are kept", () => {
    expect(
      merge(text("same\n"), text("same\n"), text("same\n"), { baseUnavailable: true }),
    ).toEqual({ action: "keep" });
  });

  test("a permission-bit-only difference keeps yours and reports it", () => {
    // Same content, different mode: there is no line conflict to render, and a
    // mode disagreement cannot be written as conflict markers, so yours stays
    // as it is and the difference is reported instead.
    expect(
      merge(undefined, text("same\r\n", 0o755), text("same\n", 0o644), { baseUnavailable: true }),
    ).toEqual({ action: "keep", note: "base-unavailable-mode" });
  });

  test("a path only upstream has is a conflict, not an addition", () => {
    // A local removal and an upstream addition look the same without a base, so
    // the file stays absent and theirs goes to a side file.
    expect(merge(undefined, undefined, text("upstream\n", 0o755), { baseUnavailable: true })).toEqual({
      action: "side-file",
      upstream: Buffer.from("upstream\n"),
      upstreamMode: 0o755,
      reason: "base-unavailable",
    });
  });

  test("a local file only theirs lacks is a conflict that keeps yours", () => {
    // Nothing can be written to a side file for a removal, so the conflict is
    // reported without one.
    expect(merge(undefined, text("mine\n"), undefined, { baseUnavailable: true })).toEqual({
      action: "keep",
      note: "base-unavailable",
    });
  });

  test("a binary conflict keeps yours and returns a side file", () => {
    expect(
      merge(binary([0x00, 0x01]), binary([0x00, 0x02]), binary([0x00, 0x03]), {
        baseUnavailable: true,
      }),
    ).toEqual({
      action: "side-file",
      upstream: Buffer.from([0x00, 0x03]),
      upstreamMode: 0o644,
      reason: "binary",
    });
  });
});
