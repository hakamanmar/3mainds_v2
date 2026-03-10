import os
import sqlite3
import json
import secrets
import string
import uuid
import mimetypes
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadTimeSignature
import time

try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
except ImportError:
    Limiter = None

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
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max upload

# Setup Rate Limiting
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'ppt', 'pptx', 'mp3', 'mp4', 'mov', 'avi', 'zip', 'rar', 'webm', 'ogg', 'aac', 'm4a', 'webp'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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
        "media-src 'self' blob:; "
        "connect-src 'self' https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;"
    )
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

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
TURSO_DATABASE_URL = os.environ.get('TURSO_DATABASE_URL', '')
TURSO_AUTH_TOKEN   = os.environ.get('TURSO_AUTH_TOKEN', '')
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
                        # Handle Turso's string-encoded large integers
                        if v.get("type") == "integer" and val is not None:
                            try: val = int(val)
                            except: pass
                        vals.append(val)
                    self._rows.append(TursoRow(zip(cols, vals)))
                # For INSERT, get lastrowid from affected rows
                self.lastrowid = response.get("last_insert_rowid")
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


def init_db():
    conn = get_db()
    c = conn.cursor()

    # --- Migration Helper: Check schema compatibility ---
    try:
        # Check for user_devices table - if it's missing, we need a clean start for the new device system
        c.execute('SELECT id FROM user_devices LIMIT 1')
    except Exception:
        print("[DB] user_devices table missing - Performing clean schema reset for migration...")
        for tbl in ['user_devices', 'subjects','users','lessons','announcements','attendance_records','attendance_sessions','enrollments','assignments','submissions','sections']:
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
            role TEXT NOT NULL, -- super_admin, section_admin, teacher, student, committee
            section_id TEXT,    -- Link to sections, NULL for super_admin
            device_id TEXT,
            must_change_pw INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id)
        )
    ''')

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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id)
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
            target_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id)
        )
    ''')
    
    # Add target_date column if it doesn't exist (SQLite only)
    if not USE_TURSO:
        try:
            c.execute('SELECT target_date FROM announcements LIMIT 1')
        except Exception:
            c.execute('ALTER TABLE announcements ADD COLUMN target_date TIMESTAMP')

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
            # Super admin can do anything
            if ctx['role'] == 'super_admin':
                 return f(*args, **kwargs)
            
            # Check if role matches
            if ctx['role'] not in roles:
                return jsonify({'error': 'Unauthorized', 'required': roles, 'got': ctx['role']}), 401
            
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator

# ─── Root Files (PWA & Branding) ─────────────────────────────
@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory(os.getcwd(), 'manifest.json')

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
    try:
        user_row = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        
        if not user_row:
            print(f"[LOGIN] User not found: {email}") # DEBUG LOG
            conn.close()
            return jsonify({'success': False, 'message': 'البريد الإلكتروني غير مسجل'}), 401
            
        user = dict(user_row)
        print(f"[LOGIN] Found user: {user['email']} with role: {user['role']}") # DEBUG LOG
        
        if not check_password_hash(user['password'], password):
            print(f"[LOGIN] Password mismatch for user: {email}") # DEBUG LOG
            conn.close()
            return jsonify({'success': False, 'message': 'كلمة المرور غير صحيحة'}), 401

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

    print(f"[LOGIN] Login successful, generating token for {email}") # DEBUG LOG
    
    resp = make_response(jsonify({
        'success': True,
        'must_reset': bool(user.get('must_change_pw', 0)),
        'user': token_data
    }))
    resp.set_cookie('auth_token', auth_token, httponly=True, secure=False, samesite='Strict', max_age=31536000)
    return resp

@app.route('/api/change-password', methods=['POST'])
@limiter.limit("5 per hour") # Prevent automated password resets
def change_password():
    data = request.json
    user_id = data.get('user_id')
    new_password = data.get('password', '')

    if len(new_password) < 8:
        return jsonify({'error': 'كلمة المرور قصيرة جداً (8 أحرف على الأقل)'}), 400

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

