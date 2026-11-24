/**
 * 執行管考與雙軌分權月報模組（組合 4B：普魯士藍底撞柿子橘）
 * - 署端管理者：完整維護經費生命週期、納入新年度核定批次、檢視各分署月報燈號與標餘款、結案歸檔
 * - 河川分署端：鎖定本分署未結案案件，表格行內快填日期與進度，經費欄位強制唯讀
 */

let execRecords = [];
let execLoaded = false;
let execCurrentMonth = "";
let branchSession = { branch: "", passcode: "" };
let execDirtyMap = {}; // { exec_id: { field: value } }

const EXEC_STATUS_LIST = [
  "未發包", "已上網", "已決標待開工", "施工中", "已完工待結算", "已結案", "停工/撤案"
];

const BRANCH_STATUS_LIST = [
  "未發包", "已上網", "已決標待開工", "施工中", "已完工待結算", "停工/撤案"
];

const ACTUAL_DATE_FIELDS = ["實際上網日", "實際決標日", "實際開工日", "實際完工日"];

const ALL_BRANCH_KEYS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "水規分署"];

function normalizeExecBranchKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.includes("水規")) return "水規分署";
  return s.replace(/^第/, "").replace(/河川分署$/, "").replace(/分署$/, "").trim();
}

function displayExecBranch(raw) {
  const k = normalizeExecBranchKey(raw);
  if (!k) return "-";
  return k === "水規分署" ? "水規分署" : `${k}分署`;
}

function formatBatchShortTag(batchStr) {
  const s = String(batchStr || "").trim();
  if (s.includes("期中") || s.includes("下半年") || s.includes("增辦")) return "期中";
  return "先期";
}

function deriveExecStatusFromDates(currentStatus, dateObj, forceResetIfEmpty = false) {
  const cur = String(currentStatus || "").trim();
  if (cur === "已結案" || cur === "停工/撤案") {
    return cur;
  }
  if (dateObj["實際完工日"]) return "已完工待結算";
  if (dateObj["實際開工日"]) return "施工中";
  if (dateObj["實際決標日"]) return "已決標待開工";
  if (dateObj["實際上網日"]) return "已上網";
  return forceResetIfEmpty ? "未發包" : (cur || "未發包");
}

function getLocalRocYearMonth() {
  if (execCurrentMonth) return execCurrentMonth;
  const now = new Date();
  const y = now.getFullYear() - 1911;
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function switchLoginRole(role) {
  const isBranch = role === "branch";
  const btnA = document.getElementById("btnRoleAdmin");
  const btnB = document.getElementById("btnRoleBranch");
  const panelA = document.getElementById("adminLoginPanel");
  const panelB = document.getElementById("branchLoginPanel");

  if (btnA && btnB) {
    btnA.classList.toggle("bg-[#ED6D35]", !isBranch);
    btnA.classList.toggle("text-white", !isBranch);
    btnA.classList.toggle("text-[#1D3557]", isBranch);

    btnB.classList.toggle("bg-[#004E89]", isBranch);
    btnB.classList.toggle("text-white", isBranch);
    btnB.classList.toggle("text-[#1D3557]", !isBranch);
  }
  if (panelA) panelA.classList.toggle("hidden", isBranch);
  if (panelB) panelB.classList.toggle("hidden", !isBranch);

  if (isBranch) {
    const inp = document.getElementById("inputBranchPass");
    if (inp) inp.focus();
  } else {
    const inp = document.getElementById("inputAdminPass");
    if (inp) inp.focus();
  }
}

async function submitBranchLogin() {
  const branch = document.getElementById("selLoginBranch").value;
  const pass = document.getElementById("inputBranchPass").value.trim();
  if (!branch || !pass) {
    alert("請選擇分署並輸入通行碼");
    return;
  }
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "verify_branch", branch, passcode: pass })
    });
    const json = await res.json();
    if (json.status === "success") {
      if (adminPasscode && typeof logoutAdmin === "function") {
        logoutAdmin();
      }
      branchSession = { branch: json.branch, passcode: pass };
      execDirtyMap = {};
      closeAdminModal();
      syncExecAuthUI();
      switchTab("exec");
      alert(`${displayExecBranch(branchSession.branch)} 登入成功！已切換至本月執行管考填報畫面。`);
    } else {
      alert(json.message || "分署通行碼錯誤");
    }
  } catch (err) {
    alert("驗證連線失敗：" + err.message);
  }
}

function logoutBranch() {
  branchSession = { branch: "", passcode: "" };
  execDirtyMap = {};
  const inp = document.getElementById("inputBranchPass");
  if (inp) inp.value = "";
  syncExecAuthUI();
  renderExecView();
}

function syncExecAuthUI() {
  const isAdmin = Boolean(adminPasscode);
  const isBranch = Boolean(branchSession.branch && branchSession.passcode);

  const menuLogin = document.getElementById("menuAdminLogin");
  const menuBranchLogout = document.getElementById("menuBranchLogout");
  const lblBranchLogout = document.getElementById("lblBranchLogoutText");
  const dot = document.getElementById("adminIndicatorDot");

  if (isAdmin && isBranch) {
    branchSession = { branch: "", passcode: "" };
  }

  if (menuLogin) {
    menuLogin.classList.toggle("hidden", isAdmin || Boolean(branchSession.branch));
  }
  if (menuBranchLogout) {
    menuBranchLogout.classList.toggle("hidden", !branchSession.branch);
  }
  if (lblBranchLogout && branchSession.branch) {
    lblBranchLogout.textContent = `${displayExecBranch(branchSession.branch)} 已登入 (登出)`;
  }
  if (dot) {
    dot.classList.toggle("hidden", !(isAdmin || Boolean(branchSession.branch)));
  }

  const execView = document.getElementById("viewExec");
  if (execView && !execView.classList.contains("hidden")) {
    renderExecView();
  }
}

async function onEnterExecTab() {
  ensureExecModals();
  if (!execLoaded) {
    await loadExecData(false);
  } else {
    renderExecView();
  }
}

