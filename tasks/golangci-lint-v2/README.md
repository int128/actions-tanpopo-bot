# Update github.com/golangci/golangci-lint to v2

## Goal

Update the linting tool `github.com/golangci/golangci-lint` to v2.

## Steps

### 1. Update go.mod

Run the following command to update `go.mod`:

```bash
go get -tool github.com/golangci/golangci-lint/v2/cmd/golangci-lint
go mod edit -droptool=github.com/golangci/golangci-lint/cmd/golangci-lint
go mod tidy
```

### 2. Update Makefile

If `Makefile` exists, run the following command to update it to v2:

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

#### errcheck

If you got an error of `errcheck` like this:

```
example.go:1:1: Error return value of `f.Close` is not checked (errcheck)
	defer f.Close()
```

You need to check the error returned by `f.Close()` and log it.
For example, if you have the following code:

```go
defer func() {
    if err := f.Close(); err != nil {
        slog.Error("Failed to close the file", "error", err)
    }
}()
```
