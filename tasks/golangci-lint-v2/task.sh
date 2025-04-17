#!/bin/bash
set -eux -o pipefail

if grep github.com/golangci/golangci-lint/v2/cmd/golangci-lint go.mod; then
  exit
fi

go get -tool github.com/golangci/golangci-lint/v2/cmd/golangci-lint
go mod edit -droptool=github.com/golangci/golangci-lint/cmd/golangci-lint
go mod tidy
sed -i -e 's|github.com/golangci/golangci-lint/cmd/golangci-lint|github.com/golangci/golangci-lint/v2/cmd/golangci-lint|g' Makefile