async function loadExecData(forceNotify) {
  ensureExecModals();
  const container = document.getElementById("viewExec");
  if (container && !execLoaded) {
    container.innerHTML = `<div class="py-10 text-center text-xs text-[#1D3557]/60">正在從雲端載入動態管考資料...</div>`;
  }
  try {
    const res = await fetch(`${GAS_API_URL}?type=execution`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== "success") throw new Error(json.message || "讀取管考資料失敗");

    execRecords = json.data || [];
    execCurrentMonth = json.currentMonth || getLocalRocYearMonth();
    execLoaded = true;
    execDirtyMap = {};
    renderExecView();
    if (forceNotify) alert(`執行管考資料已更新，共 ${execRecords.length} 筆。`);
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="py-8 text-center text-xs text-rose-600">載入管考資料失敗：${escapeHtmlAttr(err.message)}</div>`;
    }
  }
}

function isExecDelayed(rec) {
  const effStatus = deriveExecStatusFromDates(rec["執行狀態"], rec, false);
  if (effStatus === "已結案" || effStatus === "停工/撤案") return false;
  const planP = parseFloat(rec["預定進度_%"]) || 0;
  const actP = parseFloat(rec["實際進度_%"]) || 0;
  if (planP - actP >= 5) return true;

  const today = new Date().toISOString().slice(0, 10);
  if (rec["預定上網日"] && !rec["實際上網日"] && rec["預定上網日"] < today) return true;
  if (rec["預定開工日"] && !rec["實際開工日"] && rec["預定開工日"] < today) return true;
  if (rec["預定完工日"] && !rec["實際完工日"] && rec["預定完工日"] < today) return true;
  return false;
}

function calcExecFinancials(rec) {
  const approved = parseFloat(rec["核定預算_千元"]) || 0;
  const deltaBudget = parseFloat(rec["增減預算_千元"]) || 0;
  const revisedBudget = approved + deltaBudget;
  const bidAmt = parseFloat(rec["發包金額_千元"]) || 0;
  const changeAmt = parseFloat(rec["變更追加減_千元"]) || 0;
  const savings = bidAmt > 0 ? (revisedBudget - bidAmt) : 0;
  const contractTotal = bidAmt > 0 ? (bidAmt + changeAmt) : 0;
  return { approved, deltaBudget, revisedBudget, bidAmt, changeAmt, savings, contractTotal };
}

function getExecFilterState() {
  return {
    status: document.getElementById("selExecStatus")?.value || "active",
    batch: document.getElementById("selExecBatch")?.value || "ALL",
    branch: document.getElementById("selExecBranch")?.value || "ALL",
    kw: normalizeText(document.getElementById("txtExecKeyword")?.value || "").toLowerCase()
  };
}

function filterExecByBranchPill(branchKey) {
  const sel = document.getElementById("selExecBranch");
  if (!sel) return;
  sel.value = sel.value === branchKey ? "ALL" : branchKey;
  renderExecTableBody();
}

function renderExecView() {
  const container = document.getElementById("viewExec");
  if (!container) return;

  const prevFilters = getExecFilterState();
  const isAdmin = Boolean(adminPasscode);
  const isBranch = Boolean(branchSession.branch && branchSession.passcode);
  const curMonth = getLocalRocYearMonth();

  const scopeRecords = isBranch
    ? execRecords.filter(r => normalizeExecBranchKey(r["分署"]) === branchSession.branch)
    : execRecords;

  const activeRecords = scopeRecords.filter(r => {
    const st = deriveExecStatusFromDates(r["執行狀態"], r, false);
    return st !== "已結案" && st !== "停工/撤案";
  });
  const delayedCount = activeRecords.filter(isExecDelayed).length;
  const updatedThisMonth = activeRecords.filter(r => r["最後更新月份"] === curMonth).length;
  const totalRevisedYi = activeRecords.reduce((acc, r) => acc + calcExecFinancials(r).revisedBudget, 0) / 100000;
  const totalSavingsYi = activeRecords.reduce((acc, r) => acc + calcExecFinancials(r).savings, 0) / 100000;

  let branchStatusStrip = "";
  if (!isBranch && execRecords.length > 0) {
    const pills = ALL_BRANCH_KEYS.map(bKey => {
      const bAct = execRecords.filter(r => {
        const st = deriveExecStatusFromDates(r["執行狀態"], r, false);
        return normalizeExecBranchKey(r["分署"]) === bKey && st !== "已結案" && st !== "停工/撤案";
      });
      if (!bAct.length) return "";
      const done = bAct.filter(r => r["最後更新月份"] === curMonth).length;
      const allDone = done === bAct.length;
      const cls = allDone
        ? "bg-[#1D3557] border-[#1D3557] text-white"
        : (done > 0 ? "bg-[#FAF3E0] border-[#ED6D35]/50 text-[#ED6D35]" : "bg-white border-[#1D3557]/20 text-[#1D3557]");
      return `
        <button type="button" onclick="filterExecByBranchPill('${bKey}')" class="px-2 py-0.5 rounded border text-[11px] font-medium ${cls} hover:opacity-85 transition">
          ${displayExecBranch(bKey)} ${done}/${bAct.length}${allDone ? " ✓" : ""}
        </button>
      `;
    }).filter(Boolean).join("");

    if (pills) {
      branchStatusStrip = `
        <div class="flex flex-wrap items-center gap-1.5 bg-[#FAF3E0]/70 border border-[#1D3557]/15 rounded-md px-2.5 py-2 mb-2.5">
          <span class="text-[11px] font-bold text-[#1D3557] mr-1">${curMonth} 月報填報進度（點擊篩選）：</span>
          ${pills}
        </div>
      `;
    }
  }

  const batches = Array.from(new Set(execRecords.map(r => r["核定批次"]).filter(Boolean))).sort().reverse();
  const dirtyCount = Object.keys(execDirtyMap).length;

  container.innerHTML = `
    <!-- 頂部精簡管考摘要列（組合 4B：柿子橘焦點卡 ＋ 復古奶油白數據卡） -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2.5 text-xs">
      <div class="bg-[#ED6D35] text-white border border-[#ED6D35] rounded-md px-3 py-2 shadow-xs">
        <div class="text-[11px] text-white/90">進行中管考案件${isBranch ? `（${displayExecBranch(branchSession.branch)}）` : ""}</div>
        <div class="text-base font-bold text-white mt-0.5">${activeRecords.length.toLocaleString()} 筆</div>
      </div>
      <div class="bg-[#FAF3E0] border border-rose-300/70 rounded-md px-3 py-2">
        <div class="text-[11px] text-rose-700 font-medium">落後 / 逾期預警（落後 ≥ 5% 或逾日）</div>
        <div class="text-base font-bold text-rose-700 mt-0.5">${delayedCount.toLocaleString()} 筆</div>
      </div>
      <div class="bg-[#FAF3E0] border border-[#1D3557]/15 rounded-md px-3 py-2">
        <div class="text-[11px] text-[#1D3557]/80 font-medium">進行中核定總預算 / 標餘款</div>
        <div class="text-sm font-bold text-[#1D3557] mt-1">${totalRevisedYi.toFixed(2)} 億 ／ <span class="text-[#004E89]">餘 ${totalSavingsYi.toFixed(2)} 億</span></div>
      </div>
      <div class="bg-[#FAF3E0] border border-[#1D3557]/15 rounded-md px-3 py-2">
        <div class="text-[11px] text-[#1D3557]/80 font-medium">${curMonth} 本月進度更新率</div>
        <div class="text-base font-bold text-[#ED6D35] mt-0.5">${updatedThisMonth} / ${activeRecords.length} 筆</div>
      </div>
    </div>

    ${branchStatusStrip}

    <!-- 工具列與篩選 -->
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
      <div class="flex flex-wrap items-center gap-2">
        <select id="selExecStatus" onchange="renderExecTableBody()" class="border border-[#1D3557]/20 rounded px-2 py-1 bg-white text-[#1D3557]">
          <option value="active">進行中（不含結案）</option>
          <option value="delayed">落後 / 逾期預警</option>
          <option value="未發包">未發包</option>
          <option value="已上網">已上網</option>
          <option value="已決標待開工">已決標待開工</option>
          <option value="施工中">施工中</option>
          <option value="已完工待結算">已完工待結算</option>
          <option value="已結案">已結案（歷史封存）</option>
          <option value="ALL">全部狀態</option>
        </select>

        <select id="selExecBatch" onchange="renderExecTableBody()" class="border border-[#1D3557]/20 rounded px-2 py-1 bg-white text-[#1D3557]">
          <option value="ALL">全部核定梯次</option>
          ${batches.map(b => `<option value="${escapeHtmlAttr(b)}">${escapeHtmlAttr(b)}</option>`).join("")}
        </select>

        ${!isBranch ? `
          <select id="selExecBranch" onchange="renderExecTableBody()" class="border border-[#1D3557]/20 rounded px-2 py-1 bg-white text-[#1D3557]">
            <option value="ALL">全部分署</option>
            ${ALL_BRANCH_KEYS.map(b => `<option value="${b}">${displayExecBranch(b)}</option>`).join("")}
          </select>
        ` : `<input type="hidden" id="selExecBranch" value="${branchSession.branch}" />`}

        <input id="txtExecKeyword" type="text" oninput="renderExecTableBody()" placeholder="搜尋案名 / 編號 / 水系" class="border border-[#1D3557]/20 rounded px-2 py-1 bg-white text-[#1D3557] w-44" />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" onclick="loadExecData(true)" class="px-2.5 py-1 rounded border border-[#1D3557]/20 bg-white hover:bg-[#FAF3E0] text-[#1D3557] font-bold transition">重新載入</button>
        ${isAdmin ? `
          <button type="button" onclick="openExecImportModal()" class="px-3 py-1 rounded bg-[#ED6D35] hover:bg-[#D65A24] text-white font-bold transition">＋ 納入管考</button>
        ` : ""}
        ${isBranch ? `
          <button type="button" id="btnSaveBranchExec" onclick="saveBranchExecUpdates()" class="px-3.5 py-1 rounded bg-[#ED6D35] hover:bg-[#D65A24] text-white font-bold transition">
            儲存本月填報進度 (${dirtyCount})
          </button>
        ` : ""}
        ${(!isAdmin && !isBranch) ? `
          <button type="button" onclick="openAdminModal(); switchLoginRole('branch');" class="px-3 py-1 rounded bg-[#004E89] hover:bg-[#1D3557] text-white font-bold transition">分署月報登入</button>
        ` : ""}
      </div>
    </div>

    ${isBranch ? `<div class="text-[11px] text-[#1D3557] bg-[#FAF3E0] border border-[#ED6D35]/40 rounded px-2.5 py-1.5 mb-2">填報說明：您目前以 <b>${displayExecBranch(branchSession.branch)}</b> 身分登入，可直接於表格內更新日期、預定/實際進度(%)與辦理情形（填寫實際日期將自動更新執行狀態），完成後請點擊右上角「儲存本月填報進度」。經費欄位由署端統一維護（唯讀）。</div>` : ""}

    <!-- 管考主表格 -->
    <div class="overflow-x-auto bg-white border border-[#1D3557]/15 rounded shadow-xs">
      <table class="w-full text-left border-collapse text-xs">
        <thead class="sticky top-0 z-10">
          ${isBranch ? `
            <tr>
              <th class="px-2 py-2 whitespace-nowrap text-center">年度</th>
              <th class="px-2 py-2 min-w-[210px]">案件名稱 / 編號</th>
              <th class="px-2 py-2 whitespace-nowrap text-right">核定預算(千元)</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">執行狀態</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">上網日 (預/實)</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">決標日 (預/實)</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">開工日 (預/實)</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">完工日 (預/實)</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">進度% (預/實)</th>
              <th class="px-2 py-2 min-w-[180px]">辦理情形與落後說明</th>
            </tr>
          ` : `
            <tr>
              <th class="px-2 py-2 whitespace-nowrap text-center">年度</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">分署</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">性質 / 類別</th>
              <th class="px-2 py-2 min-w-[220px]">案件名稱 / 編號</th>
              <th class="px-2 py-2 whitespace-nowrap text-right">核定預算</th>
              <th class="px-2 py-2 whitespace-nowrap text-right">發包金額</th>
              <th class="px-2 py-2 whitespace-nowrap text-right">標餘款</th>
              <th class="px-2 py-2 whitespace-nowrap text-right">契約總價</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">執行狀態</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">進度 (預/實/月增)</th>
              <th class="px-2 py-2 whitespace-nowrap text-center">更新月份</th>
              <th class="px-2 py-2 min-w-[160px]">辦理情形</th>
              ${isAdmin ? `<th class="px-2 py-2 whitespace-nowrap text-center">經費/管考</th>` : ""}
            </tr>
          `}
        </thead>
        <tbody id="tbodyExec" class="divide-y divide-slate-200"></tbody>
      </table>
    </div>
  `;

  const selStatus = document.getElementById("selExecStatus");
  const selBatch = document.getElementById("selExecBatch");
  const selBranch = document.getElementById("selExecBranch");
  const txtKw = document.getElementById("txtExecKeyword");
  if (selStatus) selStatus.value = prevFilters.status;
  if (selBatch && batches.includes(prevFilters.batch)) selBatch.value = prevFilters.batch;
  if (selBranch && !isBranch) selBranch.value = prevFilters.branch;
  if (txtKw) txtKw.value = prevFilters.kw;

  renderExecTableBody();
}

function onBranchCellChange(execId, field, value) {
  if (!execDirtyMap[execId]) {
    execDirtyMap[execId] = { exec_id: execId };
  }
  execDirtyMap[execId][field] = value;

  if (ACTUAL_DATE_FIELDS.includes(field)) {
    const orig = execRecords.find(r => r.exec_id === execId) || {};
    const merged = { ...orig, ...execDirtyMap[execId] };
    const nextStatus = deriveExecStatusFromDates(merged["執行狀態"], merged, true);
    execDirtyMap[execId]["執行狀態"] = nextStatus;

    const statusSel = document.querySelector(`select[data-exec-status="${execId}"]`);
    if (statusSel) {
      statusSel.value = nextStatus;
    }
  }

  const tr = document.querySelector(`tr[data-exec-id="${execId}"]`);
  if (tr) {
    tr.classList.add("bg-[#FAF3E0]");
  }
  const btn = document.getElementById("btnSaveBranchExec");
  if (btn) {
    btn.textContent = `儲存本月填報進度 (${Object.keys(execDirtyMap).length})`;
  }
}

function syncAdminModalStatusFromDates() {
  const statusEl = document.getElementById("execEdStatus");
  if (!statusEl) return;
  const dateObj = {
    "實際上網日": document.getElementById("execEdActBid")?.value || "",
    "實際決標日": document.getElementById("execEdActAward")?.value || "",
    "實際開工日": document.getElementById("execEdActStart")?.value || "",
    "實際完工日": document.getElementById("execEdActEnd")?.value || ""
  };
  statusEl.value = deriveExecStatusFromDates(statusEl.value, dateObj, true);
}

function renderExecTableBody() {
  const tbody = document.getElementById("tbodyExec");
  if (!tbody) return;

  const isAdmin = Boolean(adminPasscode);
  const isBranch = Boolean(branchSession.branch && branchSession.passcode);
  const { status, batch, branch, kw } = getExecFilterState();

  const rows = execRecords.filter(r => {
    const effStatus = deriveExecStatusFromDates(r["執行狀態"], r, false);
    if (isBranch && normalizeExecBranchKey(r["分署"]) !== branchSession.branch) return false;
    if (!isBranch && branch !== "ALL" && normalizeExecBranchKey(r["分署"]) !== branch) return false;
    if (batch !== "ALL" && r["核定批次"] !== batch) return false;

    if (status === "active") {
      if (effStatus === "已結案" || effStatus === "停工/撤案") return false;
    } else if (status === "delayed") {
      if (!isExecDelayed(r)) return false;
    } else if (status !== "ALL") {
      if (effStatus !== status) return false;
    }

    if (kw) {
      const hay = `${r["案件名稱"]} ${r["工程編號"]} ${r["水系"]} ${r["縣市"]} ${r["辦理情形與落後說明"]}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="py-8 text-center text-slate-400">目前無符合條件的管考案件${isAdmin ? "（可點擊上方「＋ 納入管考」從核定總庫匯入年度案件）" : ""}</td></tr>`;
    return;
  }

  if (isBranch) {
    tbody.innerHTML = rows.map(r => {
      const dirty = execDirtyMap[r.exec_id] || {};
      const val = f => (dirty[f] !== undefined ? dirty[f] : r[f]);
      const mergedForStatus = { ...r, ...dirty };
      const currentStatus = deriveExecStatusFromDates(val("執行狀態"), mergedForStatus, false);
      const fin = calcExecFinancials(r);
      const isClosed = currentStatus === "已結案";
      const dis = isClosed ? "disabled" : "";
      const rowBg = execDirtyMap[r.exec_id] ? "bg-[#FAF3E0]" : "bg-white";
      const prevP = parseFloat(r["上月實際進度_%"]) || 0;
      const yearNum = r["最新年度"] || r["起始年度"] || "-";
      const phaseTag = formatBatchShortTag(r["核定批次"]);
      const phaseCls = phaseTag === "期中" ? "text-[#ED6D35]" : "text-[#1D3557]/55";

      return `
        <tr data-exec-id="${escapeHtmlAttr(r.exec_id)}" class="${rowBg} hover:bg-[#FAF3E0]/60 align-top">
          <td class="px-2 py-2 text-center whitespace-nowrap">
            <div class="font-bold text-[#1D3557]">${escapeHtmlAttr(yearNum)}</div>
            <div class="text-[10px] font-medium ${phaseCls}">${phaseTag}</div>
          </td>
          <td class="px-2 py-2">
            <div class="font-bold text-[#1D3557] leading-snug">${escapeHtmlAttr(r["案件名稱"])}</div>
            <div class="text-[10px] text-[#1D3557]/60 font-mono mt-0.5">${escapeHtmlAttr(r["性質"])}・${escapeHtmlAttr(r["類別"])}｜${escapeHtmlAttr(r["縣市"])}・${escapeHtmlAttr(r["水系"])}｜${escapeHtmlAttr(r["工程編號"] || "-")}</div>
          </td>
          <td class="px-2 py-2 text-right font-mono text-[#1D3557] whitespace-nowrap">
            <div>${formatIntThousand(fin.revisedBudget)}</div>
            ${fin.bidAmt > 0 ? `<div class="text-[10px] text-[#004E89]">發包:${formatIntThousand(fin.bidAmt)}</div>` : ""}
          </td>
          <td class="px-1.5 py-2 text-center">
            <select ${dis} data-exec-status="${escapeHtmlAttr(r.exec_id)}" onchange="onBranchCellChange('${r.exec_id}', '執行狀態', this.value)" class="border border-[#1D3557]/25 rounded px-1 py-1 bg-white text-[#1D3557] text-[11px]">
              ${(isClosed ? EXEC_STATUS_LIST : BRANCH_STATUS_LIST).map(st => `<option value="${st}" ${currentStatus === st ? "selected" : ""}>${st}</option>`).join("")}
            </select>
          </td>
          <td class="px-1 py-1.5 space-y-1">
            <input type="date" ${dis} value="${escapeHtmlAttr(val("預定上網日"))}" onchange="onBranchCellChange('${r.exec_id}', '預定上網日', this.value)" title="預定上網日" class="block w-[114px] border border-slate-200 rounded px-1 py-0.5 text-[11px]" />
            <input type="date" ${dis} value="${escapeHtmlAttr(val("實際上網日"))}" onchange="onBranchCellChange('${r.exec_id}', '實際上網日', this.value)" title="實際上網日" class="block w-[114px] border border-[#004E89]/50 rounded px-1 py-0.5 text-[11px]" />
          </td>
          <td class="px-1 py-1.5 space-y-1">
            <input type="date" ${dis} value="${escapeHtmlAttr(val("預定決標日"))}" onchange="onBranchCellChange('${r.exec_id}', '預定決標日', this.value)" title="預定決標日" class="block w-[114px] border border-slate-200 rounded px-1 py-0.5 text-[11px]" />
            <input type="date" ${dis} value="${escapeHtmlAttr(val("實際決標日"))}" onchange="onBranchCellChange('${r.exec_id}', '實際決標日', this.value)" title="實際決標日" class="block w-[114px] border border-[#004E89]/50 rounded px-1 py-0.5 text-[11px]" />
          </td>
          <td class="px-1 py-1.5 space-y-1">
            <input type="date" ${dis} value="${escapeHtmlAttr(val("預定開工日"))}" onchange="onBranchCellChange('${r.exec_id}', '預定開工日', this.value)" title="預定開工日" class="block w-[114px] border border-slate-200 rounded px-1 py-0.5 text-[11px]" />
            <input type="date" ${dis} value="${escapeHtmlAttr(val("實際開工日"))}" onchange="onBranchCellChange('${r.exec_id}', '實際開工日', this.value)" title="實際開工日" class="block w-[114px] border border-[#004E89]/50 rounded px-1 py-0.5 text-[11px]" />
          </td>
          <td class="px-1 py-1.5 space-y-1">
            <input type="date" ${dis} value="${escapeHtmlAttr(val("預定完工日"))}" onchange="onBranchCellChange('${r.exec_id}', '預定完工日', this.value)" title="預定完工日" class="block w-[114px] border border-slate-200 rounded px-1 py-0.5 text-[11px]" />
            <input type="date" ${dis} value="${escapeHtmlAttr(val("實際完工日"))}" onchange="onBranchCellChange('${r.exec_id}', '實際完工日', this.value)" title="實際完工日" class="block w-[114px] border border-[#004E89]/50 rounded px-1 py-0.5 text-[11px]" />
          </td>
          <td class="px-1.5 py-1.5 space-y-1 text-center">
            <div class="flex items-center gap-1 justify-center">
              <span class="text-[10px] text-slate-400">預</span>
              <input type="number" step="0.1" min="0" max="100" ${dis} value="${val("預定進度_%")}" onchange="onBranchCellChange('${r.exec_id}', '預定進度_%', this.value)" class="w-14 border border-slate-200 rounded px-1 py-0.5 text-right font-mono text-[11px]" />
            </div>
            <div class="flex items-center gap-1 justify-center">
              <span class="text-[10px] text-[#004E89] font-bold">實</span>
              <input type="number" step="0.1" min="0" max="100" ${dis} value="${val("實際進度_%")}" onchange="onBranchCellChange('${r.exec_id}', '實際進度_%', this.value)" class="w-14 border border-[#004E89]/50 rounded px-1 py-0.5 text-right font-mono text-[11px] font-bold text-[#1D3557]" />
            </div>
            <div class="text-[10px] text-slate-400">上月 ${prevP.toFixed(1)}%</div>
          </td>
          <td class="px-1.5 py-1.5">
            <textarea rows="2" ${dis} onchange="onBranchCellChange('${r.exec_id}', '辦理情形與落後說明', this.value)" placeholder="填寫最新進度或落後原因" class="w-full border border-[#1D3557]/20 rounded px-1.5 py-1 text-[11px]">${escapeHtmlAttr(val("辦理情形與落後說明"))}</textarea>
          </td>
        </tr>
      `;
    }).join("");
    return;
  }

  // 署端管理者 / 一般唯讀檢視模式
  tbody.innerHTML = rows.map((r, idx) => {
    const bg = idx % 2 === 0 ? "bg-[#F7F5F0]/75" : "bg-white";
    const fin = calcExecFinancials(r);
    const effStatus = deriveExecStatusFromDates(r["執行狀態"], r, false);
    const delayed = isExecDelayed(r);
    const planP = parseFloat(r["預定進度_%"]) || 0;
    const actP = parseFloat(r["實際進度_%"]) || 0;
    const prevP = parseFloat(r["上月實際進度_%"]) || 0;
    const diffP = actP - planP;
    const monthGain = actP - prevP;
    const yearNum = r["最新年度"] || r["起始年度"] || "-";
    const phaseTag = formatBatchShortTag(r["核定批次"]);
    const phaseCls = phaseTag === "期中" ? "text-[#ED6D35]" : "text-[#1D3557]/55";

    const statusBadge = delayed
      ? `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[11px]">${escapeHtmlAttr(effStatus)} (預警)</span>`
      : (effStatus === "已結案"
        ? `<span class="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-[11px]">已結案</span>`
        : `<span class="px-1.5 py-0.5 rounded bg-[#FAF3E0] text-[#1D3557] border border-[#1D3557]/20 font-bold text-[11px]">${escapeHtmlAttr(effStatus)}</span>`);

    const diffCls = diffP <= -5 ? "text-rose-600 font-bold" : (diffP >= 0 ? "text-[#004E89] font-bold" : "text-[#ED6D35]");

    return `
      <tr class="${bg} hover:bg-[#FAF3E0]/75">
        <td class="px-2 py-2 text-center whitespace-nowrap">
          <div class="font-bold text-[#1D3557]">${escapeHtmlAttr(yearNum)}</div>
          <div class="text-[10px] font-medium ${phaseCls}">${phaseTag}</div>
        </td>
        <td class="px-2 py-2 text-center font-bold whitespace-nowrap text-[#1D3557]">${displayExecBranch(r["分署"])}</td>
        <td class="px-2 py-2 text-center whitespace-nowrap text-[#1D3557]">
          <div>${escapeHtmlAttr(r["性質"] || "-")}</div>
          <div class="text-[10px] text-[#1D3557]/60">${escapeHtmlAttr(r["類別"] || "-")}</div>
        </td>
        <td class="px-2 py-2">
          <div class="font-bold text-[#1D3557]">${escapeHtmlAttr(r["案件名稱"])}</div>
          <div class="text-[10px] text-[#1D3557]/60 font-mono">${escapeHtmlAttr(r["縣市"])}・${escapeHtmlAttr(r["水系"])}｜${escapeHtmlAttr(r["工程編號"] || "-")}</div>
        </td>
        <td class="px-2 py-2 text-right font-mono whitespace-nowrap text-[#1D3557]">${formatIntThousand(fin.revisedBudget)}</td>
        <td class="px-2 py-2 text-right font-mono whitespace-nowrap text-[#1D3557]">${fin.bidAmt > 0 ? formatIntThousand(fin.bidAmt) : "-"}</td>
        <td class="px-2 py-2 text-right font-mono whitespace-nowrap ${fin.savings > 0 ? "text-[#004E89] font-bold" : "text-slate-400"}">${fin.bidAmt > 0 ? formatIntThousand(fin.savings) : "-"}</td>
        <td class="px-2 py-2 text-right font-mono whitespace-nowrap text-[#1D3557]">${fin.contractTotal > 0 ? formatIntThousand(fin.contractTotal) : "-"}</td>
        <td class="px-2 py-2 text-center whitespace-nowrap">${statusBadge}</td>
        <td class="px-2 py-2 text-center whitespace-nowrap font-mono">
          <div>${planP.toFixed(1)}% / <span class="${diffCls}">${actP.toFixed(1)}%</span></div>
          <div class="text-[10px] text-[#1D3557]/55">月增 ${monthGain >= 0 ? "+" : ""}${monthGain.toFixed(1)}%</div>
        </td>
        <td class="px-2 py-2 text-center whitespace-nowrap text-[#1D3557]/75">${escapeHtmlAttr(r["最後更新月份"] || "-")}</td>
        <td class="px-2 py-2 text-[#1D3557]/75 max-w-[200px] truncate" title="${escapeHtmlAttr(r["辦理情形與落後說明"])}">${escapeHtmlAttr(r["辦理情形與落後說明"] || "-")}</td>
        ${isAdmin ? `
          <td class="px-2 py-2 text-center whitespace-nowrap">
            <button type="button" onclick="openAdminExecEditModal('${escapeHtmlAttr(r.exec_id)}')" class="px-2 py-1 rounded bg-[#FAF3E0] hover:bg-[#ED6D35] text-[#1D3557] hover:text-white border border-[#1D3557]/20 font-bold text-[11px] transition">維護</button>
          </td>
        ` : ""}
      </tr>
    `;
  }).join("");
}

