#!/usr/bin/env python3
"""
R3WAGON Data Integrity Monitor
Detects anomalies in on-chain data and price feeds using z-score.
Alerts on oracle manipulation, price spikes, unusual tx volumes.
"""
import os, json, statistics, logging
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [INTEGRITY] %(message)s")
log = logging.getLogger("data_integrity")

class DataIntegrityMonitor:
    def __init__(self, sigma_threshold=3, min_samples=10):
        self.sigma_threshold = sigma_threshold  # 3-sigma = 99.7% confidence
        self.min_samples = min_samples
        self.history: dict[str, list[float]] = {}
        self.alerts: list[dict] = []

    def add_sample(self, metric: str, value: float):
        if metric not in self.history:
            self.history[metric] = []
        self.history[metric].append(value)
        # Keep rolling 100-sample window
        if len(self.history[metric]) > 100:
            self.history[metric] = self.history[metric][-100:]

    def detect_anomaly(self, data_point: float, historical: list[float]) -> dict:
        """Returns anomaly result with z-score."""
        if len(historical) < self.min_samples:
            return {"anomaly": False, "reason": "insufficient_data", "z_score": 0}
        mean = statistics.mean(historical)
        stdev = statistics.stdev(historical) or 0.0001
        z_score = abs((data_point - mean) / stdev)
        anomaly = z_score > self.sigma_threshold
        if anomaly:
            log.warning(f"Anomaly detected: value={data_point:.4f} mean={mean:.4f} z={z_score:.2f}")
        return {"anomaly": anomaly, "z_score": round(z_score, 3), "mean": round(mean, 6), "stdev": round(stdev, 6)}

    def check_gold_price(self, price: float) -> dict:
        """Validate gold oracle price against historical baseline."""
        self.add_sample("gold_price", price)
        result = self.detect_anomaly(price, self.history["gold_price"][:-1])
        if result["anomaly"]:
            alert = {"type": "oracle_price_anomaly", "metric": "gold_price", "value": price, **result}
            self.alerts.append(alert)
            log.error(f"GOLD ORACLE ANOMALY: ${price} — z={result['z_score']}")
        return result

    def check_tx_volume(self, volume: float) -> dict:
        """Validate daily transaction volume."""
        self.add_sample("tx_volume", volume)
        result = self.detect_anomaly(volume, self.history["tx_volume"][:-1])
        if result["anomaly"]:
            self.alerts.append({"type": "volume_spike", "metric": "tx_volume", "value": volume, **result})
        return result

    def check_ltn_price(self, price: float) -> dict:
        """Validate LTN token price."""
        self.add_sample("ltn_price", price)
        return self.detect_anomaly(price, self.history["ltn_price"][:-1])

    def get_alerts(self, clear=False) -> list:
        alerts = self.alerts.copy()
        if clear:
            self.alerts.clear()
        return alerts

    def health_report(self) -> dict:
        return {
            "monitored_metrics": list(self.history.keys()),
            "sample_counts": {k: len(v) for k, v in self.history.items()},
            "active_alerts": len(self.alerts),
            "sigma_threshold": self.sigma_threshold,
        }


if __name__ == "__main__":
    mon = DataIntegrityMonitor(sigma_threshold=3)
    # Simulate gold prices
    import random
    for _ in range(20):
        mon.check_gold_price(4133 + random.gauss(0, 20))
    # Inject spike
    result = mon.check_gold_price(5500)
    print(f"Spike test: {json.dumps(result, indent=2)}")
    print(f"Health: {json.dumps(mon.health_report(), indent=2)}")
