#!/bin/bash
set -eux -o pipefail

if [ -f vitest.config.ts ]; then
  exit
fi

pnpm remove @types/jest jest ts-jest eslint-plugin-jest
pnpm add -D vitest @vitest/eslint-plugin
rm jest.config.js

perl -i -pne 's/"jest"/"vitest"/' package.json

perl -i -pne "s/^import jest .+/import vitest from '\@vitest\/eslint-plugin'/" eslint.config.js
perl -i -pne "s/jest\.configs\[.+/vitest.configs.recommended,/" eslint.config.js

cat > vitest.config.ts <<EOF
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    clearMocks: true,
  },
})
EOF

find tests -name '*.test.ts' | while read -r ts; do
  if grep 'expect(' "$ts" > /dev/null; then
    sed -e "1i\\
import { expect } from 'vitest'" -i "$ts"
  fi

  if egrep 'it[\.|(]' "$ts" > /dev/null; then
    sed -e "1i\\
import { it } from 'vitest'" -i "$ts"
  fi

  if egrep 'describe[\.|(]' "$ts" > /dev/null; then
    sed -e "1i\\
import { describe } from 'vitest'" -i "$ts"
  fi

  if egrep 'test[\.|(]' "$ts" > /dev/null; then
    sed -e "1i\\
import { test } from 'vitest'" -i "$ts"
  fi
done

pnpm run format
