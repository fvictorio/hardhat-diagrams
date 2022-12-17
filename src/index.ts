import fs from "fs";
import { extendConfig, task } from "hardhat/config";
import * as taskNames from "hardhat/builtin-tasks/task-names";
import { DependencyGraph, HardhatConfig, ResolvedFile } from "hardhat/types";
import mkdirp from "mkdirp";
import open from "open";
import os from "os";
import path from "path";

import "./type-extensions";

extendConfig((config, userConfig) => {
  config.diagrams = userConfig.diagrams ?? {};
});

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
        ignore: config.diagrams.ignore,
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
  options: {
    includeLibraries: boolean;
    ignore?: (file: ResolvedFile) => boolean;
  }
) {
  let id = 0;
  let sourceNameToId: Record<string, string> = {};
  let mermaidSource: string[] = [];

  mermaidSource.push("graph LR");

  function getNodeId(sourceName: string): string {
    if (sourceNameToId[sourceName] === undefined) {
      sourceNameToId[sourceName] = `Node${id}`;
      id++;
    }

    return sourceNameToId[sourceName];
  }

  for (const file of graph.getResolvedFiles()) {
    if (file.library !== undefined) {
      continue;
    }
    if (options.ignore?.(file) === true) {
      continue;
    }
    const fileNodeId = getNodeId(file.sourceName);

    // include node because it might not import anything
    mermaidSource.push(`${fileNodeId}["${file.sourceName}"]`);

    const deps = graph.getDependencies(file);
    for (const dep of deps) {
      const isLibrary = dep.library !== undefined;
      if (!options.includeLibraries && isLibrary) {
        continue;
      }
      if (options.ignore?.(dep) === true) {
        continue;
      }

      const depNodeId = getNodeId(dep.sourceName);

      mermaidSource.push(
        `${fileNodeId}["${file.sourceName}"] --> ${depNodeId}["${dep.sourceName}"]`
      );
      if (isLibrary) {
        mermaidSource.push(`class ${depNodeId} cssLibrary`);
      }
    }
  }

  return mermaidSource.join(os.EOL);
}
