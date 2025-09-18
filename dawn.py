import json, time, sys, pathlib, base64, hashlib
sys.stdout.write('\x1b]2;Dawn Mining Node by : 佐賀県産 （𝒀𝑼𝑼𝑹𝑰）\x1b\\'); sys.stdout.flush()
from typing import Dict, Any, Optional, Tuple
from urllib.parse import urlencode
from datetime import datetime
import requests
from requests.exceptions import RequestException
import pyfiglet
from termcolor import colored

API_BASE = "https://ext-api.dawninternet.com"
APP_VERSION = "1.2.2"
UA_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
SEC_CH_UA = '"Chromium";v="140", "Not=A?Brand";v="24", "Microsoft Edge";v="140"'
SEC_CH_UA_PLATFORM = '"Windows"'
SEC_CH_UA_MOBILE = '?0'
EXT_ORIGIN = 'chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp'
BOLD = "\033[1m"; RESET = "\033[0m"; GREEN = "\033[32m"; YELLOW = "\033[33m"; RED = "\033[31m"; CYAN = "\033[36m"
def LG(m): print(f"{GREEN}{BOLD}{m}{RESET}", flush=True)
def LY(m): print(f"{YELLOW}{BOLD}{m}{RESET}", flush=True)
def LR(m): print(f"{RED}{BOLD}{m}{RESET}", flush=True)
def LC(m): print(f"{CYAN}{BOLD}{m}{RESET}", flush=True)
def display_banner():
    ascii_art = pyfiglet.figlet_format("Yuurisandesu", font="standard")
    print(colored(f"{BOLD}{ascii_art}{RESET}", "cyan"))
    print(colored(f"{BOLD}Welcome to Yuuri, Dawn Mining Node {RESET}", "magenta"))
    print(colored(f"{BOLD}Ready to hack the world?{RESET}", "green"))
    print(colored(f"{BOLD}Current time: {datetime.now().strftime('%d-%m-%Y %H:%M:%S')}{RESET}", "yellow"))
    print()
ROOT = pathlib.Path(__file__).resolve().parent
ACCOUNTS_PATH = ROOT / "accounts.json"
CACHE_PATH = ROOT / ".dawn_cache.json"
def load_accounts() -> Dict[str, Any]:
    if not ACCOUNTS_PATH.exists():
        ACCOUNTS_PATH.write_text(json.dumps({"accounts":[{"label":"acc1","token":"PASTE_TOKEN_HERE"},{"label":"acc2","token":"PASTE_TOKEN_HERE"}]}, indent=2))
        LY("created accounts.json • fill tokens and labels")
        sys.exit(0)
    try:
        d = json.loads(ACCOUNTS_PATH.read_text())
        accs = d.get("accounts", [])
        if not isinstance(accs, list): raise ValueError("accounts must be a list")
        cleaned = []
        for a in accs:
            label = a.get("label") or "-"
            t = a.get("token") or ""
            if not t or t == "PASTE_TOKEN_HERE":
                LR(f"{label}: token missing")
                continue
            if "." not in t:
                try:
                    pad = 4 - (len(t) % 4)
                    if pad and pad < 4: t += "=" * pad
                    raw = base64.b64decode(t).decode("utf-8", "ignore")
                    if raw.count(".") == 2:
                        t = raw
                except Exception:
                    pass
            cleaned.append({"label": label, "token": t})
        if not cleaned:
            LR("no valid accounts found")
            sys.exit(1)
        return {"accounts": cleaned}
    except Exception as e:
        LR(f"failed to read accounts.json • {e}")
        sys.exit(1)
def load_cache() -> Dict[str, Any]:
    if CACHE_PATH.exists():
        try: return json.loads(CACHE_PATH.read_text())
        except Exception: return {}
    return {}
def save_cache(obj: Dict[str, Any]):
    CACHE_PATH.write_text(json.dumps(obj, indent=2))
def headers_base(auth_token: Optional[str] = None) -> Dict[str, str]:
    h = {
        "accept": "*/*",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br, zstd",
        "origin": EXT_ORIGIN,
        "sec-ch-ua": SEC_CH_UA,
        "sec-ch-ua-mobile": SEC_CH_UA_MOBILE,
        "sec-ch-ua-platform": SEC_CH_UA_PLATFORM,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent": UA_EDGE,
        "content-type": "application/json"
    }
    if auth_token:
        h["authorization"] = f"Berear {auth_token}"
    return h
def http_get(path: str, token: Optional[str]=None, query: Optional[dict]=None):
    url = f"{API_BASE.rstrip('/')}/{path.lstrip('/')}"
    if query: url += ("?" + urlencode(query))
    try:
        r = requests.get(url, headers=headers_base(token), timeout=30)
    except RequestException as e:
        raise RuntimeError(f"GET {path} network") from e
    if r.status_code >= 400:
        raise RuntimeError(f"GET {path} http {r.status_code}")
    if r.text.strip():
        try: return r.json()
        except Exception: return None
    return None
def http_post(path: str, token: str, body: dict, query: Optional[dict]=None):
    url = f"{API_BASE.rstrip('/')}/{path.lstrip('/')}"
    if query: url += ("?" + urlencode(query))
    try:
        r = requests.post(url, headers=headers_base(token), json=body, timeout=30)
    except RequestException as e:
        raise RuntimeError(f"POST {path} network") from e
    if r.status_code >= 400:
        raise RuntimeError(f"POST {path} http {r.status_code}")
    if r.text.strip():
        try: return r.json()
        except Exception: return None
    return None
