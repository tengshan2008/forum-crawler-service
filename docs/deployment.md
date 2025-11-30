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
```

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
