# CouchDB Configuration for Obsidian LiveSync

This repository provides a Docker container for configuring CouchDB specifically for use with [Obsidian LiveSync](https://github.com/vrtmrz/obsidian-livesync). It automates the setup process by parsing a Bash script (`couchdb-init.sh`) and updating CouchDB's configuration file (`local.ini`).

The container is built and published automatically via GitHub Actions.

[Docker Hub Page](https://hub.docker.com/r/oleduc/docker-obsidian-livesync-couchdb)

## Features
- **Automated CouchDB Configuration**: Extracts necessary settings for Obsidian LiveSync from the bash script created by the plugin maintainer.
- **Build time configuration**: Configures couchDB at build time via configuration files instead of using couchDB APIs which simplifies the process.
- **Auto-Publishing**: Docker images are automatically built and pushed to a container registry via GitHub Actions.

## Pulling the Docker Image
To use the pre-built image, pull it from the container registry:
```bash
docker pull docker.io/docker-obsidian-livesync-couchdb:latest
```
## Running the Container

Run the container with CouchDB configured for Obsidian LiveSync:

```
docker run -d \
  -e SERVER_DOMAIN=example.com \
  -e COUCHDB_USER=username \
  -e COUCHDB_PASSWORD=password \
  -e COUCHDB_DATABASE=obsidian \
  -p 5984:5984 \
  docker.io/oleduc/docker-obsidian-livesync-couchdb:master
```

Or via docker-compose
```yaml
version: "3.8"

services:
  couchdb-obsidian-livesync:
    image: docker.io/oleduc/docker-obsidian-livesync-couchdb:master
    container_name: couchdb-obsidian-livesync
    restart: always
    environment:
      SERVER_URL: ${SERVER_URL}
      COUCHDB_USER: ${COUCHDB_USER}
      COUCHDB_PASSWORD: ${COUCHDB_PASSWORD}
      COUCHDB_DATABASE: ${COUCHDB_DATABASE}
    ports:
      - "${COUCHDB_PORT:-5984}:5984"
    volumes:
      - /container-data/obsidian-livesync:/opt/couchdb/data
```

## Testing Configuration

To verify the updated configuration:

    Open your CouchDB dashboard (http://example.com:5984/_utils).
    Check that the settings are applied under /_node/_local/_config.

## License

This repository is licensed under the MIT License. Contributions are welcome!

## Credits

- [Obsidian LiveSync for the core synchronization functionality.](https://github.com/vrtmrz/obsidian-livesync)
- [CouchDB for its awesome, distributed database solution.](https://couchdb.apache.org/)
- [Obsidian for it's awesome note taking app.](https://obsidian.md/)