async function saveBranchExecUpdates() {
  const updates = Object.values(execDirtyMap);
  if (!updates.length) {
    alert("目前尚未修改任何案件進度。");
    return;
  }
  const btn = document.getElementById("btnSaveBranchExec");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "雲端儲存中...";
  }
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "branch_batch_update_exec",
        branch: branchSession.branch,
        passcode: branchSession.passcode,
        updates
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      alert(json.message);
      await loadExecData(false);
    } else {
      alert(json.message || "儲存失敗");
    }
  } catch (err) {
    alert("雲端寫入失敗：" + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function ensureExecModals() {
  if (!document.getElementById("modalExecImport")) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="modalExecImport" class="hidden fixed inset-0 bg-[#1D3557]/65 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
        <div class="bg-[#F7F5F0] rounded-lg shadow-xl border border-white/20 p-5 w-full max-w-md space-y-3 text-xs">
          <h2 class="text-base font-bold text-[#1D3557]">納入年度核定案件至執行管考池</h2>
          <p class="text-[#1D3557]/80">系統會從歷年核定總庫篩選出該年度核定經費 > 0 之案件，新案自動建卡、跨年延續案自動更新預算並保留既有施工進度。</p>
          <div>
            <label class="font-bold text-[#1D3557] block mb-1">選擇要納入的核定年度</label>
            <select id="selExecImportYear" onchange="updateExecImportPreviewCount()" class="w-full border border-[#1D3557]/20 rounded px-2 py-1.5 bg-white text-[#1D3557]"></select>
          </div>
          <div>
            <label class="font-bold text-[#1D3557] block mb-1">核定梯次（上半年／下半年）</label>
            <select id="selExecImportPhase" class="w-full border border-[#1D3557]/20 rounded px-2 py-1.5 bg-white text-[#1D3557]">
              <option value="先期">先期（上半年核定）</option>
              <option value="期中">期中（下半年增辦）</option>
            </select>
          </div>
          <div id="lblExecImportCount" class="bg-[#FAF3E0] text-[#1D3557] border border-[#1D3557]/15 rounded p-2 font-medium"></div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" onclick="document.getElementById('modalExecImport').classList.add('hidden')" class="px-3 py-1.5 bg-white border border-[#1D3557]/20 text-[#1D3557] rounded font-bold">取消</button>
            <button type="button" id="btnConfirmExecImport" onclick="confirmImportToExec()" class="px-4 py-1.5 bg-[#ED6D35] hover:bg-[#D65A24] text-white rounded font-bold transition">確認納入管考</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap.firstElementChild);
  }

  if (!document.getElementById("modalExecEdit")) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="modalExecEdit" class="hidden fixed inset-0 bg-[#1D3557]/65 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
        <div class="bg-[#F7F5F0] rounded-lg shadow-xl border border-white/20 p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-3 text-xs">
          <div class="flex items-center justify-between border-b border-[#1D3557]/15 pb-2">
            <h2 class="text-base font-bold text-[#1D3557]">署端經費生命週期與管考維護</h2>
            <span id="execEditSubTitle" class="text-[11px] text-[#004E89] font-medium"></span>
          </div>
          <input type="hidden" id="execEditId" />
          <div id="execEditNameBanner" class="font-bold text-sm text-[#1D3557] bg-[#FAF3E0] border border-[#1D3557]/15 rounded p-2"></div>

          <div class="font-bold text-[#004E89] pt-1">一、經費生命週期（單位：千元，僅限署端維護）</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div><label class="block mb-1 text-[#1D3557]/80">核定預算</label><input id="execEdApproved" type="number" step="0.001" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/80">增減預算 (+/-)</label><input id="execEdDelta" type="number" step="0.001" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/80">發包金額</label><input id="execEdBid" type="number" step="0.001" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/80">變更設計追加減 (+/-)</label><input id="execEdChange" type="number" step="0.001" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/80">完工結算金額</label><input id="execEdSettle" type="number" step="0.001" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/80">最終決算金額</label><input id="execEdFinal" type="number" step="0.001" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1" /></div>
          </div>

          <div class="font-bold text-[#ED6D35] pt-1">二、執行狀態、關鍵日期與進度覆核</div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label class="block mb-1 text-[#1D3557]/80">核定梯次</label>
              <input id="execEdBatch" type="text" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1" />
            </div>
            <div>
              <label class="block mb-1 text-[#1D3557]/80">執行狀態（填寫實際日期自動連動）</label>
              <select id="execEdStatus" class="w-full border border-[#1D3557]/20 rounded px-2 py-1 bg-white text-[#1D3557]">
                ${EXEC_STATUS_LIST.map(s => `<option value="${s}">${s}</option>`).join("")}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              <div><label class="block mb-1 text-[#1D3557]/80">預定進度%</label><input id="execEdPlanP" type="number" step="0.1" class="w-full border border-[#1D3557]/20 bg-white rounded px-1.5 py-1" /></div>
              <div><label class="block mb-1 text-[#1D3557]/80">實際進度%</label><input id="execEdActP" type="number" step="0.1" class="w-full border border-[#1D3557]/20 bg-white rounded px-1.5 py-1" /></div>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><label class="block mb-1 text-[#1D3557]/65">預定上網日</label><input id="execEdPlanBid" type="date" class="w-full border border-[#1D3557]/20 bg-white rounded px-1.5 py-1" /></div>
            <div><label class="block mb-1 text-[#004E89] font-medium">實際上網日</label><input id="execEdActBid" type="date" onchange="syncAdminModalStatusFromDates()" class="w-full border border-[#004E89]/40 bg-white rounded px-1.5 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/65">預定決標日</label><input id="execEdPlanAward" type="date" class="w-full border border-[#1D3557]/20 bg-white rounded px-1.5 py-1" /></div>
            <div><label class="block mb-1 text-[#004E89] font-medium">實際決標日</label><input id="execEdActAward" type="date" onchange="syncAdminModalStatusFromDates()" class="w-full border border-[#004E89]/40 bg-white rounded px-1.5 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/65">預定開工日</label><input id="execEdPlanStart" type="date" class="w-full border border-[#1D3557]/20 bg-white rounded px-1.5 py-1" /></div>
            <div><label class="block mb-1 text-[#004E89] font-medium">實際開工日</label><input id="execEdActStart" type="date" onchange="syncAdminModalStatusFromDates()" class="w-full border border-[#004E89]/40 bg-white rounded px-1.5 py-1" /></div>
            <div><label class="block mb-1 text-[#1D3557]/65">預定完工日</label><input id="execEdPlanEnd" type="date" class="w-full border border-[#1D3557]/20 bg-white rounded px-1.5 py-1" /></div>
            <div><label class="block mb-1 text-[#004E89] font-medium">實際完工日</label><input id="execEdActEnd" type="date" onchange="syncAdminModalStatusFromDates()" class="w-full border border-[#004E89]/40 bg-white rounded px-1.5 py-1" /></div>
          </div>

          <div>
            <label class="block mb-1 text-[#1D3557]/80">辦理情形與落後說明</label>
            <textarea id="execEdNote" rows="2" class="w-full border border-[#1D3557]/20 bg-white rounded px-2 py-1"></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-2 border-t border-[#1D3557]/15">
            <button type="button" onclick="document.getElementById('modalExecEdit').classList.add('hidden')" class="px-3 py-1.5 bg-white border border-[#1D3557]/20 text-[#1D3557] rounded font-bold">取消</button>
            <button type="button" onclick="saveAdminExecEdit()" class="px-4 py-1.5 bg-[#ED6D35] hover:bg-[#D65A24] text-white rounded font-bold transition">儲存寫入雲端</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap.firstElementChild);
  }
}

