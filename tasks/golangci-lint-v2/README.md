# Update github.com/golangci/golangci-lint to v2

## Prerequisites

If go.mod already contains `github.com/golangci/golangci-lint/v2/cmd/golangci-lint`, do nothing.

## Steps

Update go.mod to v2 by the following command:

```bash
go get -tool github.com/golangci/golangci-lint/v2/cmd/golangci-lint
go mod edit -droptool=github.com/golangci/golangci-lint/cmd/golangci-lint
go mod tidy
```

Update Makefile to v2 by the following command:

```bash
sed -i -e 's|github.com/golangci/golangci-lint/cmd/golangci-lint|github.com/golangci/golangci-lint/v2/cmd/golangci-lint|g' Makefile
```

Check if golangci-lint is passing by the following command:

```bash
make lint
```
