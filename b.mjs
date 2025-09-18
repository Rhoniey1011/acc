import fs from "fs/promises";
import axios from "axios";
import figlet from "figlet";
import chalk from "chalk";
import process from "process";
import { setTimeout as sleep } from "timers/promises";
import { v5 as uuidv5 } from "uuid";

const SUPABASE_URL = "https://qevcpuebfogiqtyrxfpv.supabase.co";
const ANON_KEY = "sb_publishable_y0JX5vySxUoPYWT9yoROlA_1_uCXOSl";
const FUNC_HEARTBEAT = "https://qevcpuebfogiqtyrxfpv.functions.supabase.co/heartbeat";
const ACCOUNTS_FILE = "accounts.json";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const ID_MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];

function displayBanner(){
  const asciiArt = figlet.textSync("Yuurisandesu", { font: "Standard" });
  console.log(chalk.cyan(BOLD + asciiArt + RESET));
  console.log(chalk.magenta(BOLD + "Welcome to Yuuri, Browser Cash Auto Mining" + RESET));
  console.log(chalk.green(BOLD + "Ready to hack the world?" + RESET));
  const now = new Date();
  console.log(chalk.yellow(BOLD + `Current time: ${now.toLocaleString("id-ID",{hour12:false})}` + RESET));
  console.log();
}

function setWindowTitle(){
  process.stdout.write('\x1b]2;Browser Cash Auto Mining by : 佐賀県産 （𝒀𝑼𝑼𝑹𝑰）\x1b\\');
}

function toLocalDate(ts){
  if(typeof ts === "number"){
    if(ts > 1e12) ts = ts/1000;
    return new Date(ts * 1000);
  }
  if(typeof ts === "string"){
    return new Date(ts);
  }
  return new Date();
}

function humanClock(dt){
  return `${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")} WIB`;
}

function humanDate(dt){
  const d = dt.getDate();
  const m = ID_MONTH[dt.getMonth()];
  const y = dt.getFullYear();
  return `${d} ${m} ${y}`;
}

function fmtHumanTs(ts){
  const dt = toLocalDate(ts);
  return `${humanDate(dt)} ${humanClock(dt)}`;
}