function openExecImportModal() {
  ensureExecModals();
  const years = Array.from(new Set(allRecords.map(r => String(r["年度"])).filter(Boolean))).sort().reverse();
  const sel = document.getElementById("selExecImportYear");
  sel.innerHTML = years.map(y => `<option value="${y}">${y} 年度</option>`).join("");
  const phaseSel = document.getElementById("selExecImportPhase");
  if (phaseSel) phaseSel.value = "先期";
  updateExecImportPreviewCount();
  document.getElementById("modalExecImport").classList.remove("hidden");
}

function updateExecImportPreviewCount() {
  const yr = document.getElementById("selExecImportYear").value;
  const targets = allRecords.filter(r => String(r["年度"]) === yr && (parseFloat(r["核定經費_千元"]) || 0) > 0);
  document.getElementById("lblExecImportCount").textContent = `符合條件共 ${targets.length} 筆案件將納入管考池（重複案件將自動掛接更新）。`;
}

async function confirmImportToExec() {
  const yr = document.getElementById("selExecImportYear").value;
  const phase = document.getElementById("selExecImportPhase")?.value || "先期";
  const batchName = `${yr}-${phase}`;
  const targets = allRecords.filter(r => String(r["年度"]) === yr && (parseFloat(r["核定經費_千元"]) || 0) > 0);
  if (!targets.length) {
    alert("該年度無可納入管考的案件。");
    return;
  }

  const payloadRecords = targets.map(r => {
    const code = normalizeText(r["工程編號"]);
    const core = typeof getCoreProjectName === "function" ? getCoreProjectName(r["案件名稱"]) : r["案件名稱"];
    const mk = (code && code !== "-") ? code : `${normalizeExecBranchKey(r["分署"])}__${r["類別"]}__${core}`;
    const nature = typeof formatAppendixToNature === "function" ? formatAppendixToNature(r["附表"]) : r["附表"];
    return {
      master_key: mk,
      "年度": r["年度"],
      "分署": r["分署"],
      "性質": nature,
      "類別": r["類別"],
      "縣市": r["縣市"],
      "水系": r["水系"],
      "案件名稱": r["案件名稱"],
      "工程編號": r["工程編號"],
      "核定經費_千元": r["核定經費_千元"]
    };
  });

  const btn = document.getElementById("btnConfirmExecImport");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "雲端寫入中...";
  }
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "import_to_exec",
        passcode: adminPasscode,
        batchName,
        records: payloadRecords
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      document.getElementById("modalExecImport").classList.add("hidden");
      alert(json.message);
      await loadExecData(false);
    } else {
      alert(json.message || "納入失敗");
    }
  } catch (err) {
    alert("納入管考失敗：" + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "確認納入管考";
    }
  }
}

