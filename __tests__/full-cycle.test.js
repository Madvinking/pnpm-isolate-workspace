import { execSync } from 'child_process';
import fse from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import lockfile from '@pnpm/lockfile.fs';
import YAML from 'yaml';
import { afterEach, describe, expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootFolder = path.join(__dirname, 'monoRepo');
const workspaceFolder = path.join(__dirname, 'monoRepo/packages/root-workspace');
const workspaceFolder1 = path.join(__dirname, 'monoRepo/packages/workspace-1');

const runWithParam = (params = '', workspace = 'root-workspace') => {
  execSync(
    `node ${path.join(__dirname, '../src/index.js')} --project-folder=${path.join(__dirname, 'monoRepo')} ${workspace} ${params}`,
    { stdio: 'inherit' },
  );
};

const clean = () => {
  execSync(
    ` rm -rf ${workspaceFolder}/_isolated_ ${workspaceFolder}/_isolated-other_ ${workspaceFolder1}/_isolated_ ${workspaceFolder1}/_isolated-other_`,
  );
};

describe('full cycle of isolated', () => {
  afterEach(clean);

  test('should create all files', async () => {
    runWithParam();

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_`);
    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
    ]);

    const workspaceYaml = [
      'workspaces/packages/workspace-1',
      'workspaces/packages/workspace-2',
      'workspaces/packages/workspace3',
      'workspaces/packages/workspace-4',
      'workspaces/packages/workspace11',
      'workspaces/packages/workspace12',
      'workspaces/packages/workspace13',
      'workspaces/packages/workspace16',
    ];

    const currentYaml = YAML.parse(fse.readFileSync(`${workspaceFolder}/_isolated_/pnpm-workspace.yaml`).toString());

    expect(currentYaml.packages).toEqual(workspaceYaml);

    const listOfAllWorkspaces = [
      'workspace-1',
      'workspace-2',
      'workspace-4',
      'workspace11',
      'workspace12',
      'workspace13',
      'workspace16',
      'workspace3',
    ];

    expect(fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces/packages`)).toEqual(listOfAllWorkspaces);

    expect(fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces-src-less/packages`)).toEqual(listOfAllWorkspaces);

    expect(fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces-src-less-prod/packages`)).toEqual([
      'workspace-1',
      'workspace-2',
      'workspace-4',
      'workspace3',
    ]);

    expect(fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces/packages/workspace-1`)).toEqual([
      'nestedFolder',
      'package.json',
      'src.js',
    ]);

    expect(fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces-src-less/packages/workspace-1`)).toEqual(['package.json']);

    expect(fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces-src-less-prod/packages/workspace-1`)).toEqual([
      'package.json',
    ]);

    const rootPackageJSON = JSON.parse(fse.readFileSync(`${rootFolder}/package.json`).toString());
    const mainPackageJSON = JSON.parse(fse.readFileSync(`${workspaceFolder}/package.json`).toString());
    const generatedPackageJSON = JSON.parse(fse.readFileSync(`${workspaceFolder}/_isolated_/package.json`).toString());

    expect(mainPackageJSON.dependencies).toEqual(generatedPackageJSON.dependencies);
    expect(mainPackageJSON.devDependencies).toEqual(generatedPackageJSON.devDependencies);
    expect(rootPackageJSON.pnpm).toEqual(generatedPackageJSON.pnpm);

    const generatedProdPackageJSON = JSON.parse(fse.readFileSync(`${workspaceFolder}/_isolated_/package-prod.json`).toString());

    expect(mainPackageJSON.dependencies).toEqual(generatedPackageJSON.dependencies);
    expect(generatedProdPackageJSON.devDependencies).toEqual({});
    expect(rootPackageJSON.pnpm).toEqual(generatedProdPackageJSON.pnpm);

    let lfData = await lockfile.readWantedLockfile(`${workspaceFolder}/_isolated_`, 'utf8');

    expect(lfData.importers['.'].specifiers).toEqual({
      'in-root-dep-1': '1.0.0',
      'in-root-dep-2': '2.0.0',
      'in-root-dev-dep-1': '1.0.0',
      'in-root-dev-dep-2': '2.0.0',
      'workspace-1': 'workspace:1.0.0',
      'workspace-11': 'workspace:1.0.0',
      'workspace-12': 'workspace:1.0.0',
      'workspace-2': 'workspace:1.0.0',
    });

    expect(lfData.importers['.'].dependencies).toEqual({
      'in-root-dep-1': '1.0.0',
      'in-root-dep-2': '2.0.0',
      'workspace-1': 'link:workspaces/packages/workspace-1',
      'workspace-2': 'link:workspaces/packages/workspace-2',
    });

    expect(lfData.importers['.'].devDependencies).toEqual({
      'in-root-dev-dep-1': '1.0.0',
      'in-root-dev-dep-2': '2.0.0',
      'workspace-11': 'link:workspaces/packages/workspace11',
      'workspace-12': 'link:workspaces/packages/workspace12',
    });
  });

  test('should keep only relevant packages in the isolated lockfile', async () => {
    runWithParam();
    const originalLockFile = await lockfile.readWantedLockfile(`${rootFolder}`, 'utf8');

    const isolatedLockFile = await lockfile.readWantedLockfile(`${workspaceFolder}/_isolated_`, 'utf8');

    expect(isolatedLockFile.packages).not.toEqual(originalLockFile.packages);
    expect(Object.keys(originalLockFile.packages)).toEqual(['fs-e@10.0.0', 'is-zero@1.0.0']);
    expect(Object.keys(isolatedLockFile.packages)).toEqual(['is-zero@1.0.0']);
  });

  test('--include-root-deps: generated in a different output folder', async () => {
    runWithParam('--include-root-deps');

    let lfData = await lockfile.readWantedLockfile(`${workspaceFolder}/_isolated_`, 'utf8');
    expect(lfData.importers['.'].specifiers).toEqual({
      'dev-dep': '2.2.1',
      'fs-e': '^10.0.0',
      'in-root-dep-1': '1.0.0',
      'in-root-dep-2': '2.0.0',
      'in-root-dev-dep-1': '1.0.0',
      'in-root-dev-dep-2': '2.0.0',
      'workspace-1': 'workspace:1.0.0',
      'workspace-11': 'workspace:1.0.0',
      'workspace-12': 'workspace:1.0.0',
      'workspace-2': 'workspace:1.0.0',
    });

    expect(lfData.importers['.'].dependencies).toEqual({
      'fs-e': '10.0.0',
      'in-root-dep-1': '1.0.0',
      'in-root-dep-2': '2.0.0',
      'workspace-1': 'link:workspaces/packages/workspace-1',
      'workspace-2': 'link:workspaces/packages/workspace-2',
    });

    expect(lfData.importers['.'].devDependencies).toEqual({
      'dev-dep': '2.2.1',
      'in-root-dev-dep-1': '1.0.0',
      'in-root-dev-dep-2': '2.0.0',
      'workspace-11': 'link:workspaces/packages/workspace11',
      'workspace-12': 'link:workspaces/packages/workspace12',
    });
  });

  test('--output-folder: generated in a different output folder', async () => {
    runWithParam('--output-folder=_isolated-other_');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated-other_`);
    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
    ]);

    expect(fse.existsSync(`${workspaceFolder}/_isolated_`)).toEqual(false);
  });

  test.skip('--npmrc-disable: generate .npmrc', async () => {
    runWithParam('--pnpmrc-disable');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_`);
    expect(folder).toEqual([
      '.yarnrc',
      'package-prod.json',
      'package.json',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
      'yarn.lock',
    ]);

    expect(fse.readFileSync(`${workspaceFolder}/_isolated_/.yarnrc`, { encoding: 'utf-8' })).toEqual(
      'workspaces-experimental true',
    );
  });

  test('--pnpm-lock-file: disable yarn lock creation', async () => {
    runWithParam('--pnpm-lock-file');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_`);
    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
    ]);
  });

  test('--src-less-disable: disable src less folder creation', async () => {
    runWithParam('--src-less-disable');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_`);
    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less-prod',
    ]);
  });

  test('--src-less-prod-disable]: disable src less prod folder creation', async () => {
    runWithParam('--src-less-prod-disable]');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_`);
    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
    ]);
  });

  test('--json-file-disable: disable json file creation', async () => {
    runWithParam('--json-file-disable');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_`);
    expect(folder).toEqual([
      'package-prod.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
    ]);
  });

  test('--json-file-prod-disable: disable json prod file creation', async () => {
    runWithParam('--json-file-prod-disable');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_`);
    expect(folder).toEqual([
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
    ]);
  });

  test('should not copy nested output folders (default _isolated_)', async () => {
    runWithParam('--output-folder=_isolated-other_', 'workspace-1');
    runWithParam('--output-folder=_isolated-other_');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated-other_/workspaces/packages/workspace-1`);

    expect(folder).toEqual(['nestedFolder', 'package.json', 'src.js']);
  });

  test('should filter by regex when copy files (default _isolated_ & node_modules)', async () => {
    runWithParam('--output-folder=_isolated-other_', 'workspace-1');
    runWithParam(`--output-folder=_isolated-other_ --workspaces-exclude-glob='src.js'`);

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated-other_/workspaces/packages/workspace-1`);

    expect(folder).toEqual(['nestedFolder', 'package.json']);
  });

  test('--src-less-glob: should include in src-less param', async () => {
    runWithParam(`--src-less-glob='src.js'`);

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces-src-less/packages/workspace-1`);

    expect(folder).toEqual(['package.json', 'src.js']);
  });

  test('--src-less-prod-glob: should include in src-less param nested', async () => {
    runWithParam(`--src-less-prod-glob='nestedFolder/nestedFile.js'`);

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_/workspaces-src-less-prod/packages/workspace-1`);

    expect(folder).toEqual(['nestedFolder', 'package.json']);
  });

  test('--src-files-enable: should include main workspace src files', async () => {
    runWithParam('--src-files-enable --src-less-disable');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_/`);

    expect(folder).toEqual([
      'no.js',
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'src.js',
      'workspaces',
      'workspaces-src-less-prod',
    ]);
  });

  test('--src-files-exclude-glob: should exclude main workspace received values', async () => {
    runWithParam("--src-files-exclude-glob='no.js' --src-less-disable");

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_/`);

    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'src.js',
      'workspaces',
      'workspaces-src-less-prod',
    ]);
  });

  test('--src-files-include-glob: should exclude main workspace received values', async () => {
    runWithParam("--src-files-include-glob='src.js' --src-less-disable");

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_/`);

    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'src.js',
      'workspaces',
      'workspaces-src-less-prod',
    ]);
  });

  test('--src-less-sub-dev-deps: should include sub workspaces dev deps', async () => {
    runWithParam('--src-less-sub-dev-deps');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_/`);

    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
    ]);

    const subWorkspacePackageJson = JSON.parse(
      fse.readFileSync(`${workspaceFolder}/_isolated_/workspaces-src-less/packages/workspace-1/package.json`).toString(),
    );

    // With '--src-less-sub-dev-deps', we include the 'devDependencies'
    expect(subWorkspacePackageJson.devDependencies).toEqual({
      'in-w1-dev-dep-1': '1.0.0',
      'in-w1-dev-dep-2': '2.0.0',
      'workspace-11': 'workspace:1.0.0',
      'workspace-13': 'workspace:1.0.0',
      'workspace-15': 'workspace:1.0.0',
    });

    const subWorkspacePackageJson2 = JSON.parse(
      fse.readFileSync(`${workspaceFolder}/_isolated_/workspaces-src-less/packages/workspace13/package.json`).toString(),
    );

    // Also include the 'devDependencies' of those 'devDependencies'
    expect(subWorkspacePackageJson2.devDependencies).toEqual({
      'in-w13-dev-dep-1': '1.0.0',
      'in-w13-dev-dep-2': '2.0.0',
      'workspace-17': 'workspace:1.0.0',
    });

    // Make sure we've copied over those workspaces
    // workspace-1 -> workspace-15 -> workspace-17
    expect(fse.existsSync(`${workspaceFolder}/_isolated_/workspaces-src-less/packages/workspace17/package.json`)).toEqual(true);

    const subWorkspacePackageJson3 = JSON.parse(
      fse.readFileSync(`${workspaceFolder}/_isolated_/workspaces-src-less/packages/workspace17/package.json`).toString(),
    );

    expect(subWorkspacePackageJson3.name).toEqual('workspace-17');
  });

  test('--include-root-deps: should include root package json dev and prod deps', async () => {
    runWithParam('--include-root-deps');

    const folder = fse.readdirSync(`${workspaceFolder}/_isolated_/`);

    expect(folder).toEqual([
      'package-prod.json',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'workspaces',
      'workspaces-src-less',
      'workspaces-src-less-prod',
    ]);

    const mainPackageJson = JSON.parse(fse.readFileSync(`${workspaceFolder}/_isolated_/package.json`).toString());

    expect(mainPackageJson.dependencies).toEqual({
      'in-root-dep-1': '1.0.0',
      'in-root-dep-2': '2.0.0',
      'root-dep': '1',
      'workspace-1': 'workspace:1.0.0',
      'workspace-2': 'workspace:1.0.0',
    });

    expect(mainPackageJson.devDependencies).toEqual({
      'in-root-dev-dep-1': '1.0.0',
      'in-root-dev-dep-2': '2.0.0',
      'root-dev-dep': '1',
      'workspace-11': 'workspace:1.0.0',
      'workspace-12': 'workspace:1.0.0',
    });

    const packageJsonProd = JSON.parse(fse.readFileSync(`${workspaceFolder}/_isolated_/package-prod.json`).toString());

    expect(packageJsonProd.dependencies).toEqual({
      'in-root-dep-1': '1.0.0',
      'in-root-dep-2': '2.0.0',
      'root-dep': '1',
      'workspace-1': 'workspace:1.0.0',
      'workspace-2': 'workspace:1.0.0',
    });

    expect(packageJsonProd.devDependencies).toEqual({});
  });

  test('--disable-root-config: should not copy root pnpm config', async () => {
    runWithParam('--disable-root-config');

    const generatedPackageJSON = JSON.parse(fse.readFileSync(`${workspaceFolder}/_isolated_/package.json`).toString());

    expect(generatedPackageJSON.pnpm).toEqual(undefined);
  });
});
