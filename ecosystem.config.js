module.exports = {
  apps: [
    {
      name: "nexus-entity-dapp-static", // 服务名称
      script: "npm",
      args: "start",
      cwd: "/www/nexus-entity-dapp", // 项目目录（必须填）
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/www/pm2/logs/entity-static-err.log", // 日志放/www盘
      out_file: "/www/pm2/logs/entity-static-out.log",
      merge_logs: true,
      autorestart: true, // 崩溃自动重启
      watch: false,
    },
  ],
};
