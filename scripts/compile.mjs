import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(projectRoot, "contracts", "PayzRewardsPoints.sol");
const sourceKey = "contracts/PayzRewardsPoints.sol";
const outputDirectory = join(projectRoot, "build");
const abiDirectory = join(projectRoot, "abi");
const nodeModulesDirectory = join(projectRoot, "node_modules");

const source = await readFile(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: {
    [sourceKey]: { content: source },
  },
  settings: {
    optimizer: {
      enabled: false,
      runs: 200,
    },
    evmVersion: "shanghai",
    metadata: {
      bytecodeHash: "ipfs",
    },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

function resolveImport(importPath) {
  const resolvedPath = resolve(nodeModulesDirectory, importPath);
  if (
    resolvedPath !== nodeModulesDirectory &&
    !resolvedPath.startsWith(`${nodeModulesDirectory}${sep}`)
  ) {
    return { error: `Import is outside node_modules: ${importPath}` };
  }

  try {
    return { contents: readFileSync(resolvedPath, "utf8") };
  } catch {
    return { error: `Unable to resolve import: ${importPath}` };
  }
}

const output = JSON.parse(
  solc.compile(JSON.stringify(input), { import: resolveImport }),
);
const diagnostics = output.errors ?? [];
for (const diagnostic of diagnostics) {
  const write = diagnostic.severity === "error" ? console.error : console.warn;
  write(diagnostic.formattedMessage);
}
if (diagnostics.some(({ severity }) => severity === "error")) {
  process.exitCode = 1;
} else {
  const contract = output.contracts?.[sourceKey]?.PayzRewardsPoints;
  if (!contract) {
    throw new Error("Compiler output did not include PayzRewardsPoints.");
  }

  await mkdir(outputDirectory, { recursive: true });
  await mkdir(abiDirectory, { recursive: true });
  const abiJson = `${JSON.stringify(contract.abi, null, 2)}\n`;
  await writeFile(join(outputDirectory, "PayzRewardsPoints.abi"), abiJson);
  await writeFile(
    join(outputDirectory, "PayzRewardsPoints.bin"),
    `${contract.evm.bytecode.object}\n`,
  );
  await writeFile(
    join(outputDirectory, "PayzRewardsPoints.runtime.bin"),
    `${contract.evm.deployedBytecode.object}\n`,
  );
  await writeFile(join(abiDirectory, "PayzRewardsPoints.json"), abiJson);

  console.log(`Compiled PayzRewardsPoints with ${solc.version()}.`);
  console.log(`Build output: ${relative(projectRoot, outputDirectory)}/`);
  console.log(`Integration ABI: ${relative(projectRoot, abiDirectory)}/PayzRewardsPoints.json`);
}
