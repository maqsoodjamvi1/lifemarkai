/** @type {import('pm2').ProcessDescription} */
module.exports = {
  apps: [
    {
      name: "lifemarkai",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "./",
      instances: "max", // use all available CPU cores
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      env_staging: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      // Graceful shutdown — let in-flight requests finish
      kill_timeout: 10000,
      listen_timeout: 5000,
      // Log config
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],

  deploy: {
    production: {
      user: "deploy",
      host: ["your-server-ip"],
      ref: "origin/main",
      repo: "git@github.com:your-org/lifemarkai.git",
      path: "/var/www/lifemarkai",
      "pre-deploy-local": "",
      "post-deploy":
        "npm ci --production=false && npm run build && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "mkdir -p /var/www/lifemarkai/logs",
    },
  },
};
