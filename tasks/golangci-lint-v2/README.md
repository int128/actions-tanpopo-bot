# Update github.com/golangci/golangci-lint to v2

If go.mod already contains `github.com/golangci/golangci-lint/v2/cmd/golangci-lint`, do not run this task.

Run `update.sh` in the task directory to update golangci-lint to v2.

Check if golangci-lint is passing by the following command:

```bash
make lint
```
