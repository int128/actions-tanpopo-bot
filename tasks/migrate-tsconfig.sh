#!/bin/bash
set -eux -o pipefail

pnpm remove @tsconfig/recommended
pnpm add -D @tsconfig/node20

perl -i -pne 's/@tsconfig\/recommended/@tsconfig\/node20/' tsconfig.json
