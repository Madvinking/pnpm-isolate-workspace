const path = require('path');
const fs = require('fs');
const yaml = require('yaml');

const { findWorkspacePackages } = require('@pnpm/find-workspace-packages');

async function getWorkspacePatterns(workspaceRoot) {
  const workspaceFilePath = path.join(workspaceRoot, 'pnpm-workspace.yaml');

  try {
    const fileContent = fs.readFileSync(workspaceFilePath, { encoding: 'utf-8' });
    const { packages } = yaml.parse(fileContent);

    if (!packages || !Array.isArray(packages)) {
      console.warn(`No "packages" field found in ${workspaceFilePath}`);
      return undefined;
    }

    return packages;
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`File ${workspaceFilePath} not found.`);
      return undefined;
    }
    throw err;
  }
}

async function getWorkspaces(workspaceRoot) {
  const patterns = await getWorkspacePatterns(workspaceRoot);

  const workspaces = await findWorkspacePackages(workspaceRoot, { patterns });

  return workspaces.reduce((acc, { rootDir, manifest: { name } }) => {
    acc[name] = {
      location: dir,
    };
    return acc;
  }, {});
}

async function getParams() {
  let [, , ...cliParams] = process.argv;

  function getParam(name, value = false) {
    const p = cliParams.find(p => p.includes(name));

    cliParams = cliParams.filter(p => !p.includes(name));

    if (value) return p ? p.split('=')[1] : false;

    return Boolean(p);
  }

  if (getParam('--help')) printHelp();

  const pnpmrcDisable = getParam('--pnpmrc-disable');
  const pnpmLockFile = !getParam('--pnpm-lock-file');
  const srcLessDisable = getParam('--src-less-disable');
  const srcLessSubDev = getParam('--src-less-sub-dev-deps');
  const includeRootDeps = getParam('--include-root-deps');
  const srcLessGlob = getParam('--src-less-glob', true);
  const srcLessProdDisable = getParam('--src-less-prod-disable');
  const srcLessProdGlob = getParam('--src-less-prod-glob', true);
  const jsonFileDisable = getParam('--json-file-disable');
  const jsonFileProdDisable = getParam('--json-file-prod-disable');
  const outputFolder = getParam('--output-folder', true) || '_isolated_';
  const srcFilesEnable = getParam('--src-files-enable');
  const srcFilesPackageJson = getParam('--src-files-package-json');
  const srcFilesIncludeGlob = getParam('--src-files-include-glob', true);
  const srcFilesExcludeGlob = getParam('--src-files-exclude-glob', true);
  const workspacesExcludeGlob = getParam('--workspaces-exclude-glob', true);
  const disableRootConfig = getParam('--disable-root-config');
  const projectRoot = getParam('--project-folder', true) || path.resolve();

  let max = getParam('--max-depth', true) || 5;

  const getWorkspacesRoot = dir => {
    const pkg = path.join(dir, 'pnpm-workspace.yaml');
    let found = false;
    if (fs.existsSync(pkg)) found = true;
    if (found) return dir;
    if (max === 0) {
      console.log('no workspace project found');
      process.exit(1);
    }
    max--;
    return getWorkspacesRoot(path.join(dir, '../'));
  };

  const rootDir = getWorkspacesRoot(projectRoot);

  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));

  const projectWorkspaces = await getWorkspaces(rootDir);

  const workspaceName = (function getWorkspaceName() {
    let [targetWorkspaceName] = cliParams;

    if (targetWorkspaceName) {
      if (projectWorkspaces[targetWorkspaceName]) return targetWorkspaceName;
    } else {
      targetWorkspaceName = '.';
    }

    if (targetWorkspaceName[0] === '.') {
      targetWorkspaceName = path.resolve(projectRoot, targetWorkspaceName);
    }

    let workspaceName = Object.keys(projectWorkspaces).find(
      workspace => projectWorkspaces[workspace].location === targetWorkspaceName,
    );

    if (workspaceName) return workspaceName;

    console.log(`no such workspace or folder: ${targetWorkspaceName}`);
    process.exit(1);
  })();

  for (let key in projectWorkspaces) {
    projectWorkspaces[key].relativePath = path.relative(rootDir, projectWorkspaces[key].location);
    projectWorkspaces[key].resolvePath = path.join('workspaces', projectWorkspaces[key].relativePath);
    projectWorkspaces[key].pkgJsonLocation = path.join(projectWorkspaces[key].location, 'package.json');
    projectWorkspaces[key].pkgJson = JSON.parse(fs.readFileSync(projectWorkspaces[key].pkgJsonLocation));
    if (projectWorkspaces[key].pkgJson.dependencies && projectWorkspaces[key].pkgJson.dependencies[workspaceName])
      delete projectWorkspaces[key].pkgJson.dependencies[workspaceName];

    if (projectWorkspaces[key].pkgJson.devDependencies && projectWorkspaces[key].pkgJson.devDependencies[workspaceName])
      delete projectWorkspaces[key].pkgJson.devDependencies[workspaceName];

    if (srcFilesPackageJson) projectWorkspaces[key].includeFiles = projectWorkspaces[key].pkgJson.files || [];
  }

  const workspaceData = projectWorkspaces[workspaceName];

  const prodWorkspaces = (function getProdWorkspaces() {
    const list = [];
    const recursive = (dependencies = {}) => {
      Object.keys(dependencies).forEach(depName => {
        if (projectWorkspaces[depName] && !list.includes(depName)) {
          list.push(depName);
          recursive(projectWorkspaces[depName].pkgJson.dependencies);
        }
      });
    };
    recursive(workspaceData.pkgJson.dependencies);
    return list;
  })();

  const devWorkspaces = (function getDevWorkspaces(prodWorkspaces) {
    const list = [];
    const recursive = (dependencies = {}) => {
      Object.keys(dependencies).forEach(depName => {
        if (projectWorkspaces[depName] && !list.includes(depName)) {
          list.push(depName);
          if (srcLessSubDev) {
            recursive({
              ...projectWorkspaces[depName].pkgJson.dependencies,
              ...projectWorkspaces[depName].pkgJson.devDependencies,
            });
          } else {
            recursive(projectWorkspaces[depName].pkgJson.dependencies);
          }
        }
      });
    };
    recursive({ ...workspaceData.pkgJson.dependencies, ...workspaceData.pkgJson.devDependencies });
    return list.filter(w => !prodWorkspaces.includes(w));
  })(prodWorkspaces);

  const relatedWorkspaces = [...prodWorkspaces, ...devWorkspaces];

  let isolateFolder = `${workspaceData.location}/${outputFolder}`;
  let workspacesFolder = `${isolateFolder}/workspaces/`;
  let srcLessFolder = `${isolateFolder}/workspaces-src-less/`;
  let srcLessFolderProd = `${isolateFolder}/workspaces-src-less-prod/`;

  function printHelp() {
    console.log(`
    isolating workspace in pnpm workspace project
    use:
    # pnpm-isolate [options] [workspace name to isolate]
    # pnpm-isolate [options] // from a workspace folder

      // pnpm files
      * [--pnpmrc-disable]                   disable copy .npmrc file
      [--pnpm-lock-file]                     disable generate pnpm-lock.yaml file

      // src-less folder
      [--src-less-disable]                   disable create of the src-less folders
      [--src-less-glob={value}]              extra files to copy to src-less folder
      [--src-less-sub-dev-deps]              include sub workspaces dev dependecies (if sub workspaces need to be build as well)

      // src-less-prod folder
      [--src-less-prod-disable]              disable create the prod src-less folder
      [--src-less-prod-glob={value}]         extra files to copy to src-less folder

      // main workspace
      [--json-file-disable]                  disable create json file
      [--json-file-prod-disable]             disable create json prod json file (withtout dev-dependencies)
      [--output-folder]                      folder to create all generated files (default to _isolated_)
      [--include-root-deps]                  include root workspaces package.json dependencies and dev dependencies
      [--disable-root-config]                disable root package.json pnpm config (like overrides)

      // files
      [--src-files-enable]                   copy all src file of main workspace to isolate folder
      [--src-files-exclude-glob={value}]     copy src file of main workspace by glob
      [--src-files-include-glob={value}]     copy src file of main workspace by glob
      [--workspaces-exclude-glob={value}]    exclude glob when copy workspaces (default: node_modules and selected output-folder)

      // workspaces folder configuration
      [--max-depth]                          by default we search recursively project-root 5 folder
      [--project-folder={value}]             absolute path to project-root (default will look for the root)
  `);

    process.exit(0);
  }

  return {
    rootDir,
    rootPackageJson,
    workspaceName,
    workspaceData,
    prodWorkspaces,
    devWorkspaces,
    relatedWorkspaces,
    projectWorkspaces,
    pnpmrcDisable,
    pnpmLockFile,
    srcLessDisable,
    srcLessGlob,
    srcLessProdDisable,
    srcLessProdGlob,
    srcLessSubDev,
    jsonFileDisable,
    jsonFileProdDisable,
    outputFolder,
    srcFilesEnable,
    srcFilesPackageJson,
    srcFilesIncludeGlob,
    srcFilesExcludeGlob,
    workspacesExcludeGlob,
    isolateFolder,
    workspacesFolder,
    srcLessFolder,
    srcLessFolderProd,
    includeRootDeps,
    disableRootConfig,
  };
}

module.exports = {
  getParams,
};
