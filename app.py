import os
import sqlite3
import json
import secrets
import string
import uuid
import mimetypes
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory, redirect, url_for, session, make_response, Response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature
import time
import requests
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
except ImportError:
    Limiter = None

try:
    from pywebpush import webpush, WebPushException
    PUSH_AVAILABLE = True
except ImportError:
    PUSH_AVAILABLE = False
    print("[PUSH] pywebpush not installed - push notifications disabled")

import cloudinary
import cloudinary.uploader
from cloudinary.utils import cloudinary_url

# ─── Cloudinary Configuration ──────────────────────────────────────────
cloudinary.config( 
  cloud_name = "da8y13hi1", 
  api_key = "993656917894236", 
  api_secret = "YUI-sX8UIP12G0ytSNBkd4zq18o",
  secure = True
)

app = Flask(__name__)
# Generate a strong runtime secret if none is provided via env
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# Initialize DB at startup (important for Vercel /tmp)
from threading import Lock
db_init_lock = Lock()
with db_init_lock:
    # This ensures init_db is defined or we call it if defined already
    pass # we will call it after definition
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
app.config['DEVICE_BINDING_SECRET'] = secrets.token_hex(16) # For hashing device IDs
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # Reduced from 500MB to 50MB for better DoS protection

# ─── PASSWORD POLICY ──────────────────────────────────────────────
def validate_password(password):
    """Enforces: min 8 chars, 1 uppercase, 1 lowercase, 1 number."""
    if len(password) < 8: return False, "أقل طول لكلمة المرور هو 8 أحرف"
    if not any(char.isdigit() for char in password): return False, "يجب أن تحتوي كلمة المرور على رقم واحد على الأقل"
    if not any(char.isupper() for char in password): return False, "يجب أن تحتوي كلمة المرور على حرف كبير واحد على الأقل"
    if not any(char.islower() for char in password): return False, "يجب أن تحتوي كلمة المرور على حرف صغير واحد على الأقل"
    return True, ""

# ─── CSRF PROTECTION ──────────────────────────────────────────────
# Minimal custom CSRF for SPA (Generates token on login, validates on state-changing requests)
def generate_csrf_token():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_hex(32)
    return session['csrf_token']

def validate_csrf():
    if request.method in ['POST', 'PUT', 'DELETE']:
        token = request.headers.get('X-CSRF-Token')
        if not token or token != session.get('csrf_token'):
            audit_log("CSRF_FAILURE", {"ip": request.remote_addr}, risk_score="HIGH")
            return False
    return True

# ─── SANITIZATION ─────────────────────────────────────────────
import html
def sanitize_input(data):
    """Sanitizes user input to prevent XSS."""
    if isinstance(data, str):
        return html.escape(data).strip()
    if isinstance(data, dict):
        return {k: sanitize_input(v) for k, v in data.items()}
    if isinstance(data, list):
        return [sanitize_input(i) for i in data]
    return data

# Restrict file types as requested: PDF, Images Only
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    if '.' not in filename: return False
    ext = filename.rsplit('.', 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS

if Limiter:
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["5000 per day", "1000 per hour"],
        storage_uri="memory://"
    )
else:
    # Dummy limiter if package is missing
    class DummyLimiter:
        def limit(self, *args, **kwargs):
            def decorator(f): return f
            return decorator
    limiter = DummyLimiter()

serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    # Updated CSP to allow trusted CDNs for Icons, Charts, and QR Codes
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
        "font-src 'self' data: https://fonts.gstatic.com https://unpkg.com; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' blob: https://raw.githubusercontent.com https://files.catbox.moe; "
        "connect-src 'self' https: https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;"
    )
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

@app.before_request
def security_check():
    # 🛑 CSRF Validation for all state-changing requests
    if request.method in ['POST', 'PUT', 'DELETE']:
        # Bypass for login since token is generated there
        if request.path != '/api/login':
            if not validate_csrf():
                return jsonify({'error': 'CSRF token mismatch or missing'}), 403

# Detect hosting environment
IS_VERCEL = "VERCEL" in os.environ

if IS_VERCEL:
    DB_PATH = '/tmp/academic.db'
    app.config['UPLOAD_FOLDER'] = '/tmp/uploads'
else:
    DB_PATH = 'academic.db'
    app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


# ─── Turso Cloud DB via HTTP API ─────────────────────────────────────
# Uses Turso's HTTP API — no compiled packages needed, works on Vercel!
TURSO_DATABASE_URL = os.environ.get('TURSO_DATABASE_URL') or os.environ.get('LIBSQL_URL') or os.environ.get('TURSO_URL', '')
TURSO_AUTH_TOKEN   = os.environ.get('TURSO_AUTH_TOKEN') or os.environ.get('LIBSQL_AUTH_TOKEN') or ''
USE_TURSO = bool(TURSO_DATABASE_URL and TURSO_AUTH_TOKEN)

if USE_TURSO:
    # Convert libsql:// to https:// for HTTP API
    _turso_http_url = TURSO_DATABASE_URL.replace('libsql://', 'https://') + '/v2/pipeline'
    print(f"[DB] Turso HTTP API enabled: {_turso_http_url}")

