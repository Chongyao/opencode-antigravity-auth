#!/bin/bash
set -e

cd "$(dirname "$0")/.."

bun run scripts/check-quota.ts "$@"
