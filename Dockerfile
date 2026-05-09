FROM news-base-image.n3r.reg.navercorp.com/core/rhel8/node:24.14.0

USER root

RUN yum install -y git && yum clean all

RUN mkdir -p /etc/claude-code
COPY managed-settings.json /etc/claude-code/managed-settings.json
RUN chmod 644 /etc/claude-code/managed-settings.json

USER irteam:irteam
WORKDIR /home1/irteam

RUN mkdir -p app workspace

ENV DISABLE_INSTALLATION_CHECKS=1
ENV FORCE_CODE_TERMINAL=true

WORKDIR /home1/irteam/app

COPY --chown=irteam:irteam package*.json ./
RUN npm ci

ENV PATH="/home1/irteam/.local/bin:$PATH"

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    /home1/irteam/.local/bin/claude --version

COPY --chown=irteam:irteam scripts/setup-claude-config.js /tmp/setup-claude-config.js
RUN node /tmp/setup-claude-config.js && rm /tmp/setup-claude-config.js

COPY --chown=irteam:irteam . .

COPY --chown=irteam:irteam scripts/entrypoint.sh /home1/irteam/app/scripts/entrypoint.sh
RUN chmod +x /home1/irteam/app/scripts/entrypoint.sh

RUN npm run build
RUN npm prune --production

EXPOSE 9001

WORKDIR /home1/irteam

CMD ["bash", "/home1/irteam/app/scripts/entrypoint.sh"]
