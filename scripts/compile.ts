import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileContracts } from "../src/compile.js";

const artifacts = compileContracts();
const directory = join(process.cwd(), "artifacts");
mkdirSync(directory, { recursive: true });
for (const [name, artifact] of Object.entries(artifacts)) {
  writeFileSync(join(directory, `${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
}
console.log(`Compiled ${Object.keys(artifacts).length} deployable contracts.`);
