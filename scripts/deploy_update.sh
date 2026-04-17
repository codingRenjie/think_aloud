#!/usr/bin/env bash
# 在服务器上项目根目录执行：拉取最新代码并重新构建、重启 PM2。
set -euo pipefail
cd "$(dirname "$0")/.."
git pull
npm ci
npm run build
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save
