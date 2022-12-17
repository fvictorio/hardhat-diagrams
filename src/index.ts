import fs from "fs";
import { task } from "hardhat/config";
import * as taskNames from "hardhat/builtin-tasks/task-names";
import { DependencyGraph, HardhatConfig } from "hardhat/types";
import mkdirp from "mkdirp";
import open from "open";
import os from "os";
import path from "path";

task("diagram:flowchart")
  .addOptionalVariadicPositionalParam("sourceNames")
  .addFlag("includeLibraries")
  .setAction(
    async (
      {
        sourceNames: sourceNamesParam,
        includeLibraries,
      }: { sourceNames: string[] | undefined; includeLibraries: boolean },
      { run, config }
    ) => {
      const sourcePaths = await run(
        taskNames.TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS
      );

      const sourceNames =
        sourceNamesParam ??
        (await run(taskNames.TASK_COMPILE_SOLIDITY_GET_SOURCE_NAMES, {
          sourcePaths,
        }));

      const graph = await run(
        taskNames.TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH,
        {
          sourceNames,
        }
      );

      const mermaidSource = generateMermaidSource(graph, config.paths, {
        includeLibraries,
      });

      const htmlTemplate = fs
        .readFileSync(path.join(__dirname, "flowchart-template.html"))
        .toString();

      const htmlSource = htmlTemplate.replace(
        "%MERMAID_SOURCE%",
        mermaidSource
      );

      const pathToHtml = path.resolve(config.paths.cache, "graph.html");

      await mkdirp(config.paths.cache);
      fs.writeFileSync(pathToHtml, htmlSource);

      await open(pathToHtml);
    }
  );

function generateMermaidSource(
  graph: DependencyGraph,
  paths: HardhatConfig["paths"],
  options: { includeLibraries: boolean }
) {
  let id = 0;
  let sourceNameToId: Record<string, string> = {};
  let mermaidSource: string[] = [];

  mermaidSource.push("graph LR");

  for (const file of graph.getResolvedFiles()) {
    if (file.library !== undefined) {
      continue;
    }
    if (sourceNameToId[file.sourceName] === undefined) {
      sourceNameToId[file.sourceName] = `Node${id}`;
      id++;
    }
    mermaidSource.push(
      `${sourceNameToId[file.sourceName]}["${file.sourceName}"]`
    );

    const deps = graph.getDependencies(file);
    for (const dep of deps) {
      const isLibrary = dep.library !== undefined;
      if (!options.includeLibraries && isLibrary) {
        continue;
      }

      if (sourceNameToId[dep.sourceName] === undefined) {
        sourceNameToId[dep.sourceName] = `Node${id}`;
        id++;
      }

      mermaidSource.push(
        `${sourceNameToId[file.sourceName]}["${file.sourceName}"] --> ${
          sourceNameToId[dep.sourceName]
        }["${dep.sourceName}"]`
      );
      if (isLibrary) {
        mermaidSource.push(
          `class ${sourceNameToId[dep.sourceName]} cssLibrary`
        );
      }
    }
  }

  return mermaidSource.join(os.EOL);
}
