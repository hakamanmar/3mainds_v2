import os
import shutil
import sqlite3
import datetime
import tarfile

# --- CONFIGURATION ---
DB_SOURCE = 'academic.db'
UPLOADS_DIR = 'uploads'
BACKUP_DIR = 'backups'
LOG_FILE = 'security_audit.log'

def perform_backup():
    # 1. Create timestamped environment
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    current_backup_path = os.path.join(BACKUP_DIR, f"backup_{timestamp}")
    os.makedirs(current_backup_path, exist_ok=True)
    
    print(f"[*] Starting backup sequence for {timestamp}")

    # 2. Backup Database (Safe Hot Backup if using WAL)
    try:
        if os.path.exists(DB_SOURCE):
            dest_db = os.path.join(current_backup_path, 'academic_backup.db')
            # Use sqlite3.backup for a consistent online backup
            src_conn = sqlite3.connect(DB_SOURCE)
            dst_conn = sqlite3.connect(dest_db)
            src_conn.backup(dst_conn)
            src_conn.close()
            dst_conn.close()
            print("[+] Database hot-backup successful.")
        else:
            print("[!] Source database not found.")
    except Exception as e:
        print(f"[!] Database backup failed: {e}")

    # 3. Backup Uploads & Logs (Compressed)
    try:
        archive_name = os.path.join(current_backup_path, 'assets.tar.gz')
        with tarfile.open(archive_name, "w:gz") as tar:
            if os.path.exists(UPLOADS_DIR):
                tar.add(UPLOADS_DIR, arcname=os.path.basename(UPLOADS_DIR))
                print("[+] Uploads directory archived.")
            if os.path.exists(LOG_FILE):
                tar.add(LOG_FILE, arcname=os.path.basename(LOG_FILE))
                print("[+] Security logs archived.")
    except Exception as e:
        print(f"[!] Asset archiving failed: {e}")

    # 4. Clean old backups (Keep last 7 days)
    # Simplified logic: keep only the 7 most recent folders
    backups = sorted([d for d in os.listdir(BACKUP_DIR) if os.path.isdir(os.path.join(BACKUP_DIR, d))])
    if len(backups) > 7:
        for old_backup in backups[:-7]:
            shutil.rmtree(os.path.join(BACKUP_DIR, old_backup))
            print(f"[-] Removed stale backup: {old_backup}")

    print(f"[*] Backup complete: {current_backup_path}")

if __name__ == "__main__":
    os.makedirs(BACKUP_DIR, exist_ok=True)
    perform_backup()