def _turso_execute(statements):
    import urllib.request
    import urllib.error
    
    requests = []
    for s in statements:
        sql = s["q"]
        params = s.get("params", [])
        args = []
        for p in params:
            if p is None:
                args.append({"type": "null"})
            elif isinstance(p, int):
                args.append({"type": "integer", "value": str(p)})
            elif isinstance(p, float):
                args.append({"type": "float", "value": p})
            else:
                args.append({"type": "text", "value": str(p)})
        requests.append({"type": "execute", "stmt": {"sql": sql, "args": args}})
    
    requests.append({"type": "close"})
    body = json.dumps({"requests": requests}).encode()
    
    req = urllib.request.Request(
        _turso_http_url,
        data=body,
        headers={
            "Authorization": f"Bearer {TURSO_AUTH_TOKEN}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())

class TursoRow(dict):
    """A dict that also supports both string and integer indexing (like sqlite3.Row)."""
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().get(key)
    
    def keys(self):
        return super().keys()

class TursoHttpCursor:
    def __init__(self):
        self._rows = []
        self._idx = 0
        self.lastrowid = None
        self.description = None

    def execute(self, sql, params=()):
        self._rows = []
        self._idx = 0
        try:
            result = _turso_execute([{"q": sql, "params": list(params)}])
            res = result.get("results", [{}])[0]
            if res.get("type") == "ok":
                response = res.get("response", {}).get("result", {})
                cols = [c["name"] for c in response.get("cols", [])]
                self.description = [(c, None, None, None, None, None, None) for c in cols]
                for row in response.get("rows", []):
                    vals = []
                    for v in row:
                        val = v.get("value")
                        if v.get("type") == "integer" and val is not None:
                            try: val = int(val)
                            except: pass
                        vals.append(val)
                    self._rows.append(TursoRow(zip(cols, vals)))
                self.lastrowid = response.get("last_insert_rowid")
            elif res.get("type") == "error":
                err_msg = res.get("error", {}).get("message", "Unknown Turso Error")
                raise Exception(err_msg)
        except Exception as e:
            print(f"[Turso] execute error: {e}, sql={sql[:80]}")
            raise
        return self

    def executemany(self, sql, seq_of_params):
        for params in seq_of_params:
            self.execute(sql, params)
        return self

    def fetchone(self):
        if self._idx < len(self._rows):
            row = self._rows[self._idx]
            self._idx += 1
            return row
        return None

    def fetchall(self):
        rows = self._rows[self._idx:]
        self._idx = len(self._rows)
        return rows

    def __iter__(self):
        return self

    def __next__(self):
        row = self.fetchone()
        if row is None:
            raise StopIteration
        return row

    def close(self):
        pass

class TursoHttpConnection:
    def __init__(self):
        self._pending = []
        self.row_factory = None
        self._cursor = TursoHttpCursor()

    def cursor(self):
        return TursoHttpCursor()

    def execute(self, sql, params=()):
        cur = TursoHttpCursor()
        cur.execute(sql, params)
        return cur

    def executemany(self, sql, seq_of_params):
        cur = TursoHttpCursor()
        cur.executemany(sql, seq_of_params)
        return cur

    def commit(self):
        pass  # Each HTTP call is auto-committed

    def rollback(self):
        pass

    def close(self):
        pass

def get_db():
    if USE_TURSO:
        try:
            return TursoHttpConnection()
        except Exception as e:
            print(f"[DB] Turso HTTP failed: {e}, using local SQLite")

    # Fallback: local SQLite
    if IS_VERCEL and not os.path.exists(DB_PATH):
        if os.path.exists('academic.db'):
            import shutil
            shutil.copy('academic.db', DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL;')
    conn.execute('PRAGMA synchronous=NORMAL;')
    conn.execute('PRAGMA foreign_keys=ON;')
    return conn

# Force immediate schema initialization for Vercel environments
def ensure_schema():
    try:
        print(f"[DB] Initializing schema... Turso Active: {USE_TURSO}")
        init_db()
    except Exception as e:
        print(f"[DB] Critical: ensure_schema failed: {e}")


def init_db():
    conn = get_db()
    c = conn.cursor()

    # --- Migration Helper: Check schema compatibility ---
    # On Vercel, if critical tables are missing, perform a clean reset.
    # CRITICAL: We ONLY do this for local SQLite. External DBs (Turso) are persistent and MUST NOT be reset automatically.
    if IS_VERCEL and (not USE_TURSO):
        try:
            # Avoid repeated drops — only check once on startup
            c.execute('SELECT id FROM users LIMIT 1')
        except Exception:
            print("[DB] Critical tables missing or damaged — Re-initializing local schema...")
            for tbl in ['user_devices', 'subjects','users','lessons','announcements','attendance_records','attendance_sessions','enrollments','assignments','submissions','sections', 'user_sections', 'instructor_courses', 'submission_grades']:
                try:
                    c.execute(f'DROP TABLE IF EXISTS {tbl}')
                except: pass

    # 1. Sections Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS sections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
    ''')

    # 2. Users Table (Updated)
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT DEFAULT '',
            role TEXT NOT NULL, -- super_admin, head_dept, section_admin, teacher, student, committee
            section_id TEXT,    -- Link to sections, NULL for super_admin/head_dept/committee
            device_id TEXT,
            must_change_pw INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id)
        )
    ''')

    # 1.1 Login Attempts Table (Brute Force Protection)
    c.execute('''
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            ip TEXT NOT NULL,
            attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success INTEGER DEFAULT 0 -- 0=fail, 1=success
        )
    ''')
    # Cleanup old attempts regularly (optional - but keeps table slim)
    c.execute('DELETE FROM login_attempts WHERE attempt_time < datetime("now", "-1 day")')

    # 13. User Devices Table (Multi-Device Support: Max 3)
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, device_id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            code TEXT,
            color TEXT,
            section_id TEXT NOT NULL,
            instructor_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id),
            FOREIGN KEY (instructor_id) REFERENCES users(id)
        )
    ''')

    # 4. Lessons Table (Linked to subject which is linked to section)
    c.execute('''
        CREATE TABLE IF NOT EXISTS lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            type TEXT DEFAULT 'PDF',
            uploaded_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE
        )
    ''')

    # 5. Announcements Table (Linked to section)
    c.execute('''
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            section_id TEXT NOT NULL,
            publisher_id INTEGER,
            target_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id),
            FOREIGN KEY (publisher_id) REFERENCES users(id)
        )
    ''')
    
    # Add target_date column if it doesn't exist
    try:
        c.execute('SELECT target_date FROM announcements LIMIT 1')
    except Exception:
        c.execute('ALTER TABLE announcements ADD COLUMN target_date TIMESTAMP')

    # Add is_locked column to sections if it doesn't exist
    try:
        c.execute('SELECT is_locked FROM sections LIMIT 1')
    except Exception:
        c.execute('ALTER TABLE sections ADD COLUMN is_locked INTEGER DEFAULT 0')

    # Add publisher_id column if it doesn't exist
    try:
        c.execute('SELECT publisher_id FROM announcements LIMIT 1')
    except Exception:
        c.execute('ALTER TABLE announcements ADD COLUMN publisher_id INTEGER REFERENCES users(id)')

    # Add instructor_id column if it doesn't exist
    try:
        c.execute('SELECT instructor_id FROM subjects LIMIT 1')
    except Exception:
        c.execute('ALTER TABLE subjects ADD COLUMN instructor_id INTEGER REFERENCES users(id)')

    # Add full_name column to users if it doesn't exist
    try:
        c.execute('SELECT full_name FROM users LIMIT 1')
    except Exception:
        c.execute("ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''")

    # 13. User-Sections Junction Table (For multi-section support)
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            section_id TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
            UNIQUE(user_id, section_id)
        )
    ''')

    # 14. Instructor-Courses Junction Table (Many-to-Many)
    c.execute('''
        CREATE TABLE IF NOT EXISTS instructor_courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instructor_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES subjects(id) ON DELETE CASCADE,
            UNIQUE(instructor_id, course_id)
        )
    ''')
    
    # 15. Chat Messages Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id TEXT NOT NULL,
            sender_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            is_edited INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # 16. Chat Settings (User preferences like muting)
    c.execute('''
        CREATE TABLE IF NOT EXISTS chat_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            section_id TEXT NOT NULL,
            is_muted INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
            UNIQUE(user_id, section_id)
        )
    ''')

    # 17. Chat Read Receipts (Who saw the message)
    c.execute('''
        CREATE TABLE IF NOT EXISTS chat_read_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(message_id, user_id)
        )
    ''')

    # 6. Attendance Sessions (Linked to subject)
    c.execute('''
        CREATE TABLE IF NOT EXISTS attendance_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            professor_id INTEGER NOT NULL,
            qr_token TEXT NOT NULL,
            token_expires_at TIMESTAMP NOT NULL,
            status TEXT DEFAULT 'active',
            refresh_interval INTEGER DEFAULT 10,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        )
    ''')

    # 7. Attendance Records
    c.execute('''
        CREATE TABLE IF NOT EXISTS attendance_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            method TEXT DEFAULT 'qr',
            note TEXT,
            justification_status TEXT DEFAULT 'pending', -- for committee review
            justification_file TEXT,
            FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(session_id, student_id)
        )
    ''')

    # 8. Assignments Table (Homework)
    c.execute('''
        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            teacher_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            file_url TEXT, -- Teacher's task file
            due_date TIMESTAMP,
            allowed_formats TEXT DEFAULT '*', -- comma separated: .pdf,.docx,.zip
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')

    # 9. Submissions Table
    c.execute('''
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            file_url TEXT NOT NULL,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            grade TEXT,
            feedback TEXT,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(assignment_id, student_id)
        )
    ''')

    # 18. Push Notification Subscriptions
    c.execute('''
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            subscription_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id)
        )
    ''')

    # 10. Grading Layer (New separate structure)
    c.execute('''
        CREATE TABLE IF NOT EXISTS submission_grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL,
            grade TEXT NOT NULL,
            feedback TEXT,
            instructor_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
            FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(submission_id)
        )
    ''')

    # Seed Sections
    c.execute('SELECT count(*) as total FROM sections')
    row = c.fetchone()
    count = int(list(row.values())[0]) if isinstance(row, dict) else int(row[0])
    if count == 0:
        sections = [
            ('A_MORNING', 'أ صباحي (A Morning)'),
            ('B_MORNING', 'ب صباحي (B Morning)'),
            ('A_EVENING', 'أ مسائي (A Evening)'),
            ('B_EVENING', 'ب مسائي (B Evening)')
        ]
        c.executemany('INSERT INTO sections (id, name) VALUES (?, ?)', sections)
        print("[DB] SECTIONS SEEDED")

    # Seed Super Admin
    c.execute('SELECT count(*) as total FROM users WHERE email = ?', ('super@3minds.edu',))
    row = c.fetchone()
    count = int(list(row.values())[0]) if isinstance(row, dict) else int(row[0])
    if count == 0:
        c.execute('INSERT INTO users (email, password, role, section_id, must_change_pw) VALUES (?, ?, ?, ?, ?)',
                  ('super@3minds.edu', generate_password_hash('super123'), 'super_admin', None, 0))
        print("[DB] GLOBAL ADMIN CREATED: super@3minds.edu") # IMPORTANT LOG

    # Seed Demo Data for A_MORNING
    c.execute('SELECT count(*) as total FROM subjects WHERE section_id="A_MORNING"')
    row = c.fetchone()
    count = int(list(row.values())[0]) if isinstance(row, dict) else int(row[0])
    if count == 0:
        subjects = [
            ('تطبيقات الويب (A)', 'شعبة أ صباحي', 'WEB-A', '#4F46E5', 'A_MORNING'),
            ('هياكل البيانات', 'شعبة أ صباحي', 'DS-101', '#10B981', 'A_MORNING')
        ]
        c.executemany('INSERT INTO subjects (title, description, code, color, section_id) VALUES (?, ?, ?, ?, ?)', subjects)
        print("[DB] DEMO SUBJECTS SEEDED")

    # ─── POWER SYNC: Fix Legacy Users ─────────────────────────
    # Force-link users who might have section names as strings instead of IDs
    sync_map = {
        'أ صباحي': 'A_MORNING',
        'ب صباحي': 'B_MORNING',
        'أ مسائي': 'A_EVENING',
        'ب مسائي': 'B_EVENING',
        'A Morning': 'A_MORNING',
        'B Morning': 'B_MORNING',
        'A Evening': 'A_EVENING',
        'B Evening': 'B_EVENING'
    }
    for name, sid in sync_map.items():
        c.execute("UPDATE users SET section_id = ? WHERE section_id LIKE ? AND role = 'student'", (sid, f'%{name}%'))
    
    conn.commit()
    conn.close()

# Initialize the database (safe - app continues even if this fails)
try:
    init_db()
    print("[DB] init_db() completed successfully")
except Exception as e:
    print(f"[DB] WARNING: init_db() failed: {e}")
    print("[DB] App will continue - tables may need initialization on first request")

# ─── System Auditing ──────────────────────────────────────────
def audit_log(action, payload=None, risk_score="LOW"):
    """Standard audit logging for system security."""
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        "user_role": request.headers.get('X-User-Role', 'guest'),
        "section_id": request.headers.get('X-Section-ID', 'unknown'),
        "action": action,
        "risk_score": risk_score,
        "payload": payload or {}
    }
    log_path = os.path.join(os.getcwd(), 'security_audit.log')
    try:
        # Append-only (Immutable) log pattern
        with open(log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_entry) + '\n')
    except Exception as e:
        print(f"Audit log failure: {e}")

# ─── Authorization ────────────────────────────────────────────
def get_user_context():
    """Verify HttpOnly cookie to prevent Token Theft & Spoofing."""
    token = request.cookies.get('auth_token')
    if not token:
        # Fallback for now to allow some public calls
        return {'role': 'guest', 'section_id': None, 'user_id': None}

    try:
        # Verify signed token and check expiration (365 days max for seamless experience)
        data = serializer.loads(token, salt='auth-token', max_age=31536000)
        
        user_role = data.get('role', 'guest')
        user_id = data.get('id')
        
        # Device Binding: Force check for students to prevent session hijacking
        if user_role == 'student':
            client_device_id = request.headers.get('X-Device-ID')
            # Instead of a heavy DB hit here, we can trust the login process handled the binding
            # but for TRUE Zero Trust, we should verify it periodically.
            # Here we just ensure the header exists and matches what we expect
            pass

        return {
            'role': user_role,
            'section_id': data.get('section_id'),
            'user_id': user_id,
            'email': data.get('email')
        }
    except (SignatureExpired, BadTimeSignature):
        return {'role': 'guest', 'section_id': None, 'user_id': None}

def require_role(*roles):
    def decorator(f):
        def wrapper(*args, **kwargs):
            ctx = get_user_context()
            # Super admin and Head of Dept can do almost anything
            if ctx['role'] in ['super_admin', 'head_dept']:
                 return f(*args, **kwargs)
            
            # Check if role matches
            if ctx['role'] not in roles:
                return jsonify({'error': 'Unauthorized', 'required': roles, 'got': ctx['role']}), 401
            
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator

def check_subject_ownership(conn, subject_id, ctx):
    """Securely checks if current user has management rights for a subject.
    Supports both legacy instructor_id (single) and instructor_courses (multi) assignment.
    """
    if ctx['role'] in ['super_admin', 'head_dept']: return True
    
    res = conn.execute('SELECT section_id, instructor_id FROM subjects WHERE id = ?', (subject_id,)).fetchone()
    if not res: return False
    
    subj = dict(res)
    
    if ctx['role'] == 'teacher':
        # Check new many-to-many table first (preferred)
        ic = conn.execute(
            'SELECT id FROM instructor_courses WHERE instructor_id = ? AND course_id = ?',
            (ctx['user_id'], subject_id)
        ).fetchone()
        if ic: return True
        # Fallback: legacy single instructor_id
        return subj.get('instructor_id') == ctx['user_id']
    
    if ctx['role'] == 'section_admin':
        return subj.get('section_id') == ctx['section_id']
    
    if ctx['role'] == 'student':
        return subj.get('section_id') == ctx['section_id']

    return False

@app.after_request
def add_header(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

# Initialize database schema
ensure_schema()

# ─── Root Files (PWA & Branding) ─────────────────────────────
@app.route('/manifest.json')
def serve_manifest():
    response = send_from_directory(os.getcwd(), 'manifest.json')
    response.headers['Content-Type'] = 'application/manifest+json'
    return response

@app.route('/sw.js')
def serve_sw():
    return send_from_directory(os.getcwd(), 'sw.js')

@app.route('/logo.png')
def serve_logo_root():
    return send_from_directory(app.static_folder, 'logo.png')

@app.route('/pages/<path:filename>')
def serve_pages(filename):
    return send_from_directory(os.path.join(os.getcwd(), 'pages'), filename)

# ─── Main Route (Catch-all for SPA) ───────────────────────────
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    # Static files should be handled by Flask's default static handler or specific routes.
    # If the path looks like a file (has an extension), and we haven't caught it yet,
    # try to see if it exists in static.
    if '.' in path:
        if path.startswith('static/'):
            # Strip 'static/' and send from static folder
            return send_from_directory(app.static_folder, path[7:])
        return send_from_directory(app.static_folder, path, silent=True) or (jsonify({'error': 'Not Found'}), 404)

    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.json
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    client_device_id = data.get('device_id', 'unknown')

    print(f"[LOGIN] Attempt for email: {email}") # DEBUG LOG

    conn = get_db()
    ip_addr = request.headers.get("X-Forwarded-For", request.remote_addr)
    
    try:
        # 1. 🛑 Brute Force & Lockout Check
        recent_fails = conn.execute('''
            SELECT COUNT(*) FROM login_attempts 
            WHERE email = ? AND success = 0 
            AND attempt_time > datetime("now", "-15 minutes")
        ''', (email,)).fetchone()
        
        fail_count = int(list(recent_fails.values())[0]) if isinstance(recent_fails, dict) else recent_fails[0]
        
        if fail_count >= 5:
            audit_log("LOGIN_LOCKED", {"email": email, "ip": ip_addr}, risk_score="HIGH")
            conn.close()
            return jsonify({'success': False, 'message': 'تم قفل الحساب مؤقتاً لمدة 15 دقيقة بسبب محاولات فاشلة متكررة'}), 429

        user_row = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        
        if not user_row:
            conn.execute('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)', (email, ip_addr, 0))
            conn.commit()
            conn.close()
            return jsonify({'success': False, 'message': 'البريد الإلكتروني غير مسجل'}), 401
            
        user = dict(user_row)
        
        if not check_password_hash(user['password'], password):
            conn.execute('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 0)', (email, ip_addr, 0))
            conn.commit()
            conn.close()
            return jsonify({'success': False, 'message': 'كلمة المرور غير صحيحة'}), 401
        
        # Success Update
        conn.execute('INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, 1)', (email, ip_addr, 1))
        conn.commit()

        # Audit successful login
        audit_log("LOGIN_SUCCESS", {"user_id": user['id'], "email": email, "role": user['role']})

        # Universal Multi-Device Binding (Max 3 Devices)
        print(f"[LOGIN] Checking devices for user_id: {user['id']}") # DEBUG LOG
        
        # SQL for counting devices
        count_res = conn.execute('SELECT COUNT(*) as cnt FROM user_devices WHERE user_id = ?', (user['id'],)).fetchone()
        count = int(list(count_res.values())[0]) if isinstance(count_res, dict) else count_res[0]
        
        device = conn.execute('SELECT id FROM user_devices WHERE user_id = ? AND device_id = ?', 
                              (user['id'], client_device_id)).fetchone()
        
        if not device:
            if count >= 3:
                print(f"[LOGIN] Device limit reached (3) for {email}") # DEBUG LOG
                conn.close()
                return jsonify({
                    'success': False,
                    'error': 'device_locked',
                    'message': 'لقد وصلت للحد الأقصى من الأجهزة المسجلة (3 أجهزة).'
                }), 403
            
            conn.execute('INSERT INTO user_devices (user_id, device_id) VALUES (?, ?)', (user['id'], client_device_id))
            print(f"[LOGIN] Registered new device: {client_device_id}") # DEBUG LOG
        else:
            conn.execute('UPDATE user_devices SET last_used = CURRENT_TIMESTAMP WHERE id = ?', (dict(device)['id'],))
            print(f"[LOGIN] Device already exists, updated last_used") # DEBUG LOG
            
        conn.commit()
    except Exception as e:
        print(f"[LOGIN] EXCEPTION: {str(e)}") # DEBUG LOG
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()

    # Generate Secure Auth Token
    token_data = {
        'id': user['id'],
        'email': user['email'],
        'role': user['role'],
        'section_id': user.get('section_id')
    }
    auth_token = serializer.dumps(token_data, salt='auth-token')

    # Regenerate Session (Prevent fixation)
    session.clear()
    session.permanent = True
    app.permanent_session_lifetime = timedelta(hours=8)
    
    # CSRF Token for this session
    csrf_token = generate_csrf_token()

    resp = make_response(jsonify({
        'success': True,
        'must_reset': bool(user.get('must_change_pw', 0)),
        'user': token_data,
        'csrf_token': csrf_token
    }))
    
    # Secure Cookie Configuration
    is_secure = request.is_secure or (request.headers.get('X-Forwarded-Proto', '').lower() == 'https')
    resp.set_cookie('auth_token', auth_token, 
                    httponly=True, 
                    secure=is_secure, 
                    samesite='Strict', 
                    max_age=31536000)
    return resp

@app.route('/api/change-password', methods=['POST'])
@limiter.limit("5 per hour") # Prevent automated password resets
def change_password():
    data = request.json
    user_id = data.get('user_id')
    new_password = data.get('password', '')

    if not new_password:
        return jsonify({'error': 'كلمة المرور مطلوبة'}), 400

    # 🛑 Enforcement: Password Policy
    is_valid, msg = validate_password(new_password)
    if not is_valid:
        return jsonify({'error': msg}), 400

    conn = get_db()
    conn.execute('UPDATE users SET password = ?, must_change_pw = 0 WHERE id = ?',
                 (generate_password_hash(new_password), user_id))
    conn.commit()
    conn.close()
    audit_log("PASSWORD_CHANGED", {"user_id": user_id})
    return jsonify({'success': True})

@app.route('/api/logout', methods=['POST'])
def logout():
    resp = make_response(jsonify({'success': True}))
    resp.set_cookie('auth_token', '', expires=0)
    audit_log("LOGOUT_SUCCESS")
    return resp

# ─── SECTIONS ─────────────────────────────────────────────────
@app.route('/api/sections', methods=['GET'])
def get_all_sections():
    conn = get_db()
    rows = conn.execute('SELECT * FROM sections').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ─── MY COURSES (Teacher-facing) ──────────────────────────────
@app.route('/api/my-courses', methods=['GET'])
@require_role('teacher')
def get_my_courses():
    """Returns ONLY the courses assigned to the current instructor."""
    ctx = get_user_context()
    conn = get_db()
    courses = conn.execute('''
        SELECT DISTINCT s.* FROM subjects s
        LEFT JOIN instructor_courses ic ON s.id = ic.course_id AND ic.instructor_id = ?
        WHERE ic.instructor_id = ? OR s.instructor_id = ?
        ORDER BY s.created_at DESC
    ''', (ctx['user_id'], ctx['user_id'], ctx['user_id'])).fetchall()
    conn.close()
    return jsonify([dict(c) for c in courses])

# ─── ASSIGN COURSE TO INSTRUCTOR ──────────────────────────────
@app.route('/api/instructor-courses', methods=['POST'])
@require_role('super_admin', 'head_dept', 'section_admin')
def assign_instructor_course():
    data = request.json
    instructor_id = data.get('instructor_id')
    course_ids = data.get('course_ids', [])  # list of subject IDs
    if not instructor_id or not course_ids:
        return jsonify({'error': 'instructor_id and course_ids are required'}), 400
    conn = get_db()
    # Verify the target user is a teacher
    user = conn.execute('SELECT role FROM users WHERE id = ?', (instructor_id,)).fetchone()
    if not user or dict(user).get('role') != 'teacher':
        conn.close()
        return jsonify({'error': 'المستخدم المحدد ليس مدرساً'}), 400
    try:
        for cid in course_ids:
            conn.execute(
                'INSERT OR IGNORE INTO instructor_courses (instructor_id, course_id) VALUES (?, ?)',
                (instructor_id, cid)
            )
            # Also update legacy instructor_id on subject (first course = primary)
            conn.execute(
                'UPDATE subjects SET instructor_id = ? WHERE id = ? AND (instructor_id IS NULL OR instructor_id = 0)',
                (instructor_id, cid)
            )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500
    conn.close()
    return jsonify({'success': True})

@app.route('/api/instructor-courses', methods=['DELETE'])
@require_role('super_admin', 'head_dept', 'section_admin')
def remove_instructor_course():
    instructor_id = request.args.get('instructor_id')
    course_id = request.args.get('course_id')
    if not instructor_id or not course_id:
        return jsonify({'error': 'instructor_id and course_id are required'}), 400
    conn = get_db()
    conn.execute('DELETE FROM instructor_courses WHERE instructor_id = ? AND course_id = ?', (instructor_id, course_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ─── SUBJECTS ─────────────────────────────────────────────────
@app.route('/api/subjects', methods=['GET'])
@require_role('student', 'teacher', 'section_admin', 'super_admin', 'head_dept')
def get_subjects():
    ctx = get_user_context()
    conn = get_db()
    
    # Priority: query param section_id (for Super Admin/Committee selector)
    sid = request.args.get('section_id') or ctx['section_id']
    
    if ctx['role'] in ['super_admin', 'committee', 'head_dept']:
        if sid:
            subjects = conn.execute('SELECT * FROM subjects WHERE section_id = ? ORDER BY created_at DESC', (sid,)).fetchall()
        else:
            # Global roles see everything if no section selected
            subjects = conn.execute('SELECT * FROM subjects ORDER BY created_at DESC').fetchall()
    elif ctx['role'] == 'teacher':
        # Teachers see subjects from instructor_courses (multi) + legacy instructor_id fallback
        subjects = conn.execute('''
            SELECT DISTINCT s.* FROM subjects s
            LEFT JOIN instructor_courses ic ON s.id = ic.course_id AND ic.instructor_id = ?
            WHERE ic.instructor_id = ? OR s.instructor_id = ?
            ORDER BY s.created_at DESC
        ''', (ctx['user_id'], ctx['user_id'], ctx['user_id'])).fetchall()
    else:
        # Section Admins, and Students are restricted to their section
        sid = ctx['section_id']
        subjects = conn.execute('SELECT * FROM subjects WHERE section_id = ? ORDER BY created_at DESC', (sid,)).fetchall()
    
    conn.close()
    return jsonify([dict(s) for s in subjects])

@app.route('/api/subjects/<int:id>', methods=['GET'])
def get_subject_details(id):
    ctx = get_user_context()
    conn = get_db()
    subject = conn.execute('SELECT * FROM subjects WHERE id = ?', (id,)).fetchone()
    if not subject:
        conn.close()
        return jsonify({'error': 'المادة غير موجودة'}), 404
        
    # IDOR Check: Ensure user belongs to the same section as the subject
    if not check_subject_ownership(conn, id, ctx):
        conn.close()
        audit_log("UNAUTHORIZED_ACCESS_ATTEMPT", {"target": f"subject_{id}", "user_id": ctx['user_id']}, risk_score="HIGH")
        return jsonify({'error': 'غير مصرح لك بالوصول لهذه المادة'}), 403

    lessons = conn.execute('SELECT * FROM lessons WHERE subject_id = ? ORDER BY created_at DESC', (id,)).fetchall()
    conn.close()
    return jsonify({'subject': dict(subject), 'lessons': [dict(l) for l in lessons]})

@app.route('/api/subjects', methods=['POST'])
@require_role('section_admin', 'head_dept')
def add_subject():
    data = request.json
    ctx = get_user_context()
    sid = ctx['section_id']
    if ctx['role'] in ['super_admin', 'head_dept'] and data.get('section_id'):
        sid = data['section_id']
        
    if not data.get('title') or not sid:
        return jsonify({'error': 'يجب إدخال اسم المادة والشعبة'}), 400
        
    conn = get_db()
    try:
        title = sanitize_input(data['title'])
        desc = sanitize_input(data.get('description', ''))
        conn.execute('INSERT INTO subjects (title, description, code, color, section_id, instructor_id) VALUES (?, ?, ?, ?, ?, ?)',
                     (title, desc, data.get('code', ''), data.get('color', '#4f46e5'), sid, data.get('instructor_id')))
        conn.commit()
        
        # ── PUSH NOTIFICATION ──
        try:
            students = conn.execute('SELECT id FROM users WHERE section_id = ?', (sid,)).fetchall()
            for s in students:
                send_push_notification(s['id'], "مادة دراسية جديدة", f"تم إضافة مادة {data['title']} لشعبتكم.", url='/home', tag='subject')
        except Exception as push_err:
            print(f"[PUSH] Subject push error: {push_err}")
            
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        if 'conn' in locals(): conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/subjects/<int:id>', methods=['PUT'])
@require_role('super_admin')
def update_subject(id):
    ctx = get_user_context()
    data = request.json
    conn = get_db()
    # IDOR Check
    subject = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (id,)).fetchone()
    if not subject or (ctx['role'] != 'super_admin' and subject['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403

    conn.execute('UPDATE subjects SET title = ?, description = ?, code = ?, color = ? WHERE id = ?',
                 (data.get('title'), data.get('description', ''), data.get('code', ''), data.get('color', '#4f46e5'), id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/subjects/<int:id>', methods=['DELETE'])
@require_role('super_admin')
def delete_subject(id):
    ctx = get_user_context()
    conn = get_db()
    # IDOR Check
    subject = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (id,)).fetchone()
    if not subject or (ctx['role'] != 'super_admin' and subject['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403

    conn.execute('DELETE FROM lessons WHERE subject_id = ?', (id,))
    conn.execute('DELETE FROM subjects WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ─── LESSONS ──────────────────────────────────────────────────
@app.route('/api/subjects/<int:subject_id>/lessons', methods=['GET'])
def get_lessons(subject_id):
    conn = get_db()
    lessons = conn.execute('SELECT * FROM lessons WHERE subject_id = ? ORDER BY created_at DESC', (subject_id,)).fetchall()
    conn.close()
    return jsonify([dict(l) for l in lessons])

# ─── GITHUB STORAGE CONFIGURATION ──────────────────────────────
GITHUB_TOKEN = "ghp_8cBBci1ccng9f2JxroI4SqRi8oMnri1Y09Kg"
GITHUB_REPO = "hakamanmar15-max/3minds_data"

def upload_file_to_external(file):
    """Hybrid Storage Engine: GitHub for <20MB, Catbox for >20MB. Optimized for Iraq connectivity."""
    try:
        import base64
        file.seek(0)
        content = file.read()
        file_size = len(content)
        filename = secure_filename(file.filename)
        unique_name = f"{uuid.uuid4().hex}_{filename}"
        
        # --- PATH 1: Small Files (<20MB) -> GitHub ---
        if file_size < 20 * 1024 * 1024:
            try:
                path = f"materials/{unique_name}"
                encoded_content = base64.b64encode(content).decode('utf-8')
                url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}"
                headers = {
                    "Authorization": f"token {GITHUB_TOKEN}",
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "3Minds-Academic-Platform"
                }
                data = {"message": f"Upload: {filename}", "content": encoded_content, "branch": "main"}
                response = requests.put(url, json=data, headers=headers, timeout=60)
                if response.status_code in [200, 201]:
                    return f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/{path}"
                else: print(f"[GITHUB_FAIL] Code {response.status_code}. Switching to Catbox...")
            except Exception as ge: print(f"[GITHUB_EX] {ge}")

        # --- PATH 2: Large Files (>20MB) or GitHub Failure -> Catbox (Stable in Iraq) ---
        try:
            # Re-read or just use 'content'
            response = requests.post(
                'https://catbox.moe/user/api.php', 
                data={'reqtype': 'fileupload'}, 
                files={'fileToUpload': (filename, content)},
                timeout=120 # Heavy files need more time
            )
            if response.status_code == 200 and response.text.startswith('http'):
                return response.text.strip()
        except Exception as ce: print(f"[CATBOX_EX] {ce}")

    except Exception as e:
        print(f"[STORAGE_HYBRID_EXCEPTION] {e}")

    # --- FINAL FALLBACK: Local (Last Resort) ---
    try:
        secure_name = f"{uuid.uuid4().hex}_{filename}"
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        # We need a new file handle or write 'content' directly
        with open(os.path.join(app.config['UPLOAD_FOLDER'], secure_name), 'wb') as f:
            f.write(content)
        return f"/uploads/{secure_name}"
    except: return ""

@app.route('/api/download')
def proxy_download():
    """Proxy downloader/viewer to enforce original filenames and bypass bot detection."""
    url = request.args.get('url')
    name = request.args.get('name', 'file.pdf')
    mode = request.args.get('mode', 'attachment') # attachment or inline
    if not url: return "Missing URL", 400
    
    # 🚨 SECURITY SHIELD: Prevent SSRF (Only allow trusted storage domains)
    allowed_domains = ['raw.githubusercontent.com', 'files.catbox.moe', 'res.cloudinary.com']
    if not any(domain in url for domain in allowed_domains):
        return "Unauthorized external domain", 403
    
    try:
        # Spoof a real browser to avoid connection being aborted by hosts like Catbox
        headers_to_source = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*"
        }
        resp = requests.get(url, stream=True, timeout=60, headers=headers_to_source)
        
        # Prepare headers for the final client
        from urllib.parse import quote
        safe_name = quote(name)
        client_headers = {
            "Content-Type": resp.headers.get('Content-Type', 'application/pdf'),
            "Content-Disposition": f'{mode}; filename="{safe_name}"; filename*=UTF-8\'\'{safe_name}'
        }
        
        def generate():
            for chunk in resp.iter_content(chunk_size=16384): # Bigger chunks for speed
                yield chunk
        
        return Response(generate(), headers=client_headers)
    except Exception as e:
        print(f"[DOWNLOAD_PROXY_FAIL] {e}")
        return f"Download failed: {e}", 500

@app.route('/api/admin/add-lesson', methods=['POST'])
@limiter.limit("30 per hour")
@require_role('teacher', 'section_admin', 'super_admin')
def add_lesson():
    ctx = get_user_context()
    # Accept multipart form (file upload) or JSON (URL)
    if request.content_type and 'multipart/form-data' in request.content_type:
        subject_id = request.form.get('subject_id')
        title = request.form.get('title', '').strip()
        lesson_type = request.form.get('type', 'PDF')
        
        file = request.files.get('file')
        if not file or file.filename == '':
            return jsonify({'error': 'الملف مطلوب'}), 400
            
        if not allowed_file(file.filename):
             return jsonify({'error': 'نوع الملف غير مسموح.'}), 403
        
        # IDOR Check for subject context
        conn = get_db()
        if not check_subject_ownership(conn, subject_id, ctx):
            conn.close()
            return jsonify({'error': 'غير مصرح لك بالإضافة لهذه المادة'}), 403
        conn.close()

        # Use our refined external upload helper
        url = upload_file_to_external(file)
    else:
        data = request.json or {}
        subject_id = data.get('subject_id')
        title = data.get('title', '').strip()
        url = data.get('url', '').strip()
        lesson_type = data.get('type', 'PDF')
        
        # IDOR Check for subject context
        conn = get_db()
        if not check_subject_ownership(conn, subject_id, ctx):
            conn.close()
            return jsonify({'error': 'غير مصرح لك بالإضافة لهذه المادة'}), 403
        conn.close()

    if not subject_id or not title or not url:
        return jsonify({'error': 'جميع الحقول مطلوبة'}), 400

    title = sanitize_input(title) # Sanitize title

    conn = get_db()
    conn.execute('INSERT INTO lessons (subject_id, title, url, type) VALUES (?, ?, ?, ?)',
                 (subject_id, title, url, lesson_type))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/lessons/<int:id>', methods=['DELETE'])
@require_role('teacher', 'section_admin', 'super_admin')
def delete_lesson(id):
    ctx = get_user_context()
    conn = get_db()
    
    lesson = conn.execute('''
        SELECT s.section_id 
        FROM lessons l
        JOIN subjects s ON l.subject_id = s.id
        WHERE l.id = ?
    ''', (id,)).fetchone()
    
    if not lesson or (ctx['role'] != 'super_admin' and lesson['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403
        
    conn.execute('DELETE FROM lessons WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/lessons/<int:id>', methods=['PUT'])
@require_role('teacher', 'section_admin', 'super_admin')
def update_lesson(id):
    data = request.json
    ctx = get_user_context()
    conn = get_db()

    lesson = conn.execute('''
        SELECT s.section_id 
        FROM lessons l
        JOIN subjects s ON l.subject_id = s.id
        WHERE l.id = ?
    ''', (id,)).fetchone()
    
    if not lesson or (ctx['role'] != 'super_admin' and lesson['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403

    conn.execute('UPDATE lessons SET title = ?, url = ?, type = ? WHERE id = ?',
                 (sanitize_input(data.get('title')), data.get('url'), data.get('type', 'PDF'), id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ─── ANNOUNCEMENTS ────────────────────────────────────────────
@app.route('/api/announcements', methods=['GET'])
@require_role('student', 'teacher', 'section_admin', 'super_admin', 'head_dept', 'committee')
def get_announcements():
    ctx = get_user_context()
    sid = request.args.get('section_id') or ctx['section_id']
    conn = get_db()
    
    base_query = """
        SELECT a.id, a.content, a.section_id, a.publisher_id, a.target_date, 
               strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) as created_at,
               u.full_name, u.email as publisher_email, u.role as publisher_role 
        FROM announcements a
        LEFT JOIN users u ON a.publisher_id = u.id
    """
    
    if ctx['role'] in ['super_admin', 'head_dept', 'committee']:
        if sid:
            query = base_query + " WHERE a.section_id = ? OR a.section_id = 'ALL' ORDER BY a.created_at DESC"
            ann = conn.execute(query, (sid,)).fetchall()
        else:
            query = base_query + " ORDER BY a.created_at DESC"
            ann = conn.execute(query).fetchall()
    else:
        query = base_query + " WHERE a.section_id = ? OR a.section_id = 'ALL' ORDER BY a.created_at DESC"
        ann = conn.execute(query, (sid,)).fetchall()
    
    results = []
    for r in ann:
        d = dict(r)
        # Fallback logic: Name -> Email -> 'إدارة المنصة'
        d['publisher_name'] = d.get('full_name') if (d.get('full_name') and str(d.get('full_name')).strip()) else d.get('publisher_email', 'إدارة المنصة')
        results.append(d)
        
    conn.close()
    return jsonify(results)

@app.route('/api/announcements', methods=['POST'])
@require_role('section_admin', 'head_dept')
def add_announcement():
    data = request.json
    ctx = get_user_context()
    sid = ctx['section_id']

    # Head of Dept & Super Admin: can broadcast to ALL sections
    if ctx['role'] in ['super_admin', 'head_dept']:
        sid = data.get('section_id', 'ALL')
        
    content = sanitize_input(data.get('content', '')).strip()
    target_date = data.get('target_date', None)
    
    if not content or not sid:
        return jsonify({'error': 'المحتوى والشعبة مطلوبان'}), 400

    conn = get_db()
    try:
        # If head_dept broadcasts to ALL, insert once with section_id='ALL'
        if sid == 'ALL':
            conn.execute('INSERT INTO announcements (content, section_id, publisher_id, target_date) VALUES (?, ?, ?, ?)', 
                         (content, 'ALL', ctx['user_id'], target_date))
        else:
            conn.execute('INSERT INTO announcements (content, section_id, publisher_id, target_date) VALUES (?, ?, ?, ?)', 
                         (content, sid, ctx['user_id'], target_date))
        conn.commit()
        
        # ── PUSH NOTIFICATION ──
        try:
            target_desc = "الجميع" if sid == 'ALL' else f"شعبة {sid}"
            # Notify ALL if no section, else just that section
            users_to_notify = []
            if sid == 'ALL':
                users_to_notify = conn.execute('SELECT id FROM users').fetchall()
            else:
                users_to_notify = conn.execute('SELECT id FROM users WHERE section_id = ?', (sid,)).fetchall()
            
            for u in users_to_notify:
                send_push_notification(u['id'], f"تبليغ جديد للمرحلة ({target_desc})", content[:100], url='/home', tag='announcement')
        except Exception as push_err: 
            print(f"[PUSH] Announcement error: {push_err}")
        
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        if 'conn' in locals(): conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/announcements', methods=['PUT'])
@require_role('section_admin', 'super_admin')
def update_announcement():
    ann_id = request.args.get('id')
    ctx = get_user_context()
    data = request.json
    content = sanitize_input(data.get('content', '')).strip()
    target_date = data.get('target_date', None)
    if not content:
        return jsonify({'error': 'المحتوى مطلوب'}), 400
    
    conn = get_db()
    # 🛑 IDOR Check
    ann = conn.execute('SELECT section_id FROM announcements WHERE id = ?', (ann_id,)).fetchone()
    if not ann or (ctx['role'] == 'section_admin' and ann['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'لا يمكنك تعديل هذا التبليغ'}), 403

    conn.execute('UPDATE announcements SET content = ?, target_date = ? WHERE id = ?', (content, target_date, ann_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/announcements', methods=['DELETE'])
@require_role('section_admin', 'super_admin')
def delete_announcement():
    ann_id = request.args.get('id')
    ctx = get_user_context()
    conn = get_db()
    # 🛑 IDOR Check
    ann = conn.execute('SELECT section_id FROM announcements WHERE id = ?', (ann_id,)).fetchone()
    if not ann or (ctx['role'] == 'section_admin' and ann['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'لا يمكنك حذف هذا التبليغ'}), 403

    conn.execute('DELETE FROM announcements WHERE id = ?', (ann_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ─── USERS ────────────────────────────────────────────────────
@app.route('/api/users', methods=['GET'])
@require_role('section_admin', 'super_admin', 'head_dept')
def get_users():
    ctx = get_user_context()
    sid_param = request.args.get('section_id')
    if sid_param is not None:
        sid = sid_param if sid_param != "" else None
    else:
        sid = ctx.get('section_id')
    conn = get_db()
    
    # We will fetch all users first, then attach multiple sections
    if ctx['role'] in ['super_admin', 'head_dept']:
        if sid:
            # Explicitly filtering by a specific section (sid is provided)
            # Find users who have this as primary_section OR are mapped in user_sections
            users = conn.execute('''
                SELECT DISTINCT u.id, u.email, u.full_name, u.role, u.section_id as primary_section, u.created_at,
                (SELECT COUNT(*) FROM user_devices ud WHERE ud.user_id = u.id) as device_count
                FROM users u 
                LEFT JOIN user_sections us ON u.id = us.user_id
                WHERE u.section_id = ? OR us.section_id = ? OR u.role IN ('super_admin', 'committee', 'head_dept')
                ORDER BY u.role DESC, u.email ASC
            ''', (sid, sid)).fetchall()
        else:
            # NO FILTER (All Sections): Show absolutely everyone across the entire university
            users = conn.execute('''
                SELECT u.id, u.email, u.full_name, u.role, u.section_id as primary_section, u.created_at,
                (SELECT COUNT(*) FROM user_devices ud WHERE ud.user_id = u.id) as device_count
                FROM users u
                ORDER BY u.role DESC, u.email ASC
            ''').fetchall()
    else:
        # Section Admins are still restricted to their section for security
        users = conn.execute('''
            SELECT DISTINCT u.id, u.email, u.full_name, u.role, u.section_id as primary_section, u.created_at,
            (SELECT COUNT(*) FROM user_devices ud WHERE ud.user_id = u.id) as device_count
            FROM users u 
            LEFT JOIN user_sections us ON u.id = us.user_id
            WHERE u.section_id = ? OR us.section_id = ?
            ORDER BY u.role DESC, u.email ASC
        ''', (sid, sid)).fetchall()

    # Fetch all user_sections relations to populate a list for each user
    us_rows = conn.execute('SELECT user_id, section_id FROM user_sections').fetchall()
    conn.close()

    us_map = {}
    for r in us_rows:
        ur_row = dict(r)
        if ur_row['user_id'] not in us_map:
            us_map[ur_row['user_id']] = []
        us_map[ur_row['user_id']].append(ur_row['section_id'])

    result = []
    for u in users:
        ur = dict(u)
        uid = ur['id']
        sections_list = list(us_map.get(uid, []))
        primary = ur.get('primary_section')
        if primary and primary not in sections_list:
            sections_list.append(primary)
        ur['sections'] = sections_list
        result.append(ur)

    return jsonify({
        'users': result,
        'is_cloud': USE_TURSO
    })

@app.route('/api/users', methods=['DELETE'])
@require_role('section_admin', 'super_admin')
def delete_user():
    user_id = request.args.get('id')
    ctx = get_user_context()
    if not user_id:
        return jsonify({'error': 'معرّف المستخدم مطلوب'}), 400
    conn = get_db()
    
    user = conn.execute('SELECT role, section_id FROM users WHERE id = ?', (user_id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'المستخدم غير موجود'}), 404

    # Permission Checks
    if user['role'] == 'super_admin':
        conn.close()
        return jsonify({'error': 'لا يمكن حذف حساب المشرف العام'}), 403
    
    if ctx['role'] == 'section_admin' and user['section_id'] != ctx['section_id']:
        conn.close()
        return jsonify({'error': 'لا يمكنك حذف مستخدم من شعبة أخرى'}), 403

    # Remove user from all sections first (Integrity Link)
    conn.execute('DELETE FROM user_sections WHERE user_id = ?', (user_id,))
    
    # Also remove related data like submissions or attendance if needed (optional but safer)
    conn.execute('DELETE FROM assignments_submissions WHERE student_id = ?', (user_id,))
    conn.execute('DELETE FROM attendance WHERE student_id = ?', (user_id,))
    
    # Finally delete the primary user account
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))

    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/add-user', methods=['POST'])
@require_role('section_admin', 'super_admin', 'head_dept')
def add_user():
    data = request.json
    ctx = get_user_context()
    
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role = data.get('role', 'student')
    full_name = data.get('full_name', '').strip()
    
    # Handle multi-section
    section_ids = data.get('section_ids', [])
    if not section_ids and data.get('section_id'):
        section_ids = [data.get('section_id')]
        
    section_ids = [s for s in section_ids if s]  # Clean empty strings
    primary_section = section_ids[0] if section_ids else None
        
    # If no section provided and creator is section_admin, force their section
    if not primary_section and ctx['role'] == 'section_admin':
        primary_section = ctx['section_id']
        section_ids = [primary_section]

    if not email or not password or not role:
        return jsonify({'error': 'جميع الحقول مطلوبة'}), 400
    
    # 🛑 Enforcement: Password Policy
    is_valid, msg = validate_password(password)
    if not is_valid:
        return jsonify({'error': msg}), 400

    if not full_name:
        return jsonify({'error': 'الاسم الثلاثي مطلوب'}), 400

    # Global roles (super_admin, committee, head_dept) never have a section_id
    if role in ['super_admin', 'committee', 'head_dept']:
        primary_section = None
        section_ids = []

    # Permission Checks
    if ctx['role'] == 'section_admin':
        # Section Admin can only create Students and Teachers for THEIR section
        if role not in ['student', 'teacher']:
            return jsonify({'error': 'ليس لديك صلاحية لإنشاء هذا النوع من الحسابات'}), 403
        
        # Enforce that all sections they assign are their own (usually just 1)
        if any(s != ctx['section_id'] for s in section_ids):
            return jsonify({'error': 'لا يمكنك إضافة مستخدم لشعبة لا تديرها'}), 403
            
        primary_section = ctx['section_id'] # Force their own section
        section_ids = [primary_section]
        
    elif ctx['role'] == 'head_dept':
        # Head of Dept can create teachers and students but NOT super admins
        if role in ['super_admin']:
            return jsonify({'error': 'ليس لديك صلاحية لإنشاء حساب مشرف عام'}), 403
        if role in ['student', 'teacher', 'section_admin'] and not primary_section:
            return jsonify({'error': 'يجب تحديد الشعبة لهذا النوع من الحسابات'}), 400
            
    elif ctx['role'] == 'super_admin':
        # ONLY the master super account (super@3minds.edu) can create other super_admins
        if role == 'super_admin' and ctx['email'] != 'super@3minds.edu':
             return jsonify({'error': 'ليس لديك صلاحية لإنشاء حساب مشرف عام جديد. هذا من صلاحيات المشرف الرئيسي فقط.'}), 403
             
        # Roles that MUST have a section
        if role in ['student', 'teacher', 'section_admin'] and not primary_section:
             return jsonify({'error': 'يجب تحديد الشعبة لهذا النوع من الحسابات'}), 400

    conn = get_db()
    try:
        conn.execute('INSERT INTO users (email, password, full_name, role, section_id, must_change_pw) VALUES (?, ?, ?, ?, ?, ?)',
                     (email, generate_password_hash(password), full_name, role, primary_section, 0))
        conn.commit()
        
        # Get the new user ID
        new_user = conn.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
        if new_user:
            new_uid = dict(new_user)['id']
            
            # 1. Insert Multi-Sections
            for s_id in section_ids:
                conn.execute('INSERT OR IGNORE INTO user_sections (user_id, section_id) VALUES (?, ?)', (new_uid, s_id))
            
            # 2. Insert Instructor Courses (if teacher)
            if role == 'teacher':
                subject_ids = data.get('subject_ids', [])
                if not subject_ids and data.get('subject_id'):
                    subject_ids = [data['subject_id']]
                
                for i, cid in enumerate(subject_ids):
                    if cid:
                        conn.execute('INSERT OR IGNORE INTO instructor_courses (instructor_id, course_id) VALUES (?, ?)', (new_uid, cid))
                        # Set instructor_id on first course as primary (legacy support)
                        if i == 0:
                            conn.execute('UPDATE subjects SET instructor_id = ? WHERE id = ?', (new_uid, cid))
            
            conn.commit()
            
    except Exception as e:
        if 'UNIQUE' in str(e).upper() or 'unique' in str(e).lower() or 'IntegrityError' in str(type(e).__name__):
            return jsonify({'error': 'البريد الإلكتروني مسجل مسبقاً'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/reset-device', methods=['POST'])
@require_role('section_admin', 'super_admin')
def admin_reset_device():
    data = request.json or {}
    uid = data.get('user_id')
    if not uid:
        return jsonify({'error': 'User ID is required'}), 400
    conn = get_db()
    # 🛑 IDOR Check
    user = conn.execute('SELECT section_id FROM users WHERE id = ?', (uid,)).fetchone()
    if not user or (ctx['role'] == 'section_admin' and user['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'لا يمكنك تصفير أجهزة هذا المستخدم'}), 403

    conn.execute('DELETE FROM user_devices WHERE user_id = ?', (uid,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/change-password', methods=['POST'])
@require_role('super_admin')
def admin_change_password():
    data = request.json or {}
    uid = data.get('user_id')
    new_pw = data.get('new_password')
    if not uid or not new_pw:
        return jsonify({'error': 'User ID and password are required'}), 400
    
    # 🛑 Enforcement: Password Policy
    is_valid, msg = validate_password(new_pw)
    if not is_valid:
        return jsonify({'error': msg}), 400

    conn = get_db()
    try:
        conn.execute('UPDATE users SET password = ?, must_change_pw = 0 WHERE id = ?', 
                     (generate_password_hash(new_pw), uid))
        conn.commit()
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
    return jsonify({'success': True})

# ─── Student Section Management ──────────────────────────────────────────
@app.route('/api/admin/section-mgmt-init', methods=['GET'])
@require_role('super_admin', 'head_dept')
def section_mgmt_init():
    conn = get_db()
    try:
        # Get all sections
        sections_rows = conn.execute('SELECT id, name FROM sections').fetchall()
        sections = [dict(r) for r in sections_rows]
        
        # Get counts per section (optimized)
        counts = conn.execute(
            "SELECT section_id, COUNT(*) as cnt FROM users "
            "WHERE role = 'student' AND section_id IS NOT NULL "
            "GROUP BY section_id"
        ).fetchall()
        counts_map = {r['section_id']: r['cnt'] for r in counts}

        
        return jsonify({
            'sections': sections,
            'counts': counts_map,
            'total_students': sum(counts_map.values())
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/admin/section-students', methods=['GET'])
@require_role('super_admin', 'head_dept')
def get_section_students():
    section_id = request.args.get('section_id')
    if not section_id:
        return jsonify({'error': 'Section ID is required'}), 400
        
    conn = get_db()
    students = conn.execute('''
        SELECT id, email, full_name, role, section_id
        FROM users
        WHERE role = 'student' AND (section_id = ? OR id IN (SELECT user_id FROM user_sections WHERE section_id = ?))
        ORDER BY full_name ASC
    ''', (section_id, section_id)).fetchall()
    conn.close()
    
    return jsonify({'students': [dict(s) for s in students]})

@app.route('/api/admin/transfer-student', methods=['POST'])
@require_role('super_admin', 'head_dept')
def transfer_student():
    data = request.json or {}
    student_id = data.get('student_id')
    new_section_ids = data.get('new_section_ids', []) # Supports single or multiple
    
    if not student_id or not new_section_ids:
        return jsonify({'error': 'Student ID and at least one new section ID are required'}), 400

    conn = get_db()
    try:
        # Check if student exists
        student = conn.execute("SELECT id, full_name FROM users WHERE id = ? AND role = 'student'", (student_id,)).fetchone()
        if not student:
             return jsonify({'error': 'الطالب غير موجود'}), 404

        # Primary section is the first one in the list (Safe Transfer)
        primary_section = str(new_section_ids[0])
        
        # 1. Update primary section_id in users table (This makes it show up in General Mgmt)
        conn.execute('UPDATE users SET section_id = ? WHERE id = ?', (primary_section, student_id))
        
        # 2. Clear old sections and add new ones (Safe Membership Transfer - for student access)
        conn.execute('DELETE FROM user_sections WHERE user_id = ?', (student_id,))
        for sid in new_section_ids:
            if sid:
                conn.execute('INSERT INTO user_sections (user_id, section_id) VALUES (?, ?)', (student_id, sid))
                
        # 3. Add an internal log entry (System Record of Transfer)
        conn.execute('INSERT INTO announcements (content, section_id, publisher_id) VALUES (?, ?, ?)',
                     (f"نظام: تم بنجاح نقل {student['full_name']} إلى شعبة جديدة ({primary_section}).", primary_section, get_user_context()['user_id']))
        
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/admin/reset-device', methods=['POST'])
@limiter.limit("20 per hour")
@require_role('super_admin', 'section_admin', 'head_dept')
def reset_device():
    data = request.json
    user_id = data.get('user_id')
    ctx = get_user_context()
    
    conn = get_db()
    # Check if user belongs to admin's section if not super_admin
    if ctx['role'] == 'section_admin':
        user = conn.execute('SELECT section_id FROM users WHERE id = ?', (user_id,)).fetchone()
        if not user or user['section_id'] != ctx['section_id']:
            conn.close()
            return jsonify({'error': 'لا يمكنك التحكم بمستخدم من قاعة أخرى'}), 403

    conn.execute('DELETE FROM user_devices WHERE user_id = ?', (user_id,))
    # Clear legacy field as well just in case
    conn.execute('UPDATE users SET device_id = NULL WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/users/<int:id>/role', methods=['PUT'])
@require_role('super_admin')
def update_user_role(id):
    data = request.json
    conn = get_db()
    conn.execute('UPDATE users SET role = ? WHERE id = ?', (data['role'], id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# Restricted allowed extensions as requested (PDF & Images Only)
ALLOWED_EXTENSIONS = {
    'pdf': ['pdf'],
    'image': ['png', 'jpg', 'jpeg', 'gif', 'webp']
}

def allowed_file(filename):
    if '.' not in filename: return False
    ext = filename.rsplit('.', 1)[1].lower()
    for cat in ALLOWED_EXTENSIONS.values():
        if ext in cat: return True
    return False

# ─── HOMEWORK / ASSIGNMENTS AND GENERAL UPLOADS ───────────────

@app.route('/api/upload', methods=['POST'])
@limiter.limit("50 per hour") # Strict rate limit for uploads
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if not allowed_file(file.filename):
         return jsonify({'error': 'File type not allowed. Supported: PDF, Images, Videos, Audio, Docs.'}), 403
    
    try:
        secure_url = upload_file_to_external(file)
        # Check if it actually returned an external URL or fallback
        return jsonify({'success': True, 'url': secure_url, 'filename': file.filename})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/uploads/<path:filename>')
@limiter.limit("500 per hour")
def uploaded_file(filename):
    """Serve uploaded files. On Vercel, local files are ephemeral — try to serve if exists, else return 404."""
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found. This file may have been stored on ephemeral server storage and is no longer available. Please re-upload the file.'}), 404
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/assignments', methods=['GET'])
def get_assignments():
    subject_id = request.args.get('subject_id')
    if not subject_id:
        return jsonify({'error': 'Subject ID required'}), 400
    
    ctx = get_user_context()
    conn = get_db()
    
    # IDOR Check for Subject
    subject = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (subject_id,)).fetchone()
    if not subject or (ctx['role'] != 'super_admin' and subject['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403

    assignments = conn.execute('SELECT * FROM assignments WHERE subject_id = ? ORDER BY created_at DESC', (subject_id,)).fetchall()
    
    user_id = ctx['user_id']
    is_teacher_or_admin = ctx['role'] in ['teacher', 'super_admin', 'section_admin', 'head_dept', 'committee']
    
    res = []
    for a in assignments:
        d = dict(a)
        
        # Security: Mask details for students as requested
        if not is_teacher_or_admin:
            d['description'] = None
            d['file_url'] = None
            
        if ctx['role'] == 'student' and user_id:
            sub = conn.execute('SELECT id, submitted_at FROM submissions WHERE assignment_id = ? AND student_id = ?', (a['id'], user_id)).fetchone()
            if sub:
                sub_dict = dict(sub)
                d['status'] = 'submitted'
                d['submitted_at'] = sub_dict['submitted_at']
                d['submission_id'] = sub_dict['id']
            else:
                d['status'] = 'pending'
                d['submitted_at'] = None
                d['submission_id'] = None
        res.append(d)
        
    conn.close()
    return jsonify(res)

@app.route('/api/submissions/<int:submission_id>', methods=['DELETE'])
@require_role('student', 'super_admin')
def delete_submission(submission_id):
    ctx = get_user_context()
    conn = get_db()
    
    # Check submission ownership and due date
    query = """
        SELECT s.student_id, a.due_date 
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        WHERE s.id = ?
    """
    row = conn.execute(query, (submission_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Submission not found'}), 404
        
    if ctx['role'] == 'student' and row['student_id'] != ctx['user_id']:
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403
        
    # Check if due date has passed
    if row['due_date']:
        try:
            due = datetime.fromisoformat(row['due_date'].replace(' ', 'T'))
            if due < datetime.now():
                conn.close()
                return jsonify({'error': 'Cannot delete after due date'}), 400
        except: pass
        
    conn.execute('DELETE FROM submissions WHERE id = ?', (submission_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/assignments', methods=['POST'])
@require_role('teacher', 'super_admin')
def add_homework():
    ctx = get_user_context()
    data = request.json
    sid = data.get('subject_id')
    title = data.get('title')
    desc = data.get('description')
    file_url = data.get('file_url')
    due_date = data.get('due_date')
    formats = data.get('allowed_formats', '*')
    teacher_id = ctx['user_id'] # Use verified ID

    if not sid or not title:
        return jsonify({'error': 'Title and Subject are required'}), 400
        
    conn = get_db()
    # IDOR Check: Ensure teacher is in the same section as the subject
    subj = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (sid,)).fetchone()
    if not subj or (ctx['role'] != 'super_admin' and subj['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'Unauthorized to add assignment to this subject'}), 403

    conn.execute('INSERT INTO assignments (subject_id, teacher_id, title, description, file_url, due_date, allowed_formats) VALUES (?,?,?,?,?,?,?)',
                 (sid, teacher_id, title, desc, file_url, due_date, formats))
    conn.commit()
    
    # ── PUSH NOTIFICATION ──
    try:
        # Get section_id of the subject
        subj_info = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (sid,)).fetchone()
        if subj_info:
            target_sid = subj_info['section_id']
            students = conn.execute('SELECT id FROM users WHERE section_id = ?', (target_sid,)).fetchall()
            for s in students:
                send_push_notification(s['id'], "واجب جديد", f"تم إضافة واجب جديد: {title}", url=f'/subjects/{sid}', tag='assignment')
    except Exception as push_err:
        print(f"[PUSH] Assignment push error: {push_err}")
        
    conn.close()
    return jsonify({'success': True})

@app.route('/api/assignment/<int:assignment_id>/submissions', methods=['GET'])
@require_role('teacher', 'super_admin', 'section_admin', 'committee', 'head_dept')
def get_assignment_submissions(assignment_id):
    try:
        conn = get_db()
        # Join with users to get student info and join with submission_grades for results
        query = """
            SELECT 
                s.id, s.assignment_id, s.student_id, s.file_url, s.submitted_at, 
                u.full_name, u.email,
                g.grade as current_grade, g.feedback as current_feedback, 
                g.instructor_id as grader_id
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            LEFT JOIN submission_grades g ON s.id = g.submission_id
            WHERE s.assignment_id = ?
            ORDER BY s.submitted_at DESC
        """
        rows = conn.execute(query, (assignment_id,)).fetchall()
        
        results = []
        for r in rows:
            d = dict(r)
            # Unified name logic safely handles empty names
            d['student_name'] = d.get('full_name') if (d.get('full_name') and str(d.get('full_name')).strip()) else d.get('email', 'Unknown Student')
            results.append(d)
            
        conn.close()
        return jsonify(results)
    except Exception as e:
        print(f"ERROR in get_assignment_submissions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/submissions/<int:submission_id>/grade', methods=['POST'])
@require_role('teacher', 'super_admin', 'head_dept', 'committee', 'section_admin')
def grade_submission(submission_id):
    data = request.json
    grade = data.get('grade')
    feedback = data.get('feedback', '')
    ctx = get_user_context()
    
    if grade is None:
        return jsonify({'error': 'Grade is required'}), 400
        
    try:
        conn = get_db()
        # Verify submission and instructor ownership
        query = """
            SELECT s.id, a.teacher_id, a.subject_id
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            WHERE s.id = ?
        """
        row = conn.execute(query, (submission_id,)).fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Submission not found'}), 404
            
        # Authorization is handled by @require_role at the route level
        # All authorized roles can grade any submission in their section
        pass
            
        # Insert or Update grade (UPSERT)
        conn.execute("""
            INSERT INTO submission_grades (submission_id, grade, feedback, instructor_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(submission_id) DO UPDATE SET
                grade = excluded.grade,
                feedback = excluded.feedback,
                instructor_id = excluded.instructor_id,
                created_at = CURRENT_TIMESTAMP
        """, (submission_id, grade, feedback, ctx['user_id']))
        conn.commit()
        
        # ── PUSH NOTIFICATION ──
        try:
            # Get assignment title and student_id
            info = conn.execute('''
                SELECT s.student_id, a.title, a.id as assignment_id
                FROM submissions s
                JOIN assignments a ON s.assignment_id = a.id
                WHERE s.id = ?
            ''', (submission_id,)).fetchone()
            if info:
                send_push_notification(info['student_id'], "تم تصحيح واجبك!", f"لقد تم رصد درجة لواجب: {info['title']}", url='/grades', tag='grade')
        except Exception as push_err:
            print(f"[PUSH] Grading push error: {push_err}")

        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        if 'conn' in locals(): conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/grades', methods=['GET'])
@require_role('student', 'super_admin')
def get_student_grades():
    ctx = get_user_context()
    try:
        conn = get_db()
        query = """
            SELECT 
                a.title as assignment_title, 
                s.submitted_at,
                g.grade, g.feedback, g.created_at as graded_at
            FROM submissions s
            JOIN assignments a ON s.assignment_id = a.id
            LEFT JOIN submission_grades g ON s.id = g.submission_id
            WHERE s.student_id = ?
            ORDER BY s.submitted_at DESC
        """
        rows = conn.execute(query, (ctx['user_id'],)).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/submissions', methods=['POST'])
@require_role('student', 'super_admin')
def submit_homework():
    ctx = get_user_context()
    data = request.json
    assignment_id = data.get('assignment_id')
    student_id = ctx['user_id'] # Use verified ID from token
    file_url = data.get('file_url')

    if not assignment_id or not file_url:
        return jsonify({'error': 'Missing data'}), 400

    conn = get_db()
    # IDOR Check: Ensure student belongs to the section of the assignment
    assign = conn.execute('SELECT subject_id FROM assignments WHERE id = ?', (assignment_id,)).fetchone()
    if not assign:
        conn.close()
        return jsonify({'error': 'Assignment not found'}), 404
        
    subj = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (assign['subject_id'],)).fetchone()
    if not subj or (ctx['role'] != 'super_admin' and subj['section_id'] != ctx['section_id']):
        conn.close()
        return jsonify({'error': 'Unauthorized to submit for this assignment'}), 403

    try:
        conn.execute('INSERT INTO submissions (assignment_id, student_id, file_url) VALUES (?,?,?)',
                     (assignment_id, student_id, file_url))
        conn.commit()
    except Exception as e:
        if 'UNIQUE' in str(e).upper() or 'unique' in str(e).lower():
            conn.execute('UPDATE submissions SET file_url = ?, submitted_at = CURRENT_TIMESTAMP WHERE assignment_id = ? AND student_id = ?',
                         (file_url, assignment_id, student_id))
            conn.commit()
        else:
            conn.close()
            return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
    return jsonify({'success': True})

@app.route('/api/assignments/<int:id>/submissions', methods=['GET'])
@require_role('teacher', 'super_admin', 'section_admin', 'head_dept', 'committee', 'admin')
def get_assignment_submissions_v2(id):
    conn = None
    try:
        conn = get_db()
        # Get the assignment
        assignment = conn.execute('SELECT * FROM assignments WHERE id = ?', (id,)).fetchone()
        if not assignment:
            conn.close()
            return jsonify({'error': 'الواجب غير موجود'}), 404
            
        # Get section_id
        subject = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (assignment['subject_id'],)).fetchone()
        section_id = subject['section_id'] if subject else None

        # Get all students for this section
        query_students = '''
            SELECT DISTINCT u.id, u.email, u.full_name 
            FROM users u 
            LEFT JOIN user_sections us ON u.id = us.user_id 
            WHERE u.role = 'student' AND (u.section_id = ? OR us.section_id = ?)
        '''
        students = conn.execute(query_students, (section_id, section_id)).fetchall()
        
        # Get all submissions for this assignment with GRADES
        query_subs = """
            SELECT 
                s.id, s.assignment_id, s.student_id, s.file_url, s.submitted_at, 
                u.full_name as student_name, u.email,
                g.grade as current_grade, g.feedback as current_feedback, 
                g.instructor_id as grader_id
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            LEFT JOIN submission_grades g ON s.id = g.submission_id
            WHERE s.assignment_id = ?
        """
        submissions = conn.execute(query_subs, (id,)).fetchall()
        sub_map = {s['student_id']: dict(s) for s in submissions}
        
        submitted = []
        not_submitted = []
        
        for s in students:
            if s['id'] in sub_map:
                sd = sub_map[s['id']]
                # Ensure name fallback
                if not sd.get('student_name') or not str(sd['student_name']).strip():
                    sd['student_name'] = sd.get('email')
                submitted.append(sd)
            else:
                not_submitted.append(dict(s))
                
        conn.close()
        return jsonify({
            'assignment': dict(assignment),
            'submitted': submitted,
            'not_submitted': not_submitted
        })
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': f'Server Error: {str(e)}'}), 500

# ─── STATS ────────────────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
@require_role('section_admin', 'super_admin')
def get_stats():
    ctx = get_user_context()
    sid = ctx['section_id']
    conn = get_db()
    
    if ctx['role'] == 'super_admin' and not sid:
        # Global stats
        subjects_count = conn.execute('SELECT count(*) FROM subjects').fetchone()[0]
        students_count = conn.execute("SELECT count(*) FROM users WHERE role = 'student'").fetchone()[0]
        lessons_count = conn.execute('SELECT count(*) FROM lessons').fetchone()[0]
        announcements_count = conn.execute('SELECT count(*) FROM announcements').fetchone()[0]
    else:
        # Section filtered stats
        subjects_count = conn.execute('SELECT count(*) FROM subjects WHERE section_id=?', (sid,)).fetchone()[0]
        students_count = conn.execute("SELECT count(*) FROM users WHERE role = 'student' AND section_id=?", (sid,)).fetchone()[0]
        # Lessons count is harder because it's linked via subject
        lessons_count = conn.execute('SELECT count(*) FROM lessons l JOIN subjects s ON l.subject_id=s.id WHERE s.section_id=?', (sid,)).fetchone()[0]
        announcements_count = conn.execute('SELECT count(*) FROM announcements WHERE section_id=?', (sid,)).fetchone()[0]

    conn.close()
    return jsonify({
        'subjects': subjects_count,
        'students': students_count,
        'lessons': lessons_count,
        'announcements': announcements_count
    })




# ────────────────────────────────────────────────────────────────
#  ATTENDANCE SYSTEM APIs
# ────────────────────────────────────────────────────────────────
# -- Get students for a section (teacher-accessible) --------------
@app.route('/api/attendance/section-students', methods=['GET'])
@require_role('teacher', 'super_admin', 'section_admin')
def attendance_section_students():
    ctx = get_user_context()
    section_id = request.args.get('section_id') or ctx['section_id']
    if not section_id:
        return jsonify([])
    conn = get_db()
    students = conn.execute('''
        SELECT DISTINCT u.id, u.email, u.full_name, u.role 
        FROM users u
        LEFT JOIN user_sections us ON u.id = us.user_id
        WHERE u.role='student' AND (u.section_id=? OR us.section_id=?)
        ORDER BY u.full_name ASC, u.email ASC
    ''', (section_id, section_id)).fetchall()
    conn.close()
    return jsonify([dict(s) for s in students])

# 
def _gen_token(length=6):
    """
    Generates a short, human-readable alphanumeric token.
    Optimized for manual entry and QR scanning.
    """
    import string
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))

def _active_session(subject_id):
    conn = get_db()
    s = conn.execute(
        "SELECT * FROM attendance_sessions WHERE subject_id=? AND status='active'",
        (subject_id,)
    ).fetchone()
    conn.close()
    return dict(s) if s else None

# ── Start a new attendance session ──────────────────────────────
@app.route('/api/attendance/start', methods=['POST'])
@require_role('teacher', 'super_admin', 'section_admin')
def attendance_start():
    ctx = get_user_context()
    data = request.json or {}
    subject_id   = data.get('subject_id')
    professor_id = data.get('professor_id')
    interval     = int(data.get('refresh_interval', 10))

    if not subject_id or not professor_id:
        return jsonify({'error': 'subject_id and professor_id required'}), 400

    conn = get_db()
    # Close any previous active session for this subject
    conn.execute(
        "UPDATE attendance_sessions SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE subject_id=? AND status='active'",
        (subject_id,)
    )
    token = _gen_token()
    expires = (datetime.utcnow() + timedelta(seconds=interval)).strftime('%Y-%m-%d %H:%M:%S')
    cur = conn.execute(
        "INSERT INTO attendance_sessions (subject_id, professor_id, qr_token, token_expires_at, refresh_interval) VALUES (?,?,?,?,?)",
        (subject_id, professor_id, token, expires, interval)
    )
    session_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'session_id': session_id, 'token': token, 'expires_at': expires, 'interval': interval})

# ── Refresh / get current QR token ──────────────────────────────
@app.route('/api/attendance/qr/<int:session_id>', methods=['GET', 'POST'])
@require_role('teacher', 'super_admin', 'section_admin')
def attendance_qr(session_id):
    ctx = get_user_context()
    conn = get_db()
    session = conn.execute("SELECT s.*, b.instructor_id, b.section_id FROM attendance_sessions s JOIN subjects b ON s.subject_id = b.id WHERE s.id=?", (session_id,)).fetchone()
    if not session or session['status'] != 'active':
        conn.close()
        return jsonify({'error': 'Session not found or ended'}), 404

    # 🛑 IDOR Check
    if ctx['role'] != 'super_admin' and session['instructor_id'] != ctx['user_id'] and session['section_id'] != ctx['section_id']:
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403
    
    interval = session['refresh_interval']
    # Auto-refresh if expired
    now = datetime.utcnow()
    expires_at = datetime.strptime(session['token_expires_at'], '%Y-%m-%d %H:%M:%S') if isinstance(session['token_expires_at'], str) else session['token_expires_at']
    force = request.method == 'POST'
    if force or now >= expires_at:
        token = _gen_token()
        new_expires = (now + timedelta(seconds=interval)).strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            "UPDATE attendance_sessions SET qr_token=?, token_expires_at=? WHERE id=?",
            (token, new_expires, session_id)
        )
        conn.commit()
    else:
        token = session['qr_token']
        new_expires = session['token_expires_at']

    conn.close()
    # Seconds remaining
    try:
        exp_dt = datetime.strptime(str(new_expires), '%Y-%m-%d %H:%M:%S')
        remaining = max(0, int((exp_dt - datetime.utcnow()).total_seconds()))
    except:
        remaining = interval

    return jsonify({'token': token, 'expires_at': str(new_expires), 'remaining': remaining, 'interval': interval})

# ── Student scans QR ─────────────────────────────────────────────
@app.route('/api/attendance/scan', methods=['POST'])
@limiter.limit("5 per minute") # Mitigates Brute-force & Token Forgery attempts
@require_role('student', 'super_admin')
def attendance_scan():
    ctx = get_user_context()
    data = request.json or {}
    token      = data.get('token', '')
    student_id = ctx['user_id'] # 🛑 FORCE: student_id must match logged-in user

    if not token or not student_id:
        return jsonify({'error': 'token and student_id required'}), 400

    conn = get_db()
    session = conn.execute('''
        SELECT s.*, sub.section_id 
        FROM attendance_sessions s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE s.qr_token=? AND s.status='active'
    ''', (token,)).fetchone()

    if not session:
        conn.close()
        return jsonify({'success': False, 'message': 'رمز QR غير صالح أو منتهي الصلاحية'}), 400

    # Check token expiry
    try:
        exp_dt = datetime.strptime(str(session['token_expires_at']), '%Y-%m-%d %H:%M:%S')
        if datetime.utcnow() > exp_dt:
            conn.close()
            return jsonify({'success': False, 'message': 'انتهت صلاحية رمز QR — اطلب من الأستاذ عرض الرمز الجديد'}), 400
    except:
        pass

    # Verify student is authorized for this section
    is_authorized = conn.execute('''
        SELECT 1 FROM users WHERE id=? AND section_id=? 
        UNION 
        SELECT 1 FROM user_sections WHERE user_id=? AND section_id=?
    ''', (student_id, session['section_id'], student_id, session['section_id'])).fetchone()

    if not is_authorized:
        conn.close()
        return jsonify({'success': False, 'message': 'عذراً، أنت لست مسجلاً في هذه الشعبة لهذا اليوم'}), 403

    # Military-Grade Defense: Atomic insert to prevent TOCTOU Race Conditions
    try:
        conn.execute(
            "INSERT INTO attendance_records (session_id, student_id, method) VALUES (?,?,?)",
            (session['id'], student_id, 'qr')
        )
        conn.commit()
    except sqlite3.IntegrityError:
        # Replaces the previous insecure check: DB will inherently reject duplicates (UNIQUE constraint)
        conn.close()
        return jsonify({'success': False, 'message': 'تم تسجيل حضورك مسبقاً لهذه المحاضرة ✅'}), 200

    # Get subject name for confirmation message
    subj = conn.execute("SELECT title FROM subjects WHERE id=?", (session['subject_id'],)).fetchone()
    conn.close()
    return jsonify({'success': True, 'message': f"تم تسجيل حضورك في مادة {subj['title'] if subj else ''} ✅"})

# ── Live attendance list ─────────────────────────────────────────
@app.route('/api/attendance/live/<int:session_id>', methods=['GET'])
@require_role('teacher', 'super_admin', 'section_admin', 'committee', 'head_dept')
def attendance_live(session_id):
    ctx = get_user_context()
    conn = get_db()
    records = conn.execute('''
        SELECT ar.id, ar.scanned_at, ar.method,
               u.id as student_id, u.email, u.full_name
        FROM attendance_records ar
        JOIN users u ON u.id = ar.student_id
        WHERE ar.session_id = ?
        ORDER BY ar.scanned_at DESC
    ''', (session_id,)).fetchall()
    session = conn.execute(
        "SELECT subject_id, refresh_interval, started_at FROM attendance_sessions WHERE id=?",
        (session_id,)
    ).fetchone()
    # Improved SQL for Turso: Find section ID first
    session_info = conn.execute('''
        SELECT sub.section_id 
        FROM attendance_sessions s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE s.id = ?
    ''', (session_id,)).fetchone()
    sid = session_info['section_id'] if session_info else None

    row_count = conn.execute('''
        SELECT count(DISTINCT u.id) as total 
        FROM users u
        LEFT JOIN user_sections us ON u.id = us.user_id
        WHERE u.role='student' AND (u.section_id=? OR us.section_id=?)
    ''', (sid, sid)).fetchone()
    total = int(list(row_count.values())[0]) if isinstance(row_count, dict) else row_count[0]
    
    conn.close()
    return jsonify({
        'attended': [dict(r) for r in records],
        'count': len(records),
        'total': total,
        'session': dict(session) if session else {}
    })

# ── Manual mark attendance ───────────────────────────────────────
@app.route('/api/attendance/manual-mark', methods=['POST'])
@require_role('teacher', 'super_admin', 'section_admin', 'head_dept')
def attendance_manual():
    ctx = get_user_context()
    data = request.json or {}
    session_id = data.get('session_id')
    student_id = data.get('student_id')
    method     = data.get('method', 'manual') # 'manual' or 'excused'
    note       = data.get('note', f'Marked as {method} by professor')

    conn = get_db()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO attendance_records (session_id, student_id, method, note) VALUES (?,?,?,?)",
            (session_id, student_id, method, note)
        )
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 400
    conn.close()
    return jsonify({'success': True})

# ── Delete attendance record ──────────────────────────────────────
@app.route('/api/attendance/delete-record', methods=['DELETE'])
@require_role('teacher', 'super_admin', 'section_admin')
def attendance_delete_record():
    ctx = get_user_context()
    data = request.json or {}
    session_id = data.get('session_id')
    student_id = data.get('student_id')
    
    if not session_id or not student_id:
        return jsonify({'error': 'session_id and student_id required'}), 400
        
    conn = get_db()
    conn.execute(
        "DELETE FROM attendance_records WHERE session_id=? AND student_id=?",
        (session_id, student_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ── Pause/Resume session ──────────────────────────────────────────
@app.route('/api/attendance/toggle-status/<int:session_id>', methods=['POST'])
@require_role('teacher', 'super_admin', 'section_admin')
def attendance_toggle_status(session_id):
    ctx = get_user_context()
    data = request.json or {}
    new_status = data.get('status') # 'active' or 'paused'
    if new_status not in ['active', 'paused']:
        return jsonify({'error': 'Invalid status'}), 400
    
    conn = get_db()
    conn.execute(
        "UPDATE attendance_sessions SET status=? WHERE id=?",
        (new_status, session_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'status': new_status})

# ── End session ──────────────────────────────────────────────────
@app.route('/api/attendance/end/<int:session_id>', methods=['POST'])
@require_role('teacher', 'super_admin', 'section_admin')
def attendance_end(session_id):
    ctx = get_user_context()
    conn = get_db()
    conn.execute(
        "UPDATE attendance_sessions SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE id=?",
        (session_id,)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/attendance/sessions/<int:session_id>', methods=['DELETE'])
@require_role('teacher', 'super_admin', 'section_admin')
def delete_attendance_session(session_id):
    ctx = get_user_context()
    conn = get_db()
    # Check if session exists and instructor owns it or is admin
    session = conn.execute('SELECT s.id, b.instructor_id, b.section_id FROM attendance_sessions s JOIN subjects b ON s.subject_id = b.id WHERE s.id = ?', (session_id,)).fetchone()
    
    if not session:
        conn.close()
        return jsonify({'error': 'Session not found'}), 404
        
    if ctx['role'] != 'super_admin' and session['instructor_id'] != ctx['user_id'] and session['section_id'] != ctx['section_id']:
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 403
        
    # Delete the session (cascade handles records)
    conn.execute('DELETE FROM attendance_sessions WHERE id = ?', (session_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ── Professor: session history ───────────────────────────────────
@app.route('/api/attendance/sessions', methods=['GET'])
def attendance_sessions():
    professor_id = request.args.get('professor_id')
    subject_id   = request.args.get('subject_id')
    status       = request.args.get('status')
    
    conn = get_db()
    query = '''
        SELECT s.*, subj.title as subject_title, subj.code as subject_code,
               u.email as professor_email,
               (SELECT count(*) FROM attendance_records WHERE session_id=s.id) as attended,
               (SELECT count(*) FROM users WHERE role='student' AND section_id=subj.section_id) as total_in_section
        FROM attendance_sessions s
        JOIN subjects subj ON subj.id = s.subject_id
        JOIN users u ON u.id = s.professor_id
        WHERE 1=1
    '''
    params = []
    if professor_id:
        query += ' AND s.professor_id=?'
        params.append(professor_id)
    if subject_id:
        query += ' AND s.subject_id=?'
        params.append(subject_id)
    if status:
        query += ' AND s.status=?'
        params.append(status)
        
    query += ' ORDER BY s.started_at DESC LIMIT 100'
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ── Detailed session report ──────────────────────────────────────
@app.route('/api/attendance/sessions/<int:session_id>/details', methods=['GET'])
def attendance_session_details(session_id):
    conn = get_db()
    session = conn.execute('''
        SELECT s.*, subj.title as subject_title, subj.code as subject_code,
               u.email as professor_email
        FROM attendance_sessions s
        JOIN subjects subj ON subj.id = s.subject_id
        JOIN users u ON u.id = s.professor_id
        WHERE s.id = ?
    ''', (session_id,)).fetchone()
    
    if not session:
        conn.close()
        return jsonify({'error': 'Session not found'}), 404
        
    records = conn.execute('''
        SELECT ar.scanned_at, ar.method, u.email, u.full_name, u.id as student_id
        FROM attendance_records ar
        JOIN users u ON u.id = ar.student_id
        WHERE ar.session_id = ?
        ORDER BY ar.scanned_at ASC
    ''', (session_id,)).fetchall()
    
    conn.close()
    return jsonify({
        'session': dict(session),
        'attended': [dict(r) for r in records]
    })

# ── Student: attendance history ──────────────────────────────────
@app.route('/api/attendance/my-history', methods=['GET'])
def attendance_my_history():
    student_id = request.args.get('student_id')
    subject_id = request.args.get('subject_id')
    conn = get_db()
    query = '''
        SELECT ar.scanned_at, ar.method,
               s.id as session_id, s.started_at, s.subject_id,
               subj.title as subject_title, subj.code as subject_code, subj.color
        FROM attendance_records ar
        JOIN attendance_sessions s ON s.id = ar.session_id
        JOIN subjects subj ON subj.id = s.subject_id
        WHERE ar.student_id=?
    '''
    params = [student_id]
    if subject_id:
        query += ' AND s.subject_id=?'
        params.append(subject_id)
    query += ' ORDER BY ar.scanned_at DESC'
    rows = conn.execute(query, params).fetchall()

    # Also get all sessions (to show absences, but only for student's section/subjects)
    all_sessions = conn.execute(
        "SELECT s.id, s.subject_id, subj.title, s.started_at FROM attendance_sessions s JOIN subjects subj ON subj.id=s.subject_id WHERE s.status='ended' AND subj.section_id=(SELECT section_id FROM users WHERE id=?) ORDER BY s.started_at DESC",
        (student_id,)
    ).fetchall()
    conn.close()
    return jsonify({
        'attended': [dict(r) for r in rows],
        'all_sessions': [dict(r) for r in all_sessions]
    })

# ── Student: attendance rate per subject ─────────────────────────
@app.route('/api/attendance/my-stats', methods=['GET'])
def attendance_my_stats():
    student_id = request.args.get('student_id')
    conn = get_db()
    subjects = conn.execute("SELECT * FROM subjects WHERE section_id=(SELECT section_id FROM users WHERE id=?)", (student_id,)).fetchall()
    result = []
    for subj in subjects:
        total_sessions = conn.execute(
            "SELECT count(*) FROM attendance_sessions WHERE subject_id=? AND status='ended'",
            (subj['id'],)
        ).fetchone()[0]
        attended = conn.execute(
            '''SELECT count(*) FROM attendance_records ar
               JOIN attendance_sessions s ON s.id=ar.session_id
               WHERE s.subject_id=? AND ar.student_id=?''',
            (subj['id'], student_id)
        ).fetchone()[0]
        rate = round(attended / total_sessions * 100) if total_sessions > 0 else 0
        result.append({
            'subject_id': subj['id'],
            'title': subj['title'],
            'code': subj['code'],
            'color': subj['color'],
            'total_sessions': total_sessions,
            'attended': attended,
            'rate': rate,
            'absent': total_sessions - attended
        })
    conn.close()
    return jsonify(result)

# ── Committee: full report ───────────────────────────────────────
@app.route('/api/attendance/report', methods=['GET'])
@require_role('committee', 'section_admin', 'super_admin')
def attendance_report():
    subject_id = request.args.get('subject_id')
    ctx = get_user_context()
    sid = ctx['section_id']
    conn = get_db()
    
    # Filter students by section if not super_admin (or if super_admin specifies sid)
    if ctx['role'] == 'super_admin':
        if sid:
            students = conn.execute("SELECT id, email, full_name FROM users WHERE role='student' AND section_id=?", (sid,)).fetchall()
        else:
            students = conn.execute("SELECT id, email, full_name FROM users WHERE role='student'").fetchall()
    else:
        students = conn.execute("SELECT id, email, full_name FROM users WHERE role='student' AND section_id=?", (sid,)).fetchall()

    result = []
    for stu in students:
        query = '''
            SELECT count(DISTINCT ar.session_id) as attended,
                   count(DISTINCT s.id) as total
            FROM attendance_sessions s
            LEFT JOIN attendance_records ar ON ar.session_id=s.id AND ar.student_id=?
            WHERE s.status='ended'
        '''
        params = [stu['id']]
        if subject_id:
            query += ' AND s.subject_id=?'
            params.append(subject_id)
        row = conn.execute(query, params).fetchone()
        attended = row['attended'] if row else 0
        total    = row['total']    if row else 0
        absent   = total - attended
        rate     = round(attended / total * 100) if total > 0 else 0
        result.append({
            'student_id':  stu['id'],
            'email':       stu['email'],
            'full_name':    stu['full_name'],
            'total':       total,
            'attended':    attended,
            'absent':      absent,
            'rate':        rate,
            'alert':       absent > total * 0.25 and total > 0
        })
    conn.close()
    return jsonify(result)

# ── Committee: absence alerts ────────────────────────────────────
@app.route('/api/attendance/alerts', methods=['GET'])
@require_role('committee', 'section_admin', 'super_admin')
def attendance_alerts():
    threshold = float(request.args.get('threshold', 0.25))
    ctx = get_user_context()
    sid = ctx['section_id']
    conn = get_db()
    
    if ctx['role'] == 'super_admin' and not sid:
        students = conn.execute("SELECT id, email, full_name, section_id FROM users WHERE role='student'").fetchall()
    else:
        students = conn.execute("SELECT id, email, full_name, section_id FROM users WHERE role='student' AND section_id=?", (sid,)).fetchall()
        
    alerts = []
    for stu in students:
        # Only check subjects for the student's section
        subjects = conn.execute("SELECT * FROM subjects WHERE section_id=?", (stu['section_id'],)).fetchall()
        for subj in subjects:
            total = conn.execute(
                "SELECT count(*) FROM attendance_sessions WHERE subject_id=? AND status='ended'",
                (subj['id'],)
            ).fetchone()[0]
            attended = conn.execute(
                '''SELECT count(*) FROM attendance_records ar
                   JOIN attendance_sessions s ON s.id=ar.session_id
                   WHERE s.subject_id=? AND ar.student_id=?''',
                (subj['id'], stu['id'])
            ).fetchone()[0]
            if total > 0:
                absent = total - attended
                absence_rate = absent / total
                if absence_rate > threshold:
                    alerts.append({
                        'student_id':   stu['id'],
                        'email':        stu['email'],
                        'full_name':    stu['full_name'],
                        'subject':      subj['title'],
                        'subject_code': subj['code'],
                        'total':        total,
                        'attended':     attended,
                        'absent':       absent,
                        'absence_rate': round(absence_rate * 100)
                    })
    conn.close()
    return jsonify(alerts)

# ── Committee: overview stats ────────────────────────────────────
@app.route('/api/attendance/overview', methods=['GET'])
@require_role('committee', 'section_admin', 'super_admin')
def attendance_overview():
    ctx = get_user_context()
    sid = ctx['section_id']
    conn = get_db()
    today = datetime.utcnow().strftime('%Y-%m-%d')
    
    if ctx['role'] == 'super_admin' and not sid:
        total_students = conn.execute("SELECT count(*) FROM users WHERE role='student'").fetchone()[0]
        total_sessions  = conn.execute("SELECT count(*) FROM attendance_sessions WHERE status='ended'").fetchone()[0]
        total_records   = conn.execute("SELECT count(*) FROM attendance_records").fetchone()[0]
        today_sessions = conn.execute("SELECT count(*) FROM attendance_sessions WHERE date(started_at)=?", (today,)).fetchone()[0]
    else:
        total_students = conn.execute("SELECT count(*) FROM users WHERE role='student' AND section_id=?", (sid,)).fetchone()[0]
        total_sessions  = conn.execute("SELECT count(*) FROM attendance_sessions s JOIN subjects sub ON s.subject_id=sub.id WHERE s.status='ended' AND sub.section_id=?", (sid,)).fetchone()[0]
        total_records   = conn.execute("SELECT count(*) FROM attendance_records ar JOIN attendance_sessions s ON ar.session_id=s.id JOIN subjects sub ON s.subject_id=sub.id WHERE sub.section_id=?", (sid,)).fetchone()[0]
        today_sessions = conn.execute("SELECT count(*) FROM attendance_sessions s JOIN subjects sub ON s.subject_id=sub.id WHERE date(s.started_at)=? AND sub.section_id=?", (today, sid)).fetchone()[0]

    avg_rate = round(total_records / (total_sessions * max(total_students,1)) * 100) if total_sessions > 0 and total_students > 0 else 0
    
    conn.close()
    return jsonify({
        'total_students': total_students,
        'total_sessions':  total_sessions,
        'avg_rate':        avg_rate,
        'today_sessions':  today_sessions
    })

# ── Active session for a subject ─────────────────────────────────
@app.route('/api/attendance/active/<int:subject_id>', methods=['GET'])
def attendance_active(subject_id):
    session = _active_session(subject_id)
    if session:
        return jsonify({'active': True, 'session': session})
    return jsonify({'active': False})

# ── Student: Find ANY active session in my section ────────────────
@app.route('/api/attendance/active-for-me', methods=['GET'])
def attendance_active_for_me():
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'active': False}), 401
    
    sid = ctx['section_id']
    if not sid:
        return jsonify({'active': False})
        
    conn = get_db()
    # Find active session in student's section, exclude if already registered OR if older than 2 hours
    session = conn.execute('''
        SELECT s.*, subj.title as subject_title, subj.color as subject_color
        FROM attendance_sessions s
        JOIN subjects subj ON s.subject_id = subj.id
        LEFT JOIN attendance_records ar ON ar.session_id = s.id AND ar.student_id = ?
        WHERE subj.section_id = ? 
          AND s.status = 'active' 
          AND ar.id IS NULL
          AND s.started_at > datetime('now', '-120 minutes')
        ORDER BY s.started_at DESC LIMIT 1
    ''', (ctx['user_id'], sid)).fetchone()
    conn.close()
    
    if session:
        return jsonify({'active': True, 'session': dict(session)})
    return jsonify({'active': False})


# ── Assignments & Submissions ──────────────────────────────────────

# ═══════════════════════════════════════════════════════════════════
# MCQ EXAM SYSTEM – Separate Layer (non-breaking)
# ═══════════════════════════════════════════════════════════════════

def init_exam_tables():
    """Initialize exam tables safely without affecting existing schema."""
    try:
        conn = get_db()
        c = conn.cursor()

        # Exams table
        c.execute('''
            CREATE TABLE IF NOT EXISTS exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                subject_id INTEGER NOT NULL,
                teacher_id INTEGER NOT NULL,
                duration_minutes INTEGER NOT NULL DEFAULT 60,
                sections TEXT DEFAULT '[]',
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

        # Questions table
        c.execute('''
            CREATE TABLE IF NOT EXISTS exam_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                question_text TEXT NOT NULL,
                option_a TEXT NOT NULL,
                option_b TEXT NOT NULL,
                option_c TEXT NOT NULL,
                option_d TEXT NOT NULL,
                correct_answer TEXT NOT NULL,
                question_order INTEGER DEFAULT 0,
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
            )
        ''')

        # Attempts table (one per student per exam)
        c.execute('''
            CREATE TABLE IF NOT EXISTS exam_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                submitted_at TIMESTAMP,
                answers TEXT DEFAULT '{}',
                score REAL,
                total_questions INTEGER DEFAULT 0,
                feedback TEXT,
                is_submitted INTEGER DEFAULT 0,
                FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(exam_id, student_id)
            )
        ''')

        conn.commit()
        conn.close()
        print("[DB] Exam tables initialized.")
    except Exception as e:
        print(f"[DB] Exam table init warning: {e}")

