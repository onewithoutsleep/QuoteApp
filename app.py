from flask import Flask, request, redirect, render_template, session, flash
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import redis
import sqlite3
from datetime import date, datetime
from urllib.parse import quote
import os
import requests
import hashlib
import re
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)

secret = os.environ.get("SECRET_KEY")
if not secret:
    raise RuntimeError("SECRET_KEY not configured")
app.secret_key = secret

if os.environ.get("FLASK_ENV") == "production":
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        storage_uri="redis://localhost:6379"
    )
else:
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        storage_uri="memory://"
    )

AUTH_DB_PATH = "data/auth.db"

# -----------------------------
# AUTH DATABASE
# -----------------------------
def get_auth_db():
    os.makedirs(os.path.dirname(AUTH_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(AUTH_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "username" not in session:
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated


def current_user():
    return session.get("username")


def user_db_path(username):
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", username)
    return f"data/users/{safe}.db"


# -----------------------------
# JINJA FILTERS
# -----------------------------
@app.template_filter("fmt_price")
def fmt_price(value):
    try:
        v = float(value)
        return f"{v:.0f}" if v % 1 == 0 else f"{v:.2f}"
    except (TypeError, ValueError):
        return value


@app.template_filter("time12")
def time12(value):
    """Convert HH:MM (24hr) to h:MM AM/PM display."""
    try:
        h, m = int(value[:2]), value[3:5]
        ampm = "AM" if h < 12 else "PM"
        h12 = h % 12 or 12
        return f"{h12}:{m} {ampm}"
    except Exception:
        return value or ""


@app.template_filter("fmt_date")
def fmt_date(value):
    """Convert YYYY-MM-DD to 'Tuesday May 3, 2026'."""
    try:
        d = datetime.strptime(value, "%Y-%m-%d")
        return d.strftime("%A %B %-d, %Y")
    except Exception:
        return value or ""


@app.template_filter("fmt_phone")
def fmt_phone(value):
    """Format phone number as (XXX) XXX-XXXX."""
    try:
        digits = "".join(c for c in str(value) if c.isdigit())
        if len(digits) == 10:
            return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
        if len(digits) == 11 and digits[0] == "1":
            return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    except Exception:
        pass
    return value or ""


@app.template_filter("urlencode")
def urlencode_filter(value):
    from urllib.parse import quote as url_quote
    return url_quote(str(value), safe="")


# -----------------------------
# DATABASE HELPER
# -----------------------------
def get_db(username=None):
    if username is None:
        username = current_user()
    db_path = user_db_path(username)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS houses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            lat         REAL,
            lng         REAL,
            address     TEXT UNIQUE NOT NULL,
            knocked_at  TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS quotes (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            house_id      INTEGER NOT NULL REFERENCES houses(id),
            customer      TEXT,
            phone         TEXT,
            email         TEXT,
            windows       INTEGER,
            outside_price REAL,
            inside_price  REAL,
            both_price    REAL,
            notes         TEXT,
            quote_date    TEXT,
            found_via     TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS services (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            quote_id     INTEGER NOT NULL REFERENCES quotes(id),
            service_date TEXT,
            service_time TEXT,
            type         TEXT,
            price        REAL,
            notes        TEXT,
            completed    INTEGER DEFAULT 0,
            paid         INTEGER DEFAULT 0,
            amount_paid  REAL
        )
    """)
    conn.commit()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_date TEXT,
            category    TEXT,
            description TEXT,
            amount      REAL,
            notes       TEXT
        )
    """)
    conn.commit()

    # Migrate services table: add new columns if missing
    svc_cols = [r[1] for r in conn.execute("PRAGMA table_info(services)").fetchall()]
    for col, defn in [
        ("completed","INTEGER DEFAULT 0"),
        ("paid","INTEGER DEFAULT 0"),
        ("amount_paid","REAL"),
        ("duration_minutes","INTEGER"),
    ]:
        if col not in svc_cols:
            conn.execute(f"ALTER TABLE services ADD COLUMN {col} {defn}")
    conn.commit()

    _migrate(conn)
    return conn


def _migrate(conn):
    """
    One-time migration: if the old schema exists (quotes.address column,
    houses.quote_id column), move address data into houses and wire up
    house_id on quotes, then drop the stale columns via table rebuild.
    """
    quote_cols = [r[1] for r in conn.execute("PRAGMA table_info(quotes)").fetchall()]
    house_cols = [r[1] for r in conn.execute("PRAGMA table_info(houses)").fetchall()]

    need_quote_migration = "address" in quote_cols and "house_id" not in quote_cols
    need_house_migration  = "quote_id" in house_cols

    if not need_quote_migration and not need_house_migration:
        return  # already on new schema

    # Step 1 — ensure house_id column exists on quotes (temp nullable)
    if "house_id" not in quote_cols:
        conn.execute("ALTER TABLE quotes ADD COLUMN house_id INTEGER")

    # Step 2 — for each quote, find or create a house row and set house_id
    rows = conn.execute("SELECT id, address FROM quotes WHERE house_id IS NULL").fetchall()
    for q in rows:
        addr = normalize_address(q["address"] or "")
        if not addr:
            addr = f"Unknown (quote {q['id']})"

        existing = conn.execute(
            "SELECT id FROM houses WHERE address=? COLLATE NOCASE", (addr,)
        ).fetchone()

        if existing:
            house_id = existing["id"]
        else:
            conn.execute(
                "INSERT OR IGNORE INTO houses (address) VALUES (?)", (addr,)
            )
            house_id = conn.execute(
                "SELECT id FROM houses WHERE address=? COLLATE NOCASE", (addr,)
            ).fetchone()["id"]

        conn.execute(
            "UPDATE quotes SET house_id=? WHERE id=?", (house_id, q["id"])
        )

    conn.commit()

    # Disable FK constraints for the duration of the table rebuilds
    conn.execute("PRAGMA foreign_keys = OFF")

    # Step 3 — rebuild quotes without address column
    if "address" in quote_cols:
        conn.execute("DROP TABLE IF EXISTS quotes_new")
        conn.execute("""
            CREATE TABLE quotes_new (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                house_id      INTEGER NOT NULL REFERENCES houses(id),
                customer      TEXT,
                phone         TEXT,
                email         TEXT,
                windows       INTEGER,
                outside_price REAL,
                inside_price  REAL,
                both_price    REAL,
                notes         TEXT,
                quote_date    TEXT,
                found_via     TEXT
            )
        """)
        conn.execute("""
            INSERT INTO quotes_new
                (id, house_id, customer, phone, email, windows,
                 outside_price, inside_price, both_price, notes, quote_date, found_via)
            SELECT
                id, house_id, customer, phone, email, windows,
                outside_price, inside_price, both_price, notes, quote_date, found_via
            FROM quotes
        """)
        conn.execute("DROP TABLE quotes")
        conn.execute("ALTER TABLE quotes_new RENAME TO quotes")

    # Step 4 — rebuild houses without quote_id column
    if "quote_id" in house_cols:
        conn.execute("DROP TABLE IF EXISTS houses_new")
        conn.execute("""
            CREATE TABLE houses_new (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                lat        REAL,
                lng        REAL,
                address    TEXT UNIQUE NOT NULL,
                knocked_at TEXT
            )
        """)
        conn.execute("""
            INSERT INTO houses_new (id, lat, lng, address, knocked_at)
            SELECT id, lat, lng, address, knocked_at FROM houses
        """)
        conn.execute("DROP TABLE houses")
        conn.execute("ALTER TABLE houses_new RENAME TO houses")

    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")


# -----------------------------
# SETTING HELPERS
# -----------------------------
def get_setting(key, default=""):
    conn = get_db()
    row = conn.execute(
        "SELECT value FROM settings WHERE key=?", (key,)
    ).fetchone()
    conn.close()
    return row["value"] if row else default


def get_rates():
    conn = get_db()
    rows = conn.execute(
        "SELECT key, value FROM settings WHERE key IN "
        "('outside_rate','inside_rate','both_rate')"
    ).fetchall()
    conn.close()
    rates = {r["key"]: float(r["value"]) for r in rows if r["value"]}
    return (
        rates.get("outside_rate", 5.0),
        rates.get("inside_rate",  5.0),
        rates.get("both_rate",    9.0),
    )


def _geocode_and_create(cursor, address):
    """Geocode address, insert a house row, return its id (or None on failure)."""
    address = normalize_address(address)
    try:
        data = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": "quote-app"},
            timeout=5,
        ).json()
        if data:
            cursor.execute(
                "INSERT OR IGNORE INTO houses (lat, lng, address) VALUES (?, ?, ?)",
                (float(data[0]["lat"]), float(data[0]["lon"]), address)
            )
            row = cursor.execute(
                "SELECT id FROM houses WHERE address=? COLLATE NOCASE", (address,)
            ).fetchone()
            return row["id"] if row else None
    except Exception:
        pass
    # Geocode failed — insert without coordinates so the quote can still be saved
    cursor.execute(
        "INSERT OR IGNORE INTO houses (address) VALUES (?)", (address,)
    )
    row = cursor.execute(
        "SELECT id FROM houses WHERE address=? COLLATE NOCASE", (address,)
    ).fetchone()
    return row["id"] if row else None


def normalize_address(addr):
    """Normalize to title-case + collapsed whitespace for consistent storage."""
    return " ".join(addr.strip().split()).title()


def get_house_or_404(conn, house_id):
    row = conn.execute("SELECT * FROM houses WHERE id=?", (house_id,)).fetchone()
    return row


# -----------------------------
# AUTH ROUTES
# -----------------------------
@app.route("/login", methods=["GET", "POST"])
@limiter.limit("5 per minute")
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip().lower()
        password = request.form.get("password", "")
        conn = get_auth_db()
        user = conn.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        ).fetchone()
        conn.close()
        if user and check_password_hash(user["password"], password):
            session["username"] = username
            return redirect("/")
        error = "Invalid username or password."
    return render_template("login.html", error=error, mode="login")


@app.route("/register", methods=["GET", "POST"])
def register():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip().lower()
        password = request.form.get("password", "")
        confirm  = request.form.get("confirm", "")
        if not username or not password:
            error = "Username and password are required."
        elif not re.match(r"^[a-zA-Z0-9_-]{2,32}$", username):
            error = "Username may only contain letters, numbers, underscores, and hyphens (2-32 chars)."
        elif password != confirm:
            error = "Passwords do not match."
        else:
            conn = get_auth_db()
            try:
                conn.execute(
                    "INSERT INTO users (username, password) VALUES (?, ?)",
                    (username, generate_password_hash(password))
                )
                conn.commit()
                conn.close()
                session["username"] = username
                return redirect("/")
            except sqlite3.IntegrityError:
                conn.close()
                error = "That username is already taken."
    return render_template("login.html", error=error, mode="register")


@app.route("/logout")
def logout():
    session.pop("username", None)
    return redirect("/login")


# -----------------------------
# HOME PAGE
# -----------------------------
@app.route("/")
@login_required
def home():
    conn = get_db()
    quotes = conn.execute("""
        SELECT q.*, h.address
        FROM quotes q
        JOIN houses h ON h.id = q.house_id
        ORDER BY q.id DESC
    """).fetchall()
    quotes = [dict(q) for q in quotes]
    for q in quotes:
        q["services"] = conn.execute(
            "SELECT * FROM services WHERE quote_id=? ORDER BY service_date, service_time",
            (q["id"],)
        ).fetchall()
    conn.close()
    return render_template("index.html", quotes=quotes)


# -----------------------------
# NEW QUOTE
# -----------------------------
@app.route("/quote/new", methods=["GET", "POST"])
@login_required
def new_quote():
    if request.method == "POST":
        house_id  = request.form.get("house_id", "").strip()
        customer  = request.form["customer"]
        phone     = request.form["phone"]
        email     = request.form["email"]
        windows   = int(request.form["windows"])
        outside   = float(request.form["outside"])
        inside    = float(request.form["inside"])
        both      = float(request.form["both"])
        notes     = request.form["notes"]
        quote_date = request.form["quote_date"]
        found_via = request.form.get("found_via", "").strip() or None

        conn = get_db()
        c = conn.cursor()

        if not house_id:
            # Manual entry — geocode address and create a house row automatically
            address = normalize_address(request.form.get("address", ""))
            if not address:
                conn.close()
                return redirect("/quote/new")

            existing = c.execute(
                "SELECT id FROM houses WHERE address=? COLLATE NOCASE", (address,)
            ).fetchone()

            if existing:
                house_id = existing["id"]
            else:
                house_id = _geocode_and_create(c, address)
                conn.commit()

        c.execute("""
            INSERT INTO quotes
                (house_id, customer, phone, email, windows,
                 outside_price, inside_price, both_price,
                 notes, quote_date, found_via)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (int(house_id), customer, phone, email, windows,
              outside, inside, both, notes, quote_date, found_via))
        conn.commit()
        conn.close()
        return redirect("/")

    # GET
    house_id = request.args.get("house_id", "").strip()
    house = None
    if house_id:
        conn = get_db()
        house = get_house_or_404(conn, house_id)
        conn.close()

    outside_rate, inside_rate, both_rate = get_rates()
    found_via = "knock" if house_id else ""

    return render_template(
        "quote_form.html",
        today=date.today().isoformat(),
        house=house,
        house_id=house_id,
        found_via=found_via,
        outside_rate=outside_rate,
        inside_rate=inside_rate,
        both_rate=both_rate,
        edit=False,
        quote=None,
    )


# -----------------------------
# EDIT QUOTE
# -----------------------------
@app.route("/edit/<int:id>", methods=["GET", "POST"])
@login_required
def edit(id):
    conn = get_db()
    c = conn.cursor()

    if request.method == "POST":
        customer   = request.form["customer"]
        phone      = request.form["phone"]
        email      = request.form["email"]
        windows    = int(request.form["windows"])
        outside    = float(request.form["outside"])
        inside     = float(request.form["inside"])
        both       = float(request.form["both"])
        notes      = request.form["notes"]
        quote_date = request.form["quote_date"]
        found_via  = request.form.get("found_via", "").strip() or None

        c.execute("""
            UPDATE quotes SET
                customer=?, phone=?, email=?,
                windows=?, outside_price=?, inside_price=?, both_price=?,
                notes=?, quote_date=?, found_via=?
            WHERE id=?
        """, (customer, phone, email, windows,
              outside, inside, both, notes, quote_date, found_via, id))
        conn.commit()
        conn.close()
        return redirect("/")

    # Join house so we have the address
    quote_data = c.execute("""
        SELECT q.*, h.address, h.id AS house_id
        FROM quotes q
        JOIN houses h ON h.id = q.house_id
        WHERE q.id=?
    """, (id,)).fetchone()
    conn.close()

    if quote_data is None:
        return redirect("/")

    outside_rate, inside_rate, both_rate = get_rates()
    return render_template(
        "quote_form.html",
        quote=quote_data,
        house_id=quote_data["house_id"],
        edit=True,
        found_via=quote_data["found_via"] or "",
        outside_rate=outside_rate,
        inside_rate=inside_rate,
        both_rate=both_rate,
    )


# -----------------------------
# DELETE QUOTE (+ services + house)
# -----------------------------
@app.route("/delete/<int:id>")
@login_required
def delete(id):
    conn = get_db()
    row = conn.execute("SELECT house_id FROM quotes WHERE id=?", (id,)).fetchone()
    if row:
        house_id = row["house_id"]
        conn.execute("DELETE FROM services WHERE quote_id=?", (id,))
        conn.execute("DELETE FROM quotes WHERE id=?", (id,))
        conn.execute("DELETE FROM houses WHERE id=?", (house_id,))
        conn.commit()
    conn.close()
    return redirect("/")


# -----------------------------
# BOOK SERVICE
# -----------------------------
@app.route("/service/new/<int:quote_id>")
@login_required
def service_new(quote_id):
    conn = get_db()
    q = conn.execute("""
        SELECT q.*, h.address FROM quotes q
        JOIN houses h ON h.id = q.house_id
        WHERE q.id=?
    """, (quote_id,)).fetchone()
    conn.close()
    if q is None:
        return redirect("/")
    return render_template(
        "service_form.html",
        quote=q,
        today=date.today().isoformat(),
    )


@app.route("/service/book", methods=["POST"])
@login_required
def service_book():
    quote_id     = int(request.form["quote_id"])
    service_date = request.form.get("service_date", "")
    # Assemble time from AM/PM picker
    t_hour  = request.form.get("service_time_hour", "")
    t_min   = request.form.get("service_time_min", "00")
    t_ampm  = request.form.get("service_time_ampm", "AM")
    if t_hour:
        h24 = int(t_hour) % 12 + (12 if t_ampm == "PM" else 0)
        service_time = f"{h24:02d}:{t_min}"
    else:
        service_time = request.form.get("service_time", "")
    stype        = request.form.get("type", "")
    price        = request.form.get("price", "")
    notes        = request.form.get("notes", "")
    try:
        price = float(price) if price else None
    except ValueError:
        price = None
    conn = get_db()
    conn.execute("""
        INSERT INTO services (quote_id, service_date, service_time, type, price, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (quote_id, service_date, service_time, stype, price, notes))
    conn.commit()
    conn.close()
    return redirect("/")


@app.route("/service/complete/<int:service_id>", methods=["POST"])
@login_required
def service_complete(service_id):
    """Quick AJAX endpoint to mark service complete/paid from bookings page."""
    completed = int(request.form.get("completed", 0))
    paid = int(request.form.get("paid", 0))
    amount_paid = request.form.get("amount_paid", "")
    duration_minutes = request.form.get("duration_minutes", "")
    try:
        amount_paid = float(amount_paid) if amount_paid else None
    except ValueError:
        amount_paid = None
    try:
        duration_minutes = int(duration_minutes) if duration_minutes else None
    except ValueError:
        duration_minutes = None
    conn = get_db()
    conn.execute("""
        UPDATE services SET completed=?, paid=?, amount_paid=?, duration_minutes=? WHERE id=?
    """, (completed, paid, amount_paid, duration_minutes, service_id))
    conn.commit()
    conn.close()
    from flask import jsonify
    return jsonify({"status": "ok"})


@app.route("/service/delete/<int:service_id>")
@login_required
def service_delete(service_id):
    conn = get_db()
    # remember where to redirect back to
    back = request.args.get("back", "/")
    conn.execute("DELETE FROM services WHERE id=?", (service_id,))
    conn.commit()
    conn.close()
    return redirect(back)


@app.route("/service/edit/<int:service_id>", methods=["GET", "POST"])
@login_required
def service_edit(service_id):
    conn = get_db()
    if request.method == "POST":
        service_date = request.form.get("service_date", "")
        t_hour  = request.form.get("service_time_hour", "")
        t_min   = request.form.get("service_time_min", "00")
        t_ampm  = request.form.get("service_time_ampm", "AM")
        if t_hour:
            h24 = int(t_hour) % 12 + (12 if t_ampm == "PM" else 0)
            service_time = f"{h24:02d}:{t_min}"
        else:
            service_time = request.form.get("service_time", "")
        stype        = request.form.get("type", "")
        price        = request.form.get("price", "")
        notes        = request.form.get("notes", "")
        back         = request.form.get("back", "/")
        completed    = 1 if request.form.get("completed") else 0
        paid         = 1 if request.form.get("paid") else 0
        amount_paid  = request.form.get("amount_paid", "")
        duration_minutes = request.form.get("duration_minutes", "")
        try:
            price = float(price) if price else None
        except ValueError:
            price = None
        try:
            amount_paid = float(amount_paid) if amount_paid else None
        except ValueError:
            amount_paid = None
        try:
            duration_minutes = int(duration_minutes) if duration_minutes else None
        except ValueError:
            duration_minutes = None
        conn.execute("""
            UPDATE services
            SET service_date=?, service_time=?, type=?, price=?, notes=?,
                completed=?, paid=?, amount_paid=?, duration_minutes=?
            WHERE id=?
        """, (service_date, service_time, stype, price, notes,
              completed, paid, amount_paid, duration_minutes, service_id))
        conn.commit()
        conn.close()
        return redirect(back)

    s = conn.execute("""
        SELECT s.*, q.customer, q.phone, q.outside_price, q.inside_price, q.both_price,
               h.address, s.quote_id
        FROM services s
        JOIN quotes q ON q.id = s.quote_id
        JOIN houses h ON h.id = q.house_id
        WHERE s.id=?
    """, (service_id,)).fetchone()
    conn.close()
    if s is None:
        return redirect("/")
    back = request.args.get("back", "/")
    return render_template("service_edit.html", service=s, today=date.today().isoformat(), back=back)


# -----------------------------
# BOOKINGS
# -----------------------------
@app.route("/bookings")
@login_required
def bookings():
    conn = get_db()
    services = conn.execute("""
        SELECT s.*, q.customer, q.phone, q.windows, q.house_id, h.address
        FROM services s
        JOIN quotes q ON q.id = s.quote_id
        JOIN houses h ON h.id = q.house_id
        ORDER BY s.service_date, s.service_time
    """).fetchall()
    services_list = [dict(r) for r in services]
    conn.close()
    return render_template("bookings.html", services=services_list, services_json=services_list)


# -----------------------------
# SETTINGS
# -----------------------------
@app.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    if request.method == "POST":
        keys = ["outside_rate", "inside_rate", "both_rate",
                "email_template", "text_template"]
        conn = get_db()
        for key in keys:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, request.form.get(key, ""))
            )
        conn.commit()
        conn.close()
        return redirect("/")

    return render_template(
        "settings.html",
        outside_rate=get_setting("outside_rate"),
        inside_rate=get_setting("inside_rate"),
        both_rate=get_setting("both_rate"),
        email_template=get_setting("email_template"),
        text_template=get_setting("text_template"),
    )


