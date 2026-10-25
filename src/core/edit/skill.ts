import { Document } from "yaml";
import { headingFromName } from "./paths.js";
import { serializeYamlDocument } from "./document.js";

export function skillFileText(name: string, description: string): string {
  const doc = new Document();
  doc.set("name", name);
  doc.set("description", description);

  return `---\n${serializeYamlDocument(doc)}---\n\n# ${headingFromName(name)}\n`;
}
