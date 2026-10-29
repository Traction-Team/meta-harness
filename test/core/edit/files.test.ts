import { describe, expect, test } from "vitest";
import {
  addPipelineEntryText,
  readFactoryYamlText,
  writeFactoryYamlText,
} from "../../../src/core/edit/index.js";
import { makeRepo } from "../../helpers/makeRepo.js";

const FACTORY = `format: 1
name: mark4

# Keep this comment.
pipeline:
  - y # first
  - z
`;

describe("factory.yaml files", () => {
  test("reads undefined when factory.yaml is missing", async () => {
    const repo = await makeRepo();
    try {
      expect(await readFactoryYamlText(repo.path(".factory"))).toBeUndefined();
    } finally {
      await repo.cleanup();
    }
  });

  test("writes a file and creates its directory", async () => {
    const repo = await makeRepo();
    try {
      await writeFactoryYamlText(repo.path(".factory"), "format: 1\nname: x\n");

      expect(await readFactoryYamlText(repo.path(".factory"))).toBe("format: 1\nname: x\n");
    } finally {
      await repo.cleanup();
    }
  });

  test("round-trips an edit through the file and keeps comments", async () => {
    const repo = await makeRepo({ ".factory/factory.yaml": FACTORY });
    try {
      const original = await readFactoryYamlText(repo.path(".factory"));
      expect(original).toBe(FACTORY);

      const edited = addPipelineEntryText(original!, "x", {
        after: "y",
        stop: "A person decides",
      });
      await writeFactoryYamlText(repo.path(".factory"), edited);

      expect(await readFactoryYamlText(repo.path(".factory"))).toBe(`format: 1
name: mark4

# Keep this comment.
pipeline:
  - y # first
  - x: { stop: A person decides }
  - z
`);
    } finally {
      await repo.cleanup();
    }
  });
});
