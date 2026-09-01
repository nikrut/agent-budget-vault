import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean);

const rules = [
  { name: "EVM private key", pattern: /(?:PRIVATE_KEY|SECRET_KEY)\s*=\s*0x[0-9a-fA-F]{64}/ },
  { name: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /\b(?:gh[opurs]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];
const findings: string[] = [];
for (const file of files) {
  const contents = readFileSync(file, "utf8");
  for (const rule of rules) if (rule.pattern.test(contents)) findings.push(`${file}: ${rule.name}`);
}
if (findings.length > 0) throw new Error(`Potential secrets found:\n${findings.join("\n")}`);
console.log(`Secret scan passed (${files.length} repository files).`);