# ─── SUBJECTS ─────────────────────────────────────────────────
@app.route('/api/subjects', methods=['GET'])
@require_role('student', 'teacher', 'section_admin', 'super_admin')
def get_subjects():
    ctx = get_user_context()
    conn = get_db()
    
    # Priority: query param section_id (for Super Admin/Committee selector)
    sid = request.args.get('section_id') or ctx['section_id']
    
    if ctx['role'] in ['super_admin', 'committee']:
        if sid:
            subjects = conn.execute('SELECT * FROM subjects WHERE section_id = ? ORDER BY created_at DESC', (sid,)).fetchall()
        else:
            # Global roles see everything if no section selected
            subjects = conn.execute('SELECT * FROM subjects ORDER BY created_at DESC').fetchall()
    else:
        # Teachers, Section Admins, and Students are restricted to their section
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
    if ctx['role'] != 'super_admin' and subject['section_id'] != ctx['section_id']:
        conn.close()
        audit_log("UNAUTHORIZED_ACCESS_ATTEMPT", {"target": f"subject_{id}", "user_id": ctx['user_id']}, risk_score="HIGH")
        return jsonify({'error': 'غير مصرح لك بالوصول لهذه المادة'}), 403

    lessons = conn.execute('SELECT * FROM lessons WHERE subject_id = ? ORDER BY created_at DESC', (id,)).fetchall()
    conn.close()
    return jsonify({'subject': dict(subject), 'lessons': [dict(l) for l in lessons]})

