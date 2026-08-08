# syntax=docker/dockerfile:1
#
# @zkuat/runtime — the local sponsor companion.
#
# The release workflow generates the ignored Compact assets, builds this file
# from the repository root, and publishes:
#
#   ghcr.io/rpetey317/zkuat-runtime:latest
#
# Operators should pull that image. A source build is still possible from the
# repository root after `npm --prefix contract run compile:keys`; runtime/
# depends on ../contract through a `file:` link.
#
# Run with host networking. This is not a preference — runtime/src/config.ts
# rejects any ZKUAT_RUNTIME_URL or ZKUAT_PROOF_SERVER_URL that is not loopback,
# so the container must share the host's loopback interface for the paired
# browser to reach :4317 and for the runtime to reach the proof server on :6300.
# The Docker socket is mounted so the runtime can manage the sibling proof-server
# container (`docker run --label works.zkuat.runtime=true ...`).
#
# The root compose.yml contains the normal operator configuration. Run attached
# so the startup banner and PAIRING CODE remain visible:
#
#   docker compose up
#
# Compose loads runtime/.env into the process environment and mounts
# ~/.zkuat/runtime separately for jobs and private state. Both contain sensitive
# material; never bake either into an image layer.

ARG NODE_VERSION=22-bookworm-slim
ARG DOCKER_CLI_VERSION=27.5.1


# --- docker CLI ---------------------------------------------------------------
# Only the client binary. ProofServerManager shells out to `docker inspect`,
# `docker run`, `docker start`, and `docker stop`; the daemon stays on the host.
FROM debian:bookworm-slim AS docker-cli
ARG DOCKER_CLI_VERSION
ARG TARGETARCH
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    rm -rf /var/lib/apt/lists/*; \
    case "${TARGETARCH:-amd64}" in \
      amd64) docker_arch=x86_64 ;; \
      arm64) docker_arch=aarch64 ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/docker-${DOCKER_CLI_VERSION}.tgz" \
      | tar -xz -C /tmp docker/docker; \
    install -m 0755 /tmp/docker/docker /usr/local/bin/docker; \
    docker --version


# --- dependencies -------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# contract/ installs its own tree. Rule 1: the SDK — and therefore the WASM
# module — must exist exactly once, inside contract/node_modules.
COPY contract/package.json contract/package-lock.json ./contract/
RUN npm --prefix contract ci

# runtime/ depends only on @zkuat/contract (file:../contract), so contract's
# package.json must already be in place for `npm ci` to resolve the link.
# Dev dependencies are kept: tsx is what executes src/cli.ts.
COPY runtime/package.json runtime/package-lock.json ./runtime/
RUN npm --prefix runtime ci

# Fail the build on a second copy of the pinned onchain runtime rather than
# letting it surface as `expected instance of StateValue` on the first circuit
# call, long after a successful deployment.
RUN set -eux; \
    contract_copies="$(find contract/node_modules -name onchain-runtime-v3 -type d | wc -l)"; \
    runtime_copies="$(find runtime/node_modules -name onchain-runtime-v3 -type d | wc -l)"; \
    echo "onchain-runtime-v3: contract=${contract_copies} runtime=${runtime_copies}"; \
    [ "${contract_copies}" -eq 1 ]; \
    [ "${runtime_copies}" -eq 0 ]


# --- runtime image ------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# Root, deliberately: mounting the Docker socket is already root-equivalent on
# the host, and root keeps the 0700/0600 modes that storage.ts enforces on the
# bind-mounted ~/.zkuat/runtime working regardless of the host uid.
ENV NODE_ENV=production \
    HOME=/root \
    PATH=/app/runtime/node_modules/.bin:$PATH

WORKDIR /app

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=deps /app/contract/node_modules ./contract/node_modules
COPY --from=deps /app/runtime/node_modules ./runtime/node_modules

COPY contract/package.json contract/tsconfig.json ./contract/
COPY contract/src ./contract/src
COPY runtime/package.json runtime/tsconfig.json ./runtime/
COPY runtime/src ./runtime/src

# `npm ci` created runtime/node_modules/@zkuat/contract as a symlink into the
# builder's layout; re-point it at this image's ../contract.
RUN set -eux; \
    mkdir -p runtime/node_modules/@zkuat; \
    rm -rf runtime/node_modules/@zkuat/contract; \
    ln -s ../../../contract runtime/node_modules/@zkuat/contract; \
    node -e "console.log(require('node:fs').realpathSync('runtime/node_modules/@zkuat/contract'))"

# Proving keys and ZKIR are gitignored (~15 MB). The publishing workflow
# generates them before this build and COPY above includes them in the image, so
# operators never need the Compact compiler. For a manual source build, generate
# them first with `npm --prefix contract run compile:keys`. Pass
# --build-arg SKIP_ZK_ASSET_CHECK=1 to build a proof-less image (useful only for
# `proof-server status` or config smoke tests — deploy and prove will fail).
ARG SKIP_ZK_ASSET_CHECK=0
RUN set -eux; \
    assets=contract/src/managed/audit_registry; \
    if [ ! -d "${assets}/keys" ] || [ ! -d "${assets}/zkir" ]; then \
      echo "zkuat: ${assets}/keys and ${assets}/zkir are missing." >&2; \
      echo "zkuat: the publishing workflow or source builder must run 'npm --prefix contract run compile:keys' first." >&2; \
      [ "${SKIP_ZK_ASSET_CHECK}" = "1" ] || exit 1; \
      echo "zkuat: continuing without ZK assets (SKIP_ZK_ASSET_CHECK=1); proving will fail." >&2; \
    fi

WORKDIR /app/runtime

# Default from config.ts; override with -e ZKUAT_RUNTIME_URL and a matching
# published port. Documentation only — --network host ignores EXPOSE.
EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const u = new URL('/v1/health', process.env.ZKUAT_RUNTIME_URL || 'http://127.0.0.1:4317'); fetch(u).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# JSON form keeps the TypeScript runtime as PID 1. It writes its startup banner
# directly to stdout, which is visible in the attached terminal and retained by
# Docker's log driver for `docker logs zkuat-runtime`.
ENTRYPOINT ["tsx", "src/cli.ts"]
CMD ["start"]
