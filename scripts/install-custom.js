const process = require('process');
const fs = require('fs');
const {execSync} = require('child_process');

const repoBase = "https://github.com/EvilInnocence-Studios/";

// Get the list of modules
const modules = JSON.parse(fs.readFileSync("./package.custom.json"));

// Move to the src directory
process.chdir("./src");

Object.keys(modules).forEach(module => {
    // Get the repo location and branch name of the module
    const {repo, branch} = modules[module];

    // Determine if the branch is a tag or normal branch
    const isTag = branch.startsWith("tags/");

    try {
        if(fs.existsSync(module)) {
            // If the module already exists, then just update it
            console.log(`Updating ${module} - ${repo}:${branch}`);
            execSync(`git fetch --all && git checkout ${branch}${!isTag ? ' && git pull': ''}`, {cwd: module, stdio: 'ignore'});
        } else {
            // Otherwise, make the module directory and clone the repo
            console.log(`Installing ${module} - ${repo}:${branch}`);
            execSync(`mkdir ${module} && cd ${module} && git clone ${repoBase}${repo}.git . && git checkout ${branch}`, {stdio: 'ignore'});
        }
    } catch(e) {
        console.error(`Failed to install ${module} - ${repo}:${branch}`, e);
    }
});
