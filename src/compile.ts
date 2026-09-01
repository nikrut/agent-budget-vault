import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import solc from "solc";

export interface ContractArtifact {
  abi: readonly unknown[];
  bytecode: `0x${string}`;
}

function solidityFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return solidityFiles(root, path);
    return entry.name.endsWith(".sol") ? [path] : [];
  });
}

export function compileContracts(projectRoot = process.cwd()): Record<string, ContractArtifact> {
  const contractsRoot = join(projectRoot, "contracts");
  const sources = Object.fromEntries(
    solidityFiles(contractsRoot).map((path) => [
      `contracts/${relative(contractsRoot, path)}`,
      { content: readFileSync(path, "utf8") },
    ]),
  );
  const input = {
    language: "Solidity",
    sources,
    settings: {
      evmVersion: "shanghai",
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter(
    (entry: { severity: string }) => entry.severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(errors.map((entry: { formattedMessage: string }) => entry.formattedMessage).join("\n"));
  }
  const artifacts: Record<string, ContractArtifact> = {};
  for (const contracts of Object.values(output.contracts) as Array<Record<string, any>>) {
    for (const [name, contract] of Object.entries(contracts)) {
      const object = contract.evm.bytecode.object;
      if (object) artifacts[name] = { abi: contract.abi, bytecode: `0x${object}` };
    }
  }
  return artifacts;
}