function openAdminExecEditModal(execId) {
  ensureExecModals();
  const rec = execRecords.find(r => r.exec_id === execId);
  if (!rec) return;

  document.getElementById("execEditId").value = rec.exec_id;
  document.getElementById("execEditSubTitle").textContent = `${displayExecBranch(rec["分署"])}｜${rec["性質"]}・${rec["類別"]}`;
  document.getElementById("execEditNameBanner").textContent = `${rec["案件名稱"]}（${rec["工程編號"] || "無編號"}）`;

  document.getElementById("execEdApproved").value = rec["核定預算_千元"];
  document.getElementById("execEdDelta").value = rec["增減預算_千元"];
  document.getElementById("execEdBid").value = rec["發包金額_千元"];
  document.getElementById("execEdChange").value = rec["變更追加減_千元"];
  document.getElementById("execEdSettle").value = rec["完工結算_千元"];
  document.getElementById("execEdFinal").value = rec["最終決算_千元"];

  document.getElementById("execEdBatch").value = rec["核定批次"];
  document.getElementById("execEdStatus").value = deriveExecStatusFromDates(rec["執行狀態"], rec, false);
  document.getElementById("execEdPlanP").value = rec["預定進度_%"];
  document.getElementById("execEdActP").value = rec["實際進度_%"];

  document.getElementById("execEdPlanBid").value = rec["預定上網日"];
  document.getElementById("execEdActBid").value = rec["實際上網日"];
  document.getElementById("execEdPlanAward").value = rec["預定決標日"];
  document.getElementById("execEdActAward").value = rec["實際決標日"];
  document.getElementById("execEdPlanStart").value = rec["預定開工日"];
  document.getElementById("execEdActStart").value = rec["實際開工日"];
  document.getElementById("execEdPlanEnd").value = rec["預定完工日"];
  document.getElementById("execEdActEnd").value = rec["實際完工日"];
  document.getElementById("execEdNote").value = rec["辦理情形與落後說明"];

  document.getElementById("modalExecEdit").classList.remove("hidden");
}