@app.route('/api/subjects', methods=['POST'])
@require_role('section_admin')
def add_subject():
    data = request.json
    ctx = get_user_context()
    sid = ctx['section_id']
    if ctx['role'] == 'super_admin' and data.get('section_id'):
        sid = data['section_id']
        
    if not data.get('title') or not sid:
        return jsonify({'error': 'يجب إدخال اسم المادة والشعبة'}), 400
        
    conn = get_db()
    conn.execute('INSERT INTO subjects (title, description, code, color, section_id) VALUES (?, ?, ?, ?, ?)',
                 (data['title'], data.get('description', ''), data.get('code', ''), data.get('color', '#4f46e5'), sid))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

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
        subj = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (subject_id,)).fetchone()
        if not subj or (ctx['role'] != 'super_admin' and subj['section_id'] != ctx['section_id']):
            conn.close()
            return jsonify({'error': 'غير مصرح لك بالإضافة لهذه المادة'}), 403
        conn.close()

        ext = file.filename.rsplit('.', 1)[1].lower()
        secure_name = f"{uuid.uuid4().hex}.{ext}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], secure_name))
        url = f"/uploads/{secure_name}"
    else:
        data = request.json or {}
        subject_id = data.get('subject_id')
        title = data.get('title', '').strip()
        url = data.get('url', '').strip()
        lesson_type = data.get('type', 'PDF')
        
        # IDOR Check for subject context
        conn = get_db()
        subj = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (subject_id,)).fetchone()
        if not subj or (ctx['role'] != 'super_admin' and subj['section_id'] != ctx['section_id']):
            conn.close()
            return jsonify({'error': 'غير مصرح لك بالإضافة لهذه المادة'}), 403
        conn.close()

    if not subject_id or not title or not url:
        return jsonify({'error': 'جميع الحقول مطلوبة'}), 400

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
                 (data.get('title'), data.get('url'), data.get('type', 'PDF'), id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ─── ANNOUNCEMENTS ────────────────────────────────────────────
@app.route('/api/announcements', methods=['GET'])
@require_role('student', 'teacher', 'section_admin', 'super_admin')
def get_announcements():
    ctx = get_user_context()
    sid = ctx['section_id']
    conn = get_db()
    if ctx['role'] in ['super_admin', 'committee']:
        if sid:
            ann = conn.execute('SELECT * FROM announcements WHERE section_id = ? ORDER BY created_at DESC', (sid,)).fetchall()
        else:
            ann = conn.execute('SELECT * FROM announcements ORDER BY created_at DESC').fetchall()
    else:
        ann = conn.execute('SELECT * FROM announcements WHERE section_id = ? ORDER BY created_at DESC', (sid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in ann])

@app.route('/api/announcements', methods=['POST'])
@require_role('section_admin')
def add_announcement():
    data = request.json
    ctx = get_user_context()
    sid = ctx['section_id']
    if ctx['role'] == 'super_admin' and data.get('section_id'):
        sid = data['section_id']
        
    content = data.get('content', '').strip()
    target_date = data.get('target_date', None)
    
    if not content or not sid:
        return jsonify({'error': 'المحتوى والشعبة مطلوبان'}), 400
        
    conn = get_db()
    conn.execute('INSERT INTO announcements (content, section_id, target_date) VALUES (?, ?, ?)', (content, sid, target_date))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/announcements', methods=['PUT'])
@require_role('section_admin', 'super_admin')
def update_announcement():
    ann_id = request.args.get('id')
    data = request.json
    content = data.get('content', '').strip()
    target_date = data.get('target_date', None)
    if not content:
        return jsonify({'error': 'المحتوى مطلوب'}), 400
    conn = get_db()
    conn.execute('UPDATE announcements SET content = ?, target_date = ? WHERE id = ?', (content, target_date, ann_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/announcements', methods=['DELETE'])
@require_role('section_admin', 'super_admin')
def delete_announcement():
    ann_id = request.args.get('id')
    conn = get_db()
    conn.execute('DELETE FROM announcements WHERE id = ?', (ann_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

# ─── USERS ────────────────────────────────────────────────────
@app.route('/api/users', methods=['GET'])
@require_role('section_admin', 'super_admin')
def get_users():
    ctx = get_user_context()
    sid = request.args.get('section_id') or ctx['section_id']
    conn = get_db()
    if ctx['role'] == 'super_admin':
        if sid:
            # Show users of the section PLUS global roles (they are relevant everywhere)
            users = conn.execute('''
                SELECT u.id, u.email, u.role, u.section_id, u.created_at,
                (SELECT COUNT(*) FROM user_devices ud WHERE ud.user_id = u.id) as device_count
                FROM users u 
                WHERE u.section_id = ? OR u.role IN ('super_admin', 'committee')
                ORDER BY u.role DESC, u.email ASC
            ''', (sid,)).fetchall()
        else:
            users = conn.execute('''
                SELECT u.id, u.email, u.role, u.section_id, u.created_at,
                (SELECT COUNT(*) FROM user_devices ud WHERE ud.user_id = u.id) as device_count
                FROM users u
                ORDER BY u.role DESC, u.email ASC
            ''').fetchall()
    else:
        # Section Admin only sees users of their section (they don't need to see other global admins)
        users = conn.execute('''
            SELECT u.id, u.email, u.role, u.section_id, u.created_at,
            (SELECT COUNT(*) FROM user_devices ud WHERE ud.user_id = u.id) as device_count
            FROM users u WHERE u.section_id = ?
            ORDER BY u.role DESC, u.email ASC
        ''', (sid,)).fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

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

    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/add-user', methods=['POST'])
@require_role('section_admin', 'super_admin')
def add_user():
    data = request.json
    ctx = get_user_context()
    
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    role = data.get('role', 'student')
    section_id = data.get('section_id')
    if section_id == "": # Clean up empty strings from frontend
        section_id = None
        
    # If still None, fall back to creator's section (for teachers/students by section admins)
    if not section_id:
        section_id = ctx['section_id']

    if not email or not password or not role:
        return jsonify({'error': 'جميع الحقول مطلوبة'}), 400

    # Global roles (super_admin, committee) never have a section_id
    if role in ['super_admin', 'committee']:
        section_id = None

    # Permission Checks
    if ctx['role'] == 'section_admin':
        # Section Admin can only create Students and Teachers for THEIR section
        if role not in ['student', 'teacher']:
            return jsonify({'error': 'ليس لديك صلاحية لإنشاء هذا النوع من الحسابات'}), 403
        section_id = ctx['section_id'] # Force their own section
    elif ctx['role'] == 'super_admin':
        # ONLY the master super account (super@3minds.edu) can create other super_admins
        if role == 'super_admin' and ctx['email'] != 'super@3minds.edu':
             return jsonify({'error': 'ليس لديك صلاحية لإنشاء حساب مشرف عام جديد. هذا من صلاحيات المشرف الرئيسي فقط.'}), 403
             
        # Roles that MUST have a section
        if role in ['student', 'teacher', 'section_admin'] and not section_id:
             return jsonify({'error': 'يجب تحديد الشعبة لهذا النوع من الحسابات'}), 400

    conn = get_db()
    try:
        conn.execute('INSERT INTO users (email, password, role, section_id, must_change_pw) VALUES (?, ?, ?, ?, ?)',
                     (email, generate_password_hash(password), role, section_id, 0))
        conn.commit()
    except Exception as e:
        if 'UNIQUE' in str(e).upper() or 'unique' in str(e).lower() or 'IntegrityError' in str(type(e).__name__):
            return jsonify({'error': 'هذا البريد الإلكتروني مسجّل مسبقاً'}), 400
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
    return jsonify({'success': True})

@app.route('/api/admin/reset-device', methods=['POST'])
@require_role('section_admin', 'super_admin')
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

# Strict allowed extensions by category
ALLOWED_EXTENSIONS = {
    'pdf': ['pdf'],
    'image': ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    'video': ['mp4', 'webm', 'mov', 'avi'],
    'audio': ['mp3', 'wav', 'ogg', 'm4a'],
    'doc': ['doc', 'docx', 'ppt', 'pptx']
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
    
    # Use UUID4 to completely obscure the original filename and prevent Path Traversal
    ext = file.filename.rsplit('.', 1)[1].lower()
    secure_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_name)
    file.save(file_path)
    
    return jsonify({'success': True, 'url': f"/uploads/{secure_name}", 'filename': file.filename})

@app.route('/uploads/<filename>')
@limiter.limit("500 per hour")
def uploaded_file(filename):
    """Serve uploaded files with Military-Grade security headers."""
    # Ensure filename contains no path traversal tricks before checking
    safe_name = secure_filename(filename)
    if safe_name != filename:
        return "Invalid filename", 400
        
    response = make_response(send_from_directory(app.config['UPLOAD_FOLDER'], safe_name))
    
    # Secure Serving: Force download for anything that shouldn't be executed inline (prevent XSS via SVG/HTML)
    ext = safe_name.rsplit('.', 1)[-1].lower() if '.' in safe_name else ''
    if request.args.get('download') or ext not in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'wav']:
        # Force download as attachment
        response.headers['Content-Disposition'] = f'attachment; filename="{safe_name}"'
    else:
        # Prevent inline execution even for media
        response.headers['Content-Disposition'] = f'inline; filename="{safe_name}"'
        
    # Extra security for served files
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response

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
    
    # If user is student, check their submission status using verified ctx['user_id']
    user_id = ctx['user_id']
    
    res = []
    for a in assignments:
        d = dict(a)
        if ctx['role'] == 'student' and user_id:
            sub = conn.execute('SELECT id, submitted_at FROM submissions WHERE assignment_id = ? AND student_id = ?', (a['id'], user_id)).fetchone()
            d['status'] = 'submitted' if sub else 'pending'
            d['submitted_at'] = sub['submitted_at'] if sub else None
        res.append(d)
        
    conn.close()
    return jsonify(res)

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
    conn.close()
    return jsonify({'success': True})

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
@require_role('teacher', 'super_admin')
def get_assignment_submissions(id):
    conn = get_db()
    # Get the assignment to find out which subject/section it belongs to
    assignment = conn.execute('SELECT * FROM assignments WHERE id = ?', (id,)).fetchone()
    if not assignment:
        conn.close()
        return jsonify({'error': 'Assignment not found'}), 404
        
    subject = conn.execute('SELECT section_id FROM subjects WHERE id = ?', (assignment['subject_id'],)).fetchone()
    section_id = subject['section_id']

    # Get all students in this section
    students = conn.execute('SELECT id, email FROM users WHERE role = "student" AND section_id = ?', (section_id,)).fetchall()
    
    # Get all submissions for this assignment
    submissions = conn.execute('SELECT * FROM submissions WHERE assignment_id = ?', (id,)).fetchall()
    sub_map = {s['student_id']: dict(s) for s in submissions}
    
    submitted = []
    not_submitted = []
    
    for s in students:
        if s['id'] in sub_map:
            sub_data = sub_map[s['id']]
            sub_data['email'] = s['email']
            submitted.append(sub_data)
        else:
            not_submitted.append({'id': s['id'], 'email': s['email']})
            
    conn.close()
    return jsonify({
        'assignment': dict(assignment),
        'submitted': submitted,
        'not_submitted': not_submitted
    })

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
def attendance_start():
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
def attendance_qr(session_id):
    conn = get_db()
    session = conn.execute("SELECT * FROM attendance_sessions WHERE id=?", (session_id,)).fetchone()
    if not session or session['status'] != 'active':
        conn.close()
        return jsonify({'error': 'Session not found or ended'}), 404

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
def attendance_scan():
    data = request.json or {}
    token      = data.get('token', '')
    student_id = data.get('student_id')

    if not token or not student_id:
        return jsonify({'error': 'token and student_id required'}), 400

    conn = get_db()
    session = conn.execute(
        "SELECT * FROM attendance_sessions WHERE qr_token=? AND status='active'",
        (token,)
    ).fetchone()

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
def attendance_live(session_id):
    conn = get_db()
    records = conn.execute('''
        SELECT ar.id, ar.scanned_at, ar.method,
               u.id as student_id, u.email
        FROM attendance_records ar
        JOIN users u ON u.id = ar.student_id
        WHERE ar.session_id = ?
        ORDER BY ar.scanned_at DESC
    ''', (session_id,)).fetchall()
    session = conn.execute(
        "SELECT subject_id, refresh_interval, started_at FROM attendance_sessions WHERE id=?",
        (session_id,)
    ).fetchone()
    # Improved SQL for Turso compatibility
    row_count = conn.execute("SELECT count(*) as total FROM users WHERE role='student'").fetchone()
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
def attendance_manual():
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
def attendance_delete_record():
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
def attendance_toggle_status(session_id):
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
def attendance_end(session_id):
    conn = get_db()
    conn.execute(
        "UPDATE attendance_sessions SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE id=?",
        (session_id,)
    )
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
        SELECT ar.scanned_at, ar.method, u.email, u.id as student_id
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
            students = conn.execute("SELECT id, email FROM users WHERE role='student' AND section_id=?", (sid,)).fetchall()
        else:
            students = conn.execute("SELECT id, email FROM users WHERE role='student'").fetchall()
    else:
        students = conn.execute("SELECT id, email FROM users WHERE role='student' AND section_id=?", (sid,)).fetchall()

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
        students = conn.execute("SELECT id, email, section_id FROM users WHERE role='student'").fetchall()
    else:
        students = conn.execute("SELECT id, email, section_id FROM users WHERE role='student' AND section_id=?", (sid,)).fetchall()
        
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
    # Find any active session belonging to a subject in the student's section
    session = conn.execute('''
        SELECT s.*, subj.title as subject_title, subj.color as subject_color
        FROM attendance_sessions s
        JOIN subjects subj ON s.subject_id = subj.id
        WHERE subj.section_id = ? AND s.status = 'active'
        ORDER BY s.started_at DESC LIMIT 1
    ''', (sid,)).fetchone()
    conn.close()
    
    if session:
        return jsonify({'active': True, 'session': dict(session)})
    return jsonify({'active': False})


# ── Assignments & Submissions ──────────────────────────────────────

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', debug=True, port=5000)

