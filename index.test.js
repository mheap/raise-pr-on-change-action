const fs = require("fs");

const action = require(".");
const core = require("@actions/core");
const github = require("@actions/github");

const { when } = require("jest-when");
const mockedEnv = require("mocked-env");
const nock = require("nock");
nock.disableNetConnect();

const owner = "mheap";
const repo = "downstream-test";

const prBranch = "automated-oas-update";
const targetBranch = "main";

const defaultConfig = {
  INPUT_CONFIGFILE: ".github/config.json",
  INPUT_PRBRANCH: prBranch,
  INPUT_PRTITLE: "Hello",
  INPUT_PRBODY: "This is in a test case",
};

describe("Raise PR on change", () => {
  let restore;
  let restoreTest;

  beforeEach(() => {
    restore = mockedEnv({
      GITHUB_EVENT_NAME: "issue",
      GITHUB_EVENT_PATH: "/github/workspace/event.json",
      GITHUB_WORKFLOW: "demo-workflow",
      GITHUB_ACTION: "raise-pr-on-change",
      GITHUB_ACTOR: "mheap",
      GITHUB_REPOSITORY: "mheap/missing-repo",
      GITHUB_WORKSPACE: "/github/workspace",
      GITHUB_SHA: "e21490305ed7ac0897b7c7c54c88bb47f7a6d6c4",
      INPUT_TOKEN: "this_is_invalid",
    });
    jest.mock("fs");

    core.setOutput = jest.fn();
    core.setFailed = jest.fn();
    console.log = jest.fn();
  });

  afterEach(() => {
    restore();
    restoreTest();
    jest.resetModules();
    jest.resetAllMocks();

    if (!nock.isDone()) {
      throw new Error(
        `Not all nock interceptors were used: ${JSON.stringify(
          nock.pendingMocks()
        )}`
      );
    }
    nock.cleanAll();
  });

  describe("mode: pr-changes", () => {
    it("creates a PR when required", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "pr-changes",
      });

      const myFileContents = "First File";
      const anotherFileContents = "Second File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
          "another-file.yaml": anotherFileContents,
        },
      });

      mockPrChanges({
        owner,
        repo: "missing-repo",
        files: ["my-file.yaml", "another-file.yaml"],
      });

      mockCreateCommit({
        owner,
        repo,
        prBranch,
        targetBranch,
        prSha: "sha-pr-branch",
        targetSha: "sha-main-branch",
        fileContents: {
          "specs/foo.yaml": myFileContents,
          "specs/bar.yaml": anotherFileContents,
        },
      });

      mockCreatePr({
        owner,
        repo,
        prBranch,
        targetBranch,
        prExists: false,
      });

      await action();

      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("does not create a PR if it already exists", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "pr-changes",
      });

      const myFileContents = "First File";
      const anotherFileContents = "Second File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
          "another-file.yaml": anotherFileContents,
        },
      });

      mockPrChanges({
        owner,
        repo: "missing-repo",
        files: ["my-file.yaml", "another-file.yaml"],
      });

      mockCreateCommit({
        owner,
        repo,
        prBranch,
        targetBranch,
        prSha: "sha-pr-branch",
        targetSha: "sha-main-branch",
        fileContents: {
          "specs/foo.yaml": myFileContents,
          "specs/bar.yaml": anotherFileContents,
        },
      });

      mockCreatePr({
        owner,
        repo,
        prBranch,
        targetBranch,
        prExists: true,
      });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("skips files that are not in the list of changed files in the PR", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "pr-changes",
      });

      const myFileContents = "First File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
        },
      });

      mockPrChanges({
        owner,
        repo: "missing-repo",
        files: ["my-file.yaml"],
      });

      mockCreateCommit({
        owner,
        repo,
        prBranch,
        targetBranch,
        prSha: "sha-pr-branch",
        targetSha: "sha-main-branch",
        fileContents: {
          "specs/foo.yaml": myFileContents,
        },
      });

      mockCreatePr({
        owner,
        repo,
        prBranch,
        targetBranch,
        prExists: true,
      });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });
  });

  describe("mode: check-upstream", () => {
    it("does not raise a PR if file contents have not changed", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "check-upstream",
      });

      const myFileContents = "First File";
      const anotherFileContents = "Second File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
          "another-file.yaml": anotherFileContents,
        },
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/foo.yaml",
        content: myFileContents,
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/bar.yaml",
        content: anotherFileContents,
      });

      mockPrExists({ owner, repo, prBranch, prExists: false });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("does not raise a PR if file contents have not changed", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "check-upstream",
      });

      const myFileContents = "First File";
      const anotherFileContents = "Second File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
          "another-file.yaml": anotherFileContents,
        },
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/foo.yaml",
        content: myFileContents,
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/bar.yaml",
        content: anotherFileContents,
      });

      mockPrExists({ owner, repo, prBranch, prExists: false });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("raises a PR if files change in upstream one, but not upstream two", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "check-upstream",
      });

      const firstFileContents = "First File";
      const secondFileContents = "Second File";

      // Upstream repo contents
      mockRepoContents({
        files: {
          "my-file.yaml": firstFileContents,
          "another-file.yaml": secondFileContents,
        },
        config: {
          "mheap/downstream-test": [
            {
              src: "my-file.yaml",
              dest: "specs/foo.yaml",
            },
          ],
          "mheap/no-pr-raised": [
            {
              src: "another-file.yaml",
              dest: "specs/bar.yaml",
            },
          ],
        },
      });

      // Downstream: mheap/downstream-test
      mockFileContent({
        owner: "mheap",
        repo: "downstream-test",
        path: "specs/foo.yaml",
        content: "This does not match so a PR should be raised",
      });

      mockCreateCommit({
        owner: "mheap",
        repo: "downstream-test",
        prBranch,
        targetBranch,
        prSha: "sha-pr-branch",
        targetSha: "sha-main-branch",
        fileContents: {
          "specs/foo.yaml": firstFileContents,
        },
      });

      mockCreatePr({
        owner: "mheap",
        repo: "downstream-test",
        prBranch,
        targetBranch,
        prExists: false,
      });

      // Downstream: mheap/no-pr-raised
      mockFileContent({
        owner: "mheap",
        repo: "no-pr-raised",
        path: "specs/bar.yaml",
        content: secondFileContents,
      });

      mockPrExists({
        owner: "mheap",
        repo: "no-pr-raised",
        prBranch,
        prExists: false,
      });

      await action();
      expect(console.log).toBeCalledWith("[mheap/downstream-test] Creating PR");
      expect(console.log).toBeCalledWith(
        "[mheap/no-pr-raised] No files changed"
      );
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("updates files that have changed in the upstream repo (one changed)", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "check-upstream",
      });

      const myFileContents = "First File";
      const anotherFileContents = "Second File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
          "another-file.yaml": anotherFileContents,
        },
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/foo.yaml",
        content: "This is different",
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/bar.yaml",
        content: anotherFileContents,
      });

      mockCreateCommit({
        owner,
        repo,
        prBranch,
        targetBranch,
        prSha: "sha-pr-branch",
        targetSha: "sha-main-branch",
        fileContents: {
          "specs/foo.yaml": myFileContents,
        },
      });

      mockCreatePr({
        owner,
        repo,
        prBranch,
        targetBranch,
        prExists: false,
      });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("updates files that have changed in the upstream repo (all changed)", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "check-upstream",
      });

      const myFileContents = "First File";
      const anotherFileContents = "Second File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
          "another-file.yaml": anotherFileContents,
        },
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/foo.yaml",
        content: "This is different",
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/bar.yaml",
        content: "And so is this",
      });

      mockCreateCommit({
        owner,
        repo,
        prBranch,
        targetBranch,
        prSha: "sha-pr-branch",
        targetSha: "sha-main-branch",
        fileContents: {
          "specs/foo.yaml": myFileContents,
          "specs/bar.yaml": anotherFileContents,
        },
      });

      mockCreatePr({
        owner,
        repo,
        prBranch,
        targetBranch,
        prExists: false,
      });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("handles missing files in the upstream repo", async () => {
      restoreTest = mockPr({
        ...defaultConfig,
        INPUT_MODE: "check-upstream",
      });

      const myFileContents = "First File";
      const anotherFileContents = "Second File";

      mockRepoContents({
        files: {
          "my-file.yaml": myFileContents,
          "another-file.yaml": anotherFileContents,
        },
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/foo.yaml",
        content: "",
        code: 404,
      });

      mockFileContent({
        owner,
        repo,
        path: "specs/bar.yaml",
        content: anotherFileContents,
      });

      mockCreateCommit({
        owner,
        repo,
        prBranch,
        targetBranch,
        prSha: "sha-pr-branch",
        targetSha: "sha-main-branch",
        fileContents: {
          "specs/foo.yaml": myFileContents,
        },
      });

      mockCreatePr({
        owner,
        repo,
        prBranch,
        targetBranch,
        prExists: false,
      });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });
  });
});

