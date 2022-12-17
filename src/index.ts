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
      const sourcePaths: string[] = await run(
        taskNames.TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS
      );

      const sourceNames: string[] =
        sourceNamesParam ??
        (await run(taskNames.TASK_COMPILE_SOLIDITY_GET_SOURCE_NAMES, {
          sourcePaths,
        }));

      const graph: DependencyGraph = await run(
        taskNames.TASK_COMPILE_SOLIDITY_GET_DEPENDENCY_GRAPH,
        {
          sourceNames,
        }
      );

      const mermaidSource = generateMermaidSource(
        sourceNames,
        graph,
        config.paths,
        {
          includeLibraries,
          ignore: config.diagrams.ignore,
          getCssClass: config.diagrams.getCssClass,
        }
      );

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
  sourceNames: string[],
  graph: DependencyGraph,
  paths: HardhatConfig["paths"],
  options: {
    includeLibraries: boolean;
    ignore?: (file: ResolvedFile) => boolean;
    getCssClass?: (file: ResolvedFile) => string | undefined;
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

  const files = graph.getResolvedFiles()
    .filter(file => sourceNames.includes(file.sourceName))

  for (const file of files) {
    if (file.library !== undefined) {
      continue;
    }
    if (options.ignore?.(file) === true) {
      continue;
    }
    const fileNodeId = getNodeId(file.sourceName);

    // include node because it might not import anything
    mermaidSource.push(`${fileNodeId}["${file.sourceName}"]`);

    const cssClass = options.getCssClass?.(file);
    if (cssClass !== undefined) {
      mermaidSource.push(`class ${fileNodeId} ${cssClass}`);
    }

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
        mermaidSource.push(`class ${depNodeId} library`);
      } else {
        const cssClass = options.getCssClass?.(dep);
        if (cssClass !== undefined) {
          mermaidSource.push(`class ${depNodeId} ${cssClass}`);
        }
      }
    }
  }

  return mermaidSource.join(os.EOL);
}
