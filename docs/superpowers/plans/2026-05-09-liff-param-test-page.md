# LIFF 參數測試頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ordering app 內加一個 LiffTestPage，部署後從 LINE 點 LIFF URL 進來能完整顯示 URL 三來源（search / hash / liff.state）與 LIFF SDK 探測結果（init / isInClient / isLoggedIn / getProfile / getIDToken / getDecodedIDToken），用以驗證 S2 應走「帶參數連結綁定」還是「6 位 OTP 綁定」。

**Architecture:** 在 `vfs/ordering/src/App.tsx` 頂部加一個 `LIFF_TEST_MODE` 常數開關，true 時整個 ordering app 直接 render `<LiffTestPage />`，跳過所有登入/路由邏輯。LIFF SDK 透過動態 `<script>` 注入從 LINE CDN 載入（不改 package.json）。LIFF ID 寫死在測試頁檔案常數內。測完把開關改 false 或整個 PR revert。

**Tech Stack:** React 18 + TypeScript（vfs/ordering 既有環境）、LIFF SDK 2.x（CDN：`https://static.line-scdn.net/liff/edge/2/sdk.js`）、AI GO Custom App VFS 部署流程

**Spec：** `docs/superpowers/specs/2026-05-09-liff-param-test-page-design.md`

**前置條件：**
- LINE Developers 後台 LIFF 已建好，Endpoint URL = `https://ordering.apps.ai-go.app/ext-runtime`
- LIFF ID = `2009976374-VYUpM905`
- Scopes = `openid, profile`（已經齊）
- `.env` 內有 `AIGO_EMAIL` / `AIGO_PASSWORD`（部署用）

**測試框架說明：** `vfs/ordering/` 沒有獨立的 vite/vitest 設定（平台 publish 時才編譯），且本頁本身就是「測試儀器」，不寫單元測試。每個 task 完成後僅做型別檢查（觀察程式語法/型別合理性）+ commit；最後整體部署一次，靠手動 LINE 點擊驗證。

---

## Task 1：建立分支 + 空殼 LiffTestPage

**Files:**
- Create: `vfs/ordering/src/pages/LiffTestPage.tsx`

- [ ] **Step 1：從 main 切新分支**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/liff-param-test
```

- [ ] **Step 2：建立空殼 LiffTestPage**

寫入 `vfs/ordering/src/pages/LiffTestPage.tsx`：

```tsx
import React from "react";

