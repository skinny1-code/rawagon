#!/usr/bin/env python3
"""
R3WAGON Secret Manager
Loads secrets from env vars with fallback to .env file.
Never logs secret values. Validates required keys on startup.
"""
import os, json, logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SECRETS] %(message)s")
log = logging.getLogger("secret_manager")

REQUIRED_KEYS = [
    "ANTHROPIC_API_KEY",
    "GANACHE_RPC",
]

OPTIONAL_KEYS = [
    "OPENAI_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "MONGO_URI",
    "JWT_SECRET",
    "ADMIN_PASSWORD_HASH",
    "RENDER_API_KEY",
    "ALERT_WEBHOOK_URL",
]

class SecretManager:
    def __init__(self, env_file: str = ".env"):
        self._secrets: dict[str, str] = {}
        self._load_env_file(env_file)
        self._load_environment()

    def _load_env_file(self, path: str):
        p = Path(path)
        if not p.exists():
            return
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"\'\')
            self._secrets[k] = v
        log.info(f"Loaded {len(self._secrets)} keys from {path}")

    def _load_environment(self):
        """Environment vars override .env file."""
        for k, v in os.environ.items():
            self._secrets[k] = v

    def get_secret(self, key_name: str, default: str = "") -> str:
        val = self._secrets.get(key_name, default)
        return val

    def require(self, key_name: str) -> str:
        val = self._secrets.get(key_name, "")
        if not val:
            raise EnvironmentError(f"Required secret missing: {key_name}")
        return val

    def validate_startup(self) -> dict:
        """Check all required keys are present. Log status without values."""
        results = {}
        all_ok = True
        for k in REQUIRED_KEYS:
            present = bool(self._secrets.get(k))
            results[k] = "✓ set" if present else "✗ MISSING"
            if not present:
                all_ok = False
                log.error(f"Required secret missing: {k}")
        for k in OPTIONAL_KEYS:
            present = bool(self._secrets.get(k))
            results[k] = "✓ set" if present else "○ not set"
        if all_ok:
            log.info("All required secrets present")
        return results

    def to_dict(self, keys: list) -> dict:
        """Return subset of secrets (use carefully)."""
        return {k: self._secrets.get(k, "") for k in keys}

# Singleton
_instance = None
def get_secrets() -> SecretManager:
    global _instance
    if _instance is None:
        _instance = SecretManager()
    return _instance


if __name__ == "__main__":
    sm = SecretManager()
    report = sm.validate_startup()
    print(json.dumps(report, indent=2))