async function saveAdminExecEdit() {
  const execId = document.getElementById("execEditId").value;
  const orig = execRecords.find(r => r.exec_id === execId);
  if (!orig) return;

  const actDates = {
    "實際上網日": document.getElementById("execEdActBid").value,
    "實際決標日": document.getElementById("execEdActAward").value,
    "實際開工日": document.getElementById("execEdActStart").value,
    "實際完工日": document.getElementById("execEdActEnd").value
  };
  const finalStatus = deriveExecStatusFromDates(document.getElementById("execEdStatus").value, actDates, false);

  const updated = {
    ...orig,
    "核定預算_千元": parseFloat(document.getElementById("execEdApproved").value) || 0,
    "增減預算_千元": parseFloat(document.getElementById("execEdDelta").value) || 0,
    "發包金額_千元": parseFloat(document.getElementById("execEdBid").value) || 0,
    "變更追加減_千元": parseFloat(document.getElementById("execEdChange").value) || 0,
    "完工結算_千元": parseFloat(document.getElementById("execEdSettle").value) || 0,
    "最終決算_千元": parseFloat(document.getElementById("execEdFinal").value) || 0,
    "核定批次": document.getElementById("execEdBatch").value.trim(),
    "執行狀態": finalStatus,
    "預定進度_%": parseFloat(document.getElementById("execEdPlanP").value) || 0,
    "實際進度_%": parseFloat(document.getElementById("execEdActP").value) || 0,
    "預定上網日": document.getElementById("execEdPlanBid").value,
    "實際上網日": actDates["實際上網日"],
    "預定決標日": document.getElementById("execEdPlanAward").value,
    "實際決標日": actDates["實際決標日"],
    "預定開工日": document.getElementById("execEdPlanStart").value,
    "實際開工日": actDates["實際開工日"],
    "預定完工日": document.getElementById("execEdPlanEnd").value,
    "實際完工日": actDates["實際完工日"],
    "辦理情形與落後說明": document.getElementById("execEdNote").value.trim()
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "admin_update_exec",
        passcode: adminPasscode,
        record: updated
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      document.getElementById("modalExecEdit").classList.add("hidden");
      alert(json.message);
      await loadExecData(false);
    } else {
      alert(json.message || "更新失敗");
    }
  } catch (err) {
    alert("雲端寫入失敗：" + err.message);
  }
}