# -----------------------------
# MAP
# -----------------------------
@app.route("/map")
@login_required
def map_view():
    conn = get_db()
    rows = conn.execute("""
        SELECT h.*, q.id AS quote_id, q.customer, s.id AS service_id,
               s.service_date, s.service_time
        FROM houses h
        LEFT JOIN quotes q ON q.house_id = h.id
        LEFT JOIN services s ON s.quote_id = q.id
    """).fetchall()
    houses = [dict(r) for r in rows]
    conn.close()

    # Find the most recently added house that has coords, for use as fallback center
    last_house = next(
        (h for h in reversed(houses) if h.get("lat") and h.get("lng")), None
    )
    fallback_center = [last_house["lat"], last_house["lng"]] if last_house else [51.130218, -114.205008]

    return render_template("map.html", houses=houses, fallback_center=fallback_center)


# -----------------------------
# ADD HOUSE (AJAX)
# -----------------------------
@app.route("/add_house", methods=["POST"])
@login_required
def add_house():
    lat        = request.form["lat"]
    lng        = request.form["lng"]
    address    = normalize_address(request.form["address"])
    knocked_at = datetime.now().strftime("%Y-%m-%d %H:%M")

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM houses WHERE address=? COLLATE NOCASE", (address,)
    ).fetchone()

    if existing:
        conn.close()
        return {"status": "exists"}

    conn.execute(
        "INSERT INTO houses (lat, lng, address, knocked_at) VALUES (?, ?, ?, ?)",
        (lat, lng, address, knocked_at)
    )
    conn.commit()
    house_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return {"status": "added", "id": house_id,
            "lat": lat, "lng": lng, "address": address,
            "knocked_at": knocked_at}


