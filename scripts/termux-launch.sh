#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════════
#  RAWAGON — Termux Bootstrap + Claude Code Launcher
#  Installs everything from scratch, clones repo, installs
#  Claude Code (claude CLI), and opens the project.
#
#  USAGE (paste this entire command into Termux):
#    curl -fsSL https://raw.githubusercontent.com/skinny1-code/rawagon/main/scripts/termux-launch.sh | bash
#
#  OR if you already have the repo:
#    bash ~/rawagon/scripts/termux-launch.sh
# ═══════════════════════════════════════════════════════════════

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[RAWagon]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}── $1 ──${NC}"; }

echo -e "${BOLD}"
cat << 'BANNER'
 ____  ___   __        ___   ____  ___   _   _
|  _ \/ _ \ / _|      / _ \ / ___||_ _| | \ | |
| |_) | |_| | |_ ____| | | | |  _ | |  |  \| |
|  _ <|  _  |  _|____| |_| | |_| || |  | |\  |
|_| \_\_| |_/_|       \___/ \____|___| |_| \_|

  Termux Bootstrap + Claude Code Launcher
  RAWNet chainId 720701 | WAGON wallet | 75/75 tests
BANNER
echo -e "${NC}"

# ───────────────────────────────────────────────────────────────
step "1/7 — System packages"
# ───────────────────────────────────────────────────────────────
pkg update -y -q 2>/dev/null || true
pkg install -y nodejs git curl wget nano tmux openssh python \
  binutils make pkg-config 2>/dev/null || true
log "System packages ready"

# ───────────────────────────────────────────────────────────────
step "2/7 — Storage permission"
# ───────────────────────────────────────────────────────────────
if [ ! -d ~/storage ]; then
  log "Requesting storage access..."
  termux-setup-storage || warn "Storage setup skipped (not needed for operation)"
fi

# ───────────────────────────────────────────────────────────────
step "3/7 — GitHub CLI (gh)"
# ───────────────────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  log "Installing GitHub CLI..."
  pkg install -y gh 2>/dev/null || {
    warn "gh not in pkg, installing from binary..."
    GH_VER="2.47.0"
    GH_URL="https://github.com/cli/cli/releases/download/v${GH_VER}/gh_${GH_VER}_linux_arm64.tar.gz"
    curl -fsSL "$GH_URL" -o /tmp/gh.tar.gz
    tar -xzf /tmp/gh.tar.gz -C /tmp
    cp /tmp/gh_*/bin/gh $PREFIX/bin/
    rm -rf /tmp/gh.tar.gz /tmp/gh_*
  }
fi
log "GitHub CLI: $(gh --version 2>/dev/null | head -1 || echo 'installed')"

# ───────────────────────────────────────────────────────────────
step "4/7 — Clone / update RAWagon repo"
# ───────────────────────────────────────────────────────────────
REPO_DIR="$HOME/rawagon"
if [ -d "$REPO_DIR/.git" ]; then
  log "Repo exists — pulling latest..."
  cd "$REPO_DIR" && git pull origin main --rebase 2>/dev/null || true
else
  log "Cloning rawagon repo..."
  # Try gh first (if authenticated), fallback to https
  if gh auth status &>/dev/null 2>&1; then
    gh repo clone skinny1-code/rawagon "$REPO_DIR" -- --depth 1
  else
    git clone --depth 1 https://github.com/skinny1-code/rawagon.git "$REPO_DIR" 2>/dev/null || {
      warn "GitHub clone failed — creating local repo structure..."
      mkdir -p "$REPO_DIR"
      cd "$REPO_DIR"
      git init
      git remote add origin https://github.com/skinny1-code/rawagon.git
    }
  fi
fi
cd "$REPO_DIR"
log "Repo ready at $REPO_DIR"

# ───────────────────────────────────────────────────────────────
step "5/7 — Node dependencies"
# ───────────────────────────────────────────────────────────────
if [ -f package.json ]; then
  log "Installing npm packages..."
  npm install --prefer-offline --no-audit --no-fund 2>/dev/null | tail -3 || \
  npm install --no-audit --no-fund 2>/dev/null | tail -3
  log "npm packages ready"
else
  warn "No package.json found — skipping npm install"
fi

# ───────────────────────────────────────────────────────────────
step "6/7 — Install Claude Code (claude CLI)"
# ───────────────────────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  log "Installing Claude Code..."
  npm install -g @anthropic-ai/claude-code 2>/dev/null || {
    warn "npm global failed — trying with prefix..."
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    export PATH="$HOME/.npm-global/bin:$PATH"
    npm install -g @anthropic-ai/claude-code
  }
  # Add to PATH permanently
  if ! grep -q '.npm-global/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$HOME/.bashrc"
  fi
  if ! grep -q '.npm-global/bin' "$HOME/.profile" 2>/dev/null; then
    echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$HOME/.profile"
  fi
  export PATH="$HOME/.npm-global/bin:$PATH"
else
  log "Claude Code already installed: $(claude --version 2>/dev/null || echo 'ok')"
fi

