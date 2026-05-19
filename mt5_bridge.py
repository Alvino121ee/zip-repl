"""
╔══════════════════════════════════════════════════════════════╗
║          VINZ PREDICT — MT5 Python Bridge                    ║
║  Jalankan script ini di PC Windows dengan MT5 sudah login.   ║
║  Gratis — pakai library resmi MetaTrader5 dari MetaQuotes.   ║
╚══════════════════════════════════════════════════════════════╝

CARA PAKAI:
1. Install Python 3.8+ di Windows (python.org)
2. Buka Command Prompt, jalankan:
       pip install MetaTrader5 requests
3. Edit 2 variabel di bawah (REPLIT_URL dan SECRET)
4. Pastikan MT5 sudah terbuka dan login di akun Anda
5. Jalankan:  python mt5_bridge.py
6. Buka app VINZ PREDICT — status akan berubah "Terhubung"

PASANG MT5:
- Download MetaTrader 5 gratis dari broker Anda
  (IC Markets, XM, Exness, Tickmill, FBS, dll)
- Login ke akun demo atau real di MT5
- Pastikan MT5 tetap berjalan selama script ini aktif
"""

import MetaTrader5 as mt5
import requests
import time
import sys

# ══════════════════════════════════════════════════════════════
# ⚙️  KONFIGURASI — Edit 2 baris ini sesuai akun Anda
# ══════════════════════════════════════════════════════════════

REPLIT_URL = "https://GANTI-DENGAN-URL-REPLIT-ANDA.repl.co"
# Contoh: "https://vinzpredict.username.repl.co"
# Atau gunakan domain custom jika sudah dipublish

SECRET = "vinzpredict2024"
# Harus sama dengan MT5_BRIDGE_SECRET di Replit Secrets
# (Jika tidak diset di Replit, biarkan default ini)

# ══════════════════════════════════════════════════════════════
# ⚙️  Konfigurasi Lanjutan (opsional)
# ══════════════════════════════════════════════════════════════

PUSH_INTERVAL_SEC = 3       # Seberapa sering kirim data (detik)
ORDER_POLL_INTERVAL_SEC = 1 # Seberapa sering cek order baru (detik)

SYMBOLS = [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
    "USDCAD", "NZDUSD", "EURJPY", "GBPJPY",
    "XAUUSD", "XAGUSD", "USOIL",
]

# ══════════════════════════════════════════════════════════════
# 🔧  Script Utama — Tidak perlu diedit
# ══════════════════════════════════════════════════════════════

PUSH_URL          = f"{REPLIT_URL.rstrip('/')}/api/mt5-bridge/push"
PENDING_ORDERS_URL = f"{REPLIT_URL.rstrip('/')}/api/mt5-bridge/orders/pending"
ORDER_RESULT_URL  = f"{REPLIT_URL.rstrip('/')}/api/mt5-bridge/orders/result"

last_push = 0
last_order_poll = 0


def init_mt5():
    """Inisialisasi koneksi ke terminal MT5."""
    print("🔌 Menghubungkan ke MetaTrader 5...")
    if not mt5.initialize():
        print(f"❌ Gagal inisialisasi MT5: {mt5.last_error()}")
        print("   Pastikan MetaTrader 5 sudah terbuka dan login.")
        return False
    info = mt5.account_info()
    if info is None:
        print("❌ Tidak bisa membaca info akun. Pastikan MT5 sudah login.")
        mt5.shutdown()
        return False
    print(f"✅ MT5 Terhubung!")
    print(f"   Akun    : #{info.login}")
    print(f"   Server  : {info.server}")
    print(f"   Balance : {info.currency} {info.balance:,.2f}")
    print(f"   Leverage: 1:{info.leverage}")
    return True


def get_account_data():
    """Ambil info akun dari MT5."""
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


def get_positions():
    """Ambil semua posisi terbuka dari MT5."""
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


def get_prices():
    """Ambil harga bid/ask untuk semua pair."""
    prices = {}
    for sym in SYMBOLS:
        tick = mt5.symbol_info_tick(sym)
        if tick:
            prices[sym] = {
                "bid":  tick.bid,
                "ask":  tick.ask,
                "time": int(tick.time) * 1000,
            }
    return prices


