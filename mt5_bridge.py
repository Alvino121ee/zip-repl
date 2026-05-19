"""
╔══════════════════════════════════════════════════════════════════════════════╗
║              VINZ PREDICT — MT5 Python Bridge  v2.0                        ║
║  Script ini SUDAH DIKONFIGURASI — tinggal download dan jalankan!           ║
╚══════════════════════════════════════════════════════════════════════════════╝

CARA PAKAI (cukup 3 langkah):
1. Install Python 3.8+ di Windows: https://python.org
   → Saat install, CENTANG "Add Python to PATH"

2. Buka Command Prompt, ketik:
       pip install MetaTrader5 requests

3. Jalankan script ini:
       python mt5_bridge.py

Script akan login otomatis ke MT5 dan mengirim data ke VINZ PREDICT.
Biarkan jendela Command Prompt tetap terbuka selama trading.
"""

import MetaTrader5 as mt5
import requests
import threading
import time
import sys
from datetime import datetime

# ══════════════════════════════════════════════════════════════════════════════
# ✅  KONFIGURASI — Sudah diisi, tidak perlu diubah
# ══════════════════════════════════════════════════════════════════════════════

MT5_SERVER   = "RoboForex-Pro"
MT5_LOGIN    = 37347868
MT5_PASSWORD = "Alvino121#"
REPLIT_URL   = "https://24b9a11f-c52a-4f12-b81e-540bab806882-00-1zvuinsw1zefi.sisko.replit.dev"
SECRET       = "vinzpredict2024"

# ══════════════════════════════════════════════════════════════════════════════
# ⚙️  Konfigurasi Lanjutan — Biasanya tidak perlu diubah
# ══════════════════════════════════════════════════════════════════════════════

MT5_PATH = ""
# Kosongkan = deteksi otomatis. Isi jika MT5 di lokasi kustom, contoh:
# r"C:\Program Files\MetaTrader 5\terminal64.exe"

PUSH_INTERVAL_SEC       = 3     # Seberapa sering kirim data ke server (detik)
ORDER_POLL_INTERVAL_SEC = 1     # Seberapa sering cek order baru (detik)
RECONNECT_DELAY_SEC     = 10    # Tunggu sebelum coba reconnect (detik)
MAX_RECONNECT_TRIES     = 999   # Maks percobaan reconnect

SYMBOLS = [
    "EURUSDm", "GBPUSDm", "USDJPYm", "USDCHFm", "AUDUSDm",
    "USDCADm", "NZDUSDm", "EURJPYm", "GBPJPYm",
    "XAUUSDm", "XAGUSDm",
    # Versi tanpa suffix 'm' sebagai fallback
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
    "USDCAD", "NZDUSD", "EURJPY", "GBPJPY", "XAUUSD",
]

# ══════════════════════════════════════════════════════════════════════════════
# 🔧  Script Utama — Tidak perlu diedit
# ══════════════════════════════════════════════════════════════════════════════

PUSH_URL           = f"{REPLIT_URL.rstrip('/')}/api/mt5-bridge/push"
PENDING_ORDERS_URL = f"{REPLIT_URL.rstrip('/')}/api/mt5-bridge/orders/pending"
ORDER_RESULT_URL   = f"{REPLIT_URL.rstrip('/')}/api/mt5-bridge/orders/result"

last_push       = 0.0
last_order_poll = 0.0
_initialized    = False


