# RAWagon Agent System

7 autonomous agents — one per entity app. Each inspects, debugs, and patches its app using Claude claude-sonnet-4-20250514.

## Run

```bash
cd ~/rawagon
export ANTHROPIC_API_KEY=sk-ant-your-key
node agents/agent-system.js
```

## What each agent does

Every 90 seconds, each agent:
1. Reads its app HTML + contract Solidity
2. Asks Claude to inspect for bugs, missing features, broken flows
3. Reviews proposed patches against guardrails
4. Applies safe patches automatically
5. Queues risky patches for human approval

## Guardrails

| Rule | Limit |
|------|-------|
| Max lines changed | 50 per patch |
| Min confidence | 0.85 to auto-apply |
| Cooldown | 60s between runs |
| Max patches/run | 3 |
| Forbidden | Contract address changes |
| Forbidden | Private key / seed phrases |
| Forbidden | Delete existing functions |
| Always | Backup before patching |
| Always | Log every action |

## Logs

All agent activity logged to `agents/log/<agentid>.jsonl`

Pending human approvals: `agents/log/<agentid>-pending.json`

Backups of patched files: `agents/log/<agentid>-<timestamp>.bak`

## Agents

| Agent | App | Contract |
|-------|-----|----------|
| bitpawn | apps/bitpawn/index.html | PawnRegistry.sol |
| goldsnap | apps/goldsnap/index.html | GoldMint.sol |
| droppa | apps/droppa/index.html | BreakFactory.sol |
| autoiq | apps/autoiq/index.html | IQTitle.sol |
| allcard | apps/1nce-allcard/index.html | EmployeeVault.sol |
| qwks | apps/qwks-protocol/index.html | FeeDistributor.sol |
| rawagonos | apps/rawagon-os/index.html | LivingToken.sol |
