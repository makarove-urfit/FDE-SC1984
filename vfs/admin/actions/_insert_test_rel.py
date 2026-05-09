"""[dev one-off] 直接 insert customer_custom_app_user_rel，給 Task 10 end-to-end 測試 hack 用。
spec / plan 出問題：原本以為 redeem_invite_token 已 work（rel 表會自然累積），
實際上 redeem_invite_token pre-existing bug 導致從未成功 insert 過符合設計的 rel。
這支臨時 action 手動補一筆讓 BranchPicker 流程能跑。"""
def execute(ctx):
    customer_id = (ctx.params or {}).get("customer_id")
    user_id = (ctx.params or {}).get("user_id")
    if not customer_id or not user_id:
        ctx.response.json({"error": "missing customer_id / user_id"})
        return
    try:
        r = ctx.db.insert("customer_custom_app_user_rel", {
            "customer_id": str(customer_id),
            "custom_app_user_id": str(user_id),
        })
        ctx.response.json({"success": True, "result": r})
    except Exception as e:
        ctx.response.json({"error": str(e), "type": type(e).__name__})
