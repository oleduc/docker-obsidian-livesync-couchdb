#!/bin/bash

# CouchDB Setup Compatibility Test Runner
# Runs the compatibility test in a Deno container using Docker or Podman

set -e

echo "🚀 CouchDB Setup Compatibility Test"
echo "=================================="

# Function to run with Docker
run_with_docker() {
    echo "📦 Using Docker"
    docker build -f test.Dockerfile -t couchdb-compatibility-test .
    docker run --rm couchdb-compatibility-test
}

# Function to run with Podman and handle storage issues
run_with_podman() {
    echo "📦 Using Podman"
    podman build -f test.Dockerfile -t couchdb-compatibility-test .
    podman run --rm couchdb-compatibility-test
}

# Function to provide manual instructions
provide_manual_instructions() {
    echo "🔧 Manual Test Instructions"
    echo "============================"
    echo ""
    echo "If container builds fail, you can run the test manually:"
    echo ""
    echo "1. Install Deno: curl -fsSL https://deno.land/install.sh | sh"
    echo "2. Run the test: deno run --allow-net --allow-read --allow-write test-compatibility.ts"
    echo ""
    echo "Or use a different container runtime:"
    echo "- Try Docker instead of Podman"
    echo "- Use rootless containers: podman --remote"
    echo ""
}

# Detect and run with available container runtime
if command -v docker &> /dev/null; then
    if run_with_docker; then
        echo "✅ Test completed successfully!"
        exit 0
    else
        echo "❌ Docker execution failed, trying alternatives..."
    fi
fi

if command -v podman &> /dev/null; then
    if run_with_podman; then
        echo "✅ Test completed successfully!"
        exit 0
    else
        echo "❌ Podman execution failed"
    fi
fi

echo "❌ Container execution failed"
provide_manual_instructions
exit 1