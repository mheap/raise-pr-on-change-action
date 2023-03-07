const core = require("@actions/core");
const github = require("@actions/github");

const CommitMultipleFiles = require("octokit-commit-multiple-files");

const fs = require("fs");

async function action() {
  try {
    const token = core.getInput("token", { required: true });
    const octokit = github.getOctokit(token, {}, CommitMultipleFiles);

    // Process input for use later
    const configFile = core.getInput("configFile");
    const prBranch = core.getInput("prBranch", { required: true });
    const targetBranch = core.getInput("targetBranch") || "main";
    const prTitle = core.getInput("prTitle", { required: true });
    const prBody = core.getInput("prBody", { required: true });

    // Read the config file
    const upstreams = JSON.parse(fs.readFileSync(configFile));

    // Grab files that changed in this PR
    const changedFiles = (
      await octokit.paginate(
        octokit.rest.pulls.listFiles,
        {
          ...github.context.repo,
          pull_number: github.context.issue.number,
        },
        (response) => response.data
      )
    ).map((f) => f.filename);

    for (const upstream in upstreams) {
      console.log("Processing " + upstream);
      const files = upstreams[upstream];

      const [owner, repo] = upstream.split("/", 2);

      const commitFiles = {};
      let message =
        "Automated OAS update: " + files.map((f) => f.dest).join(", ");

      for (let f of files) {
        // Check if the file changed in this PR
        if (!changedFiles.includes(f.src)) {
          continue;
        }

        // If so, add it to the list of files to push downstream
        commitFiles[f.dest] = fs.readFileSync(f.src);
      }

      if (Object.keys(commitFiles).length == 0) {
        console.log(`No files changed for '${upstream}'`);
        continue;
      }

      const opts = {
        owner,
        repo,
        branch: prBranch,
        createBranch: true,
        forkFromBaseBranch: true,
        changes: [
          {
            message,
            files: commitFiles,
          },
        ],
        base: targetBranch,
      };

      await octokit.rest.repos.createOrUpdateFiles(opts);

      // Create a PR with this commit hash if it doesn't exist
      let pr = (
        await octokit.rest.pulls.list({
          owner,
          repo,
          head: `${owner}:${prBranch}`,
        })
      ).data[0];

      if (!pr) {
        console.log("Creating PR");
        pr = (
          await octokit.rest.pulls.create({
            owner,
            repo,
            title: prTitle,
            body: prBody,
            head: prBranch,
            base: targetBranch,
          })
        ).data;
        console.log("PR created");
      } else {
        console.log("PR already exists. Not creating another");
      }
    }
    core.setOutput("status", "success");
  } catch (e) {
    console.log(e);
    core.setFailed(e.message);
    core.setOutput("status", "failure");
  }
}

/* istanbul ignore next */
if (require.main === module) {
  action();
}

module.exports = action;
