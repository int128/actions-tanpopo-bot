#!/bin/bash
set -eux -o pipefail

go get -tool github.com/golangci/golangci-lint/v2/cmd/golangci-lint
go mod edit -droptool=github.com/golangci/golangci-lint/cmd/golangci-lint
go mod tidy
