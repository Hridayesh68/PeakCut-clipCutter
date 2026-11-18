#!/usr/bin/env bash
# PeakCut Start Script - Mounts data, secrets, starts container + ngrok

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           PeakCut Startup Script                          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Configuration ──────────────────────────────────────────────────────
CONTAINER_NAME="peakcut-app"
IMAGE_NAME="peakcut-clipcutter:latest"
HOST_PORT=8765
CONTAINER_PORT=8765
NGROK_DOMAIN=""  # Optional: set to your ngrok static domain if you have one
USE_DOCKER_COMPOSE=false  # Set false to use docker run directly (Local Mode)

# ─── Helper Functions ───────────────────────────────────────────────────
log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $*"; }

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 not found. Please install it first."
        exit 1
    fi
}

# ─── Pre-flight Checks ──────────────────────────────────────────────────
log_step "Running pre-flight checks..."

check_command docker

if [[ "$USE_DOCKER_COMPOSE" == "true" ]]; then
    if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
        log_error "docker compose not available"
        exit 1
    fi
fi

# Check required files/directories
REQUIRED=(
    "$PROJECT_DIR/.env"
    "$PROJECT_DIR/data"
    "$PROJECT_DIR/secrets"
)

for item in "${REQUIRED[@]}"; do
    if [[ ! -e "$item" ]]; then
        log_error "Required path not found: $item"
        exit 1
    fi
done

log_info "All required paths exist ✓"

# ─── Stop Existing Container ────────────────────────────────────────────
log_step "Stopping any existing PeakCut container..."
docker stop "$CONTAINER_NAME" 2>/dev/null && log_info "Stopped existing container" || true
docker rm "$CONTAINER_NAME" 2>/dev/null && log_info "Removed existing container" || true

# Also stop docker-compose if running
if [[ "$USE_DOCKER_COMPOSE" == "true" ]]; then
    docker compose down 2>/dev/null || true
fi

# ─── Build Image ────────────────────────────────────────────────────────
log_step "Building Docker image..."
docker build -t "$IMAGE_NAME" "$PROJECT_DIR" || {
    log_error "Docker build failed"
    exit 1
}
log_info "Image built: $IMAGE_NAME"

# ─── Start ngrok ────────────────────────────────────────────────────────
log_step "Starting ngrok tunnel..."

check_command ngrok

# Kill any existing ngrok on this port
pkill -f "ngrok http $HOST_PORT" 2>/dev/null || true
sleep 1

# Start ngrok first so we can get the URL for PEAKCUT_PUBLIC_URL
NGROK_CMD="ngrok http $HOST_PORT --host-header=rewrite"
if [[ -n "$NGROK_DOMAIN" ]]; then
    NGROK_CMD="$NGROK_CMD --domain=$NGROK_DOMAIN"
fi

# Start ngrok in background
$NGROK_CMD --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

log_info "ngrok started (PID: $NGROK_PID)"
sleep 4

# Get the public URL
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | \
    grep -o '"public_url":"https://[^"]*' | head -1 | cut -d'"' -f4)

if [[ -n "$NGROK_URL" ]]; then
    log_info "ngrok tunnel active: ${GREEN}$NGROK_URL${NC}"
else
    log_error "Could not get ngrok URL. Check ngrok dashboard at http://127.0.0.1:4040 or /tmp/ngrok.log"
    # Fallback to local if ngrok fails
    NGROK_URL="http://127.0.0.1:$HOST_PORT"
fi

# ─── Start Container ────────────────────────────────────────────────────
log_step "Starting PeakCut container..."

if [[ "$USE_DOCKER_COMPOSE" == "true" ]]; then
    log_info "Using docker-compose..."
    # We pass the URL through environment to docker-compose
    export PEAKCUT_PUBLIC_URL="$NGROK_URL"
    docker compose up -d --build

    # Wait for container to be healthy
    log_info "Waiting for container to start..."
    sleep 5
else
    log_info "Using docker run directly..."
    docker run -d \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        -v "$PROJECT_DIR/data:/data" \
        -v "$PROJECT_DIR/secrets:/secrets:ro" \
        -v "$PROJECT_DIR/.env:/app/.env" \
        -v "$PROJECT_DIR/.git:/app/.git:ro" \
        -p "127.0.0.1:$HOST_PORT:$CONTAINER_PORT" \
        -e "PEAKCUT_TRUST_PROXY=1" \
        -e "PEAKCUT_HOST=0.0.0.0" \
        -e "PEAKCUT_PORT=8765" \
        -e "PEAKCUT_DATA=/data" \
        -e "PEAKCUT_PUBLIC_URL=$NGROK_URL" \
        "$IMAGE_NAME"

    # Wait for container to be ready
    log_info "Waiting for container to start..."
    sleep 5
fi

# ─── Final Output ───────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           PeakCut is Ready!                               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Local:      ${GREEN}http://127.0.0.1:$HOST_PORT${NC}"
if [[ -n "$NGROK_URL" ]]; then
    echo -e "  Public:     ${GREEN}$NGROK_URL${NC}"
fi
echo -e "  ngrok UI:   ${GREEN}http://127.0.0.1:4040${NC}"
echo ""
echo -e "  Data dir:   ${YELLOW}$PROJECT_DIR/data${NC}"
echo -e "  Secrets:    ${YELLOW}$PROJECT_DIR/secrets${NC}"
echo -e "  Config:     ${YELLOW}$PROJECT_DIR/.env${NC}"
echo ""
echo -e "  Container logs: ${BLUE}docker logs -f $CONTAINER_NAME${NC}"
echo -e "  Stop:           ${BLUE}docker stop $CONTAINER_NAME${NC}"
echo ""

# Save ngrok URL for reference
if [[ -n "$NGROK_URL" ]]; then
    echo "$NGROK_URL" > "$PROJECT_DIR/.ngrok-url"
    log_info "Saved ngrok URL to .ngrok-url"
fi

# ─── Optional: Follow Logs ──────────────────────────────────────────────
if [[ "${1:-}" == "--follow" || "${1:-}" == "-f" ]]; then
    log_info "Following container logs (Ctrl+C to detach)..."
    docker logs -f "$CONTAINER_NAME"
fi