export default function LiffTestPage() {
  return (
    <div style={{
      padding: 16,
      fontFamily: "system-ui, sans-serif",
      maxWidth: 720,
      margin: "0 auto",
      background: "#f9fafb",
      minHeight: "100vh",
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        LIFF 參數測試頁
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        目前是測試模式，正式登入暫時關閉
      </p>
    </div>
  );
}
```

- [ ] **Step 3：確認 import 路徑慣例**

讀 `vfs/ordering/src/pages/LoginPage.tsx` 確認：頁面元件用 `default export`、用相對路徑 import、沒有 `index.ts` barrel。本檔已遵循。

- [ ] **Step 4：Commit**

```bash
git add vfs/ordering/src/pages/LiffTestPage.tsx
git commit -m "feat(ordering): 新增 LiffTestPage 空殼，準備驗證 LIFF 帶參數能力"
```

---

## Task 2：URL 三來源解析（區塊 2）

**Files:**
- Modify: `vfs/ordering/src/pages/LiffTestPage.tsx`

- [ ] **Step 1：加入 URL 解析邏輯**

把 LiffTestPage.tsx 整個替換為：

```tsx
import React, { useMemo } from "react";

interface UrlReport {
  href: string;
  search: string;
  hash: string;
  liffState: string | null;
  liffStateParsed: Record<string, string> | null;
}

function parseUrl(): UrlReport {
  const url = new URL(window.location.href);
  const liffState = url.searchParams.get("liff.state");
  let liffStateParsed: Record<string, string> | null = null;
  if (liffState) {
    try {
      const inner = liffState.startsWith("?") ? liffState.slice(1) : liffState;
      const params = new URLSearchParams(inner);
      liffStateParsed = {};
      params.forEach((v, k) => { liffStateParsed![k] = v; });
    } catch { liffStateParsed = null; }
  }
  return {
    href: url.href,
    search: url.search,
    hash: url.hash,
    liffState,
    liffStateParsed,
  };
}

const PRE_STYLE: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  margin: 0,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: "16px 0 8px",
  color: "#111827",
};

export default function LiffTestPage() {
  const urlReport = useMemo(parseUrl, []);
  const renderedAt = useMemo(() => new Date().toISOString(), []);

  return (
    <div style={{
      padding: 16,
      fontFamily: "system-ui, sans-serif",
      maxWidth: 720,
      margin: "0 auto",
      background: "#f9fafb",
      minHeight: "100vh",
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
        LIFF 參數測試頁
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
        目前是測試模式，正式登入暫時關閉
      </p>
      <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16 }}>
        渲染時間：{renderedAt}
      </p>

      <div style={SECTION_TITLE}>區塊 2：URL 來源解析</div>
      <pre style={PRE_STYLE}>{JSON.stringify(urlReport, null, 2)}</pre>
    </div>
  );
}
```

- [ ] **Step 2：在腦袋裡跑一遍 URL parse**

對下列假想輸入 mentally trace：
- `https://x/?cust=ABC` → `search: "?cust=ABC"`, `liffState: null`
- `https://x/?liff.state=%3Fcust%3DABC` → `search: "?liff.state=..."`, `liffStateParsed: { cust: "ABC" }`
- `https://x/#cust=ABC` → `hash: "#cust=ABC"`, `liffState: null`

`new URL` 自動 decode `liff.state` query 一次（一次 decode），第二次 `URLSearchParams` 處理 inner。OK。

- [ ] **Step 3：Commit**

```bash
git add vfs/ordering/src/pages/LiffTestPage.tsx
git commit -m "feat(ordering/liff-test): 加上 URL 三來源解析（href/search/hash/liff.state）"
```

---

## Task 3：LIFF SDK 載入 + 探測（區塊 3）

**Files:**
- Modify: `vfs/ordering/src/pages/LiffTestPage.tsx`

- [ ] **Step 1：加入 SDK 動態載入與探測 state**

在 `LiffTestPage.tsx` 頂部 imports 後加常數：

```tsx
const LIFF_ID = "2009976374-VYUpM905";
const LIFF_SDK_SRC = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const LIFF_LOAD_TIMEOUT_MS = 5000;
```

加入新的 state 介面：

```tsx
interface SdkReport {
  sdkLoad: "loading" | "ok" | "timeout" | string; // 失敗時是 "error: ..."
  init: "pending" | "ok" | string;
  isInClient: boolean | null;
  isLoggedIn: boolean | null;
  profile: { userId?: string; displayName?: string; pictureUrl?: string; statusMessage?: string } | string | null;
  idTokenPreview: string | null;
  decodedIdToken: any | string | null;
}

const INITIAL_SDK_REPORT: SdkReport = {
  sdkLoad: "loading",
  init: "pending",
  isInClient: null,
  isLoggedIn: null,
  profile: null,
  idTokenPreview: null,
  decodedIdToken: null,
};
```

把 `LiffTestPage` component 內部改成：

```tsx
export default function LiffTestPage() {
  const urlReport = useMemo(parseUrl, []);
  const renderedAt = useMemo(() => new Date().toISOString(), []);
  const [sdk, setSdk] = useState<SdkReport>(INITIAL_SDK_REPORT);
  const [probeNonce, setProbeNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const probe = async () => {
      const liff = (window as any).liff;
      if (!liff) {
        if (!cancelled) setSdk(s => ({ ...s, sdkLoad: "error: window.liff missing" }));
        return;
      }
      try {
        await liff.init({ liffId: LIFF_ID });
      } catch (e: any) {
        if (!cancelled) setSdk(s => ({ ...s, init: "error: " + (e?.message || String(e)) }));
        return;
      }
      if (cancelled) return;

      const next: Partial<SdkReport> = { init: "ok" };
      try { next.isInClient = liff.isInClient(); } catch (e: any) { next.isInClient = null; }
      try { next.isLoggedIn = liff.isLoggedIn(); } catch (e: any) { next.isLoggedIn = null; }

      try {
        const p = await liff.getProfile();
        next.profile = p;
      } catch (e: any) {
        next.profile = "error: " + (e?.message || String(e));
      }

      try {
        const tok = liff.getIDToken();
        next.idTokenPreview = tok ? (tok.slice(0, 40) + "...") : null;
      } catch (e: any) {
        next.idTokenPreview = "error: " + (e?.message || String(e));
      }

      try {
        next.decodedIdToken = liff.getDecodedIDToken();
      } catch (e: any) {
        next.decodedIdToken = "error: " + (e?.message || String(e));
      }

      if (!cancelled) setSdk(s => ({ ...s, ...next }));
    };

    // 先掛 timeout
    timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setSdk(s => s.sdkLoad === "loading" ? { ...s, sdkLoad: "timeout" } : s);
    }, LIFF_LOAD_TIMEOUT_MS);

    // 動態插入 script（若已存在則直接 probe）
    const existing = document.querySelector(`script[src="${LIFF_SDK_SRC}"]`) as HTMLScriptElement | null;
    if (existing && (window as any).liff) {
      setSdk(s => ({ ...s, sdkLoad: "ok" }));
      probe();
    } else {
      const script = existing || document.createElement("script");
      script.src = LIFF_SDK_SRC;
      script.async = true;
      script.onload = () => {
        if (cancelled) return;
        setSdk(s => ({ ...s, sdkLoad: "ok" }));
        probe();
      };
      script.onerror = (e) => {
        if (cancelled) return;
        setSdk(s => ({ ...s, sdkLoad: "error: script load failed" }));
      };
      if (!existing) document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [probeNonce]);

  // ... return JSX 在 step 2
```

import 補上：

```tsx
import React, { useMemo, useEffect, useState } from "react";
```

- [ ] **Step 2：把 SDK 區塊加進 return 的 JSX**

在 URL 區塊 `<pre>` 之後、最外層 `</div>` 之前加：

```tsx
<div style={SECTION_TITLE}>區塊 3：LIFF SDK 探測</div>
<pre style={PRE_STYLE}>{JSON.stringify(sdk, null, 2)}</pre>
```

- [ ] **Step 3：腦袋跑一遍錯誤路徑**

確認下列路徑都不會白屏（每個 try/catch 獨立）：
1. CDN 不通 → `sdkLoad: "error: script load failed"`，其他欄位停在初始值，整頁可見
2. 5 秒沒載入 → `sdkLoad: "timeout"`，同上
3. `liff.init` reject（可能 LIFF ID 錯）→ `init: "error: ..."`，後續欄位停在 null
4. `getProfile` reject（未在 LINE 登入）→ `profile: "error: ..."`，但 `isInClient`、`isLoggedIn` 仍正常
5. `getIDToken()` 回傳 `null`（scope 不足）→ `idTokenPreview: null`，不丟錯
6. `getDecodedIDToken` reject → `decodedIdToken: "error: ..."`，其他欄位仍可見

OK，每個都各自吃掉。

- [ ] **Step 4：Commit**

```bash
git add vfs/ordering/src/pages/LiffTestPage.tsx
git commit -m "feat(ordering/liff-test): 動態載入 LIFF SDK 並探測 init/profile/idToken"
```

---

## Task 4：標頭 + 操作區（區塊 1 + 4）

**Files:**
- Modify: `vfs/ordering/src/pages/LiffTestPage.tsx`

- [ ] **Step 1：加入 5 組測試 URL 範本與按鈕**

在 component function 內、JSX 之前加：

```tsx
const TEST_URLS = [
  `https://liff.line.me/${LIFF_ID}`,
  `https://liff.line.me/${LIFF_ID}?cust=ABC123`,
  `https://liff.line.me/${LIFF_ID}?cust=ABC&token=XYZ`,
  `https://liff.line.me/${LIFF_ID}#cust=ABC123`,
  `https://liff.line.me/${LIFF_ID}/some/path?cust=ABC`,
];