# ───────────────────────────────────────────────────────────────
step "7/7 — Environment setup"
# ───────────────────────────────────────────────────────────────
cd "$REPO_DIR"
if [ ! -f .env ]; then
  log "Creating .env from example..."
  cp .env.example .env 2>/dev/null || cat > .env << 'ENVEOF'
# RAWagon Environment
BASE_RPC_URL=https://mainnet.base.org
RAWNET_RPC_URL=https://testnet-rpc.rawnet.io
NODE_ENV=development

# WAGON Wallet
WAGON_MNEMONIC="job debate bulb acquire decorate critic attitude bless bracket fork broccoli east"
WAGON_MASTER=0x629aa93822F3b4722934e8Edb68940e214a21ab7
WAGON_DEPLOYER=0xd9676b253d2d644bB33339D74e16fb73216f0EfC
WAGON_BRIDGE_RELAY=0x5117a5adc1b884a795B923916c27786988BCc648

# FOUNDER Wallet (Ryan Williams)
FOUNDER_MNEMONIC="nerve finish surface during tilt enable frame spoon arrow slow spend saddle"
FOUNDER_EVM_MAIN=0x1eA5d26F9aaEFcc8A3684fB27D0005ABFbdA83d8
FOUNDER_SOLANA=6obJ9s7159KRG5eGL2AP67Tkcw18pjkZdaSQJuFaeN78
ENVEOF
  log ".env created"
fi

# Run tests to verify everything works
log "Running test suite..."
PASS=0; FAIL=0
for test_file in tests/unit/*.test.js tests/integration/*.test.js tests/e2e/*.test.js; do
  [ -f "$test_file" ] || continue
  if node "$test_file" &>/dev/null; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    warn "Failed: $test_file"
  fi
done
log "Tests: $PASS passed, $FAIL failed"

# ───────────────────────────────────────────────────────────────
# LAUNCH OPTIONS
# ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  RAWagon is ready! Choose how to proceed:        ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}1)${NC} Launch ${BOLD}Claude Code${NC} (AI-powered dev in your project)"
echo -e "     ${YELLOW}claude${NC}"
echo ""
echo -e "  ${CYAN}2)${NC} Run ${BOLD}test suite${NC}"
echo -e "     ${YELLOW}node tests/unit/zk.test.js${NC}"
echo -e "     ${YELLOW}node tests/integration/workflows.test.js${NC}"
echo -e "     ${YELLOW}node tests/e2e/network.test.js${NC}"
echo ""
echo -e "  ${CYAN}3)${NC} Open ${BOLD}tmux session${NC} (split-screen: code + tests)"
echo -e "     ${YELLOW}tmux new-session -s rawagon${NC}"
echo ""
echo -e "  ${CYAN}4)${NC} ${BOLD}Deploy contracts${NC} to RAWNet testnet"
echo -e "     ${YELLOW}node scripts/deploy.js --network rawnet_testnet${NC}"
echo ""
echo -e "  ${CYAN}5)${NC} Check ${BOLD}WAGON wallet${NC} balance"
echo -e "     ${YELLOW}node -e \"const{ethers}=require('ethers');const p=new ethers.JsonRpcProvider('https://mainnet.base.org');p.getBalance('0x629aa93822F3b4722934e8Edb68940e214a21ab7').then(b=>console.log('WAGON Master:',ethers.formatEther(b),'ETH'))\"${NC}"
echo ""
echo -e "${BOLD}Project directory:${NC} $REPO_DIR"
echo -e "${BOLD}WAGON Master:${NC}     0x629aa93822F3b4722934e8Edb68940e214a21ab7"
echo -e "${BOLD}FOUNDER EVM:${NC}      0x1eA5d26F9aaEFcc8A3684fB27D0005ABFbdA83d8"
echo -e "${BOLD}FOUNDER Solana:${NC}   6obJ9s7159KRG5eGL2AP67Tkcw18pjkZdaSQJuFaeN78"
echo ""

# Auto-launch Claude Code if confirmed
echo -e "${YELLOW}Launch Claude Code now? (y/n):${NC} \c"
read -r LAUNCH_NOW </dev/tty 2>/dev/null || LAUNCH_NOW="n"
if [[ "$LAUNCH_NOW" =~ ^[Yy]$ ]]; then
  log "Launching Claude Code in $REPO_DIR..."
  export PATH="$HOME/.npm-global/bin:$PATH"
  cd "$REPO_DIR"
  claude
else
  echo ""
  log "Setup complete. When ready, run:"
  echo -e "  ${YELLOW}cd ~/rawagon && claude${NC}"
fi


log "Quick start:"
echo "  pkill node; sleep 1"
echo "  ganache --port 8545 --host 0.0.0.0 --deterministic --chain.chainId 720701 --quiet &"
echo "  sleep 3 && node scripts/deploy-ganache.js"
echo "  node server.js"
echo ""
echo "Tests: node scripts/run-all-tests.js"
echo "Agents: export ANTHROPIC_API_KEY=sk-ant-... && node agents/agent-system.js"
echo "Monitors: python3 packages/monitors/run_monitors.py"