def log(level: str, msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    icons = {"INFO": "ℹ️ ", "OK": "✅", "WARN": "⚠️ ", "ERR": "❌", "DATA": "📡"}
    icon = icons.get(level, "  ")
    print(f"[{ts}] {icon}  {msg}")


def _spinner(stop_event: "threading.Event", label: str) -> None:
    frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    i = 0
    start = time.time()
    while not stop_event.is_set():
        elapsed = int(time.time() - start)
        print(f"\r  {frames[i % len(frames)]}  {label}  ({elapsed}s)   ", end="", flush=True)
        i += 1
        time.sleep(0.1)
    print("\r" + " " * 60 + "\r", end="", flush=True)


def init_mt5(attempt: int = 1) -> bool:
    global _initialized
    if attempt == 1:
        print(f"  ⏳  MT5 pertama kali start butuh 20–60 detik. Mohon tunggu...")
        print()

    log("INFO", f"Menghubungkan ke MetaTrader 5... (percobaan #{attempt})")

    # ── Gabungkan initialize + login dalam 1 panggilan (lebih cepat) ─────────
    stop_evt = threading.Event()
    spinner_thread = threading.Thread(
        target=_spinner,
        args=(stop_evt, f"Memulai MT5 & login ke {MT5_SERVER}..."),
        daemon=True,
    )
    spinner_thread.start()

    kwargs: dict = {
        "login":    int(MT5_LOGIN),
        "password": str(MT5_PASSWORD),
        "server":   str(MT5_SERVER),
    }
    if MT5_PATH:
        kwargs["path"] = MT5_PATH

    ok = mt5.initialize(**kwargs)
    stop_evt.set()
    spinner_thread.join()

    if not ok:
        err = mt5.last_error()
        log("ERR", f"Gagal login MT5: {err}")
        print()
        print("  Kemungkinan penyebab:")
        print("  • Nomor akun / password salah")
        print("  • Nama server salah — cek di MT5 → Tools → Options → Server")
        print("  • Akun sudah expired (akun demo biasanya 30 hari)")
        print("  • MetaTrader 5 belum terinstall di PC ini")
        print("  • Tidak ada koneksi internet")
        print()
        return False

    info = mt5.account_info()
    if info is None:
        mt5.shutdown()
        log("ERR", "Login berhasil tapi tidak bisa baca info akun.")
        return False

    _initialized = True
    print()
    print("  ╔══════════════════════════════════════════╗")
    print(f"  ║  ✅  MT5 LOGIN BERHASIL                  ║")
    print("  ╠══════════════════════════════════════════╣")
    print(f"  ║  Akun    : #{info.login:<30} ║")
    print(f"  ║  Nama    : {str(info.name)[:31]:<31} ║")
    print(f"  ║  Server  : {str(info.server)[:31]:<31} ║")
    print(f"  ║  Broker  : {str(info.company)[:31]:<31} ║")
    print(f"  ║  Balance : {info.currency} {info.balance:>25,.2f}  ║")
    print(f"  ║  Equity  : {info.currency} {info.equity:>25,.2f}  ║")
    print(f"  ║  Leverage: 1:{info.leverage:<29} ║")
    print(f"  ║  Tipe    : {'REAL' if info.trade_mode == 0 else 'DEMO':<31} ║")
    print("  ╚══════════════════════════════════════════╝")
    print()
    return True


def ensure_connected() -> bool:
    global _initialized
    if not _initialized:
        return False
    info = mt5.account_info()
    if info is None:
        log("WARN", "Koneksi MT5 terputus. Mencoba reconnect...")
        mt5.shutdown()
        _initialized = False
        return False
    return True


def get_account_data() -> dict | None:
    info = mt5.account_info()
    if info is None:
        return None
    return {
        "login":      str(info.login),
        "server":     info.server,
        "broker":     info.company,
        "name":       info.name,
        "balance":    info.balance,
        "equity":     info.equity,
        "margin":     info.margin,
        "freeMargin": info.margin_free,
        "profit":     info.profit,
        "currency":   info.currency,
        "leverage":   info.leverage,
    }


def get_positions() -> list:
    positions = mt5.positions_get()
    if positions is None:
        return []
    result = []
    for p in positions:
        result.append({
            "ticket":       p.ticket,
            "symbol":       p.symbol,
            "type":         "buy" if p.type == mt5.ORDER_TYPE_BUY else "sell",
            "volume":       p.volume,
            "priceOpen":    p.price_open,
            "priceCurrent": p.price_current,
            "sl":           p.sl,
            "tp":           p.tp,
            "profit":       p.profit,
            "swap":         p.swap,
            "comment":      p.comment,
            "openTime":     int(p.time) * 1000,
        })
    return result


def get_prices() -> dict:
    prices = {}
    seen = set()
    for sym in SYMBOLS:
        base = sym.replace("m", "") if sym.endswith("m") else sym
        if base in seen:
            continue
        try:
            tick = mt5.symbol_info_tick(sym)
            if tick and tick.bid > 0:
                prices[base] = {
                    "bid":  tick.bid,
                    "ask":  tick.ask,
                    "time": int(tick.time) * 1000,
                }
                seen.add(base)
        except Exception:
            pass
    return prices


def push_data() -> bool:
    if not ensure_connected():
        return False

    account = get_account_data()
    if account is None:
        log("WARN", "Tidak bisa baca data akun MT5.")
        return False

    payload = {
        "secret":    SECRET,
        "account":   account,
        "positions": get_positions(),
        "prices":    get_prices(),
    }

    try:
        r = requests.post(PUSH_URL, json=payload, timeout=10)
        if r.status_code == 200:
            return True
        elif r.status_code == 401:
            log("ERR", "SECRET tidak cocok! Cek nilai SECRET di script.")
            return False
        else:
            log("WARN", f"Server response: {r.status_code} — {r.text[:120]}")
            return False
    except requests.exceptions.ConnectionError:
        log("WARN", "Tidak bisa terhubung ke server. Cek koneksi internet.")
        return False
    except requests.exceptions.Timeout:
        log("WARN", "Timeout saat kirim data ke server.")
        return False
    except Exception as e:
        log("WARN", f"Error push: {e}")
        return False


def report_result(order_id: str, ok: bool, ticket: int | None = None, error: str | None = None) -> None:
    payload: dict = {"secret": SECRET, "id": order_id, "ok": ok}
    if ticket is not None:
        payload["ticket"] = ticket
    if error is not None:
        payload["error"] = error
    try:
        requests.post(ORDER_RESULT_URL, json=payload, timeout=8)
    except Exception as e:
        log("WARN", f"Gagal lapor hasil order: {e}")


def execute_order(order: dict) -> None:
    order_id   = order["id"]
    symbol     = order.get("symbol", "")
    order_type = order.get("type", "buy")
    volume     = float(order.get("volume", 0.01))
    sl         = float(order.get("sl") or 0.0)
    tp         = float(order.get("tp") or 0.0)
    comment    = order.get("comment", "VINZ-PREDICT")

    log("INFO", f"Eksekusi order: {order_type.upper()} {volume} {symbol}")

    # ── Tutup posisi ──────────────────────────────────────────────────────────
    if symbol == "CLOSE" or (isinstance(comment, str) and comment.startswith("CLOSE:")):
        ticket_str = str(comment).replace("CLOSE:", "")
        try:
            ticket = int(ticket_str)
        except ValueError:
            report_result(order_id, False, error=f"Ticket tidak valid: {ticket_str}")
            return

        pos = mt5.positions_get(ticket=ticket)
        if not pos:
            report_result(order_id, False, error=f"Posisi #{ticket} tidak ditemukan")
            return

        p = pos[0]
        close_type = mt5.ORDER_TYPE_SELL if p.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(p.symbol)
        if tick is None:
            report_result(order_id, False, error=f"Tidak bisa ambil harga {p.symbol}")
            return
        price = tick.bid if p.type == mt5.ORDER_TYPE_BUY else tick.ask

        request = {
            "action": mt5.TRADE_ACTION_DEAL, "symbol": p.symbol,
            "volume": p.volume, "type": close_type, "position": ticket,
            "price": price, "deviation": 20, "magic": 20240101,
            "comment": "VINZ-CLOSE", "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            log("OK", f"Posisi #{ticket} berhasil ditutup — Order #{result.order}")
            report_result(order_id, True, ticket=result.order)
        else:
            msg = f"Gagal tutup: retcode={result.retcode}, {result.comment}"
            log("ERR", msg)
            report_result(order_id, False, error=msg)
        return

    # ── Buka posisi baru ──────────────────────────────────────────────────────
    # Coba dengan suffix 'm' dulu (beberapa broker pakai suffix ini, misal RoboForex: EURUSDm)
    sym_to_try = [symbol, symbol + "m"] if not symbol.endswith("m") else [symbol, symbol[:-1]]
    info = None
    final_symbol = symbol
    for s in sym_to_try:
        info = mt5.symbol_info(s)
        if info is not None:
            final_symbol = s
            break

    if info is None:
        report_result(order_id, False, error=f"Symbol '{symbol}' tidak ditemukan di MT5")
        return

    if not info.visible:
        mt5.symbol_select(final_symbol, True)
        time.sleep(0.2)

    tick = mt5.symbol_info_tick(final_symbol)
    if tick is None:
        report_result(order_id, False, error=f"Tidak bisa ambil harga {final_symbol}")
        return

    mt5_type = mt5.ORDER_TYPE_BUY if order_type.lower() == "buy" else mt5.ORDER_TYPE_SELL
    price    = tick.ask if order_type.lower() == "buy" else tick.bid

    min_vol  = info.volume_min
    step     = info.volume_step
    volume   = max(min_vol, round(round(volume / step) * step, 8))

    for filling in [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]:
        request = {
            "action": mt5.TRADE_ACTION_DEAL, "symbol": final_symbol,
            "volume": volume, "type": mt5_type, "price": price,
            "sl": sl, "tp": tp, "deviation": 20, "magic": 20240101,
            "comment": str(comment)[:31], "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling,
        }
        result = mt5.order_send(request)
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            log("OK", f"{order_type.upper()} {volume} {final_symbol} @ {price:.5f} — Ticket #{result.order}")
            report_result(order_id, True, ticket=result.order)
            return
        elif result.retcode not in (mt5.TRADE_RETCODE_INVALID_FILL,):
            break

    msg = f"Order gagal: retcode={result.retcode} ({result.comment})"
    log("ERR", msg)
    report_result(order_id, False, error=msg)


def poll_orders() -> None:
    try:
        r = requests.get(PENDING_ORDERS_URL, params={"secret": SECRET}, timeout=6)
        if r.status_code == 200:
            for order in r.json():
                log("INFO", f"📥 Order masuk: {order.get('type','?').upper()} {order.get('volume','?')} {order.get('symbol','?')}")
                execute_order(order)
    except Exception:
        pass


def run_bridge() -> None:
    global last_push, last_order_poll
    push_ok_count   = 0
    push_fail_count = 0
    reconnect_tries = 0

    print(f"  🌐  Server  : {REPLIT_URL}")
    print(f"  🔄  Interval: {PUSH_INTERVAL_SEC} detik")
    print()
    print("  ✅  Bridge aktif! Tekan Ctrl+C untuk berhenti.\n")

    try:
        while True:
            now = time.time()

            if not _initialized:
                reconnect_tries += 1
                if reconnect_tries > MAX_RECONNECT_TRIES:
                    log("ERR", f"Melebihi batas reconnect. Berhenti.")
                    break
                log("INFO", f"Reconnect ke MT5... ({reconnect_tries}x)")
                if init_mt5(reconnect_tries):
                    push_fail_count = 0
                else:
                    log("WARN", f"Reconnect gagal. Coba lagi dalam {RECONNECT_DELAY_SEC} detik...")
                    time.sleep(RECONNECT_DELAY_SEC)
                    continue

            if now - last_push >= PUSH_INTERVAL_SEC:
                ok = push_data()
                last_push = now
                if ok:
                    push_ok_count  += 1
                    push_fail_count = 0
                    if push_ok_count == 1 or push_ok_count % 20 == 0:
                        acc = get_account_data()
                        if acc:
                            log("DATA", (
                                f"Push #{push_ok_count} OK | "
                                f"Balance: {acc['currency']} {acc['balance']:,.2f} | "
                                f"Equity: {acc['currency']} {acc['equity']:,.2f} | "
                                f"Posisi: {len(get_positions())}"
                            ))
                else:
                    push_fail_count += 1
                    if push_fail_count == 5:
                        log("WARN", "5 kali gagal push. Cek koneksi internet dan pastikan app Replit berjalan.")

            if now - last_order_poll >= ORDER_POLL_INTERVAL_SEC:
                poll_orders()
                last_order_poll = now

            time.sleep(0.3)

    except KeyboardInterrupt:
        print()
        log("INFO", "Bridge dihentikan (Ctrl+C).")
    finally:
        mt5.shutdown()
        log("INFO", "Koneksi MT5 ditutup. Sampai jumpa! 👋")


def main() -> None:
    print()
    print("=" * 58)
    print("   VINZ PREDICT — MT5 Python Bridge  v2.0")
    print(f"   Akun  : {MT5_SERVER} | #{MT5_LOGIN}")
    print("=" * 58)
    print()

    if not init_mt5():
        print()
        input("Tekan Enter untuk keluar...")
        sys.exit(1)

    run_bridge()


if __name__ == "__main__":
    main()
