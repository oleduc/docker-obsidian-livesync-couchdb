# Deploy CouchDB for Obsidian LiveSync

This guide deploys the preconfigured CouchDB image, exposes it through an HTTPS reverse proxy, and generates an encrypted Setup URI for Self-hosted LiveSync. It assumes an existing Docker host and does not cover Docker, DNS, or reverse proxy installation.

## Requirements

- Docker Engine with the Compose plugin
- A persistent host path or Docker volume for CouchDB data
- A DNS record for the CouchDB endpoint
- An HTTPS reverse proxy with a publicly trusted certificate
- The Self-hosted LiveSync Obsidian plugin

Mobile clients require HTTPS. Do not expose an unauthenticated CouchDB instance directly to the Internet.

## 1. Deploy CouchDB

Create a working directory and a Compose file:

```yaml
services:
  couchdb:
    image: docker.io/oleduc/docker-obsidian-livesync-couchdb:latest
    container_name: couchdb-obsidian-livesync
    restart: unless-stopped
    environment:
      COUCHDB_USER: ${COUCHDB_USER:?required}
      COUCHDB_PASSWORD: ${COUCHDB_PASSWORD:?required}
    ports:
      - "127.0.0.1:${COUCHDB_PORT:-5984}:5984"
    volumes:
      - "${COUCHDB_DATA:?required}:/opt/couchdb/data"
    healthcheck:
      test:
        - CMD-SHELL
        - curl -fsS -u "$${COUCHDB_USER}:$${COUCHDB_PASSWORD}" http://127.0.0.1:5984/_up || exit 1
      interval: 10s
      timeout: 5s
      retries: 5
```

Use a release tag instead of `latest` when reproducible deployments matter. The image tag fixes the CouchDB version, generated configuration, and bundled LiveSync Setup URI generator as one tested unit.

Create `.env` beside `compose.yaml`:

```dotenv
COUCHDB_USER=obsidian
COUCHDB_PASSWORD=replace-with-a-long-random-password
COUCHDB_PORT=5984
COUCHDB_DATA=/srv/couchdb-obsidian-livesync
```

Protect the environment file and start CouchDB:

```bash
$ chmod 0600 .env
$ docker compose up -d
$ docker compose ps
```

`COUCHDB_DATA` must persist across container replacement. CouchDB creates `_users` and `_replicator` during single-node initialization; no manual API call is required. Self-hosted LiveSync creates and initializes the Vault database when the first client connects.

## 2. Configure the Reverse Proxy

Route the public hostname, for example `obsidian.example.com`, to CouchDB on port `5984`. If the reverse proxy runs as a container, attach both services to a private Docker network instead of publishing CouchDB on every host interface.

The proxy must:

- Terminate HTTPS using a publicly trusted certificate.
- Preserve the request method and body.
- Permit long-lived requests.
- Accept request bodies large enough for attachments.
- Forward the original `Host` and `X-Forwarded-*` headers.

A minimal Nginx location is:

```nginx
location / {
    proxy_pass http://127.0.0.1:5984;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    client_max_body_size 0;
}
```

Adjust `proxy_pass` when Nginx and CouchDB use a shared Docker network. In that case, use the Compose service name, such as `http://couchdb:5984`.

## 3. Verify CouchDB

Check the container locally before testing the public endpoint:

```bash
$ docker compose exec couchdb sh -c \
    'curl -fsS -u "$COUCHDB_USER:$COUCHDB_PASSWORD" http://127.0.0.1:5984/_up'
{"status":"ok"}

$ docker compose exec couchdb sh -c \
    'curl -fsS -u "$COUCHDB_USER:$COUCHDB_PASSWORD" http://127.0.0.1:5984/_all_dbs'
["_replicator","_users"]
```

Now verify the HTTPS endpoint from another machine:

```bash
$ curl -fsS --user 'obsidian:<COUCHDB_PASSWORD>' \
    https://obsidian.example.com/_up
{"status":"ok"}
```

An unauthenticated request returning `401 Unauthorized` is expected. The image enables `require_valid_user` and the CORS settings required by desktop and mobile Obsidian clients.

## 4. Generate a Setup URI

The image bundles the Setup URI generator matching its LiveSync configuration. It does not contact CouchDB, so it can run without network access.

Create a temporary `.livesync-setup.env` file:

```dotenv
hostname=https://obsidian.example.com
database=obsidiannotes
username=obsidian
password=replace-with-the-couchdb-password
passphrase=replace-with-a-vault-encryption-passphrase
uri_passphrase=replace-with-a-different-setup-uri-passphrase
```

The database name should start with a lowercase letter and should be unique per Vault. `passphrase` encrypts synchronized Vault data. `uri_passphrase` encrypts the Setup URI containing the CouchDB credentials and Vault settings; use a different secret for each purpose.

Generate the URI using the same image tag deployed above:

```bash
$ chmod 0600 .livesync-setup.env
$ docker run --rm --network none \
    --env-file .livesync-setup.env \
    docker.io/oleduc/docker-obsidian-livesync-couchdb:latest \
    generate-setup-uri
```

The command prints the Setup URI passphrase and an `obsidian://setuplivesync?...` URI. Store both in a password manager, then remove the temporary environment file. Do not publish the URI or write the command output to CI logs: the URI contains encrypted CouchDB credentials.

## 5. Configure Obsidian

Back up an existing Vault before enabling synchronization. A wrong choice during the initial merge can remove local or remote data.

1. Install and enable the **Self-hosted LiveSync** community plugin on one device.
2. Open the plugin setup wizard and paste the generated Setup URI.
3. Enter the `uri_passphrase` value when prompted.
4. Let the first device finish creating and uploading the remote database.
5. Configure additional devices with the same Setup URI only after the first synchronization completes.

## Backups and Updates

Back up the persistent CouchDB data and test restoration regularly. Copying `/opt/couchdb/data` while CouchDB is writing is not a reliable backup; stop the container, use a filesystem snapshot with consistent semantics, or replicate the database to another CouchDB instance.

Before changing the image tag:

```bash
$ docker compose stop couchdb
# Take a consistent backup or snapshot here.
$ docker compose pull couchdb
$ docker compose up -d couchdb
$ docker compose ps
```

The Setup URI is bootstrap material, not a backup. Keep the Vault encryption passphrase, Setup URI passphrase, CouchDB credentials, and database backups in separate secure storage.
