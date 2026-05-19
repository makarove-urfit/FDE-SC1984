"""統編檢查碼純函式單元測試（本地、不需平台）。
Run: python3 vfs/scripts/test_vat_checksum.py
"""
import os, importlib.util

ACTION_FILE = os.path.join(os.path.dirname(__file__), "..", "admin", "actions", "create_customer_bundle.py")


def _load_validator():
    spec = importlib.util.spec_from_file_location("create_customer_bundle", ACTION_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod._validate_vat_format


def main():
    validate = _load_validator()

    # 合法統編（檢查碼相符）
    ok, err = validate("04595257")  # 台積電
    assert ok is True, f"04595257 應為合法統編，err={err}"

    # 合法統編（第 7 碼為 7 的特例）
    ok, err = validate("12345675")
    assert ok is True, f"12345675 應透過第7碼特例判為合法，err={err}"

    # 非法：檢查碼不符
    ok, err = validate("12345678")
    assert ok is False, "12345678 檢查碼不符，應為非法"
    assert "檢查碼" in err

    # 非法：非 8 位
    ok, err = validate("1234567")
    assert ok is False and "8 位" in err

    # 非法：含非數字
    ok, err = validate("1234567X")
    assert ok is False and "8 位" in err

    # 非法：空值
    ok, err = validate("")
    assert ok is False and "必填" in err

    # 前後空白應被容忍（trim 後判斷）
    ok, err = validate("  04595257  ")
    assert ok is True, f"前後空白應 trim，err={err}"

    print("🎉 test_vat_checksum 全數通過")


if __name__ == "__main__":
    main()
