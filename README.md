# pnpm-isolate-workspace

![npm](https://img.shields.io/npm/v/pnpm-isolate-workspace)

**Isolate a workspace in pnpm workspaces project**
when working in pnpm workspaces environment
sometimes some workspaces depend on other workspaces.
this behavior makes it hard to prepare a workspace for a production environment,
since we need to copy all related workspaces along with it.

This tool helps you isolate the workspace.
It will copy all related workspaces to a destination folder under the workspace.
And will make it a root workspace to all the other copied workspaces.
that way, you end up with an isolated project that has everything it needs under one folder

### motivation

using CI/CD to get your project ready for production is extremely tricky with monorepos.
When your monorepo gets too big, and you want to dockerized each service independently,
you want to prevent your docker context scope from the root of the monorepo.
And make the scope for the folder of your workspace/project/service folder.
To achieve it, you need to copy all project dependence workspaces to this folder.

### example

if we have a monorepo workspaces tree that looks like this:

```
├── workspace-1
├   ├── package.json
├   ├── src-code
├── workspace-2
├   ├── package.json
├   ├── src-code
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
```

and workspace-1 depend on workspace-2
after running
`npx pnpm-isolate-workspace workspace-1`
or
`npx pnpm-isolate-workspace` from the workspace folder
the tree will look like this:

```
├── workspace-1
    ├── _isolated_
        ├── workspaces
            ├── workspace-2
                ├── package.json
                ├── src-code
        ├── workspaces-src-less
            ├── workspace-2
                ├── package.json
        ├── workspaces-src-less-prod
            ├── workspace-2
                ├── package.json
        ├── package.json
        ├── package-prod.json
        ├── pnpm-lock.yaml
        ├── pnpm-workspace.yaml
    ├── package.json
    ├── src-code
├── workspace-2
    ├── package.json
    ├── src-code
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
```

### what did you get?

the tool created a folder (with default name _isolated_)
this folder contains:

  1. `workspaces` folder - include all the related workspaces and their source code (in the example workspace 2)
  2. `workspaces-src-less` folder - contain all related workspaces by only package.json files.
*** a folder contains all the workspaces package.json (same tree as the workspaces folder).
Usually, when building an image with docker, you want to take advantage of the Docker cache layering.
And to do so, you want to copy all package.json before copying all source code. To create a layer
for all the node_modules. This folder contains only those pacakge.json,
so instead of COPY all package.json one by one, you can COPY this all folder.
  3. `workspaces-src-less-prod` folder - contain all related workspaces that are not in devDependencies and
*** same as the previous folder but each package.json filters out the devDependencis.
same as before if you run pnpm install with the --prod flag
  4. `package.json` file - duplication of the main package.json just with an extra key: `workspaces.`
     and all related workspaces are listed there so it could resolve them.
  5. `package-prod.json` file - duplication of the main package.json just with an extra key: `workspaces.`
     and without the devDependencies.
  6. `.pnpmrc` - copy if the root scope .pnpmrc if exist if not generate the file with workspaces enable flag
  7. `pnpm.lock` - if there is a 'pnpm.lock' file in the root of the project,
     it will copy all relevant dependencies from it

## Supported cli flags

we can configure the behavior of the isolated script with some params
you want to make sure you treat the depended workspaces as 'installed modules' so filter out from them
their dev-dependencies and test files.

```
  #### pnpm-isolate [options] [workspace name to isolate]
    * [--pnpmrc-disable]                   disable copy .npmrc file
    * [--pnpm-lock-file]                   disable generate pnpm-lock.yaml file

    [--src-less-disable]                   disable create of the src-less folders
    [--src-less-glob={value}]              glob pattern to include files with the src-less folder
    [--src-less-sub-dev-deps]              include sub workspaces dev dependencies

    [--src-less-prod-disable]              disable create the prod src-less folder
    [--src-less-prod-glob={value}]         glob pattern to include files with the src-less-prod folder

    [--json-file-disable]                  disable create json file
    [--json-file-prod-disable]             disable create json prod json file
    [--output-folder]                      folder to create all generated files (default to _isolated_)
    [--include-root-deps]                  include root workspaces package.json dependencies and dev dependencies
    [--disable-root-config]                disable root package.json pnpm config (like overrides)

    [--src-files-enable]                   copy all src file of main workspace to the isolated folder
    [--src-files-exclude-glob={value}]     glob pattern to exclude files from the main workspace copied files
    [--src-files-include-glob={value}]     glob pattern to include files from the main workspace copied files
    [--workspaces-exclude-glob={value}]    glob pattern to exclude files when copy workspaces

    [--max-depth]                          by default we search recursively project-root 5 folder
    [--project-folder={value}]             absolute path to project-root (default will look for the root)
```

* `--src-less-glob/--src-less-prod-glob` - if you have bin files or any other files, you need to run pnpm install in the workspace. For example, one of our workspaces have a bin script that warps lint command.
* `--src-files-enable` - in case you want to create docker context of the isolated folder.
* `--workspaces-exclude-glob` - filter files from workspaces you don't need test folders, etc.