def push_data():
    """Kirim data akun, posisi, dan harga ke Replit."""
    account = get_account_data()
    if account is None:
        print("⚠️  Tidak bisa baca akun MT5 — apakah MT5 masih terbuka?")
        return False

    payload = {
        "secret":    SECRET,
        "account":   account,
        "positions": get_positions(),
        "prices":    get_prices(),
    }

    try:
        r = requests.post(PUSH_URL, json=payload, timeout=8)
        if r.status_code == 200:
            return True
        elif r.status_code == 401:
            print("❌ SECRET tidak cocok! Periksa nilai SECRET di script dan MT5_BRIDGE_SECRET di Replit.")
            return False
        else:
            print(f"⚠️  Server response: {r.status_code} — {r.text[:100]}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"⚠️  Tidak bisa terhubung ke {REPLIT_URL}")
        print("   Pastikan URL sudah benar dan app Replit sedang berjalan.")
        return False
    except Exception as e:
        print(f"⚠️  Error push: {e}")
        return False


def execute_order(order):
    """Eksekusi order yang diterima dari Replit."""
    order_id   = order["id"]
    symbol     = order.get("symbol", "")
    order_type = order.get("type", "buy")
    volume     = order.get("volume", 0.01)
    sl         = order.get("sl") or 0.0
    tp         = order.get("tp") or 0.0
    comment    = order.get("comment", "VINZ-PREDICT")

    # Tutup posisi (kode CLOSE:ticket)
    if symbol == "CLOSE" or comment.startswith("CLOSE:"):
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
        price = mt5.symbol_info_tick(p.symbol).bid if p.type == mt5.ORDER_TYPE_BUY else mt5.symbol_info_tick(p.symbol).ask
        deviation = 20
        request = {
            "action":   mt5.TRADE_ACTION_DEAL,
            "symbol":   p.symbol,
            "volume":   p.volume,
            "type":     close_type,
            "position": ticket,
            "price":    price,
            "deviation": deviation,
            "magic":    20240101,
            "comment":  "VINZ-CLOSE",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            print(f"✅ Posisi #{ticket} berhasil ditutup")
            report_result(order_id, True, ticket=result.order)
        else:
            msg = f"Gagal tutup: retcode={result.retcode}, {result.comment}"
            print(f"❌ {msg}")
            report_result(order_id, False, error=msg)
        return

    # Buka posisi baru
    info = mt5.symbol_info(symbol)
    if info is None:
        report_result(order_id, False, error=f"Symbol {symbol} tidak ditemukan di MT5")
        return

    if not info.visible:
        mt5.symbol_select(symbol, True)

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        report_result(order_id, False, error=f"Tidak bisa dapat harga {symbol}")
        return

    mt5_type = mt5.ORDER_TYPE_BUY if order_type == "buy" else mt5.ORDER_TYPE_SELL
    price    = tick.ask if order_type == "buy" else tick.bid

    request = {
        "action":   mt5.TRADE_ACTION_DEAL,
        "symbol":   symbol,
        "volume":   float(volume),
        "type":     mt5_type,
        "price":    price,
        "sl":       float(sl),
        "tp":       float(tp),
        "deviation": 20,
        "magic":    20240101,
        "comment":  comment[:31],
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request)
    if result.retcode == mt5.TRADE_RETCODE_DONE:
        print(f"✅ Order berhasil: {order_type.upper()} {volume} {symbol} @ {price} | Ticket #{result.order}")
        report_result(order_id, True, ticket=result.order)
    else:
        msg = f"Order gagal: retcode={result.retcode}, {result.comment}"
        print(f"❌ {msg}")
        report_result(order_id, False, error=msg)


def report_result(order_id, ok, ticket=None, error=None):
    """Kirim hasil eksekusi order ke Replit."""
    payload = {
        "secret": SECRET,
        "id":     order_id,
        "ok":     ok,
    }
    if ticket is not None:
        payload["ticket"] = ticket
    if error is not None:
        payload["error"] = error
    try:
        requests.post(ORDER_RESULT_URL, json=payload, timeout=5)
    except Exception as e:
        print(f"⚠️  Gagal lapor hasil order: {e}")


def poll_orders():
    """Cek apakah ada order baru yang harus dieksekusi."""
    try:
        r = requests.get(
            PENDING_ORDERS_URL,
            params={"secret": SECRET},
            timeout=5,
        )
        if r.status_code == 200:
            orders = r.json()
            for order in orders:
                print(f"📥 Order diterima: {order.get('type','?').upper()} {order.get('volume','?')} {order.get('symbol','?')}")
                execute_order(order)
    except Exception:
        pass


def validate_config():
    """Cek apakah REPLIT_URL sudah diisi."""
    if "GANTI-DENGAN-URL" in REPLIT_URL or not REPLIT_URL.startswith("http"):
        print("❌ REPLIT_URL belum diisi!")
        print("   Edit baris REPLIT_URL di bagian atas script ini.")
        print("   Contoh: https://vinzpredict.namaanda.repl.co")
        return False
    return True


def main():
    print("=" * 60)
    print("   VINZ PREDICT — MT5 Python Bridge")
    print("=" * 60)

    if not validate_config():
        input("\nTekan Enter untuk keluar...")
        sys.exit(1)

    if not init_mt5():
        input("\nTekan Enter untuk keluar...")
        sys.exit(1)

    print(f"\n🌐 Mengirim data ke: {REPLIT_URL}")
    print(f"🔄 Interval push   : {PUSH_INTERVAL_SEC} detik")
    print(f"📋 Symbols         : {', '.join(SYMBOLS)}")
    print("\n✅ Bridge aktif! Biarkan jendela ini terbuka.")
    print("   Tekan Ctrl+C untuk berhenti.\n")

    global last_push, last_order_poll
    push_ok_count = 0
    push_fail_count = 0

    try:
        while True:
            now = time.time()

            # Push data ke server
            if now - last_push >= PUSH_INTERVAL_SEC:
                ok = push_data()
                last_push = now
                if ok:
                    push_ok_count += 1
                    if push_ok_count % 10 == 1:
                        acc = get_account_data()
                        if acc:
                            print(f"📡 [{time.strftime('%H:%M:%S')}] Push #{push_ok_count} OK | "
                                  f"Balance: {acc['currency']} {acc['balance']:,.2f} | "
                                  f"Equity: {acc['currency']} {acc['equity']:,.2f} | "
                                  f"Posisi: {len(get_positions())}")
                else:
                    push_fail_count += 1
                    if push_fail_count >= 5:
                        print("⚠️  5 kali gagal push berturut-turut. Cek koneksi internet dan URL Replit.")
                        push_fail_count = 0

            # Poll pending orders
            if now - last_order_poll >= ORDER_POLL_INTERVAL_SEC:
                poll_orders()
                last_order_poll = now

            time.sleep(0.5)

    except KeyboardInterrupt:
        print("\n\n🛑 Bridge dihentikan oleh pengguna.")
    finally:
        mt5.shutdown()
        print("👋 MT5 diputuskan. Sampai jumpa!")


if __name__ == "__main__":
    main()
