"""
雄泉 Ordering Custom App — 部署腳本

環境變數（.env）：
  AIGO_EMAIL        - AI GO 登入 email
  AIGO_PASSWORD     - AI GO 登入密碼
  ORDERING_APP_ID   - Ordering App 的 UUID

用法：
  set -a && source .env && set +a
  python3 vfs/scripts/deploy_ordering.py              # 完整部署（上傳 + 發布）
  python3 vfs/scripts/deploy_ordering.py --no-publish # 只上傳，不發布（開發測試用）
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from deploy_lib import require_env, login, ensure_references, read_vfs, upload_vfs, publish_app
from db_ordering import REFS

VFS_DIR = os.path.join(os.path.dirname(__file__), "..", "ordering")


def main():
    no_publish = "--no-publish" in sys.argv
    print("=== 雄泉 Ordering Custom App 部署 ===")
    email    = require_env("AIGO_EMAIL")
    password = require_env("AIGO_PASSWORD")
    app_id   = require_env("ORDERING_APP_ID")

    print("\n[1/4] 登入...")
    token = login(email, password)
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print("\n[2/4] 設定 DB References...")
    ensure_references(h, app_id, REFS)

    print("\n[3/4] 讀取並上傳 VFS...")
    upload_vfs(h, app_id, read_vfs(VFS_DIR))

    if no_publish:
        print("\n⏭️  略過發布（--no-publish），可用 use_dev=true 測試 action")
        print(f"   endpoint: POST /api/v1/actions/apps/{app_id}/execute-by-name?action_name=<name>&use_dev=true")
    else:
        print("\n[4/4] 發布...")
        publish_app(h, app_id)
        print("\n✅ Ordering 部署完成")


if __name__ == "__main__":
    main()
