"""Exercise the optional risk service over HTTP with separate project payloads."""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:8765"
for attempt in range(40):
    try:
        with urllib.request.urlopen(BASE + "/health", timeout=1) as response:
            assert json.load(response)["status"] == "ok"
        break
    except (OSError, TimeoutError):
        time.sleep(0.25)
else:
    raise SystemExit("Risk service did not become healthy")


def risk(files):
    body = json.dumps({
        "files": files,
        "targets": [{"id": "edit", "paths": ["src/a.ts"]}],
    }).encode()
    request = urllib.request.Request(
        BASE + "/risk", data=body, headers={"content-type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=2) as response:
        return json.load(response)["risks"][0]["score"]


first = risk([
    {"path": "src/a.ts", "content": "export function calculate() {}"},
    {"path": "src/b.ts", "content": "calculate()"},
])
second = risk([
    {"path": "src/a.ts", "content": "export function unrelated() {}"},
    {"path": "src/b.ts", "content": "calculate()"},
])
assert (first, second) == (20, 0), (first, second)
print("live service isolation smoke passed")
