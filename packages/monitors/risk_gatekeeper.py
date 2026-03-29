#!/usr/bin/env python3
"""
R3WAGON Risk Gatekeeper
Monitors drawdowns, enforces kill switches, stop-loss logic.
Wired to ProfitPilot analytics + GoldSnap price oracle.
"""
import os, time, json, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [RISK] %(message)s")
log = logging.getLogger("risk_gatekeeper")

class RiskGatekeeper:
    def __init__(self, max_drawdown=0.10, kill_switch_window=300):
        self.max_drawdown = max_drawdown        # 10% default
        self.kill_switch_window = kill_switch_window  # 5 minutes
        self.kill_active = False
        self.alert_webhook = os.getenv("ALERT_WEBHOOK_URL", "")

    def check_drawdown(self, pnl_history: list[float]) -> bool:
        """Returns True if drawdown exceeds max_drawdown within kill_switch_window."""
        if len(pnl_history) < 2:
            return False
        window = pnl_history[-self.kill_switch_window:]
        peak = max(window)
        current = window[-1]
        drawdown = (peak - current) / peak if peak > 0 else 0
        if drawdown > self.max_drawdown:
            log.warning(f"Drawdown {drawdown:.2%} exceeds {self.max_drawdown:.2%} — kill switch trigger")
            return True
        return False

    def check_per_instrument(self, symbol: str, current_price: float, entry_price: float, stop_pct=0.05) -> bool:
        """Returns True if instrument loss exceeds stop_pct."""
        if entry_price <= 0:
            return False
        loss = (entry_price - current_price) / entry_price
        if loss > stop_pct:
            log.warning(f"Stop-loss on {symbol}: {loss:.2%} loss (limit {stop_pct:.2%})")
            return True
        return False

    def engage_kill_switch(self):
        """Halt all trading activities. Log + alert."""
        self.kill_active = True
        log.error("KILL SWITCH ENGAGED — halting all trades")
        self._send_alert("KILL SWITCH ENGAGED", {"reason": "max_drawdown_exceeded"})

    def reset_kill_switch(self):
        """Manual reset after review."""
        self.kill_active = False
        log.info("Kill switch reset by operator")

    def evaluate(self, pnl_history: list[float], positions: dict = None) -> dict:
        """Full risk evaluation. Returns action dict."""
        result = {"kill_active": self.kill_active, "actions": []}
        if self.check_drawdown(pnl_history):
            self.engage_kill_switch()
            result["actions"].append("kill_switch")
        if positions:
            for sym, pos in positions.items():
                if self.check_per_instrument(sym, pos["current"], pos["entry"]):
                    result["actions"].append(f"stop_loss:{sym}")
        return result

    def _send_alert(self, title: str, data: dict):
        if not self.alert_webhook:
            return
        try:
            import urllib.request
            payload = json.dumps({"text": f"[R3WAGON RiskGatekeeper] {title}", "data": data}).encode()
            req = urllib.request.Request(self.alert_webhook, data=payload, headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            log.error(f"Alert webhook failed: {e}")


if __name__ == "__main__":
    gk = RiskGatekeeper(max_drawdown=0.10)
    # Test scenario
    pnl = [1000, 1050, 1100, 1080, 1040, 980, 950]  # drawdown from 1100 → 950 = 13.6%
    result = gk.evaluate(pnl)
    print(f"Risk evaluation: {json.dumps(result, indent=2)}")
