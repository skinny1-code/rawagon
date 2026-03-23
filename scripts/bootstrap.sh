#!/data/data/com.termux/files/usr/bin/bash
# RAWagon one-liner bootstrap
# Paste into Termux then run: bash bootstrap.sh

pkg update -y -q && pkg install -y nodejs git curl tmux 2>/dev/null
npm install -g @anthropic-ai/claude-code 2>/dev/null
mkdir -p $HOME/.npm-global/bin
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc 2>/dev/null || true
git clone --depth 1 https://github.com/skinny1-code/rawagon.git ~/rawagon 2>/dev/null || (cd ~/rawagon && git pull)
cd ~/rawagon
npm install --no-audit --no-fund 2>/dev/null | tail -2
echo "Ready. Run: cd ~/rawagon && claude"
