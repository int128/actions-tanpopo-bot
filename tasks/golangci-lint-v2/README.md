# Update github.com/golangci/golangci-lint to v2

## Goal

Update the linting tool `github.com/golangci/golangci-lint` to v2.
If go.mod already contains `github.com/golangci/golangci-lint/v2/cmd/golangci-lint`, do not run this task.

## Steps

### 1. Update the dependencies

Run `update.sh` in the task directory using `bash` to update the version to v2.

If there is `Makefile` and it contains `github.com/golangci/golangci-lint/cmd/golangci-lint`, run the following command to update it to v2:

```bash
sed -i -e 's|github.com/golangci/golangci-lint/cmd/golangci-lint|github.com/golangci/golangci-lint/v2/cmd/golangci-lint|g' Makefile
```

### 2. Check if the lint is passing

Run the following command to check if the lint is passing:

```bash
go tool golangci-lint run
```