def _extract_appid(obj: Any) -> str:
    if not obj: return ""
    if isinstance(obj, str): return obj
    if isinstance(obj, dict):
        for k in ("appid","appId","app_id","id"):
            v = obj.get(k)
            if isinstance(v, str) and v:
                return v
        if "data" in obj:
            return _extract_appid(obj["data"])
    if isinstance(obj, list) and obj:
        return _extract_appid(obj[0])
    return ""
def get_appid(cache: dict) -> str:
    ts = int(time.time())
    cached = cache.get("appid") or {}
    appid = cached.get("value")
    if isinstance(appid, str) and appid:
        return appid
    data = http_get("/chromeapi/dawn/v1/appid/getappid", None, {"app_v": APP_VERSION})
    appid = _extract_appid(data)
    if not appid:
        raise RuntimeError("cannot obtain appid")
    cache["appid"] = {"value": appid, "ts": ts}
    save_cache(cache)
    LY(f"appid loaded • {appid[:8]}…")
    return appid
def parse_points_payload(d: dict):
    data = d.get("data") or {}
    ref = data.get("referralPoint") or {}
    rew = data.get("rewardPoint") or {}
    commission = int(ref.get("commission") or 0)
    points = int(rew.get("points") or 0)
    tw = int(rew.get("twitter_x_id_points") or 0)
    dc = int(rew.get("discordid_points") or 0)
    tg = int(rew.get("telegramid_points") or 0)
    e1 = int(rew.get("epoch01") or 0)
    e2 = int(rew.get("epoch02") or 0)
    total = commission + points + tw + dc + tg + e1 + e2
    return commission, points, tw, dc, tg, e1, e2, total
def get_points(token: str, appid: str):
    try:
        d = http_get("/api/atom/v1/userreferral/getpoint", token, {"appid": appid})
        if isinstance(d, dict):
            return parse_points_payload(d)
        return None
    except Exception:
        return None
def parse_jwt_payload(token: str) -> dict:
    try:
        parts = token.split(".")
        if len(parts) != 3: return {}
        payload_b64 = parts[1]
        pad = 4 - (len(payload_b64) % 4)
        if pad and pad < 4: payload_b64 += "=" * pad
        raw = base64.urlsafe_b64decode(payload_b64.encode("ascii"))
        return json.loads(raw.decode("utf-8", "ignore"))
    except Exception:
        return {}
def guess_username(token: str) -> str:
    p = parse_jwt_payload(token)
    for key in ("username","user_name","email","sub","account_id","id","uid"):
        val = p.get(key)
        if isinstance(val, str) and len(val) >= 3:
            return val
    return ""
def pseudo_extension_id(username: str, appid: str) -> str:
    appid_str = appid if isinstance(appid, str) else json.dumps(appid, separators=(",",":"))
    base = (username or "user") + "|" + appid_str
    h = hashlib.sha1(base.encode("utf-8")).hexdigest()
    return h[:32]
def keepalive(token: str, appid: str, label: str):
    uname = guess_username(token)
    extid = pseudo_extension_id(uname, appid)
    body = {"username": uname, "extensionid": extid, "numberoftabs": 0, "_v": APP_VERSION}
    try:
        _ = http_post("/chromeapi/dawn/v1/userreward/keepalive", token, body, {"appid": appid})
        LG(f"{label}: keepalive ok • auth Berear • user {uname or 'n/a'} • extid {extid[:8]}…")
        return True
    except Exception as e:
        LR(f"{label}: keepalive failed • {e}")
        return False
def sync_loop_round_robin(accounts: list):
    cache = load_cache()
    appid = get_appid(cache)
    n = len(accounts)
    idx = 0
    while True:
        t = time.localtime()
        minute = t.tm_min
        second = t.tm_sec
        wait = ((2 - (minute % 2)) % 2) * 60 + (60 - second) if second != 0 else ((2 - (minute % 2)) % 2) * 60
        if wait == 0: wait = 120
        LY(f"next keepalive in {int(wait)}s")
        time.sleep(wait)
        a = accounts[idx]
        label = a.get("label") or f"acc{idx+1}"
        token = a.get("token") or ""
        LC(f"sending • account {idx+1}/{n} • {label}")
        if token and token != "PASTE_TOKEN_HERE":
            ok = keepalive(token, appid, label)
            stats = get_points(token, appid)
            if stats:
                commission, points, tw, dc, tg, e1, e2, total = stats
                LY(f"{label}: points • base {points} • commission {commission} • tw {tw} • dc {dc} • tg {tg} • epoch01 {e1} • epoch02 {e2}")
                LG(f"{label}: total points • {total}")
            else:
                LY(f"{label}: points not available")
        else:
            LR(f"{label}: token missing")
        idx = (idx + 1) % n
def main():
    display_banner()
    cfg = load_accounts()
    accounts = cfg.get("accounts", [])
    if not accounts:
        LR("no accounts in accounts.json")
        sys.exit(1)
    sync_loop_round_robin(accounts)
if __name__ == "__main__":
    main()
