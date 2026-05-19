"""
╔══════════════════════════════════════════════════════════════════════════════╗
║              VINZ PREDICT — MT5 Python Bridge  v2.0                        ║
║  Jalankan script ini di PC Windows yang sudah terinstall MetaTrader 5.     ║
║  Script ini akan LOGIN OTOMATIS ke akun MT5 Anda tanpa perlu buka MT5.    ║
╚══════════════════════════════════════════════════════════════════════════════╝

CARA PAKAI:
1. Install Python 3.8+ di Windows: https://python.org  (centang "Add to PATH")
2. Buka Command Prompt, jalankan:
       pip install MetaTrader5 requests
3. Isi 4 variabel wajib di bagian KONFIGURASI di bawah:
       - MT5_SERVER   : nama server broker Anda
       - MT5_LOGIN    : nomor akun MT5
       - MT5_PASSWORD : password akun MT5
       - REPLIT_URL   : URL app VINZ PREDICT Anda di Replit
4. Jalankan:
       python mt5_bridge.py
5. Buka app VINZ PREDICT → halaman Forex Pro → status akan "Terhubung ✅"

CATATAN:
- MetaTrader 5 TIDAK perlu terbuka sebelumnya — script akan login sendiri.
- Script akan auto-reconnect jika koneksi terputus.
- Biarkan jendela Command Prompt tetap terbuka selama ingin trading.
- Untuk akun Demo: gunakan kredensial akun demo dari broker Anda.
"""

import MetaTrader5 as mt5
import requests
import time
import sys
import json
from datetime import datetime

# ══════════════════════════════════════════════════════════════════════════════
# ⚙️  KONFIGURASI WAJIB — Isi 4 variabel ini sesuai akun MT5 Anda
# ══════════════════════════════════════════════════════════════════════════════

MT5_SERVER   = "GANTI-NAMA-SERVER-BROKER"
# Contoh: "ICMarketsGlobal-Demo01"  atau  "Exness-MT5Trial"  atau  "XM-MT5"
# Cara cek: Buka MT5 → Tools → Options → Server

MT5_LOGIN    = 0
# Contoh: 12345678
# Nomor akun MT5 Anda (bukan email). Bisa dilihat di pojok kiri atas MT5.

MT5_PASSWORD = "GANTI-PASSWORD-MT5-ANDA"
# Password untuk login ke akun MT5

REPLIT_URL   = "https://GANTI-DENGAN-URL-REPLIT-ANDA.repl.co"
# Contoh: "https://vinzpredict.namaanda.repl.co"
# URL ini bisa dilihat di tab Setup pada halaman Forex Pro di app Anda.

# ══════════════════════════════════════════════════════════════════════════════
# ⚙️  KONFIGURASI LANJUTAN — Biasanya tidak perlu diubah
# ══════════════════════════════════════════════════════════════════════════════

SECRET = "vinzpredict2024"
# Harus sama dengan MT5_BRIDGE_SECRET di Replit Secrets.
# Jika tidak diset di Replit, biarkan default ini.

MT5_PATH = ""
# Kosongkan untuk deteksi otomatis.
# Isi jika MT5 Anda di lokasi kustom, contoh:
# r"C:\Program Files\MetaTrader 5\terminal64.exe"

PUSH_INTERVAL_SEC      = 3    # Seberapa sering kirim data ke server (detik)
ORDER_POLL_INTERVAL_SEC = 1   # Seberapa sering cek order baru (detik)
RECONNECT_DELAY_SEC    = 10   # Tunggu sebelum coba reconnect (detik)
MAX_RECONNECT_TRIES    = 999  # Maks percobaan reconnect (999 = hampir selamanya)

