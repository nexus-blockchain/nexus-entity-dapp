# 部署说明

## 开机自启动（systemd）

在服务器 `202.140.140.202` 上执行：

### 1. 首次部署：构建项目

```bash
cd /root/nexus-entity-dapp
npm install
npm run build
```

### 2. 安装 systemd 服务

```bash
# 复制服务文件
sudo cp /root/nexus-entity-dapp/deploy/nexus-entity-dapp.service /etc/systemd/system/

# 重载并启用开机自启
sudo systemctl daemon-reload
sudo systemctl enable nexus-entity-dapp

# 启动服务
sudo systemctl start nexus-entity-dapp
```

### 3. 常用命令

```bash
sudo systemctl status nexus-entity-dapp   # 查看状态
sudo systemctl restart nexus-entity-dapp # 重启
sudo systemctl stop nexus-entity-dapp    # 停止
journalctl -u nexus-entity-dapp -f       # 查看日志
```

### 4. 访问

服务运行在 **http://localhost:3001**，若需外网访问，请配置 nginx 反向代理或防火墙放行 3001 端口。

### 5. 若出现 404

确认构建产物存在：

```bash
ls -la /root/nexus-entity-dapp/out/
ls -la /root/nexus-entity-dapp/out/index.html
```

若 `out/` 为空或不存在，重新执行 `npm run build`。