function fmtSleepHuman(s){
  s = Math.floor(s);
  if(s < 60) return `${s}s`;
  const m = Math.floor(s/60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

async function loadAccounts(){
  const data = await fs.readFile(ACCOUNTS_FILE, "utf8");
  let accounts;
  try {
    accounts = JSON.parse(data);
  } catch(e){
    throw new Error("accounts.json tidak valid JSON");
  }
  if(!Array.isArray(accounts)){
    accounts = [accounts];
  }
  for(const acc of accounts){
    if(!acc.label) acc.label = "browsercash";
    if(!(acc.email && acc.password)) throw new Error(`Akun '${acc.label}' butuh email+password`);
    if(!acc.install_id){
      const seed = `browsercash:${acc.label}:${acc.email.toLowerCase()}`;
      acc.install_id = uuidv5(seed, uuidv5.URL);
    }
  }
  return accounts;
}

function headers(access_token = null, is_json = true){
  const h = {"apikey": ANON_KEY};
  if(access_token) h["Authorization"] = `Bearer ${access_token}`;
  if(is_json) h["Content-Type"] = "application/json";
  return h;
}

async function refreshTokenCall(refresh_tok){
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  const resp = await axios.post(url, {refresh_token: refresh_tok}, {headers: headers(true), timeout: 30000});
  return resp.data;
}

async function passwordLogin(email, password){
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const body = {email, password, gotrue_meta_security:{}};
  const h = headers();
  h["Authorization"] = `Bearer ${ANON_KEY}`;
  const resp = await axios.post(url, body, {headers: h, timeout: 30000});
  return resp.data;
}

async function ensureAccessToken(state, acc){
  const now = Math.floor(Date.now()/1000);
  const at = state.access_token;
  const exp = state.expires_at;
  if(at && exp && (exp - now) > 60) return at;
  const rt = state.refresh_token_runtime;
  if(rt){
    try{
      const sess = await refreshTokenCall(rt);
      state.access_token = sess.access_token;
      if(sess.refresh_token) state.refresh_token_runtime = sess.refresh_token;
      if(sess.expires_in) state.expires_at = now + sess.expires_in;
      return state.access_token;
    }catch(e){
      // ignore refresh error
    }
  }
  const sess = await passwordLogin(acc.email, acc.password);
  state.access_token = sess.access_token;
  if(sess.refresh_token) state.refresh_token_runtime = sess.refresh_token;
  if(sess.expires_in) state.expires_at = now + sess.expires_in;
  return state.access_token;
}

async function getUserId(access_token){
  const resp = await axios.get(`${SUPABASE_URL}/auth/v1/user`, {headers: headers(access_token), timeout:30000});
  return resp.data.id || "";
}

async function rpc(access_token, fn, payload){
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const resp = await axios.post(url, payload, {headers: headers(access_token), timeout:30000});
  return resp.data;
}

async function heartbeat(access_token, install_id){
  const resp = await axios.post(FUNC_HEARTBEAT, {installId: install_id}, {headers: headers(access_token), timeout:30000});
  return resp.data;
}

function parseNextSleep(hb, fallback=60, cap=600){
  const now = Date.now()/1000;
  if(typeof hb.retryAfter === "number") return Math.max(10, Math.floor(hb.retryAfter));
  const nxt = hb.nextSyncTime;
  if(!nxt) return fallback;
  try{
    let delta;
    if(typeof nxt === "number"){
      let nxt_ts = nxt;
      if(nxt_ts > 1e12) nxt_ts = nxt_ts/1000;
      delta = Math.floor(nxt_ts - now);
    } else if(typeof nxt === "string") {
      delta = fallback;
    } else {
      delta = fallback;
    }
    delta += 1;
    return Math.min(cap, Math.max(10, delta));
  }catch(e){
    return fallback;
  }
}

function log(text, level="info"){
  const styles = {
    info: chalk.bold.yellow,
    ok: chalk.bold.green,
    err: chalk.bold.red,
  };
  const style = styles[level] || chalk.bold;
  console.log(style(text));
}

async function countdownSleep(label, totalSeconds, stopFlag){
  for(let remaining = totalSeconds; remaining > 0; remaining--) {
    if(stopFlag.flag) break;
    process.stdout.write(`\r${chalk.yellow.bold(`[${label}] sleep ${fmtSleepHuman(remaining)}`)}   `);
    await sleep(1000);
  }
  process.stdout.write("\n");
}

async function main(){
  setWindowTitle();
  displayBanner();

  let stop = {flag: false};
  process.on("SIGINT", () => {
    stop.flag = true;
    log("Shutting down...", "info");
  });

  let accounts;
  try{
    accounts = await loadAccounts();
  }catch(e){
    log(`Gagal baca accounts.json: ${e.message}`, "err");
    process.exit(1);
  }

  const STATES = {};
  for(const acc of accounts){
    STATES[acc.install_id] = {
      access_token: null,
      expires_at: null,
      refresh_token_runtime: null,
      user_id: null,
      printed_user_id: false,
      last_points: null,
    };
  }

  while(!stop.flag){
    const sleepCandidates = [];
    for(let idx = 0; idx < accounts.length; idx++){
      const acc = accounts[idx];
      const label = acc.label;
      const st = STATES[acc.install_id];
      try{
        const access = await ensureAccessToken(st, acc);
        if(!st.user_id){
          try{
            st.user_id = await getUserId(access);
          }catch(e){
            if(e.response && e.response.status === 401){
              await ensureAccessToken(st, acc);
              st.user_id = await getUserId(st.access_token);
            } else {
              throw e;
            }
          }
          if(!st.printed_user_id){
            log(`[${label}] user_id: ${st.user_id}`, "ok");
            st.printed_user_id = true;
          }
        }

        let points;
        try{
          points = await rpc(access, "get_user_points_balance", {p_user_id: st.user_id});
        }catch(e){
          if(e.response && e.response.status === 401){
            await ensureAccessToken(st, acc);
            points = await rpc(st.access_token, "get_user_points_balance", {p_user_id: st.user_id});
          } else {
            throw e;
          }
        }

        let daily;
        try{
          daily = await rpc(access, "get_user_earnings_last_24h", {p_user_id: st.user_id});
        }catch(e){
          if(e.response && e.response.status === 401){
            await ensureAccessToken(st, acc);
            daily = await rpc(st.access_token, "get_user_earnings_last_24h", {p_user_id: st.user_id});
          } else {
            throw e;
          }
        }

        let delta = null;
        if(typeof points === "number" && typeof st.last_points === "number"){
          delta = Math.floor(points - st.last_points);
        }
        st.last_points = points;

        let hb;
        try{
          hb = await heartbeat(access, acc.install_id);
        }catch(e){
          if(e.response && e.response.status === 401){
            await ensureAccessToken(st, acc);
            hb = await heartbeat(st.access_token, acc.install_id);
          } else {
            throw e;
          }
        }

        const ok = !!hb.success;
        const lvl = ok ? "ok" : "info";
        if(typeof delta === "number"){
          const sign = delta >= 0 ? "+" : "";
          log(`[${label}] points: ${points} (${sign}${delta})`, lvl);
        }else{
          log(`[${label}] points: ${points}`, lvl);
        }
        log(`[${label}] earnings 24h: ${daily}`, lvl);
        log(`[${label}] heartbeat: ${ok ? "OK" : "PENDING"}`, lvl);
        if(hb.earnRate !== undefined) log(`[${label}] earn rate: ${hb.earnRate}`, lvl);
        if(hb.lastSyncTime !== undefined) log(`[${label}] last sync: ${fmtHumanTs(hb.lastSyncTime)}`, "info");
        if(hb.nextSyncTime !== undefined) log(`[${label}] next sync: ${fmtHumanTs(hb.nextSyncTime)}`, "info");

        const sleepS = parseNextSleep(hb, 60, 600);
        sleepCandidates.push(sleepS);
        if(idx !== accounts.length - 1) console.log("");
      }catch(e){
        const status = e.response?.status || "?";
        const body = e.response?.data ? JSON.stringify(e.response.data).slice(0,300) : e.message || "";
        log(`[${label}] HTTP ${status}: ${body}`, "err");
        log(`[${label}] retry in 10s`, "info");
        await sleep(10000);
      }
    }
    if(sleepCandidates.length){
      const lastLabel = accounts[accounts.length - 1].label;
      const minSleep = Math.min(...sleepCandidates);
      await countdownSleep(lastLabel, minSleep, {flag: false});
    }
  }
}

if(process.argv[1] === new URL(import.meta.url).pathname){
  main();
}
