#!/usr/bin/env python3
"""
R3WAGON Monitor Runner
Run all monitors in background threads.
Usage: python3 packages/monitors/run_monitors.py
"""
import threading, time, logging, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from secret_manager import SecretManager
from latency_monitor import LatencyMonitor
from data_integrity import DataIntegrityMonitor
from risk_gatekeeper import RiskGatekeeper

logging.basicConfig(level=logging.INFO, format="%(asctime)s [MONITOR] %(message)s")
log = logging.getLogger("run_monitors")

def run_latency(mon):
    while True:
        results = mon.check_all()
        alive = sum(1 for r in results.values() if r["ok"])
        log.info(f"Latency: {alive}/{len(results)} endpoints OK | RPC: {results.get('ganache_rpc',{}).get('latency_ms',0)}ms")
        time.sleep(30)

def run_integrity(mon):
    """Simulate periodic oracle price checks."""
    import random, urllib.request, json
    while True:
        try:
            r = urllib.request.urlopen("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", timeout=5)
            d = json.loads(r.read())
            btc_price = d.get("bitcoin", {}).get("usd", 0)
            result = mon.check_gold_price(btc_price * 0.002)  # rough gold/btc ratio
            if result.get("anomaly"):
                log.warning(f"PRICE ANOMALY: z={result['z_score']}")
        except Exception as e:
            log.debug(f"Price check: {e}")
        time.sleep(60)

def main():
    sm = SecretManager()
    status = sm.validate_startup()
    log.info(f"Secrets: {sum(1 for v in status.values() if 'set' in v)}/{len(status)} configured")

    lat_mon = LatencyMonitor(max_latency_ms=500, check_interval=30)
    int_mon = DataIntegrityMonitor(sigma_threshold=3)
    risk_gk = RiskGatekeeper(max_drawdown=0.10)

    threads = [
        threading.Thread(target=run_latency, args=(lat_mon,), daemon=True, name="latency"),
        threading.Thread(target=run_integrity, args=(int_mon,), daemon=True, name="integrity"),
    ]
    for t in threads:
        t.start()
        log.info(f"Started {t.name} monitor")

    log.info("All monitors running. Ctrl+C to stop.")
    try:
        while True:
            time.sleep(10)
            alerts = int_mon.get_alerts(clear=True)
            if alerts:
                for a in alerts:
                    log.warning(f"ALERT: {a}")
    except KeyboardInterrupt:
        log.info("Monitor suite stopped")

if __name__ == "__main__":
    main()
