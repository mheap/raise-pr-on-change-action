# Raise PR on change

Automatically raise a PR to a downstream repo whenever a file changes.

The repos to submit PRs to are controller using a configuration file that looks like the following:

```json
{
  "mheap/downstream": [
    {
      "src": "my-file.yaml",
      "dest": "a-folder/mf.yaml"
    }
  ],
  "mheap/other-repo": [
    {
      "src": "multiple.yaml",
      "dest": "multiple.yaml"
    },
    {
      "src": "files-work.yaml",
      "dest": "too.yaml"
    }
  ]
}
```

## Usage

```yaml
name: Raise PR on change
on:
  pull_request:
    types: [closed]

jobs:
  raise-pr-on-change:
    if: github.event.pull_request.merged == true
    name: Raise PR on change
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Raise PR on change
        uses: mheap/raise-pr-on-change-action@v1
        with:
          token: ${{ secrets.PAT }}
          configFile: ".github/raise-pr-on-change.json"
          prBranch: automated-update
          targetBranch: main
          prTitle: "Automated update X"
          prBody: "This adds files based on upstream repo Y"
```

## Available Configuration

### Inputs

| Name           | Description                                                                                                                                                                                                                   | Required | Default                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------- |
| `token`        | The GitHub auth token, used to authenticate API requests. A [Personal Access Token](https://github.com/settings/tokens/new) with the `repo` scope is required as the default `GITHUB_TOKEN` does not have enough permissions. | true     |
| `configFile`   | A file containing downstream repos and any file paths that need updating                                                                                                                                                      | false    | .github/raise-pr-on-change.json |
| `prBranch`     | The branch to push changes to before submitting a PR                                                                                                                                                                          | false    |
| `targetBranch` | The branch to target when opening a PR                                                                                                                                                                                        | false    |
| `prTitle`      | The PR title to use                                                                                                                                                                                                           | true     |
| `prBody`       | The PR body to use                                                                                                                                                                                                            | true     |
