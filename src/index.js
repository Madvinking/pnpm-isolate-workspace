#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import readDirSync from 'fs-readdir-recursive';
import * as lockfile from '@pnpm/lockfile.fs';
import * as pruneLockfile from '@pnpm/lockfile.pruner';
import * as glob from 'glob';
import { getParams } from './params.js';
import YAML from 'yaml';

async function start() {
  const {
    rootDir,
    disableRootConfig,
    rootPackageJson,
    outputFolder,
    workspaceData,
    prodWorkspaces,
    relatedWorkspaces,
    projectWorkspaces,
    pnpmLockFile,
    srcLessDisable,
    srcLessSubDev,
    srcLessGlob,
    srcLessProdDisable,
    srcLessProdGlob,
    jsonFileDisable,
    jsonFileProdDisable,
    srcFilesEnable,
    srcFilesIncludeGlob,
    srcFilesExcludeGlob,
    workspacesExcludeGlob,
    includeRootDeps,
    isolateFolder,
    workspacesFolder,
    srcLessFolder,
    srcLessFolderProd,
  } = await getParams();

  const ignorePatterns = ['.', 'package.json', 'node_modules', outputFolder];

  function createDestinationFolders() {
    if (fs.existsSync(isolateFolder)) fs.rmSync(isolateFolder, { recursive: true });
    fs.mkdirSync(workspacesFolder, { recursive: true });
    if (srcFilesExcludeGlob) {
      const files = glob.sync(srcFilesExcludeGlob, { cwd: workspaceData.location, absolute: true, ignore: ignorePatterns });
      const filesToCopy = readDirSync(
        workspaceData.location,
        (name, i, dir) => !ignorePatterns.includes(name) && !files.includes(`${dir}/${name}`),
      );
      filesToCopy.forEach(file =>
        fse.copySync(path.join(workspaceData.location, file), path.join(isolateFolder, file), { preserveTimestamps: true }),
      );
    } else if (srcFilesIncludeGlob) {
      const files = glob.sync(srcFilesIncludeGlob, { cwd: workspaceData.location, absolute: true, ignore: ignorePatterns });
      files.forEach(file =>
        fse.copySync(file, path.join(isolateFolder, path.relative(workspaceData.location, file)), { preserveTimestamps: true }),
      );
    } else if (srcFilesEnable) {
      const filesToCopy = readDirSync(workspaceData.location, name => !ignorePatterns.includes(name));
      filesToCopy.forEach(file =>
        fse.copySync(path.join(workspaceData.location, file), path.join(isolateFolder, file), { preserveTimestamps: true }),
      );
    }
  }

  function resolveWorkspacesNewLocation() {
    relatedWorkspaces.forEach(name => {
      const subWorkspace = projectWorkspaces[name];
      const relativePath = path.relative(rootDir, subWorkspace.location);
      subWorkspace.newLocation = path.join(workspacesFolder, relativePath);

      subWorkspace.pkgJsonLocation = path.join(subWorkspace.newLocation, 'package.json');
      fs.mkdirSync(subWorkspace.newLocation, { recursive: true });

      if (!srcLessSubDev) subWorkspace.pkgJson.devDependencies = {};
      fs.writeFileSync(subWorkspace.pkgJsonLocation, JSON.stringify(subWorkspace.pkgJson, null, 2));

      const files = workspacesExcludeGlob
        ? glob.sync(workspacesExcludeGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePatterns })
        : [];

      const filesToCopy = readDirSync(
        subWorkspace.location,
        (name, i, dir) => !ignorePatterns.includes(name) && !files.includes(`${dir}/${name}`),
      );

      filesToCopy.forEach(file =>
        fse.copySync(path.join(subWorkspace.location, file), path.join(subWorkspace.newLocation, file), {
          preserveTimestamps: true,
        }),
      );
    });
  }

  function copySrcLessToNewLocation() {
    if (!srcLessDisable) {
      fs.mkdirSync(srcLessFolder, { recursive: true });
      relatedWorkspaces.forEach(name => {
        const subWorkspace = projectWorkspaces[name];
        const relativePath = path.relative(rootDir, subWorkspace.location);
        const subWorkspaceSrcLessFolder = path.join(srcLessFolder, relativePath);
        fs.mkdirSync(subWorkspaceSrcLessFolder, { recursive: true });

        fs.writeFileSync(path.join(subWorkspaceSrcLessFolder, 'package.json'), JSON.stringify(subWorkspace.pkgJson, null, 2), {
          flag: 'wx',
        });
        if (srcLessGlob) {
          const files = glob.sync(srcLessGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePatterns });

          files.forEach(file =>
            fse.copySync(file, path.join(subWorkspaceSrcLessFolder, path.relative(subWorkspace.location, file)), {
              preserveTimestamps: true,
            }),
          );
        }
      });
    }
  }

  function copySrcLessProdToNewLocation() {
    if (!srcLessProdDisable) {
      fs.mkdirSync(srcLessFolderProd, { recursive: true });
      prodWorkspaces.forEach(name => {
        const subWorkspace = projectWorkspaces[name];
        const relativePath = path.relative(rootDir, subWorkspace.location);
        const subWorkspaceSrcLessProdFolder = path.join(srcLessFolderProd, relativePath);
        fs.mkdirSync(subWorkspaceSrcLessProdFolder, { recursive: true });

        fs.writeFileSync(path.join(subWorkspaceSrcLessProdFolder, 'package.json'), JSON.stringify(subWorkspace.pkgJson, null, 2), {
          flag: 'wx',
        });

        if (srcLessProdGlob) {
          const files = glob.sync(srcLessProdGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePatterns });

          files.forEach(file =>
            fse.copySync(file, path.join(subWorkspaceSrcLessProdFolder, path.relative(subWorkspace.location, file)), {
              preserveTimestamps: true,
            }),
          );
        }
      });
    }
  }

  function createMainJsonFile() {
    let currentDevDependencies = {};

    currentDevDependencies = JSON.parse(JSON.stringify(workspaceData.pkgJson.devDependencies || {}));

    if (includeRootDeps) {
      currentDevDependencies = {
        ...rootPackageJson.devDependencies,
        ...currentDevDependencies,
      };
    }

    if (!disableRootConfig && rootPackageJson.pnpm) {
      workspaceData.pkgJson.pnpm = rootPackageJson.pnpm;
    }

    if (includeRootDeps) {
      workspaceData.pkgJson.dependencies = {
        ...rootPackageJson.dependencies,
        ...workspaceData.pkgJson.dependencies,
      };
    }

    if (!jsonFileProdDisable) {
      workspaceData.pkgJson.devDependencies = {};
      fs.writeFileSync(path.join(isolateFolder, 'package-prod.json'), JSON.stringify(workspaceData.pkgJson, null, 2));
    }

    workspaceData.pkgJson.devDependencies = currentDevDependencies;
    if (!jsonFileDisable) {
      fs.writeFileSync(path.join(isolateFolder, 'package.json'), JSON.stringify(workspaceData.pkgJson, null, 2));
    }
  }

  function createWorkspaceYaml() {
    const file = fs.readFileSync(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf8');
    const workspaceYamlFile = YAML.parse(file);

    workspaceYamlFile.packages = relatedWorkspaces.map(name => projectWorkspaces[name].resolvePath);

    fs.writeFileSync(path.join(isolateFolder, 'pnpm-workspace.yaml'), YAML.stringify(workspaceYamlFile));
  }

  async function createPnpmLock() {
    if (!pnpmLockFile) return;

    if (!fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
      console.warn('no pnpm-lock.yaml file on project root');
      return;
    }

    const importersNames = relatedWorkspaces.map(name => projectWorkspaces[name].relativePath);

    let lfData = await lockfile.readWantedLockfile(rootDir, 'utf8');

    Object.keys(lfData.importers).forEach(key => {
      if (!importersNames.includes(key) && key !== workspaceData.relativePath && key !== '.') delete lfData.importers[key];
    });

    const targetWorkspace = JSON.parse(JSON.stringify(lfData.importers[workspaceData.relativePath]));

    lfData.importers['.'] = {
      specifiers: {
        ...(includeRootDeps && lfData.importers['.'].specifiers ? lfData.importers['.'].specifiers : {}),
        ...(targetWorkspace.specifiers || {}),
      },
      dependencies: {
        ...(includeRootDeps && lfData.importers['.'].dependencies ? lfData.importers['.'].dependencies : {}),
        ...(targetWorkspace.dependencies || {}),
      },
      devDependencies: {
        ...(includeRootDeps && lfData.importers['.'].devDependencies ? lfData.importers['.'].devDependencies : {}),
        ...(targetWorkspace.devDependencies || {}),
      },
    };
    delete lfData.importers[workspaceData.relativePath];

    if (lfData.importers['.'].dependencies) {
      Object.keys(lfData.importers['.'].dependencies).forEach(depName => {
        if (relatedWorkspaces.includes(depName)) {
          lfData.importers['.'].dependencies[depName] = `link:${projectWorkspaces[depName].resolvePath}`;
        }
      });
    }

    if (lfData.importers['.'].devDependencies) {
      Object.keys(lfData.importers['.'].devDependencies).forEach(depName => {
        if (relatedWorkspaces.includes(depName)) {
          lfData.importers['.'].devDependencies[depName] = `link:${projectWorkspaces[depName].resolvePath}`;
        }
      });
    }

    Object.keys(lfData.importers)
      .filter(n => n !== '.')
      .forEach(currentKey => {
        const workspaceName = relatedWorkspaces.find(name => projectWorkspaces[name].relativePath === currentKey);
        const key = `workspaces/${currentKey}`;
        lfData.importers[key] = lfData.importers[currentKey];
        delete lfData.importers[currentKey];
        if (lfData.importers[key].dependencies) {
          Object.keys(lfData.importers[key].dependencies).forEach(depName => {
            if (relatedWorkspaces.includes(depName)) {
              lfData.importers[key].dependencies[depName] = `link:${path.relative(
                projectWorkspaces[workspaceName].newLocation,
                projectWorkspaces[depName].newLocation,
              )}`;
            }
          });
        }

        if (lfData.importers[key].devDependencies) {
          if (!srcLessSubDev) {
            Object.keys(lfData.importers[key].devDependencies).forEach(depName => {
              delete lfData.importers[key].specifiers[depName];
            });
            lfData.importers[key].devDependencies = {};
          } else {
            Object.keys(lfData.importers[key].devDependencies).forEach(depName => {
              if (relatedWorkspaces.includes(depName)) {
                lfData.importers[key].devDependencies[depName] = `link:${path.relative(
                  projectWorkspaces[workspaceName].newLocation,
                  projectWorkspaces[depName].newLocation,
                )}`;
              }
            });
          }
        }
      });

    const prunedLockFile = await pruneLockfile.pruneSharedLockfile(lfData);
    await lockfile.writeWantedLockfile(isolateFolder, prunedLockFile);
  }

  createDestinationFolders();
  resolveWorkspacesNewLocation();
  copySrcLessToNewLocation();
  copySrcLessProdToNewLocation();
  createMainJsonFile();
  createWorkspaceYaml();
  await createPnpmLock();
}

start();
