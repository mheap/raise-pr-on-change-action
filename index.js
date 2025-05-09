const core = require("@actions/core");
const github = require("@actions/github");

const Diff = require("diff");

const CommitMultipleFiles = require("octokit-commit-multiple-files");
const { retry } = require("@octokit/plugin-retry");

const fs = require("fs");

async function action() {
  try {
    const token = core.getInput("token", { required: true });
    const octokit = github.getOctokit(
      token,
      {
        retry: {
          enabled: true,
          retryAfter: 5,
          retries: 5,
        },
      },
      CommitMultipleFiles,
      retry
    );

    // Process input for use later
    const configFile = core.getInput("configFile");
    const mode = core.getInput("mode") || "check-upstream";
    const prBranch = core.getInput("prBranch", { required: true });
    const targetBranch = core.getInput("targetBranch") || "main";
    const prTitle = core.getInput("prTitle", { required: true });
    const prBody = core.getInput("prBody", { required: true });
    const commitMessage = core.getInput("commitMessage") || "";

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
      console.log("--------------------------------");
      const removedFiles = [];
      const [owner, repo] = upstream.split("/", 2);

      console.log(`[${owner}/${repo}] Processing`);
      const files = upstreams[upstream];

      const commitFiles = {};

      for (let f of files) {
        // Check if the file changed in this PR
        if (mode == "pr-changes" && !changedFiles.includes(f.src)) {
          continue;
        }

        // Check if the file exists
        let content = "";
        if (fs.existsSync(f.src)) {
          content = fs.readFileSync(f.src);
        } else {
          // If it exists in the repo, we need to remove it
          try {
            if (mode == "check-upstream") {
              await octokit.rest.repos.getContent({
                method: "HEAD",
                owner,
                repo,
                path: f.dest,
              });
            }
            removedFiles.push(f.dest);
          } catch (e) {
            // 404 means the file doesn't exist upstream, so there's nothing to delete
            if (e.status != "404") {
              throw e;
            }
          }
          // Then always continue as we've done the mode check
          continue;
        }

        if (mode == "check-upstream") {
          // Get contents from the upstream repo and compare to the new value
          try {
            const { data: upstreamContent } =
              await octokit.rest.repos.getContent({
                owner,
                repo,
                path: f.dest,
              });

            // Convert from base64
            const upstreamContentDecoded = Buffer.from(
              upstreamContent.content,
              "base64"
            ).toString("utf-8");

            if (content == upstreamContentDecoded) {
              console.log(`[${owner}/${repo}] Files are the same, skipping (${f.src} => ${f.dest})`);
              // No change to the contents, continue
              continue;
            } else {
              if (process.env.ACTIONS_RUNNER_DEBUG) {
                const patch = Diff.createTwoFilesPatch(
                  "upstream.yaml",
                  "openapi.yaml",
                  upstreamContentDecoded,
                  content
                );
                console.log(patch);
              }
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
      const changedFilesCount = Object.keys(commitFiles).length;
      const removedFilesCount = removedFiles.length;
      if (changedFilesCount == 0 && removedFilesCount == 0) {
        console.log(`[${owner}/${repo}] No files changed`);
        if (pr) {
          console.log(
            `[${owner}/${repo}] Closing existing PR that has no changed files`
          );
          await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number: pr.number,
            state: "closed",
          });
        }
        continue;
      }

      console.log(
        `[${owner}/${repo}] Found ${changedFilesCount} changed files and ${removedFilesCount} removed files`
      );

      let message = commitMessage ||
        "Automated OAS update: " +
        Object.keys(commitFiles).concat(removedFiles).join(", ");

      console.log(`[${owner}/${repo}] Commit message: ${message}`);

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
            filesToDelete: removedFiles,
            ignoreDeletionFailures: true,
          },
        ],
        base: targetBranch,
      };

      await octokit.createOrUpdateFiles(opts);

      // Create a PR with this commit hash if it doesn't exist
      if (!pr) {
        console.log(`[${owner}/${repo}] Creating PR`);
        try {
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
          console.log(`[${owner}/${repo}] PR created`);
        } catch (e) {
          core.setFailed(`[${owner}/${repo}] ${e.message}`);
        }
      } else {
        console.log(
          `[${owner}/${repo}] PR already exists ${pr.html_url}. Not creating another`
        );
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
