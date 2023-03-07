const fs = require("fs");

const action = require(".");
const core = require("@actions/core");
const github = require("@actions/github");

const { when } = require("jest-when");
const mockedEnv = require("mocked-env");
const nock = require("nock");
nock.disableNetConnect();

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

  describe("runs successfully", () => {
    it("creates a PR when required", async () => {
      restoreTest = mockPr(
        {
          issue: {
            user: { login: "valid_user" },
            number: 27,
            labels: [],
          },
        },
        {
          INPUT_CONFIGFILE: ".github/config.json",
          INPUT_PRBRANCH: "automated-oas-update",
          INPUT_PRTITLE: "Hello",
          INPUT_PRBODY: "This is in a test case",
        }
      );

      mockPrChanges({
        owner: "mheap",
        repo: "missing-repo",
        files: ["my-file.yaml", "another-file.yaml"],
      });

      mockActionConfig();

      mockCreateCommit({
        owner: "mheap",
        repo: "downstream-test",
        prBranch: "automated-oas-update",
        prSha: "sha-pr-branch",
        targetBranch: "main",
        targetSha: "sha-main-branch",
      });

      mockCreatePr({
        owner: "mheap",
        repo: "downstream-test",
        prBranch: "automated-oas-update",
        targetBranch: "main",
        prExists: false,
      });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });

    it("does not create a PR if it already exists", async () => {
      restoreTest = mockPr(
        {
          issue: {
            user: { login: "valid_user" },
            number: 27,
            labels: [],
          },
        },
        {
          INPUT_CONFIGFILE: ".github/config.json",
          INPUT_PRBRANCH: "automated-oas-update",
          INPUT_PRTITLE: "Hello",
          INPUT_PRBODY: "This is in a test case",
        }
      );

      mockPrChanges({
        owner: "mheap",
        repo: "missing-repo",
        files: ["my-file.yaml", "another-file.yaml"],
      });

      mockActionConfig();

      mockCreateCommit({
        owner: "mheap",
        repo: "downstream-test",
        prBranch: "automated-oas-update",
        prSha: "sha-pr-branch",
        targetBranch: "main",
        targetSha: "sha-main-branch",
      });

      mockCreatePr({
        owner: "mheap",
        repo: "downstream-test",
        prBranch: "automated-oas-update",
        targetBranch: "main",
        prExists: true,
      });

      await action();
      expect(core.setOutput).toBeCalledTimes(1);
      expect(core.setOutput).toBeCalledWith("status", "success");
    });
  });
});

function mockActionConfig(config) {
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

  when(fs.readFileSync)
    .calledWith("my-file.yaml")
    .mockReturnValueOnce("First File");
  when(fs.readFileSync)
    .calledWith("another-file.yaml")
    .mockReturnValueOnce("Second File");
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

function mockCreatePr({ owner, repo, prBranch, targetBranch, prExists }) {
  const resp = [];

  if (prExists) {
    resp.push({ pull_request: { number: 123 } });
  }

  // List existing PRs
  nock("https://api.github.com")
    .get(`/repos/${owner}/${repo}/pulls?head=${owner}:${prBranch}`)
    .reply(200, resp);

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

function mockCreateCommit({
  owner,
  repo,
  prBranch,
  prSha,
  targetBranch,
  targetSha,
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
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/git/blobs`, {
      content: "Rmlyc3QgRmlsZQ==",
      encoding: "base64",
    })
    .reply(201);
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/git/blobs`, {
      content: "U2Vjb25kIEZpbGU=",
      encoding: "base64",
    })
    .reply(201);

  // Create Tree
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/git/trees`, {
      tree: [
        { path: "specs/foo.yaml", mode: "100644", type: "blob" },
        { path: "specs/bar.yaml", mode: "100644", type: "blob" },
      ],
      base_tree: targetSha,
    })
    .reply(201);

  // Create Commit
  nock("https://api.github.com")
    .post(`/repos/${owner}/${repo}/git/commits`, {
      message: "Automated OAS update: specs/foo.yaml, specs/bar.yaml",
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

function mockFoo(user, org, role, httpCode) {
  nock("https://api.github.com")
    .get(`/orgs/${org}/memberships/${user}`)
    .reply(httpCode, {
      role,
    });
}

function mockPr(payload = {}, envParams = {}) {
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
