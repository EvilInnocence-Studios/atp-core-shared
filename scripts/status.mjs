import { execSync } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { table } from 'table';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcDir = path.resolve(__dirname, '../..');
const repos = fs.readdirSync(srcDir).filter(dir => fs.existsSync(path.join(srcDir, dir, '.git')));

const getRepoStatus = (repoPath) => {
    const name = path.basename(repoPath);
    const statusOutput = execSync('git status --porcelain', { cwd: repoPath }).toString();
    const unstagedChanges = statusOutput.split('\n').some(line => line.startsWith(' M') || line.startsWith('??'));
    const changesToPush = execSync('git log origin/main..HEAD', { cwd: repoPath }).toString().trim().length > 0;
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath }).toString().trim();
    const remoteUrl = execSync('git config --get remote.origin.url', { cwd: repoPath }).toString().trim();
    return { name, unstagedChanges, changesToPush, currentBranch, remoteUrl };
};

const repoStatuses = repos.map(repo => getRepoStatus(path.join(srcDir, repo)));
const mainRepoStatus = {
    ...getRepoStatus(path.resolve(srcDir, '..')),
    name: "<root>",
};
repoStatuses.unshift(mainRepoStatus);

const data = [
    ['Module', 'Branch', 'Committed?', 'Pushed?', 'Remote URL'],
    ...repoStatuses.map(({ name, unstagedChanges, changesToPush, currentBranch, remoteUrl }) => [
        unstagedChanges ? chalk.red(name) : changesToPush ? chalk.yellow(name) : chalk.green(name),
        chalk.blue(currentBranch),
        unstagedChanges ? chalk.red('    ✕') : chalk.green('    ✓'),
        changesToPush ? chalk.yellow('   ✕') : chalk.green('   ✓'),
        chalk.blue(remoteUrl)
    ])
];

console.log(table(data));