function mockRepoContents({ files, config }) {
  if (!config) {
    config = {
      "mheap/downstream-test": [
        {
          src: "my-file.yaml",
          dest: "specs/foo.yaml",
        },
        {
          src: "another-file.yaml",
          dest: "specs/bar.yaml",
        },
      ],
    };
  }

  jest.spyOn(fs, "readFileSync").mockImplementation();
  when(fs.readFileSync)
    .calledWith(".github/config.json")
    .mockReturnValueOnce(JSON.stringify(config));

  for (let file in files) {
    when(fs.readFileSync).calledWith(file).mockReturnValueOnce(files[file]);
  }
}

function mockPrChanges({ owner, repo, files }) {
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/pulls/27/files`)
    .reply(
      200,
      files.map((f) => {
        return { filename: f };
      })
    );
}

function mockFileContent({ owner, repo, path, content, code }) {
  code = code || 200;
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`)
    .reply(code, {
      content: Buffer.from(content).toString("base64"),
    });
}

function mockPrExists({ owner, repo, prBranch, prExists }) {
  const resp = [];

  if (prExists) {
    resp.push({ number: 123 });
  }

  // List existing PRs
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/pulls?head=${owner}:${prBranch}`)
    .reply(200, resp);
}

function mockCreatePr({ owner, repo, prBranch, targetBranch, prExists }) {
  mockPrExists({ owner, repo, prBranch, prExists });

  if (!prExists) {
    // Create PR
    nock("https://api.github.com")
      .post(`/repos/${owner}/${repo}/pulls`, {
        title: "Hello",
        body: "This is in a test case",
        head: prBranch,
        base: targetBranch,
      })
      .reply(201);
  }
}

function mockClosePr({ owner, repo, prBranch }) {
  nock("https://api.github.com")
    .patch(`/repos/${owner}/${repo}/pulls/123`, {
      state: "closed",
    })
    .reply(200);
}

function mockCreateCommit({
  owner,
  repo,
  prBranch,
  prSha,
  targetBranch,
  targetSha,
  fileContents,
}) {
  // Get Ref
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/git/ref/heads%2F${prBranch}`)
    .reply(200, {
      object: {
        sha: prSha,
      },
    });
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/git/ref/heads%2F${targetBranch}`)
    .reply(200, {
      object: {
        sha: targetSha,
      },
    });

  // Create blobs
  const tree = [];
  for (let path in fileContents) {
    const content = fileContents[path];
    nock("https://api.github.com")
      .post(`/repos/${owner}/${repo}/git/blobs`, {
        content: Buffer.from(content).toString("base64"),
        encoding: "base64",
      })
      .reply(201);
    tree.push({ path, mode: "100644", type: "blob" });
  }

  // Create Tree
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/git/trees`, {
      tree,
      base_tree: targetSha,
    })
    .reply(201);

  // Create Commit
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/git/commits`, {
      message: `Automated OAS update: ${Object.keys(fileContents).join(", ")}`,
      parents: ["sha-main-branch"],
    })
    .reply(201, {
      sha: "new-commit-sha",
    });

  // Update branch ref
  nock("https://api.github.com")
    .patch(`/repos/${owner}/${repo}/git/refs/heads%2F${prBranch}`, {
      force: true,
      sha: "new-commit-sha",
    })
    .reply(200);
}

function mockPr(envParams = {}) {
  const payload = {
    pull_request: { number: 27 },
  };
  return mockEvent(
    {
      action: "opened",
      ...payload,
    },
    envParams
  );
}

function mockEvent(mockPayload, envParams = {}) {
  github.context.payload = mockPayload;
  const r = mockedEnv(envParams);
  return r;
}