SYMBOLS = [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
    "USDCAD", "NZDUSD", "EURJPY", "GBPJPY",
    "XAUUSD", "XAGUSD", "USOIL",
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


def validate_config() -> bool:
    errors = []
    if "GANTI" in MT5_SERVER or not MT5_SERVER:
        errors.append("MT5_SERVER belum diisi  (contoh: ICMarketsGlobal-Demo01)")
    if MT5_LOGIN == 0:
        errors.append("MT5_LOGIN belum diisi   (contoh: 12345678)")
    if "GANTI" in MT5_PASSWORD or not MT5_PASSWORD:
        errors.append("MT5_PASSWORD belum diisi")
    if "GANTI" in REPLIT_URL or not REPLIT_URL.startswith("http"):
        errors.append("REPLIT_URL belum diisi  (contoh: https://vinzpredict.anda.repl.co)")

    if errors:
        print()
        print("❌  KONFIGURASI TIDAK LENGKAP!")
        print("    Edit bagian KONFIGURASI WAJIB di atas script, lalu jalankan ulang.")
        print()
        for e in errors:
            print(f"    ✗  {e}")
        print()
        return False
    return True


def init_mt5(attempt: int = 1) -> bool:
    global _initialized
    log("INFO", f"Menghubungkan ke MetaTrader 5...  (percobaan #{attempt})")

    kwargs: dict = {}
    if MT5_PATH:
        kwargs["path"] = MT5_PATH

    if not mt5.initialize(**kwargs):
        log("ERR", f"Gagal inisialisasi MT5: {mt5.last_error()}")
        log("WARN", "Pastikan MetaTrader 5 sudah terinstall di PC ini.")
        return False

    log("INFO", f"Login ke akun #{MT5_LOGIN} di server {MT5_SERVER} ...")
    authorized = mt5.login(
        login=int(MT5_LOGIN),
        password=str(MT5_PASSWORD),
        server=str(MT5_SERVER),
    )

    if not authorized:
        err = mt5.last_error()
        mt5.shutdown()
        log("ERR", f"Login gagal: {err}")
        print()
        print("  Kemungkinan penyebab:")
        print("  • Nomor akun / password salah")
        print("  • Nama server salah — cek kembali di MT5 → Tools → Options → Server")
        print("  • Akun sudah expired (akun demo biasanya 30 hari)")
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
    print(f"  ║  Nama    : {info.name:<31} ║")
    print(f"  ║  Server  : {info.server:<31} ║")
    print(f"  ║  Broker  : {info.company[:31]:<31} ║")
    print(f"  ║  Balance : {info.currency} {info.balance:>25,.2f}  ║")
    print(f"  ║  Equity  : {info.currency} {info.equity:>25,.2f}  ║")
    print(f"  ║  Margin  : {info.currency} {info.margin:>25,.2f}  ║")
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
    for sym in SYMBOLS:
        try:
            tick = mt5.symbol_info_tick(sym)
            if tick:
                prices[sym] = {
                    "bid":  tick.bid,
                    "ask":  tick.ask,
                    "time": int(tick.time) * 1000,
                }
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
            log("ERR", "SECRET tidak cocok! Periksa nilai SECRET di script dan MT5_BRIDGE_SECRET di Replit.")
            return False
        else:
            log("WARN", f"Server response: {r.status_code} — {r.text[:120]}")
            return False
    except requests.exceptions.ConnectionError:
        log("WARN", f"Tidak bisa terhubung ke server. Pastikan URL benar dan app Replit sedang berjalan.")
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

    # ── Tutup posisi (comment: "CLOSE:ticket") ──────────────────────────────
    if symbol == "CLOSE" or (isinstance(comment, str) and comment.startswith("CLOSE:")):
        ticket_str = comment.replace("CLOSE:", "")
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
            "action":        mt5.TRADE_ACTION_DEAL,
            "symbol":        p.symbol,
            "volume":        p.volume,
            "type":          close_type,
            "position":      ticket,
            "price":         price,
            "deviation":     20,
            "magic":         20240101,
            "comment":       "VINZ-CLOSE",
            "type_time":     mt5.ORDER_TIME_GTC,
            "type_filling":  mt5.ORDER_FILLING_IOC,
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

    # ── Buka posisi baru ─────────────────────────────────────────────────────
    info = mt5.symbol_info(symbol)
    if info is None:
        report_result(order_id, False, error=f"Symbol '{symbol}' tidak ditemukan di MT5")
        return

    if not info.visible:
        mt5.symbol_select(symbol, True)
        time.sleep(0.2)

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        report_result(order_id, False, error=f"Tidak bisa ambil harga {symbol}")
        return

    mt5_type = mt5.ORDER_TYPE_BUY if order_type.lower() == "buy" else mt5.ORDER_TYPE_SELL
    price    = tick.ask if order_type.lower() == "buy" else tick.bid

    # Validasi volume minimum
    min_vol = info.volume_min
    step    = info.volume_step
    volume  = max(min_vol, round(round(volume / step) * step, 8))

    request = {
        "action":        mt5.TRADE_ACTION_DEAL,
        "symbol":        symbol,
        "volume":        volume,
        "type":          mt5_type,
        "price":         price,
        "sl":            sl,
        "tp":            tp,
        "deviation":     20,
        "magic":         20240101,
        "comment":       str(comment)[:31],
        "type_time":     mt5.ORDER_TIME_GTC,
        "type_filling":  mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request)
    if result.retcode == mt5.TRADE_RETCODE_DONE:
        log("OK", f"{order_type.upper()} {volume} {symbol} @ {price:.5f} — Ticket #{result.order}")
        report_result(order_id, True, ticket=result.order)
    else:
        # Coba filling alternative jika IOC ditolak
        if result.retcode in (mt5.TRADE_RETCODE_INVALID_FILL,):
            request["type_filling"] = mt5.ORDER_FILLING_FOK
            result = mt5.order_send(request)
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            log("OK", f"{order_type.upper()} {volume} {symbol} @ {price:.5f} — Ticket #{result.order}")
            report_result(order_id, True, ticket=result.order)
        else:
            msg = f"Order gagal: retcode={result.retcode} ({result.comment})"
            log("ERR", msg)
            report_result(order_id, False, error=msg)


def poll_orders() -> None:
    try:
        r = requests.get(
            PENDING_ORDERS_URL,
            params={"secret": SECRET},
            timeout=6,
        )
        if r.status_code == 200:
            orders = r.json()
            for order in orders:
                log("INFO", f"📥 Order masuk: {order.get('type','?').upper()} {order.get('volume','?')} {order.get('symbol','?')}")
                execute_order(order)
        elif r.status_code == 401:
            log("ERR", "Polling ditolak — SECRET tidak cocok.")
    except Exception:
        pass


def run_bridge() -> None:
    global last_push, last_order_poll

    push_ok_count   = 0
    push_fail_count = 0
    reconnect_tries = 0

    print(f"  🌐  Mengirim ke  : {REPLIT_URL}")
    print(f"  🔄  Interval push : {PUSH_INTERVAL_SEC} detik")
    print(f"  📋  Simbol       : {', '.join(SYMBOLS[:6])} ...")
    print()
    print("  ✅  Bridge aktif! Tekan Ctrl+C untuk berhenti.\n")

    try:
        while True:
            now = time.time()

            # Reconnect jika terputus
            if not _initialized:
                reconnect_tries += 1
                if reconnect_tries > MAX_RECONNECT_TRIES:
                    log("ERR", f"Melebihi batas reconnect ({MAX_RECONNECT_TRIES}x). Berhenti.")
                    break
                log("INFO", f"Reconnect ke MT5... ({reconnect_tries}x)")
                if init_mt5(reconnect_tries):
                    push_fail_count = 0
                else:
                    log("WARN", f"Reconnect gagal. Coba lagi dalam {RECONNECT_DELAY_SEC} detik...")
                    time.sleep(RECONNECT_DELAY_SEC)
                    continue

            # Push data ke server
            if now - last_push >= PUSH_INTERVAL_SEC:
                ok = push_data()
                last_push = now
                if ok:
                    push_ok_count  += 1
                    push_fail_count = 0
                    if push_ok_count == 1 or push_ok_count % 20 == 0:
                        acc = get_account_data()
                        if acc:
                            pos_count = len(get_positions())
                            log("DATA", (
                                f"Push #{push_ok_count} OK | "
                                f"Balance: {acc['currency']} {acc['balance']:,.2f} | "
                                f"Equity: {acc['currency']} {acc['equity']:,.2f} | "
                                f"Posisi: {pos_count}"
                            ))
                else:
                    push_fail_count += 1
                    if push_fail_count == 5:
                        log("WARN", "5 kali gagal push berturut-turut. Cek koneksi internet dan URL Replit.")

            # Poll pending orders dari server
            if now - last_order_poll >= ORDER_POLL_INTERVAL_SEC:
                poll_orders()
                last_order_poll = now

            time.sleep(0.3)

    except KeyboardInterrupt:
        print()
        log("INFO", "Bridge dihentikan oleh pengguna (Ctrl+C).")
    finally:
        mt5.shutdown()
        log("INFO", "Koneksi MT5 ditutup. Sampai jumpa! 👋")


def main() -> None:
    print()
    print("=" * 60)
    print("   VINZ PREDICT — MT5 Python Bridge  v2.0")
    print("=" * 60)
    print()

    if not validate_config():
        input("Tekan Enter untuk keluar...")
        sys.exit(1)

    if not init_mt5():
        print()
        input("Tekan Enter untuk keluar...")
        sys.exit(1)

    run_bridge()


if __name__ == "__main__":
    main()
