import { PassThrough, Readable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { ask, closeInput, NeedsInput, openReaderCount } from "../../src/input.js";

const description = { name: "description", flag: "--description", description: "Skill description" };

afterEach(() => {
  closeInput();
});

describe("ask", () => {
  test("writes its prompt to the injected stderr and reads the injected stdin", async () => {
    let stderr = "";
    const answer = await ask(description, {
      tty: true,
      stdin: Readable.from(["my skill\n"]),
      stderr: (text) => {
        stderr += text;
      },
    });

    expect(answer).toBe("my skill");
    expect(stderr).toContain("Skill description");
  });

  test("throws NeedsInput when the injected io is not a tty", async () => {
    await expect(ask(description, { tty: false })).rejects.toBeInstanceOf(NeedsInput);
  });

  test("answers two questions from one chunk", async () => {
    const stdin = Readable.from(["first\nsecond\n"]);
    const io = { tty: true, stdin, stderr: () => undefined };

    expect(await ask(description, io)).toBe("first");
    expect(await ask(description, io)).toBe("second");
  });

  test("answers two CRLF questions without the carriage return", async () => {
    const stdin = Readable.from(["a\r\nb\r\n"]);
    const io = { tty: true, stdin, stderr: () => undefined };

    expect(await ask(description, io)).toBe("a");
    expect(await ask(description, io)).toBe("b");
  });

  test("throws NeedsInput when the input ends before a line", async () => {
    const stdin = Readable.from([]);

    const promise = ask(description, { tty: true, stdin, stderr: () => undefined });

    await expect(promise).rejects.toBeInstanceOf(NeedsInput);
    await expect(promise).rejects.toMatchObject({ exitCode: 2 });
  });

  test("throws NeedsInput when the input ends after the first answer", async () => {
    const stdin = Readable.from(["first\n"]);
    const io = { tty: true, stdin, stderr: () => undefined };

    expect(await ask(description, io)).toBe("first");
    await expect(ask(description, io)).rejects.toMatchObject({ exitCode: 2 });
  });

  test("closeInput closes every open reader", async () => {
    const stdin = new PassThrough();
    stdin.write("first\n");
    expect(await ask(description, { tty: true, stdin, stderr: () => undefined })).toBe("first");

    expect(openReaderCount()).toBe(1);

    closeInput();

    expect(openReaderCount()).toBe(0);
    stdin.end();
  });
});
