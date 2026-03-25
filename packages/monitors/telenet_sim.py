
import argparse, json, random, time, sys

def simulate(nodes=64, duration=60, out='telemetry.json'):
    ids = [f'tn-{i:03d}' for i in range(1,nodes+1)]
    roles = ['relay']*int(nodes*0.7) + ['validator']*int(nodes*0.3)
    now = int(time.time())
    telemetry = {
        "network": "TeloNet-Genesis",
        "timestamp": now,
        "nodes": [],
        "alerts": []
    }
    for i, nid in enumerate(ids):
        role = roles[i % len(roles)]
        latency = max(5, int(random.gauss(22 if role=='validator' else 35, 10)))
        uptime = round(random.uniform(0.990, 0.9999), 4)
        capacity = 2000 if role=='validator' else 1500
        relay = min(capacity, int(random.gauss(capacity*0.6, capacity*0.15)))
        score = min(100, max(60, int(100 - (latency/2) + uptime*10)))
        telemetry["nodes"].append({
            "id": nid, "latency_ms": latency, "uptime": uptime,
            "relay": relay, "capacity": capacity, "role": role, "score": score
        })
        if latency > 70:
            telemetry["alerts"].append({"level":"med","message":f"High latency on {nid} ({latency}ms)","node":nid})
        if relay > capacity*0.9:
            telemetry["alerts"].append({"level":"low","message":f"Relay near cap on {nid}","node":nid})
    with open(out,'w') as f:
        json.dump(telemetry, f, indent=2)
    print(f"Wrote {out} with {nodes} nodes at {now}.")
    time.sleep(0.1)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument('--nodes', type=int, default=64)
    p.add_argument('--duration', type=int, default=60)
    p.add_argument('--out', type=str, default='telemetry.json')
    args = p.parse_args()
    simulate(args.nodes, args.duration, args.out)
