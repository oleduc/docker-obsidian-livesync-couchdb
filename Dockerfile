FROM docker.io/couchdb:3.5.2.1

# Add metadata labels for Docker Hub integration
LABEL org.opencontainers.image.title="CouchDB for Obsidian LiveSync"
LABEL org.opencontainers.image.description="A Docker container that configures CouchDB specifically for use with Obsidian LiveSync, automating the setup process from the provisioning source provided by obsidian-livesync's maintainer"
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
RUN curl -fsSL https://deno.land/install.sh | sh -s v2.9.6

# Add Deno to the PATH
ENV PATH="/root/.deno/bin:$PATH"

# Verify Deno installation
RUN deno --version

# Set a working directory
WORKDIR /scripts

# Copy the TypeScript script into the container
COPY couchdb-setup.ts .
COPY LIVESYNC_VERSION .
COPY generate-setup-uri /usr/local/bin/generate-setup-uri

# Download one immutable version of the upstream setup tools and lockfile
RUN mkdir -p couchdb setup flyio \
    && LIVESYNC_VERSION="$(tr -d '\r\n' < LIVESYNC_VERSION)" \
    && LIVESYNC_BASE_URL="https://raw.githubusercontent.com/vrtmrz/obsidian-livesync/${LIVESYNC_VERSION}/utils" \
    && curl -fsSL "${LIVESYNC_BASE_URL}/couchdb/provision.ts" -o couchdb/provision.ts \
    && curl -fsSL "${LIVESYNC_BASE_URL}/setup/generate_setup_uri.ts" -o setup/generate_setup_uri.ts \
    && curl -fsSL "${LIVESYNC_BASE_URL}/setup/livesync-commonlib.ts" -o setup/livesync-commonlib.ts \
    && curl -fsSL "${LIVESYNC_BASE_URL}/flyio/deno.jsonc" -o flyio/deno.jsonc \
    && curl -fsSL "${LIVESYNC_BASE_URL}/flyio/deno.lock" -o flyio/deno.lock

# Update the CouchDB config from the provisioning source provided by the plugin maintainer
RUN deno -A /scripts/couchdb-setup.ts

# Cache the locked Setup URI generator dependencies and expose its command
RUN deno cache \
    --config=/scripts/flyio/deno.jsonc \
    --lock=/scripts/flyio/deno.lock \
    --frozen \
    /scripts/setup/generate_setup_uri.ts \
    && chmod 0755 /usr/local/bin/generate-setup-uri

ENV COUCHDB_USER=default