const copyAllAsJson = async () => {
  const payload = {
    renderedAt,
    userAgent: navigator.userAgent,
    url: urlReport,
    sdk,
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    alert("已複製到剪貼簿");
  } catch {
    // 退化方案：選取 textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); alert("已複製（fallback）"); }
    catch { alert("複製失敗，請手動 select pre 內文"); }
    document.body.removeChild(ta);
  }
};

const rerunProbe = () => setProbeNonce(n => n + 1);
```

- [ ] **Step 2：加入按鈕與 URL 範本到 JSX**

在區塊 3 `<pre>` 之後加：

```tsx
<div style={SECTION_TITLE}>區塊 4：操作</div>
<div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
  <button
    onClick={copyAllAsJson}
    style={{
      padding: "8px 12px",
      fontSize: 13,
      background: "#10b981",
      color: "#fff",
      border: "none",
      borderRadius: 6,
      cursor: "pointer",
    }}
  >
    複製全部結果為 JSON
  </button>
  <button
    onClick={rerunProbe}
    style={{
      padding: "8px 12px",
      fontSize: 13,
      background: "#fff",
      color: "#374151",
      border: "1px solid #d1d5db",
      borderRadius: 6,
      cursor: "pointer",
    }}
  >
    重新跑 SDK 探測
  </button>