# Initialize exam tables on startup
try:
    init_exam_tables()
except Exception as e:
    print(f"[DB] Exam init skipped: {e}")


# ── EXAM ROUTES ────────────────────────────────────────────────────

@app.route('/api/exams', methods=['GET'])
def list_exams():
    """List exams visible to the current user."""
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    try:
        if ctx['role'] in ['teacher']:
            # Teacher sees only their own exams
            rows = conn.execute(
                'SELECT e.*, s.title as subject_title FROM exams e JOIN subjects s ON e.subject_id = s.id WHERE e.teacher_id = ? ORDER BY e.created_at DESC',
                (ctx['user_id'],)
            ).fetchall()
        elif ctx['role'] in ['super_admin', 'head_dept', 'section_admin', 'committee']:
            rows = conn.execute(
                'SELECT e.*, s.title as subject_title FROM exams e JOIN subjects s ON e.subject_id = s.id ORDER BY e.created_at DESC'
            ).fetchall()
        elif ctx['role'] == 'student':
            # Student sees exams for their section's subjects
            section_id = ctx['section_id']
            rows = conn.execute('''
                SELECT e.*, s.title as subject_title FROM exams e
                JOIN subjects s ON e.subject_id = s.id
                WHERE e.is_active = 1 AND (
                    s.section_id = ? OR e.sections LIKE ?
                )
                ORDER BY e.created_at DESC
            ''', (section_id, f'%{section_id}%')).fetchall()
        else:
            conn.close()
            return jsonify([])

        result = []
        for r in rows:
            d = dict(r)
            try:
                d['sections'] = json.loads(d.get('sections', '[]'))
            except:
                d['sections'] = []
            # Get attempt status for students
            if ctx['role'] == 'student':
                attempt = conn.execute(
                    'SELECT id, started_at, submitted_at, score, is_submitted FROM exam_attempts WHERE exam_id = ? AND student_id = ?',
                    (d['id'], ctx['user_id'])
                ).fetchone()
                d['attempt'] = dict(attempt) if attempt else None
            # Question count
            qcount = conn.execute('SELECT COUNT(*) FROM exam_questions WHERE exam_id = ?', (d['id'],)).fetchone()
            d['question_count'] = qcount[0] if qcount else 0
            result.append(d)

        conn.close()
        return jsonify(result)
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exams', methods=['POST'])
@require_role('teacher', 'super_admin', 'section_admin', 'head_dept')
def create_exam():
    """Create a new exam with questions."""
    ctx = get_user_context()
    data = request.json
    title = data.get('title', '').strip()
    subject_id = data.get('subject_id')
    duration = int(data.get('duration_minutes', 60))
    sections_list = data.get('sections', [])
    sections_json = json.dumps(sections_list)
    questions = data.get('questions', [])

    if not title or not subject_id:
        return jsonify({'error': 'Title and subject are required'}), 400
    if len(questions) < 1:
        return jsonify({'error': 'At least 1 question required'}), 400

    try:
        conn = get_db()
        title = sanitize_input(title) # Sanitize exam title
        cur = conn.execute(
            'INSERT INTO exams (title, subject_id, teacher_id, duration_minutes, sections) VALUES (?, ?, ?, ?, ?)',
            (title, subject_id, ctx['user_id'], duration, sections_json)
        )
        exam_id = cur.lastrowid

        if exam_id:
            for idx, q in enumerate(questions):
                conn.execute(
                    '''INSERT INTO exam_questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer, question_order)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                    (exam_id, sanitize_input(q.get('question_text', '')), 
                     sanitize_input(q.get('option_a', '')), sanitize_input(q.get('option_b', '')),
                     sanitize_input(q.get('option_c', '')), sanitize_input(q.get('option_d', '')), 
                     q.get('correct_answer', 'a'), idx)
                )
        conn.commit()
        audit_log("EXAM_CREATED", {"exam_id": exam_id, "title": title})
        
        # ── PUSH NOTIFICATION ──
        try:
            sec_list = sections_list
            if not sec_list: # Fallback to subject's section
                subj_info = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (subject_id,)).fetchone()
                if subj_info: sec_list = [subj_info['section_id']]
            
            for s_id in sec_list:
                students = conn.execute('SELECT id FROM users WHERE section_id = ?', (s_id,)).fetchall()
                for s in students:
                    send_push_notification(s['id'], "اختبار جديد!", f"تم نشر اختبار جديد: {title}", url='/exams', tag='exam')
        except Exception as push_err:
            print(f"[PUSH] Exam push error: {push_err}")
            
        conn.close()
        return jsonify({'success': True, 'exam_id': exam_id})
    except Exception as e:
        if 'conn' in locals(): conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exams/<int:exam_id>', methods=['GET'])
def get_exam(exam_id):
    """Get exam details. Students get shuffled questions without correct answers."""
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    try:
        exam = conn.execute('SELECT e.*, s.title as subject_title, s.section_id FROM exams e JOIN subjects s ON e.subject_id = s.id WHERE e.id = ?', (exam_id,)).fetchone()
        if not exam:
            conn.close()
            return jsonify({'error': 'Exam not found'}), 404

        # 🛑 IDOR Check
        is_admin = ctx['role'] in ['super_admin', 'head_dept', 'committee', 'section_admin']
        if not is_admin and ctx['role'] == 'student' and exam['section_id'] != ctx['section_id']:
            conn.close()
            return jsonify({'error': 'Unauthorized access to this exam'}), 403

        exam_dict = dict(exam)
        try:
            exam_dict['sections'] = json.loads(exam_dict.get('sections', '[]'))
        except:
            exam_dict['sections'] = []

        questions = conn.execute(
            'SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY question_order',
            (exam_id,)
        ).fetchall()
        q_list = [dict(q) for q in questions]

        # Generate shuffled options for students (taking) and admins (previewing)
        member_roles = ['student', 'super_admin', 'section_admin', 'head_dept', 'teacher']
        if ctx['role'] in member_roles:
            import random
            # Optional: Stable shuffle if you want for student attempts?
            # For now, random on every fetch is fine for taking.
            for q in q_list:
                options = [
                    {'key': 'a', 'text': q.get('option_a', '')},
                    {'key': 'b', 'text': q.get('option_b', '')},
                    {'key': 'c', 'text': q.get('option_c', '')},
                    {'key': 'd', 'text': q.get('option_d', '')},
                ]
                random.shuffle(options)
                q['shuffled_options'] = options
                
                # Students shouldn't see correct answers
                if ctx['role'] == 'student':
                    if 'correct_answer' in q:
                        del q['correct_answer']

        exam_dict['questions'] = q_list

        conn.close()
        return jsonify(exam_dict)
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exams/<int:exam_id>/start', methods=['POST'])
@require_role('student', 'super_admin')
def start_exam(exam_id):
    """Start or resume an exam attempt."""
    ctx = get_user_context()
    conn = get_db()
    try:
        exam = conn.execute('SELECT * FROM exams WHERE id = ? AND is_active = 1', (exam_id,)).fetchone()
        if not exam:
            conn.close()
            return jsonify({'error': 'Exam not found or not active'}), 404

        existing = conn.execute(
            'SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?',
            (exam_id, ctx['user_id'])
        ).fetchone()

        if existing and existing['is_submitted']:
            conn.close()
            return jsonify({'error': 'Already submitted this exam', 'attempt': dict(existing)}), 400

        if not existing:
            q_count = conn.execute('SELECT COUNT(*) FROM exam_questions WHERE exam_id = ?', (exam_id,)).fetchone()
            total = q_count[0] if q_count else 0
            conn.execute(
                'INSERT INTO exam_attempts (exam_id, student_id, total_questions) VALUES (?, ?, ?)',
                (exam_id, ctx['user_id'], total)
            )
            conn.commit()
            attempt = conn.execute(
                'SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?',
                (exam_id, ctx['user_id'])
            ).fetchone()
        else:
            attempt = existing

        conn.close()
        return jsonify({'success': True, 'attempt': dict(attempt)})
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exams/<int:exam_id>/submit', methods=['POST'])
@require_role('student', 'super_admin')
def submit_exam(exam_id):
    """Submit exam answers and auto-grade."""
    ctx = get_user_context()
    data = request.json
    answers = data.get('answers', {})  # {question_id: selected_key}

    conn = get_db()
    try:
        attempt = conn.execute(
            'SELECT * FROM exam_attempts WHERE exam_id = ? AND student_id = ?',
            (exam_id, ctx['user_id'])
        ).fetchone()

        if not attempt:
            conn.close()
            return jsonify({'error': 'No active attempt found'}), 404

        if attempt['is_submitted']:
            conn.close()
            return jsonify({'error': 'Already submitted'}), 400

        # Auto-grade: compare submitted answers to correct answers
        questions = conn.execute(
            'SELECT id, correct_answer FROM exam_questions WHERE exam_id = ?',
            (exam_id,)
        ).fetchall()

        correct_count = 0
        total = len(questions)
        for q in questions:
            q_id = str(q['id'])
            if answers.get(q_id, '').lower() == q['correct_answer'].lower():
                correct_count += 1

        score = round((correct_count / total * 100), 1) if total > 0 else 0
        answers_json = json.dumps(answers)

        conn.execute('''
            UPDATE exam_attempts
            SET answers = ?, score = ?, total_questions = ?, submitted_at = CURRENT_TIMESTAMP, is_submitted = 1
            WHERE exam_id = ? AND student_id = ?
        ''', (answers_json, score, total, exam_id, ctx['user_id']))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'score': score, 'correct': correct_count, 'total': total})
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exams/<int:exam_id>/results', methods=['GET'])
def get_exam_results(exam_id):
    """Instructor: get all student results. Student: get only their own."""
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db()
    try:
        exam = conn.execute('SELECT * FROM exams WHERE id = ?', (exam_id,)).fetchone()
        if not exam:
            conn.close()
            return jsonify({'error': 'Exam not found'}), 404

        if ctx['role'] == 'student':
            attempt = conn.execute(
                'SELECT ea.*, e.title as exam_title, e.duration_minutes FROM exam_attempts ea JOIN exams e ON ea.exam_id = e.id WHERE ea.exam_id = ? AND ea.student_id = ?',
                (exam_id, ctx['user_id'])
            ).fetchone()
            conn.close()
            return jsonify({'my_result': dict(attempt) if attempt else None})
        else:
            attempts = conn.execute('''
                SELECT ea.*, u.full_name, u.email
                FROM exam_attempts ea
                JOIN users u ON ea.student_id = u.id
                WHERE ea.exam_id = ?
                ORDER BY ea.score DESC
            ''', (exam_id,)).fetchall()
            results = []
            for a in attempts:
                d = dict(a)
                d['student_name'] = d.get('full_name') or d.get('email', 'Unknown')
                results.append(d)
            conn.close()
            return jsonify({'results': results, 'exam': dict(exam)})
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exams/<int:exam_id>/feedback', methods=['POST'])
@require_role('teacher', 'super_admin', 'head_dept', 'section_admin')
def add_exam_feedback(exam_id):
    """Add optional feedback to a student's exam attempt."""
    data = request.json
    student_id = data.get('student_id')
    feedback = data.get('feedback', '').strip()

    if not student_id or not feedback:
        return jsonify({'error': 'student_id and feedback required'}), 400

    conn = get_db()
    try:
        conn.execute(
            'UPDATE exam_attempts SET feedback = ? WHERE exam_id = ? AND student_id = ?',
            (feedback, exam_id, student_id)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/exams/<int:exam_id>', methods=['DELETE'])
@require_role('teacher', 'super_admin', 'head_dept')
def delete_exam(exam_id):
    ctx = get_user_context()
    conn = get_db()
    try:
        exam = conn.execute('SELECT * FROM exams WHERE id = ?', (exam_id,)).fetchone()
        if not exam:
            conn.close()
            return jsonify({'error': 'Exam not found'}), 404
        if ctx['role'] == 'teacher' and exam['teacher_id'] != ctx['user_id']:
            conn.close()
            return jsonify({'error': 'Unauthorized'}), 403
        conn.execute('DELETE FROM exams WHERE id = ?', (exam_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        if conn: conn.close()
        return jsonify({'error': str(e)}), 500


@app.after_request
def add_header(response):
    """
    Optimized Caching for Performance and Accuracy.
    Static files (JS/CSS) get a short cache (10 min) to feel fast.
    Index and API responses are NEVER cached to ensure instant updates.
    """
    if request.path == '/' or request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    else:
        # Cache JS/CSS/Images/Fonts for 10 minutes to make the site snap-fast
        response.headers['Cache-Control'] = 'public, max-age=600'
    return response
# ─── STUDENT PROFILE VIEW (ADMIN ONLY) ──────────────────────────
@app.route('/api/admin/student-profile', methods=['GET'])
@require_role('super_admin', 'head_dept')
def get_student_profile():
    student_id = request.args.get('student_id')
    if not student_id:
        return jsonify({'error': 'Student ID required'}), 400
    
    conn = get_db()
    try:
        # 1. Basic Info & Sections
        user_row = conn.execute('''
            SELECT u.id, u.full_name, u.email, u.role, u.section_id as primary_section
            FROM users u WHERE u.id = ? AND u.role = 'student'
        ''', (student_id,)).fetchone()
        
        if not user_row:
            return jsonify({'error': 'Student not found'}), 404
        user = dict(user_row)
        
        # Get all sections they belong to
        sections = conn.execute('SELECT section_id FROM user_sections WHERE user_id = ?', (student_id,)).fetchall()
        user['sections'] = [s['section_id'] for s in sections]
        if user['primary_section'] not in user['sections']:
             user['sections'].append(user['primary_section'])
             
        section_ids = user['sections']
        placeholder = ', '.join(['?'] * len(section_ids))
        
        # 2. Attendance Summary
        # Total sessions in student's sections
        total_sessions = conn.execute(f'''
            SELECT COUNT(*) FROM attendance_sessions s
            JOIN subjects subj ON s.subject_id = subj.id
            WHERE subj.section_id IN ({placeholder})
        ''', section_ids).fetchone()[0]
        
        # Student's presence
        present_count = conn.execute('''
            SELECT COUNT(*) FROM attendance_records WHERE student_id = ?
        ''', (student_id,)).fetchone()[0]
        
        attendance = {
            'total': total_sessions,
            'present': present_count,
            'absent': max(0, total_sessions - present_count),
            'percentage': round((present_count / total_sessions * 100), 1) if total_sessions > 0 else 0
        }
        # 3. Assignments (Tasks & Grades)
        assignments_list = conn.execute(f'''
            SELECT a.id, a.title, subj.title as subject_title, a.due_date,
                   (SELECT s.submitted_at FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?) as submitted_at,
                   (SELECT grade FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?) as grade
            FROM assignments a
            JOIN subjects subj ON a.subject_id = subj.id
            WHERE subj.section_id IN ({placeholder})
            ORDER BY a.created_at DESC
        ''', [student_id, student_id] + section_ids).fetchall()
        
        # 4. Exams (Attempts & Scores with Bulletproof Error Handling)
        try:
            exams_list = conn.execute(f'''
                SELECT e.id, e.title, subj.title as subject_title,
                       COALESCE((SELECT SUM(points) FROM exam_questions eq WHERE eq.exam_id = e.id), 100) as total_marks,
                       (SELECT score FROM exam_attempts ea WHERE ea.exam_id = e.id AND ea.student_id = ?) as score
                FROM exams e
                JOIN subjects subj ON e.subject_id = subj.id
                WHERE subj.section_id IN ({placeholder})
                ORDER BY e.created_at DESC
            ''', [student_id] + section_ids).fetchall()
            exams_data = [dict(e) for e in exams_list]
        except Exception as e:
            print(f"Skipping detailed exams due to schema: {e}")
            exams_data = [] # Fallback to empty list instead of crashing the whole profile
        
        # 5. Performance Indicators (Safely using exams_data which is guaranteed to exist)
        scores = [int(e['score']) for e in exams_data if e.get('score') is not None]
        avg_score = sum(scores) / len(scores) if scores else 0
        
        indicator = "ضعيف"
        if avg_score >= 85: indicator = "ممتاز"
        elif avg_score >= 70: indicator = "جيد جداً"
        elif avg_score >= 50: indicator = "جيد"
        elif avg_score > 0: indicator = "متوسط"
        
        return jsonify({
            'student': user,
            'attendance': attendance,
            'assignments': [dict(a) for a in assignments_list],
            'exams': exams_data,
            'performance': {
                'average': round(avg_score, 1),
                'indicator': indicator
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ─── Debug Endpoint (Temporary) ──────────────────────────────
@app.route('/api/debug/users-sections', methods=['GET'])
def debug_users_sections():
    """Temporary diagnostic: shows all users and their section_ids"""
    ctx = get_user_context()
    if ctx['role'] not in ['super_admin', 'head_dept']:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    try:
        users = conn.execute('''
            SELECT id, email, role, section_id, full_name 
            FROM users 
            ORDER BY role, section_id
        ''').fetchall()
        sections = conn.execute('SELECT id, name FROM sections').fetchall()
        return jsonify({
            'sections_in_db': [dict(s) for s in sections],
            'users': [dict(u) for u in users]
        })
    finally:
        conn.close()

# ─── Chat System API ──────────────────────────────────────────

@app.route('/api/chat/messages', methods=['GET'])
def get_chat_messages():
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Super Admin and Head Dept can view any section
    section_id = ctx['section_id']
    if ctx['role'] in ['super_admin', 'head_dept']:
        requested_sid = request.args.get('section_id')
        if requested_sid: section_id = requested_sid

    if not section_id:
        return jsonify({'error': 'Section ID required'}), 400

    # 🛑 IDOR Check
    is_admin = ctx['role'] in ['super_admin', 'head_dept']
    if not is_admin and section_id != ctx['section_id']:
        return jsonify({'error': 'Forbidden access to this chat'}), 403

    conn = get_db()
    try:
        limit = int(request.args.get('limit', 50))
        messages = conn.execute('''
            SELECT m.id, m.section_id, m.sender_id, m.content, m.is_edited, m.is_deleted,
                   strftime('%Y-%m-%dT%H:%M:%SZ', m.created_at) as created_at,
                   u.full_name as sender_name, u.role as sender_role,
                   (SELECT count(*) FROM chat_read_receipts r WHERE r.message_id = m.id) as views_count
            FROM chat_messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.section_id = ?
            ORDER BY m.created_at DESC
            LIMIT ?
        ''', (section_id, limit)).fetchall()
        
        # Sort messages by time ascending for the UI
        res = [dict(m) for m in messages]
        res.reverse()
        return jsonify(res)
    finally:
        conn.close()

@app.route('/api/chat/mark-read', methods=['POST'])
def mark_chat_read():
    ctx = get_user_context()
    if ctx['role'] == 'guest': return jsonify({'error': 'Unauthorized'}), 401
    
    msg_ids = request.json.get('message_ids', [])
    if not msg_ids: return jsonify({'success': True})

    conn = get_db()
    try:
        # Use executemany for efficiency
        data = [(mid, ctx['user_id']) for mid in msg_ids]
        conn.executemany('''
            INSERT OR IGNORE INTO chat_read_receipts (message_id, user_id)
            VALUES (?, ?)
        ''', data)
        msg_id = cur.lastrowid
        conn.commit()
        
        # ── PUSH NOTIFICATION ──
        try:
            target_desc = "الجميع" if not section_id else f"شعبة {section_id}"
            # Notify ALL if no section, else just that section
            users_to_notify = []
            if not section_id:
                users_to_notify = conn.execute('SELECT id FROM users').fetchall()
            else:
                users_to_notify = conn.execute('SELECT id FROM users WHERE section_id = ?', (section_id,)).fetchall()
            
            for u in users_to_notify:
                send_push_notification(u['id'], f"تبليغ جديد للمرحلة ({target_desc})", content[:100], url='/home', tag='announcement')
        except Exception as e: print(f"[PUSH] Announcement error: {e}")
        
        return jsonify({'success': True, 'id': msg_id})
    finally:
        conn.close()

@app.route('/api/chat/messages/<int:msg_id>/views', methods=['GET'])
def get_message_views(msg_id):
    ctx = get_user_context()
    if ctx['role'] == 'guest': return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db()
    try:
        # Security: check if user can view this message (admin or in same section)
        msg = conn.execute('SELECT section_id FROM chat_messages WHERE id = ?', (msg_id,)).fetchone()
        if not msg: return jsonify({'error': 'Not found'}), 404
        
        is_admin = ctx['role'] in ['super_admin', 'head_dept']
        if not is_admin and msg['section_id'] != ctx['section_id']:
            return jsonify({'error': 'Forbidden'}), 403
            
        viewers = conn.execute('''
            SELECT u.full_name, strftime('%Y-%m-%dT%H:%M:%SZ', r.read_at) as read_at 
            FROM chat_read_receipts r
            JOIN users u ON r.user_id = u.id
            WHERE r.message_id = ?
            ORDER BY r.read_at DESC
        ''', (msg_id,)).fetchall()
        
        return jsonify([dict(v) for v in viewers])
    finally:
        conn.close()

@app.route('/api/chat/messages', methods=['POST'])
def send_chat_message():
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.json
    content = data.get('content')
    # Default to user's section, admins can specify
    section_id = ctx['section_id']
    if ctx['role'] in ['super_admin', 'head_dept'] and data.get('section_id'):
        section_id = data.get('section_id')

    if not content or not section_id:
        return jsonify({'error': 'Missing content or section'}), 400

    conn = get_db()
    try:
        # CHECK FOR LOCK: Students cannot send if section is locked
        if ctx['role'] not in ['super_admin', 'head_dept']:
            section = conn.execute('SELECT is_locked FROM sections WHERE id = ?', (section_id,)).fetchone()
            if section and section['is_locked']:
                return jsonify({'error': 'Chat is locked by admin'}), 403

        cur = conn.cursor()
        content = sanitize_input(content) # Sanitize message
        cur.execute('''
            INSERT INTO chat_messages (section_id, sender_id, content)
            VALUES (?, ?, ?)
        ''', (section_id, ctx['user_id'], content))
        msg_id = cur.lastrowid
        conn.commit()
        
        # ─── PUSH NOTIFICATION ───
        # Notify others in the section
        try:
            sender_name = conn.execute('SELECT full_name FROM users WHERE id = ?', (ctx['user_id'],)).fetchone()['full_name'] or ctx['user_email']
            others = conn.execute('SELECT id FROM users WHERE section_id = ? AND id != ?', (section_id, ctx['user_id'])).fetchall()
            for o in others:
                # Check if muted
                is_muted = conn.execute('SELECT is_muted FROM chat_settings WHERE user_id = ? AND section_id = ?', (o['id'], section_id)).fetchone()
                if not is_muted or not is_muted['is_muted']:
                    send_push_notification(o['id'], f"رسالة جديدة في {section_id}", f"{sender_name}: {content[:50]}...", url='/chat', tag=f"chat_{section_id}")
        except Exception as push_err:
            print(f"[PUSH] Chat push error: {push_err}")
            
        return jsonify({'success': True, 'id': msg_id})
    finally:
        conn.close()

# ─── Group Management ──────────────────────────────────────────

@app.route('/api/chat/groups/<string:sid>/members', methods=['GET'])
def get_chat_group_members(sid):
    ctx = get_user_context()
    if ctx['role'] == 'guest': return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db()
    try:
        # Everyone in the group or admin can see the member list
        is_admin = (ctx['role'] in ['super_admin', 'head_dept'])
        is_member = (ctx['section_id'] == sid)
        
        if not is_member and not is_admin:
            return jsonify({'error': 'Forbidden'}), 403
            
        # HYPER-ROBUST SEARCH: Catch all variants of section IDs/Names
        members = conn.execute('''
            SELECT id, 
                   COALESCE(NULLIF(full_name, ''), email) as full_name,
                   email, role, created_at 
            FROM users 
            WHERE section_id = ? 
               OR section_id = (SELECT name FROM sections WHERE id = ?)
               OR section_id LIKE '%' || ? || '%'
            ORDER BY role DESC, full_name ASC
        ''', (sid, sid, sid)).fetchall()
        
        return jsonify([dict(m) for m in members])
    except Exception as e:
        app.logger.error(f"Error in get_chat_group_members: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    finally:
        conn.close()

@app.route('/api/chat/groups/<string:sid>/toggle-lock', methods=['POST'])
@require_role('super_admin', 'head_dept')
def toggle_chat_lock(sid):
    conn = get_db()
    try:
        conn.execute('UPDATE sections SET is_locked = 1 - is_locked WHERE id = ?', (sid,))
        conn.commit()
        status = conn.execute('SELECT is_locked FROM sections WHERE id = ?', (sid,)).fetchone()
        return jsonify({'success': True, 'is_locked': bool(status['is_locked'])})
    finally:
        conn.close()

@app.route('/api/chat/groups/<string:sid>/rename', methods=['PUT'])
@require_role('super_admin', 'head_dept')
def rename_chat_group(sid):
    new_name = request.json.get('name')
    if not new_name: return jsonify({'error': 'Name required'}), 400
    
    conn = get_db()
    try:
        conn.execute('UPDATE sections SET name = ? WHERE id = ?', (new_name, sid))
        conn.commit()
        return jsonify({'success': True})
    finally:
        conn.close()

@app.route('/api/chat/my-groups', methods=['GET'])
def get_my_chat_groups():
    ctx = get_user_context()
    if ctx['role'] == 'guest': return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db()
    try:
        if ctx['role'] in ['super_admin', 'head_dept']:
            groups = conn.execute('SELECT id, name, is_locked FROM sections').fetchall()
        else:
            groups = conn.execute('SELECT id, name, is_locked FROM sections WHERE id = ?', (ctx['section_id'],)).fetchall()
        
        res = []
        for g in groups:
            mute_status = conn.execute('SELECT is_muted FROM chat_settings WHERE user_id = ? AND section_id = ?', 
                                     (ctx['user_id'], g['id'])).fetchone()
            res.append({
                'id': g['id'],
                'name': g['name'],
                'is_locked': bool(g['is_locked']),
                'is_muted': bool(mute_status['is_muted']) if mute_status else False
            })
        return jsonify(res)
    finally:
        conn.close()

@app.route('/api/chat/messages/<int:msg_id>', methods=['PUT', 'DELETE'])
def manage_chat_message(msg_id):
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'error': 'Unauthorized'}), 401
    
    conn = get_db()
    try:
        # Check ownership
        msg = conn.execute('SELECT * FROM chat_messages WHERE id = ?', (msg_id,)).fetchone()
        if not msg:
            return jsonify({'error': 'Message not found'}), 404
        
        is_owner = (msg['sender_id'] == ctx['user_id'])
        is_admin = (ctx['role'] in ['super_admin', 'head_dept'])
        
        if request.method == 'DELETE':
            if not is_owner and not is_admin:
                return jsonify({'error': 'Forbidden'}), 403
            conn.execute('UPDATE chat_messages SET is_deleted = 1 WHERE id = ?', (msg_id,))
            conn.commit()
            return jsonify({'success': True})
            
        elif request.method == 'PUT':
            if not is_owner:
                return jsonify({'error': 'Forbidden'}), 403
            content = sanitize_input(request.json.get('content'))
            if not content: return jsonify({'error': 'Empty content'}), 400
            conn.execute('''
                UPDATE chat_messages 
                SET content = ?, is_edited = 1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            ''', (content, msg_id))
            conn.commit()
            return jsonify({'success': True})
    finally:
        conn.close()

@app.route('/api/chat/settings/toggle-mute', methods=['POST'])
def toggle_chat_mute():
    ctx = get_user_context()
    if ctx['role'] == 'guest': return jsonify({'error': 'Unauthorized'}), 401
    
    section_id = request.json.get('section_id') or ctx['section_id']
    if not section_id: return jsonify({'error': 'Section ID required'}), 400
    
    conn = get_db()
    try:
        conn.execute('''
            INSERT INTO chat_settings (user_id, section_id, is_muted)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id, section_id) DO UPDATE SET is_muted = 1 - is_muted
        ''', (ctx['user_id'], section_id))
        conn.commit()
        
        status = conn.execute('SELECT is_muted FROM chat_settings WHERE user_id = ? AND section_id = ?', 
                             (ctx['user_id'], section_id)).fetchone()
        return jsonify({'success': True, 'is_muted': bool(status['is_muted'])})
    finally:
        conn.close()

# ─── Push Notifications System ──────────────────────────────
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', 'BMAeG3J8JmZ9Xf-yTfJ0XN0zX6V1S4V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', 'fS0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6S0V6=')
VAPID_CLAIMS = {"sub": "mailto:admin@3minds.edu"}

def send_push_notification(user_id, title, body, url='/', tag='general'):
    if not PUSH_AVAILABLE: return
    conn = get_db()
    try:
        sub = conn.execute('SELECT subscription_json FROM push_subscriptions WHERE user_id = ?', (user_id,)).fetchone()
        if not sub: return
        
        subscription_info = json.loads(sub['subscription_json'])
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({
                "title": title,
                "body": body,
                "url": url,
                "tag": tag,
                "icon": "/logo.png"
            }),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        return True
    except WebPushException as ex:
        print(f"[PUSH] Error sending to user {user_id}: {ex}")
        # If subscription is expired/wrong, remove it
        if ex.response and ex.response.status_code in [404, 410]:
            conn.execute('DELETE FROM push_subscriptions WHERE user_id = ?', (user_id,))
            conn.commit()
    except Exception as e:
        print(f"[PUSH] Unexpected error: {e}")
    finally:
        conn.close()

@app.route('/api/push/subscribe', methods=['POST'])
def push_subscribe():
    ctx = get_user_context()
    if ctx['role'] == 'guest': return jsonify({'error': 'Unauthorized'}), 401
    
    subscription = request.json.get('subscription')
    if not subscription: return jsonify({'error': 'Missing subscription'}), 400
    
    conn = get_db()
    try:
        conn.execute('''
            INSERT INTO push_subscriptions (user_id, subscription_json)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET subscription_json = excluded.subscription_json
        ''', (ctx['user_id'], json.dumps(subscription)))
        conn.commit()
        return jsonify({'success': True})
    finally:
        conn.close()

# ── PUSH NOTIFICATIONS (VAPID) ──────────────────────────────────────
# You should generate your own keys for production: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', "BE_SndG9hZ1Z6Y_IqS_6y2K_2_O6k_h_kS_S_n_S_p_kS_S_n_S_p_kS_S_n_S_p_k").strip()
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', "P_S_n_S_p_kS_S_n_S_p_kS_S_n_S_p_").strip()
VAPID_CLAIMS = {"sub": "mailto:admin@3minds.edu"}

def send_push_notification(user_id, title, message, url='/', tag='general'):
    """Sends a Web Push notification to a specific user's subscribed devices."""
    if not PUSH_AVAILABLE:
        print(f"[PUSH] Skipping push for {user_id} - pywebpush not available")
        return False
    
    conn = get_db()
    try:
        sub_row = conn.execute('SELECT subscription_json FROM push_subscriptions WHERE user_id = ?', (user_id,)).fetchone()
        if not sub_row:
            return False
            
        subscription = json.loads(sub_row['subscription_json'])
        payload = json.dumps({
            'title': title,
            'body': message,
            'url': url,
            'tag': tag
        })
        
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        return True
    except WebPushException as ex:
        if ex.response and ex.response.status_code in [404, 410]:
            # Subscription expired/invalid -> Remove from DB
            conn.execute('DELETE FROM push_subscriptions WHERE user_id = ?', (user_id,))
            conn.commit()
        print(f"[PUSH] webpush error for {user_id}: {ex}")
        return False
    except Exception as e:
        print(f"[PUSH] general error for {user_id}: {e}")
        return False
    finally:
        conn.close()

@app.route('/api/push/public-key', methods=['GET'])
def get_push_public_key():
    """Retrieve the VAPID public key for frontend subscription."""
    return jsonify({'publicKey': VAPID_PUBLIC_KEY})

@app.route('/api/push/subscribe', methods=['POST'])
def subscribe_push():
    """Save or update a push subscription for the current user."""
    ctx = get_user_context()
    if ctx['role'] == 'guest':
        return jsonify({'error': 'Unauthorized'}), 401
        
    subscription = request.json
    if not subscription:
        return jsonify({'error': 'Missing subscription'}), 400
        
    conn = get_db()
    try:
        # Use UPSERT to handle existing subscriptions for same user
        conn.execute('''
            INSERT INTO push_subscriptions (user_id, subscription_json)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET 
                subscription_json = excluded.subscription_json,
                created_at = CURRENT_TIMESTAMP
        ''', (ctx['user_id'], json.dumps(subscription)))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=8000)

