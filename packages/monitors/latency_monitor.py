#!/usr/bin/env python3
"""
R3WAGON Latency Monitor
Watches API endpoints; switches to backup feeds on threshold breach.
Covers: Ganache RPC, NHTSA API, CoinGecko, Gold oracle.
"""
import os, time, json, urllib.request, logging
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [LATENCY] %(message)s")
log = logging.getLogger("latency_monitor")

ENDPOINTS = {
    "ganache_rpc":   {"url": os.getenv("GANACHE_RPC", "http://10.117.122.142:8545"), "backup": "http://127.0.0.1:8545", "method": "POST", "body": b'{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'},
    "nhtsa_vin":     {"url": "https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/TEST?format=json", "backup": None},
    "coingecko":     {"url": "https://api.coingecko.com/api/v3/ping", "backup": None},
}

class LatencyMonitor:
    def __init__(self, max_latency_ms=500, check_interval=30):
        self.max_latency_ms = max_latency_ms
        self.check_interval = check_interval
        self.status = {k: {"ok": True, "latency_ms": 0, "using_backup": False} for k in ENDPOINTS}

    def check_latency(self, endpoint_name: str) -> dict:
        cfg = ENDPOINTS.get(endpoint_name, {})
        url = cfg.get("url", "")
        start = time.monotonic()
        ok = False
        latency = 9999
        try:
            method = cfg.get("method", "GET")
            body = cfg.get("body")
            req = urllib.request.Request(url, data=body, method=method,
                headers={"Content-Type":"application/json"} if body else {})
            with urllib.request.urlopen(req, timeout=3) as r:
                r.read(512)
            ok = True
            latency = int((time.monotonic() - start) * 1000)
        except Exception as e:
            latency = 9999
            log.warning(f"{endpoint_name} unreachable: {e}")

        over_threshold = latency > self.max_latency_ms
        if over_threshold and cfg.get("backup"):
            log.warning(f"{endpoint_name} latency {latency}ms > {self.max_latency_ms}ms — switching to backup")
            self.status[endpoint_name]["using_backup"] = True
        else:
            self.status[endpoint_name]["using_backup"] = False

        self.status[endpoint_name].update({"ok": ok, "latency_ms": latency})
        return self.status[endpoint_name]

    def check_all(self) -> dict:
        results = {}
        for name in ENDPOINTS:
            results[name] = self.check_latency(name)
        return results

    def get_best_rpc(self) -> str:
        s = self.status.get("ganache_rpc", {})
        if s.get("using_backup"):
            return ENDPOINTS["ganache_rpc"]["backup"]
        return ENDPOINTS["ganache_rpc"]["url"]

    def run(self):
        log.info(f"Latency monitor started — checking every {self.check_interval}s")
        while True:
            results = self.check_all()
            alive = sum(1 for r in results.values() if r["ok"])
            log.info(f"Endpoints: {alive}/{len(results)} OK — RPC: {results.get('ganache_rpc',{}).get('latency_ms',0)}ms")
            time.sleep(self.check_interval)


if __name__ == "__main__":
    mon = LatencyMonitor(max_latency_ms=500, check_interval=10)
    results = mon.check_all()
    print(json.dumps(results, indent=2))