</div>

<div style={{ ...SECTION_TITLE, fontSize: 12, color: "#6b7280" }}>
  測試 URL 範本（複製貼到 LINE 對話內點擊）
</div>
<pre style={PRE_STYLE}>{TEST_URLS.map((u, i) => `${i + 1}. ${u}`).join("\n")}</pre>
```

- [ ] **Step 3：Commit**

```bash
git add vfs/ordering/src/pages/LiffTestPage.tsx
git commit -m "feat(ordering/liff-test): 加上複製 JSON、重跑探測、5 組測試 URL 範本"
```

---

## Task 5：在 App.tsx 加 LIFF_TEST_MODE 開關

**Files:**
- Modify: `vfs/ordering/src/App.tsx:1-12`（加 import）
- Modify: `vfs/ordering/src/App.tsx:27-29`（加常數）
- Modify: `vfs/ordering/src/App.tsx:91-94`（加 early return）

- [ ] **Step 1：加入 LiffTestPage import**

在 App.tsx 第 2 行（`import LoginPage` 那行）後加：

```tsx
import LiffTestPage from "./pages/LiffTestPage";
```

- [ ] **Step 2：加入 LIFF_TEST_MODE 常數**

在 App.tsx 大約第 27 行（`const APP_SLUG = ...` 上方）加：

```tsx
// LIFF 參數測試模式：true 時整個 app 變成 LiffTestPage，跳過所有登入/路由
// 測完改 false 或 git revert 整個 PR
const LIFF_TEST_MODE = true;
```

- [ ] **Step 3：在 App() 函式入口加 early return**

在 `export default function App() {` 之後、`const [user, setUser] = useState...` 之前（即第 91 行 function 簽章後第一行）加：

```tsx
  if (LIFF_TEST_MODE) return <LiffTestPage />;
```

注意：放在 `useState` 之前是 OK 的，因為 React 在條件 early return 不調用 hooks 是安全的（前提是 `LIFF_TEST_MODE` 是常數，render 期間不會變 → hook 數量穩定）。

- [ ] **Step 4：腦袋跑一遍 hook 規則**

`LIFF_TEST_MODE` 是頂層常數（不是 state、不是 props），所以：
- 渲染週期內不會切換
- React hook 規則「同一 component 每次 render 必須以相同順序呼叫相同數量 hooks」**不會被違反**，因為條件本身在 component lifetime 內固定
- 等同於兩個不同的 component 在編譯時被選擇

OK，安全。

- [ ] **Step 5：Commit**

```bash
git add vfs/ordering/src/App.tsx
git commit -m "feat(ordering): 加 LIFF_TEST_MODE 開關，true 時 app 接管成測試頁"
```

---

## Task 6：型別檢查（best-effort）

**Files:** 無修改

- [ ] **Step 1：嘗試 tsc --noEmit**

`vfs/ordering` 沒有獨立 tsconfig，但根目錄 `ordering/tsconfig.json`、`ordering/tsconfig.app.json` 結構類似（都是 React 18+ + TS 5）。可選：

```bash
cd vfs/ordering && npx -y typescript@5 tsc --noEmit --jsx react-jsx --target ES2020 --module ESNext --moduleResolution bundler --strict --skipLibCheck --esModuleInterop --allowSyntheticDefaultImports --types react,react-dom src/pages/LiffTestPage.tsx src/App.tsx 2>&1 | head -30
```

預期：可能會抱怨 React 全域 types、`window` 屬性等，但**不應該有真正的型別錯誤**。

如果 tsc 在 vfs/ordering 跑不起來，跳過此步驟，靠 Task 7 的部署來驗證。

- [ ] **Step 2：人工 review LiffTestPage.tsx 整檔**

讀一遍完整檔案，檢查：
- 所有 `(window as any).liff` 用法都包在 try/catch 或 null check 內
- 所有 `useState` / `useMemo` / `useEffect` 都在 component function 內
- `useEffect` 的 cleanup 有 set `cancelled = true`
- 沒有 typo、沒有用到未定義的變數

---

## Task 7：部署 + 手動測試

**Files:** 無修改（只執行部署 + 收集結果）

- [ ] **Step 1：確認 .env 載入**

```bash
set -a && source .env && set +a
echo $AIGO_EMAIL  # 應顯示信箱
```

- [ ] **Step 2：部署 ordering app**

```bash
python3 vfs/scripts/deploy_ordering.py
```

預期輸出：4 個步驟（login / refs / upload vfs / publish）皆成功，最後一行印出 publish OK 訊息。

- [ ] **Step 3：開啟手機 LINE，貼上測試 URL 1 並點擊**

```
https://liff.line.me/2009976374-VYUpM905
```

- [ ] **Step 4：觀察 LiffTestPage 是否正常顯示**

預期：
- 標頭、URL 區塊、SDK 區塊、操作區塊都看得到
- 區塊 2 `href` 包含 `ordering.apps.ai-go.app/ext-runtime`
- 區塊 3 `sdkLoad: "ok"`、`init: "ok"`、`isInClient: true`、`profile.userId` 有值

如果 SDK 區塊全 error 但 URL 區塊正常 → 還是有效結果（路線 1 設計仍可推進）。
如果整頁白屏 → 回 Task 6 重新檢查程式。

- [ ] **Step 5：按「複製全部結果為 JSON」並貼回 chat**

主要看區塊 2 的 `search` / `hash` / `liffState` 是不是空的。

- [ ] **Step 6：重複 URL 2、3、4、5**

每次都按複製 JSON 貼回 chat。對 URL 4（hash 形式）和 URL 5（path 形式）特別觀察是否還能進到 LiffTestPage（如果連頁面都進不來，那就是 LIFF 不接受該形式的 URL 變體）。

- [ ] **Step 7：彙整測試報告**

開新檔 `docs/superpowers/specs/2026-05-09-liff-test-results.md`，列：
- 5 組 URL 各自的 raw JSON 輸出
- 結論 1：路線 1 可行性 — 哪種 URL 形式（query / hash / path）的參數能存活
- 結論 2：LINE userId 取得方式 — `getProfile().userId` 與 `getDecodedIDToken().sub` 是否一致、誰可用
- 結論 3：S2 應走路線 1 還是路線 2

---

## Task 8：清理（依結果二擇一）

**Files:**
- Modify: `vfs/ordering/src/App.tsx`（改 LIFF_TEST_MODE = false）
- 或：`git revert` 整個 PR

- [ ] **Step 1：根據 PR review 決定**

選項 A：保留 LiffTestPage 與開關（之後可能再開測），把 `LIFF_TEST_MODE` 改 `false`
選項 B：完全 revert（最乾淨）

- [ ] **Step 2A（若選 A）：關開關並重新部署**

```bash
# 編輯 App.tsx 把 LIFF_TEST_MODE 改 false
git add vfs/ordering/src/App.tsx
git commit -m "chore(ordering): LIFF 參數測試結束，關閉 LIFF_TEST_MODE 開關"
python3 vfs/scripts/deploy_ordering.py
```

- [ ] **Step 2B（若選 B）：revert 整個 PR**

```bash
# 在 main 上 revert merge commit
git checkout main && git pull --ff-only
git revert -m 1 <merge-commit-sha>
python3 vfs/scripts/deploy_ordering.py
```

- [ ] **Step 3：驗證正式登入頁恢復**

桌面瀏覽器打開 `https://ordering.apps.ai-go.app/ext-runtime`，應看到原本的 LoginPage（Email + 密碼欄位 + LINE 登入按鈕），不再是 LiffTestPage。

---

## Self-Review Checklist

完成計劃後跑一遍：

- ✅ **Spec coverage**：spec 八個段落（背景、範圍、既有狀態、架構、UI、資料流、錯誤處理、測試計畫、退場、風險）對應到 Task：
  - 架構 + 檔案異動 → Task 1, 5
  - UI 區塊 1+2 → Task 1, 2
  - UI 區塊 3 → Task 3
  - UI 區塊 4 → Task 4
  - 資料流（init → probe）→ Task 3
  - 錯誤處理 → Task 3 step 3
  - 測試計畫 → Task 7
  - 退場機制 → Task 8
  - 風險「測完忘記改回 false」→ Task 8 強制執行
- ✅ **無 placeholder**：每個 step 都有具體程式碼或具體指令
- ✅ **型別一致性**：`SdkReport` 在 Task 3 定義，Task 4 用同樣欄位序列化；`UrlReport` 同
- ✅ **檔案路徑全是絕對 / 完整 vfs 路徑**

---

## Execution Notes

- 整個 PR 預期 5~8 個 commit（task 1~5 各 1，6 不 commit，7 不 commit，8 一個）
- Task 1~5 純前端，本地 0 副作用（不部署、不打 API）
- Task 7 才會部署、影響 production LIFF 進站行為
- 測試窗口期建議：先和主管確認測試時段（避開客戶下單尖峰）再跑 Task 7
