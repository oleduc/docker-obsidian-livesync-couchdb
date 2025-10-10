FROM docker.io/couchdb:3.5.0

# Add metadata labels for Docker Hub integration
LABEL org.opencontainers.image.title="CouchDB for Obsidian LiveSync"
LABEL org.opencontainers.image.description="A Docker container that configures CouchDB specifically for use with Obsidian LiveSync, automating the setup process by parsing the bash script provided by obsidian-livesync's maintainer"
LABEL org.opencontainers.image.url="https://hub.docker.com/r/oleduc/docker-obsidian-livesync-couchdb"
LABEL org.opencontainers.image.source="https://github.com/oleduc/docker-obsidian-livesync-couchdb"
LABEL org.opencontainers.image.documentation="https://github.com/oleduc/docker-obsidian-livesync-couchdb#readme"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.authors="oleduc"
LABEL org.opencontainers.image.vendor="oleduc"

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno
RUN curl -fsSL https://deno.land/install.sh | sh

# Add Deno to the PATH
ENV PATH="/root/.deno/bin:$PATH"

# Verify Deno installation
RUN deno --version

# Set a working directory
WORKDIR /scripts

# Copy the TypeScript script into the container
COPY couchdb-setup.ts .

# Download the couchdb-init.sh script
RUN curl -fsSL https://raw.githubusercontent.com/vrtmrz/obsidian-livesync/main/utils/couchdb/couchdb-init.sh -o couchdb-init.sh
RUN curl -fsSL https://raw.githubusercontent.com/vrtmrz/obsidian-livesync/main/utils/flyio/generate_setupuri.ts -o generate_setupuri.ts

# Update the couchDB config from the couchdb-init script provided by the plugin maintainer
RUN deno -A /scripts/couchdb-setup.ts

ENV SERVER_DOMAIN=localhost
ENV COUCHDB_USER=default
ENV COUCHDB_DATABASE=default
