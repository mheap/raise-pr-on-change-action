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
    const mode = core.getInput("mode") || "check-upstream";
    const prBranch = core.getInput("prBranch", { required: true });
    const targetBranch = core.getInput("targetBranch") || "main";
    const prTitle = core.getInput("prTitle", { required: true });
    const prBody = core.getInput("prBody", { required: true });

    // Read the config file
    const upstreams = JSON.parse(fs.readFileSync(configFile));

    // Check that mode is valid
    const validModes = ["pr-changes", "check-upstream"];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode provided: ${mode}`);
    }

    let changedFiles = [];
    if (mode == "pr-changes") {
      // Grab files that changed in this PR
      changedFiles = (
        await octokit.paginate(
          octokit.rest.pulls.listFiles,
          {
            ...github.context.repo,
            pull_number: github.context.issue.number,
          },
          (response) => response.data
        )
      ).map((f) => f.filename);
    }

    for (const upstream in upstreams) {
      console.log("Processing " + upstream);
      const files = upstreams[upstream];

      const [owner, repo] = upstream.split("/", 2);

      const commitFiles = {};

      for (let f of files) {
        // Check if the file changed in this PR
        if (mode == "pr-changes" && !changedFiles.includes(f.src)) {
          continue;
        }

        const content = fs.readFileSync(f.src);

        if (mode == "check-upstream") {
          // Get contents from the upstream repo and compare to the new value
          try {
            const { data: upstreamContent } =
              await octokit.rest.repos.getContent({
                owner,
                repo,
                path: f.dest,
              });

            if (content == upstreamContent) {
              // No change to the contents, continue
              continue;
            }
          } catch (e) {
            // 404 isn't an error here. It means the file doesn't exist and
            // we can assume that it needs to be created
            if (e.status != "404") {
              throw e;
            }
          }
        }

        // If so, add it to the list of files to push downstream
        commitFiles[f.dest] = content;
      }

      // Fetch the PR for this branch
      let pr = (
        await octokit.rest.pulls.list({
          owner,
          repo,
          head: `${owner}:${prBranch}`,
        })
      ).data[0];

      // If there are no changes, don't raise a PR
      // and close any existing PRs
      if (Object.keys(commitFiles).length == 0) {
        console.log(`No files changed for '${upstream}'`);
        if (pr) {
          console.log("Closing existing PR that has no changed files");
          await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number: pr.pull_request.number,
            state: "closed",
          });
        }
        continue;
      }

      let message =
        "Automated OAS update: " + Object.keys(commitFiles).join(", ");

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
    console.error(e);
    core.setFailed(e.message);
    core.setOutput("status", "failure");
  }
}

/* istanbul ignore next */
if (require.main === module) {
  action();
}

module.exports = action;
