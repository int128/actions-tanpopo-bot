# Update github.com/golangci/golangci-lint to v2

## Goal

Update the linting tool `github.com/golangci/golangci-lint` to v2.
If `go.mod` already contains `github.com/golangci/golangci-lint/v2/cmd/golangci-lint`, do not run this task.

## Steps

### 1. Update the dependencies

Run `update.sh` with bash in the task directory to update the version to v2.

### 2. Update the caller

If Makefile exists, run the following command to update it to v2:

```bash
sed -i -e 's|github.com/golangci/golangci-lint/cmd/golangci-lint|github.com/golangci/golangci-lint/v2/cmd/golangci-lint|g' Makefile
```

### 3. Fix the lint errors

Run the following command to check if the lint is passing:

```bash
go tool golangci-lint run
```

If a lint error is returned, try to fix the code.
After the fix, check again if the lint is passing.
