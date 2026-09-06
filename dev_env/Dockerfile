# 指定基础镜像为 x86_64 架构的 Ubuntu
FROM --platform=linux/amd64 ubuntu:22.04

# 显式告知构建器，本阶段目标平台是 linux/amd64 (必须添加)
ARG TARGETPLATFORM
ARG BUILDPLATFORM
RUN echo "I am running on $BUILDPLATFORM, building for $TARGETPLATFORM" > /log.txt

# 避免安装过程中交互式提问（如时区设置）
ENV DEBIAN_FRONTEND=noninteractive

# 1. 更新软件源并安装基础包
RUN apt-get update && apt-get install -y \
    # SSH 服务端和客户端
    openssh-server \
    # 系统管理
    sudo \
    # 开发工具链
    build-essential \
    git \
    curl \
    wget \
    vim \
    nano \
    # Python3 及其包管理工具
    python3 \
    python3-pip \
    python3-venv \
    # 网络调试工具
    net-tools \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# 2. 配置SSH
RUN mkdir /var/run/sshd
# 允许root通过密码登录（仅限开发环境）
RUN echo 'PermitRootLogin yes' >> /etc/ssh/sshd_config
# 允许密码认证
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# 3. 为开发创建一个非root用户 (用户名: dev, 密码: password)
RUN useradd -m -s /bin/bash dev && \
    echo 'dev:password' | chpasswd && \
    # 将dev用户加入sudo组，允许使用sudo
    usermod -aG sudo dev

# 4. 设置root密码（可选，也可用于登录）
RUN echo 'root:password' | chpasswd

# 5. 设置工作目录并切换到dev用户
WORKDIR /home/dev/workspace
# 将目录所有权给dev用户
RUN chown -R dev:dev /home/dev

# 容器启动时执行的命令：启动SSH服务
CMD ["/usr/sbin/sshd", "-D"]