# -----------------------------
# DELETE HOUSE (AJAX)
# -----------------------------
@app.route("/delete_knock/<int:id>")
@login_required
def delete_knock(id):
    conn = get_db()
    # Only allow deletion if no quote is attached
    linked = conn.execute(
        "SELECT id FROM quotes WHERE house_id=?", (id,)
    ).fetchone()
    if linked:
        conn.close()
        return {"status": "has_quote"}
    conn.execute("DELETE FROM houses WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# -----------------------------
# EMAIL QUOTE
# -----------------------------
@app.route("/email/<int:id>")
@login_required
def email_quote(id):
    conn = get_db()
    q = conn.execute("""
        SELECT q.*, h.address FROM quotes q
        JOIN houses h ON h.id = q.house_id
        WHERE q.id=?
    """, (id,)).fetchone()
    conn.close()

    if q is None:
        return redirect("/")

    body = get_setting("email_template").format(
        customer=q["customer"],
        outside=q["outside_price"],
        inside=q["inside_price"],
        both=q["both_price"],
    )
    return redirect(
        f"mailto:{q['email']}?subject={quote('Window Washing Quote')}&body={quote(body)}"
    )


# -----------------------------
# TEXT QUOTE
# -----------------------------
@app.route("/text/<int:id>")
@login_required
def text_quote(id):
    conn = get_db()
    q = conn.execute("""
        SELECT q.*, h.address FROM quotes q
        JOIN houses h ON h.id = q.house_id
        WHERE q.id=?
    """, (id,)).fetchone()
    conn.close()

    if q is None:
        return redirect("/")

    body = get_setting("text_template").format(
        customer=q["customer"],
        outside=q["outside_price"],
        inside=q["inside_price"],
        both=q["both_price"],
    )
    return redirect(f"sms:{q['phone']}?body={quote(body)}")


# -----------------------------
# MOVE HOUSE (AJAX)
# -----------------------------
@app.route("/move_house/<int:id>", methods=["POST"])
@login_required
def move_house(id):
    from flask import jsonify
    lat = request.form.get("lat")
    lng = request.form.get("lng")
    address = request.form.get("address", "").strip()
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return jsonify({"status": "error", "msg": "bad coords"})
    conn = get_db()
    if address:
        conn.execute("UPDATE houses SET lat=?, lng=?, address=? WHERE id=?",
                     (lat, lng, normalize_address(address), id))
    else:
        conn.execute("UPDATE houses SET lat=?, lng=? WHERE id=?", (lat, lng, id))
    conn.commit()
    updated = conn.execute("SELECT * FROM houses WHERE id=?", (id,)).fetchone()
    conn.close()
    return jsonify({"status": "ok", "address": updated["address"], "lat": lat, "lng": lng})


# -----------------------------
# EXPENSES
# -----------------------------
@app.route("/expenses", methods=["GET", "POST"])
@login_required
def expenses():
    conn = get_db()
    if request.method == "POST":
        action = request.form.get("action", "add")
        if action == "delete":
            exp_id = request.form.get("id")
            if exp_id:
                conn.execute("DELETE FROM expenses WHERE id=?", (exp_id,))
                conn.commit()
        else:
            expense_date = request.form.get("expense_date", date.today().isoformat())
            category     = request.form.get("category", "").strip()
            description  = request.form.get("description", "").strip()
            amount       = request.form.get("amount", "")
            notes        = request.form.get("notes", "").strip()
            try:
                amount = float(amount) if amount else 0.0
            except ValueError:
                amount = 0.0
            conn.execute("""
                INSERT INTO expenses (expense_date, category, description, amount, notes)
                VALUES (?, ?, ?, ?, ?)
            """, (expense_date, category, description, amount, notes))
            conn.commit()
        conn.close()
        return redirect("/expenses")

    rows = conn.execute(
        "SELECT * FROM expenses ORDER BY expense_date DESC, id DESC"
    ).fetchall()
    expenses_list = [dict(r) for r in rows]
    conn.close()
    return render_template("expenses.html", expenses=expenses_list, today=date.today().isoformat())


# -----------------------------
# STATS
# -----------------------------
@app.route("/stats")
@login_required
def stats():
    conn = get_db()

    total_houses = conn.execute("SELECT COUNT(*) FROM houses").fetchone()[0]
    total_quotes = conn.execute("SELECT COUNT(*) FROM quotes").fetchone()[0]
    total_services = conn.execute("SELECT COUNT(*) FROM services").fetchone()[0]
    completed_services = conn.execute("SELECT COUNT(*) FROM services WHERE completed=1").fetchone()[0]
    paid_services = conn.execute("SELECT COUNT(*) FROM services WHERE paid=1").fetchone()[0]

    revenue_row = conn.execute("SELECT SUM(amount_paid) FROM services WHERE paid=1").fetchone()
    total_revenue = revenue_row[0] or 0.0

    price_row = conn.execute("SELECT SUM(price) FROM services WHERE completed=1").fetchone()
    total_billed = price_row[0] or 0.0

    expense_row = conn.execute("SELECT SUM(amount) FROM expenses").fetchone()
    total_expenses = expense_row[0] or 0.0

    net_profit = total_revenue - total_expenses

    # Average job duration
    dur_row = conn.execute(
        "SELECT AVG(duration_minutes) FROM services WHERE completed=1 AND duration_minutes IS NOT NULL"
    ).fetchone()
    avg_duration = dur_row[0]

    # Revenue by month
    monthly = conn.execute("""
        SELECT substr(service_date,1,7) AS month, SUM(amount_paid) AS revenue, COUNT(*) AS jobs
        FROM services WHERE paid=1 AND service_date IS NOT NULL
        GROUP BY month ORDER BY month DESC LIMIT 12
    """).fetchall()
    monthly_data = [dict(r) for r in monthly]

    # Expenses by category
    cat_expenses = conn.execute("""
        SELECT category, SUM(amount) AS total
        FROM expenses GROUP BY category ORDER BY total DESC
    """).fetchall()
    cat_data = [dict(r) for r in cat_expenses]

    # Found-via breakdown
    found_via = conn.execute("""
        SELECT found_via, COUNT(*) AS cnt FROM quotes
        WHERE found_via IS NOT NULL GROUP BY found_via ORDER BY cnt DESC
    """).fetchall()
    found_via_data = [dict(r) for r in found_via]

    # Service type breakdown
    svc_types = conn.execute("""
        SELECT type, COUNT(*) AS cnt, SUM(amount_paid) AS revenue
        FROM services WHERE completed=1
        GROUP BY type ORDER BY cnt DESC
    """).fetchall()
    svc_type_data = [dict(r) for r in svc_types]

    conn.close()

    return render_template("stats.html",
        total_houses=total_houses,
        total_quotes=total_quotes,
        total_services=total_services,
        completed_services=completed_services,
        paid_services=paid_services,
        total_revenue=total_revenue,
        total_billed=total_billed,
        total_expenses=total_expenses,
        net_profit=net_profit,
        avg_duration=avg_duration,
        monthly_data=monthly_data,
        cat_data=cat_data,
        found_via_data=found_via_data,
        svc_type_data=svc_type_data,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
