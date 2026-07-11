FROM node:22.23.1-bookworm-slim

ARG OPENCODE_VERSION=1.17.18
ARG RAILWAY_CLI_VERSION=5.26.0

LABEL org.opencontainers.image.title="OpenCode Computer" \
      org.opencontainers.image.description="Persistent, private Railway computer runtime for OpenCode" \
      org.opencontainers.image.source="https://github.com/m-abdelwahab/opencode-computer"

ENV DEBIAN_FRONTEND=noninteractive \
    AGENTD_CONTROL_HOST=127.0.0.1 \
    AGENTD_CONTROL_PORT=43117 \
    AGENTD_HEALTH_HOST=0.0.0.0 \
    HOME=/data/home \
    OPENCODE_CLI_VERSION=${OPENCODE_VERSION} \
    OPENCODE_DISABLE_AUTOUPDATE=true \
    OPENCODE_SERVER_USERNAME=opencode \
    PATH=/data/home/.local/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    RAILWAY_CLI_VERSION=${RAILWAY_CLI_VERSION} \
    SHELL=/bin/bash \
    WORKSPACE_ROOT=/data/workspace \
    XDG_CACHE_HOME=/data/home/.cache \
    XDG_CONFIG_HOME=/data/home/.config \
    XDG_DATA_HOME=/data/home/.local/share \
    XDG_STATE_HOME=/data/home/.local/state

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash-completion \
      bubblewrap \
      build-essential \
      ca-certificates \
      curl \
      fd-find \
      gh \
      git \
      jq \
      less \
      lsof \
      nano \
      openssh-client \
      openssl \
      procps \
      python3 \
      python3-pip \
      python3-venv \
      ripgrep \
      sudo \
      tini \
      tmux \
      tree \
      unzip \
      util-linux \
      vim \
      wget \
      zip \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global \
      "opencode-ai@${OPENCODE_VERSION}" \
      "@railway/cli@${RAILWAY_CLI_VERSION}" \
    && if [[ "$(dpkg --print-architecture)" == "amd64" ]]; then \
      rm /usr/local/lib/node_modules/opencode-ai/bin/opencode.exe; \
      install -m 0755 \
        /usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode \
        /usr/local/lib/node_modules/opencode-ai/bin/opencode.exe; \
    fi \
    && test "$(/usr/local/bin/opencode --version)" = "${OPENCODE_VERSION}" \
    && /usr/local/bin/railway --version \
    && chmod -R a+rX \
      /usr/local/lib/node_modules/opencode-ai \
      /usr/local/lib/node_modules/@railway \
    && chmod a+rx /usr/local/bin/opencode /usr/local/bin/railway \
    && npm cache clean --force

ENV NPM_CONFIG_PREFIX=/data/home/.local

RUN groupadd --gid 10000 workspace \
    && groupadd --gid 10001 computer \
    && groupadd --gid 10002 agentd \
    && groupadd --gid 10003 control \
    && useradd --uid 10001 --gid computer --groups workspace,control --home-dir /data/home --no-create-home --shell /bin/bash computer \
    && useradd --uid 10002 --gid agentd --groups workspace,control --home-dir /var/lib/agentd --create-home --shell /usr/sbin/nologin agentd \
    && install -d -o root -g root -m 0755 /opt/opencode-computer/default-opencode \
    && printf '%s\n' \
      'Defaults!/usr/local/sbin/opencode-computer-bootstrap env_keep += "PORT AGENT_COMPUTER_ID OPENCODE_CLI_VERSION RAILWAY_CLI_VERSION"' \
      'Defaults!/usr/local/sbin/opencode-computer-run env_keep += "PORT AGENTD_CONTROL_PORT AGENT_COMPUTER_ID OPENCODE_CLI_VERSION RAILWAY_CLI_VERSION"' \
      'computer ALL=(root) NOPASSWD: /usr/local/sbin/opencode-computer-bootstrap, /usr/local/sbin/opencode-computer-run' \
      > /etc/sudoers.d/opencode-computer \
    && chmod 0440 /etc/sudoers.d/opencode-computer \
    && setpriv --reuid=10001 --regid=10001 --init-groups \
      env -i HOME=/tmp PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
      /usr/local/bin/opencode --version \
    && setpriv --reuid=10001 --regid=10001 --init-groups \
      env -i HOME=/tmp PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
      /usr/local/bin/railway --version

WORKDIR /opt/opencode-computer

COPY package.json package-lock.json ./
COPY config/opencode.json /opt/opencode-computer/default-opencode/opencode.json
COPY src ./src
COPY scripts/bootstrap.sh /usr/local/sbin/opencode-computer-bootstrap
COPY scripts/run.sh /usr/local/sbin/opencode-computer-run
COPY scripts/entrypoint.sh /usr/local/bin/opencode-computer-entrypoint
COPY scripts/attach.sh /usr/local/bin/opencode-computer-attach

RUN chmod 0755 \
      /usr/local/sbin/opencode-computer-bootstrap \
      /usr/local/sbin/opencode-computer-run \
      /usr/local/bin/opencode-computer-entrypoint \
      /usr/local/bin/opencode-computer-attach \
    && chown -R root:root /opt/opencode-computer \
    && chmod -R a+rX,go-w /opt/opencode-computer

USER computer

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD /usr/local/bin/node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8080') + '/readyz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/opencode-computer-entrypoint"]
