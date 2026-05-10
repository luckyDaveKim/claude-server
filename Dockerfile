FROM node:24.14.0-slim

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/claude-code
COPY managed-settings.json /etc/claude-code/managed-settings.json
RUN chmod 644 /etc/claude-code/managed-settings.json

USER node:node
WORKDIR /home/node

RUN mkdir -p app workspace

ENV DISABLE_INSTALLATION_CHECKS=1
ENV FORCE_CODE_TERMINAL=true

WORKDIR /home/node/app

COPY --chown=node:node package*.json ./
RUN npm ci

ENV PATH="/home/node/.local/bin:$PATH"

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    /home/node/.local/bin/claude --version

COPY --chown=node:node scripts/setup-claude-config.js /tmp/setup-claude-config.js
RUN node /tmp/setup-claude-config.js && rm /tmp/setup-claude-config.js

COPY --chown=node:node . .

COPY --chown=node:node scripts/entrypoint.sh /home/node/app/scripts/entrypoint.sh
RUN chmod +x /home/node/app/scripts/entrypoint.sh

RUN npm run build
RUN npm prune --production

EXPOSE 9001

WORKDIR /home/node

CMD ["bash", "/home/node/app/scripts/entrypoint.sh"]
