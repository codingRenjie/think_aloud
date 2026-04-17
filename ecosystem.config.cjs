/**
 * PM2 进程描述（国内轻量云 / 宝塔常用）。
 * 在项目根目录执行：pm2 start ecosystem.config.cjs
 * 与「npm run start」等价：工作目录为 server/，便于读取 server/.env。
 */
const path = require('path')

module.exports = {
  apps: [
    {
      name: 'think-aloud',
      cwd: path.join(__dirname, 'server'),
      script: 'index.js',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 8787,
      },
    },
  ],
}
