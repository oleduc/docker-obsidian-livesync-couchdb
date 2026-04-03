FROM docker.io/denoland/deno:2.7.11

WORKDIR /app

# Copy the test files
COPY test-compatibility.ts .
COPY deno.json .

# Pre-cache dependencies
RUN deno cache test-compatibility.ts

# Make the script executable
RUN chmod +x test-compatibility.ts

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "test-compatibility.ts"]