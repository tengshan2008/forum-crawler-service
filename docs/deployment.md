# 部署指南

## 环境要求

- Docker Engine 20.10+
- Docker Compose 2.0+
- 至少 2GB RAM
- 可用磁盘空间 10GB+

## 部署步骤

### 1. 准备服务器

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证安装
docker --version
docker-compose --version
```

### 2. 克隆项目

```bash
git clone <repository-url>
cd forum-crawler-service
```

### 3. 配置环境变量

根据实际环境修改配置文件:

```bash
# 后端配置
cp backend/.env.example backend/.env
nano backend/.env

# 爬虫配置
cp crawler/.env.example crawler/.env
nano crawler/.env

# 前端配置
cp frontend/.env.example frontend/.env
nano frontend/.env

# Docker Compose 部署专用（dev/prod 两套 compose 都需要）
cp docker/.env.example docker/.env
openssl rand -hex 32   # 执行两次，分别填入 docker/.env 的 JWT_SECRET / JWT_REFRESH_SECRET
nano docker/.env
```

> **注意（必读）**：后端 `JWT_SECRET` / `JWT_REFRESH_SECRET` 必须设置为强随机值
> （如 `openssl rand -hex 32` 的输出），保留示例值或留空时：
> Docker Compose 会在启动前直接报错（`${JWT_SECRET:?}` 必填插值），
> 即使绕过 compose，后端 `config.validateEnv()` 也会 fail-fast 拒绝启动。
> 使用 `docker compose -f docker/...` 时，`.env` 自动从 compose 文件所在目录（即 `docker/`）读取。

### 4. 构建 Docker 镜像

```bash
docker-compose -f docker/docker-compose.yml build
```

### 5. 启动服务

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### 6. 验证部署

```bash
# 检查容器状态
docker-compose -f docker/docker-compose.yml ps

# 查看日志
docker-compose -f docker/docker-compose.yml logs -f

# 测试 API
curl http://localhost:5000/health
```

---

## 开发环境 Docker Compose（热更新）

`docker/docker-compose.dev.yml` 以 nodemon / Vite 运行并挂载源码卷，用于服务器或本机开发联调，
同样必须先配置 `docker/.env` 中的 JWT 密钥（见上文第 3 步）：

```bash
cp docker/.env.example docker/.env
openssl rand -hex 32   # 两次，分别填入两个变量
nano docker/.env

# 启动（-f 指定文件时，.env 自动从 docker/ 目录读取）
docker compose -f docker/docker-compose.dev.yml up -d --build

# 查看日志 / 停止
docker compose -f docker/docker-compose.dev.yml logs -f backend
docker compose -f docker/docker-compose.dev.yml down
```

端口：前端 `3000`、后端 `5000`、MongoDB `27017`、Redis `6379`。
`.env` 放在其他目录时需显式指定：`docker compose --env-file /path/to/.env -f docker/docker-compose.dev.yml up -d`。

---

## 生产环境配置

### Nginx 反向代理

创建 `/etc/nginx/sites-available/forum-crawler`:

```nginx
upstream backend {
    server backend:5000;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE 任务事件流（/api/tasks/:id/events）：关闭代理缓冲并放宽读超时，
        # 事件帧即时到达浏览器；服务端每 15s 发送 : ping 心跳保活
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    # 爬虫图片等静态资源（后端 express.static 挂在 /public）。
    # 必须用 ^~，否则 .jpg/.png 等静态文件正则 location 会抢先命中导致 404 裂图
    location ^~ /public/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 启用 HTTPS
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
}

# 重定向 HTTP 到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

启用配置:

```bash
sudo ln -s /etc/nginx/sites-available/forum-crawler /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL 证书 (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
```

### 监控和维护

```bash
# 查看实时日志
docker-compose -f docker/docker-compose.yml logs -f

# 查看容器资源使用情况
docker stats

# 备份数据库
docker exec forum-crawler-mongo mongodump --out /backup

# 清理 Docker 资源
docker system prune -a
```

---

## 扩展和优化

### 水平扩展

使用负载均衡器分发请求到多个后端实例。

### 性能优化

1. **启用 Redis 缓存**
   - 缓存频繁查询的数据
   - 减轻数据库压力

2. **数据库优化**
   - 创建适当的索引
   - 定期清理过期数据

3. **图片优化**
   - 生成缩略图
   - 使用 CDN 分发

### 自动备份

创建备份脚本:

```bash
#!/bin/bash
# backup.sh
docker exec forum-crawler-mongo mongodump --out /backup/$(date +%Y%m%d)
```

定时执行:

```bash
crontab -e
# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh
```

---

## 故障排除

### 容器无法启动

```bash
# 查看详细日志
docker-compose -f docker/docker-compose.yml logs backend

# 检查端口占用
lsof -i :5000
```

### 后端报「安全环境变量缺失…JWT_SECRET, JWT_REFRESH_SECRET」

说明 compose 未把 JWT 密钥传入容器。按上文第 3 步创建 `docker/.env`（`cp docker/.env.example docker/.env`
并填入 `openssl rand -hex 32` 的输出）后重新 `up -d`；临时验证也可用环境变量内联启动：

```bash
JWT_SECRET=$(openssl rand -hex 32) \
JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
  docker compose -f docker/docker-compose.dev.yml up -d
```

### 数据库连接错误

```bash
# 验证 MongoDB 运行状态
docker exec forum-crawler-mongo mongosh

# 检查网络连接
docker network ls
docker network inspect forum-crawler-network
```

### 内存不足

```bash
# 查看磁盘使用情况
docker system df

# 清理未使用的镜像
docker image prune -a

# 清理未使用的卷
docker volume prune
```

---

## 升级指南

### 升级服务

```bash
# 拉取最新代码
git pull origin main

# 重新构建镜像
docker-compose -f docker/docker-compose.yml build

# 重启服务
docker-compose -f docker/docker-compose.yml up -d
```

### 数据迁移

```bash
# 导出数据
docker exec forum-crawler-mongo mongodump -o /backup

# 导入数据
docker exec forum-crawler-mongo mongorestore /backup
```

---

## 安全建议

1. **修改默认密码**
   - MongoDB 管理员密码
   - Redis 密码

2. **启用防火墙**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

3. **定期更新依赖**
   ```bash
   docker-compose -f docker/docker-compose.yml build --no-cache
   ```

4. **监控日志**
   - 定期检查错误日志
   - 设置告警规则

5. **备份策略**
   - 每日备份
   - 异地存储备份

---

## 相关资源

- [Docker 文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [MongoDB 部署指南](https://docs.mongodb.com/manual/deployment/)
- [Nginx 配置指南](https://nginx.org/en/docs/)
