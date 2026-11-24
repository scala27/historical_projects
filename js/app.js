let allRecords = [];
let filteredRecords = [];
let deduplicatedRecords = [];
let mergedDuplicateRecords = [];
let zeroBudgetRecords = [];
let detailAuditMode = "all"; // "all" | "merged" | "zero"
let adminPasscode = "";
let selectedCountyForChart = "【全臺合計】";
let pendingImportRecords = [];
let detailSortAsc = {};
let isResizingCol = false;

const COL_WIDTH_STORAGE_KEY = "flood_projects_detail_col_widths_v2";
const DEFAULT_DETAIL_COL_WIDTHS = {
  year: 48,
  appendix: 82,
  category: 78,
  branch: 50,
  county: 76,
  water: 84,
  name: 300,
  approved: 90,
  usable: 90,
  code: 150,
  remark: 130,
  concern: 112
};

function $(id) {
  return document.getElementById(id);
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    if (typeof initMobileLayout === "function") {
      initMobileLayout();
    }
  } catch (err) {
    console.error("initMobileLayout 錯誤:", err);
  }

  try {
    initCategoryCheckboxes();
  } catch (err) {
    console.error("initCategoryCheckboxes 錯誤:", err);
  }

  try {
    initDetailColumnResizer();
  } catch (err) {
    console.error("initDetailColumnResizer 錯誤:", err);
  }

  try {
    if (typeof initCharts === "function") {
      initCharts();
    }
  } catch (err) {
    console.error("initCharts 錯誤:", err);
  }

  document.addEventListener("click", (e) => {
    const menuWrap = $("topMenuContainer");
    if (menuWrap && !menuWrap.contains(e.target)) {
      closeTopMenu();
    }
    const catWrap = $("categoryDropdownWrapper");
    if (catWrap && !catWrap.contains(e.target)) {
      const panel = $("categoryDropdownPanel");
      if (panel) panel.classList.add("hidden");
    }
  });

  loadAllData(false);
});

function getSavedDetailColWidths() {
  try {
    const raw = localStorage.getItem(COL_WIDTH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DETAIL_COL_WIDTHS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DETAIL_COL_WIDTHS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_DETAIL_COL_WIDTHS };
  }
}

function saveDetailColWidths(widths) {
  try {
    localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(widths));
  } catch (e) {
    console.warn("無法儲存欄寬設定:", e);
  }
}

function applyDetailColumnWidths(widths) {
  const cg = $("detailColGroup");
  if (!cg) return;
  Object.keys(DEFAULT_DETAIL_COL_WIDTHS).forEach(key => {
    const col = cg.querySelector(`col[data-col-key="${key}"]`);
    if (col && widths[key]) {
      col.style.width = `${Math.max(40, Math.round(widths[key]))}px`;
    }
  });
}

function resetDetailColumnWidths() {
  try {
    localStorage.removeItem(COL_WIDTH_STORAGE_KEY);
  } catch (e) {}
  applyDetailColumnWidths(DEFAULT_DETAIL_COL_WIDTHS);
}

function autoFitDetailColumn(colKey) {
  const tbl = $("tblDetail");
  const cg = $("detailColGroup");
  if (!tbl || !cg) return;
  const col = cg.querySelector(`col[data-col-key="${colKey}"]`);
  const ths = Array.from(tbl.querySelectorAll("thead th"));
  const colIdx = ths.findIndex(th => th.getAttribute("data-col-key") === colKey);
  if (!col || colIdx < 0) return;

  const measure = document.createElement("span");
  measure.style.position = "fixed";
  measure.style.visibility = "hidden";
  measure.style.whiteSpace = "nowrap";
  measure.style.fontSize = "12px";
  measure.style.fontWeight = "600";
  measure.textContent = ths[colIdx].textContent.trim();
  document.body.appendChild(measure);
  let maxW = measure.offsetWidth + 22;

  measure.style.fontWeight = "400";
  const rows = Array.from(tbl.querySelectorAll("tbody tr")).slice(0, 150);
  rows.forEach(tr => {
    const td = tr.children[colIdx];
    if (!td) return;
    const preview = td.querySelector(".cell-preview");
    const txt = (preview ? preview.textContent : td.textContent).trim();
    if (!txt || txt === "-") return;
    measure.textContent = txt;
    const w = measure.offsetWidth + (preview ? 34 : 18);
    if (w > maxW) maxW = w;
  });
  document.body.removeChild(measure);

  const finalW = Math.min(520, Math.max(44, maxW));
  col.style.width = `${finalW}px`;
  const widths = getSavedDetailColWidths();
  widths[colKey] = finalW;
  saveDetailColWidths(widths);
}

function initDetailColumnResizer() {
  const saved = getSavedDetailColWidths();
  applyDetailColumnWidths(saved);

  const resizers = document.querySelectorAll("#tblDetail .col-resizer");
  resizers.forEach(handle => {
    handle.style.position = "absolute";
    handle.style.right = "0";
    handle.style.top = "0";
    handle.style.bottom = "0";
    handle.style.width = "7px";
    handle.style.cursor = "col-resize";
    handle.style.zIndex = "30";
    handle.style.borderRight = "1px solid rgba(255,255,255,0.22)";

    handle.addEventListener("mouseenter", () => {
      handle.style.backgroundColor = "rgba(237,109,53,0.45)";
    });
    handle.addEventListener("mouseleave", () => {
      if (!isResizingCol) handle.style.backgroundColor = "transparent";
    });

    handle.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    handle.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const key = handle.getAttribute("data-col-key");
      if (key) autoFitDetailColumn(key);
    });

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = handle.getAttribute("data-col-key");
      const cg = $("detailColGroup");
      const col = cg ? cg.querySelector(`col[data-col-key="${key}"]`) : null;
      if (!col) return;

      isResizingCol = true;
      const startX = e.pageX;
      const startW = col.getBoundingClientRect().width || parseInt(col.style.width, 10) || 80;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (moveEvt) => {
        const delta = moveEvt.pageX - startX;
        const newW = Math.max(40, Math.round(startW + delta));
        col.style.width = `${newW}px`;
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        handle.style.backgroundColor = "transparent";

        const finalW = Math.max(40, Math.round(parseInt(col.style.width, 10) || startW));
        const widths = getSavedDetailColWidths();
        widths[key] = finalW;
        saveDetailColWidths(widths);

        setTimeout(() => {
          isResizingCol = false;
        }, 50);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

function toggleTopMenu(e) {
  if (e) e.stopPropagation();
  const dd = $("topMenuDropdown");
  if (dd) dd.classList.toggle("hidden");
}

function closeTopMenu() {
  const dd = $("topMenuDropdown");
  if (dd) dd.classList.add("hidden");
}

function toggleKpiSection() {
  const sec = $("kpiSection");
  const lbl = $("menuToggleKpiLabel");
  if (!sec) return;
  const isHidden = sec.classList.toggle("hidden");
  if (lbl) {
    lbl.textContent = isHidden ? "顯示統計卡片" : "隱藏統計卡片";
  }
  if (typeof renderActiveCharts === "function") {
    setTimeout(() => renderActiveCharts(), 30);
  }
}

function toggleCategoryDropdown(e) {
  if (e) e.stopPropagation();
  const panel = $("categoryDropdownPanel");
  if (panel) panel.classList.toggle("hidden");
}

function initCategoryCheckboxes() {
  const container = $("categoryCheckboxes");
  if (!container) return;
  container.innerHTML = CATEGORIES_LIST.map(cat => `
    <label class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#FAF3E0] cursor-pointer text-[#1D3557]">
      <input type="checkbox" class="cat-chk rounded accent-[#ED6D35]" value="${cat}" checked onchange="onSingleCategoryChange()" />
      <span>${cat}</span>
    </label>
  `).join("");
  updateCategoryDropdownLabel();
}

function updateCategoryDropdownLabel() {
  const chks = Array.from(document.querySelectorAll(".cat-chk"));
  const checked = chks.filter(c => c.checked);
  const lbl = $("lblCategorySummary");
  if (!lbl) return;
  if (checked.length === chks.length) {
    lbl.textContent = `全部類別 (${chks.length})`;
  } else if (checked.length === 0) {
    lbl.textContent = "未選取類別 (0)";
  } else if (checked.length === 1) {
    lbl.textContent = checked[0].value;
  } else {
    lbl.textContent = `已選 ${checked.length} 項類別`;
  }
}

function toggleAllCategories(checked) {
  document.querySelectorAll(".cat-chk").forEach(el => {
    el.checked = checked;
  });
  updateCategoryDropdownLabel();
  applyFilters();
}

function onSingleCategoryChange() {
  const chks = Array.from(document.querySelectorAll(".cat-chk"));
  const chkAll = $("chkAll");
  if (chkAll) chkAll.checked = chks.every(c => c.checked);
  updateCategoryDropdownLabel();
  applyFilters();
}

async function loadAllData(forceNotify) {
  const tip = $("syncStatusTooltip");
  const icon = $("iconSyncCloud");
  if (tip) tip.textContent = "雲端同步中...";
  if (icon) {
    icon.classList.add("animate-pulse", "text-[#ED6D35]");
    icon.classList.remove("text-emerald-300", "text-rose-400");
  }

  try {
    const res = await fetch(GAS_API_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== "success") throw new Error(json.message || "API 回傳異常");

    allRecords = (json.data || []).map(r => ({
      ...r,
      "年度": normalizeText(r["年度"]),
      "類別": normalizeCategoryName(r["類別"]),
      "附表": normalizeText(r["附表"]),
      "分署": normalizeText(r["分署"]).replace("水規所", "水規分署"),
      "縣市": normalizeText(r["縣市"]).replace(/台/g, "臺"),
      "水系": normalizeText(r["水系"]),
      "案件名稱": normalizeText(r["案件名稱"]),
      "工程編號": normalizeText(r["工程編號"]),
      "座標點位": normalizeText(r["座標點位"]),
      "備註資訊": normalizeText(r["備註資訊"]),
      "地方關切": normalizeText(r["地方關切"]),
      "核定經費_千元": parseFloat(r["核定經費_千元"]) || 0,
      "可支用經費_千元": parseFloat(r["可支用經費_千元"]) || 0
    }));

    populateDropdownOptions();
    applyFilters();

    if (icon) {
      icon.classList.remove("animate-pulse", "text-[#ED6D35]");
      icon.classList.add("text-emerald-300");
    }
    if (tip) tip.textContent = `已同步 (${allRecords.length} 筆)`;
    if (forceNotify) alert(`雲端資料同步完成，共載入 ${allRecords.length} 筆紀錄！`);
  } catch (err) {
    if (icon) {
      icon.classList.remove("animate-pulse", "text-[#ED6D35]");
      icon.classList.add("text-rose-400");
    }
    if (tip) tip.textContent = `連線失敗：${err.message}`;
    console.error("loadAllData 失敗:", err);
  }
}

function populateDropdownOptions() {
  const years = Array.from(new Set(allRecords.map(r => String(r["年度"])).filter(Boolean))).sort();
  const yearList = years.length ? years : ["110", "111", "112", "113", "114", "115"];

  const selStart = $("selYearStart");
  const selEnd = $("selYearEnd");
  if (!selStart || !selEnd) return;

  selStart.innerHTML = yearList.map(y => `<option value="${y}">${y}</option>`).join("");
  selEnd.innerHTML = yearList.map(y => `<option value="${y}">${y}</option>`).join("");

  // 預設進入系統即顯示最新年度案件明細
  const latestYear = yearList[yearList.length - 1];
  selStart.value = latestYear;
  selEnd.value = latestYear;

  onDimensionChange();
}

function onYearChange() {
  const s = $("selYearStart");
  const e = $("selYearEnd");
  if (!s || !e) return;
  if (parseInt(s.value, 10) > parseInt(e.value, 10)) {
    e.value = s.value;
  }
  applyFilters();
}

function onDimensionChange() {
  const dimEl = $("selDimension");
  const selTarget = $("selTarget");
  const selSub = $("selSubFilter");
  if (!dimEl || !selTarget || !selSub) return;

  const dim = dimEl.value;
  const branches = Array.from(new Set(allRecords.map(r => r["分署"]).filter(Boolean)))
    .sort((a, b) => (CHINESE_NUM_ORDER[a] || 99) - (CHINESE_NUM_ORDER[b] || 99));

  if (dim === "branch") {
    if ($("lblTarget")) $("lblTarget").textContent = "分署別：";
    if ($("lblSubFilter")) $("lblSubFilter").textContent = "縣市別：";
    selTarget.innerHTML = ["【全部分署】", ...branches].map(v => `<option value="${v}">${v}</option>`).join("");
    selSub.innerHTML = ["【全部縣市】", ...STD_22_COUNTIES].map(v => `<option value="${v}">${v}</option>`).join("");
  } else {
    if ($("lblTarget")) $("lblTarget").textContent = "縣市別：";
    if ($("lblSubFilter")) $("lblSubFilter").textContent = "分署別：";
    selTarget.innerHTML = ["【全部縣市】", ...STD_22_COUNTIES].map(v => `<option value="${v}">${v}</option>`).join("");
    selSub.innerHTML = ["【全部分署】", ...branches].map(v => `<option value="${v}">${v}</option>`).join("");
  }
  applyFilters();
}

function getYearRangeLabel() {
  const s = $("selYearStart") ? $("selYearStart").value : "";
  const e = $("selYearEnd") ? $("selYearEnd").value : "";
  return s === e ? `(${s}年度)` : `(${s}-${e}年度)`;
}

function getAllYearsInRange() {
  const s = parseInt($("selYearStart") ? $("selYearStart").value : "110", 10);
  const e = parseInt($("selYearEnd") ? $("selYearEnd").value : "115", 10);
  const list = [];
  for (let y = s; y <= e; y++) list.push(String(y));
  return list;
}

function setDetailAuditMode(mode) {
  detailAuditMode = mode;
  renderDetailTable();
}

function applyFilters() {
  detailAuditMode = "all";
  const sY = parseInt($("selYearStart") ? $("selYearStart").value : "0", 10);
  const eY = parseInt($("selYearEnd") ? $("selYearEnd").value : "999", 10);
  const dim = $("selDimension") ? $("selDimension").value : "branch";
  const target = $("selTarget") ? $("selTarget").value : "【全部分署】";
  const sub = $("selSubFilter") ? $("selSubFilter").value : "【全部縣市】";
  const kw = normalizeText($("txtKeyword") ? $("txtKeyword").value : "").toLowerCase();
  const onlyConcern = Boolean($("chkOnlyConcern") && $("chkOnlyConcern").checked);
  const selectedCats = Array.from(document.querySelectorAll(".cat-chk:checked")).map(c => c.value);

  filteredRecords = allRecords.filter(r => {
    const yr = parseInt(r["年度"], 10);
    if (yr < sY || yr > eY) return false;
    if (!selectedCats.includes(r["類別"])) return false;
    if (onlyConcern && !r["地方關切"]) return false;

    if (dim === "branch") {
      if (target !== "【全部分署】" && r["分署"] !== target) return false;
      if (sub !== "【全部縣市】" && !r["縣市"].includes(sub)) return false;
    } else {
      if (target !== "【全部縣市】" && !r["縣市"].includes(target)) return false;
      if (sub !== "【全部分署】" && r["分署"] !== sub) return false;
    }

    if (kw) {
      const hay = `${r["案件名稱"]} ${r["水系"]} ${r["工程編號"]} ${r["備註資訊"]} ${r["地方關切"]}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  zeroBudgetRecords = filteredRecords.filter(r => r["核定經費_千元"] <= 0);
  const valid = filteredRecords.filter(r => r["核定經費_千元"] > 0);
  mergedDuplicateRecords = [];

  if (sY !== eY) {
    const sorted = [...valid].sort((a, b) => {
      if (a["分署"] !== b["分署"]) return a["分署"].localeCompare(b["分署"]);
      if (a["類別"] !== b["類別"]) return a["類別"].localeCompare(b["類別"]);
      const coreA = getCoreProjectName(a["案件名稱"]);
      const coreB = getCoreProjectName(b["案件名稱"]);
      if (coreA !== coreB) return coreA.localeCompare(coreB);
      if (b["年度"] !== a["年度"]) return parseInt(b["年度"], 10) - parseInt(a["年度"], 10);
      return b["核定經費_千元"] - a["核定經費_千元"];
    });

    const seen = new Set();
    deduplicatedRecords = sorted.filter(r => {
      if (String(r["備註資訊"] || "").includes("[分年累加]")) {
        return true;
      }
      const coreName = getCoreProjectName(r["案件名稱"]);
      const key = `${r["分署"]}__${r["類別"]}__${coreName}`;
      if (seen.has(key)) {
        mergedDuplicateRecords.push(r);
        return false;
      }
      seen.add(key);
      return true;
    });
  } else {
    deduplicatedRecords = valid;
  }

  updateKpiCards();
  renderDetailTable();
  if (typeof renderCountyTable === "function") renderCountyTable();
  if (typeof renderBranchTable === "function") renderBranchTable();
  if (typeof renderActiveCharts === "function") renderActiveCharts();
}

function updateKpiCards() {
  const sumAmt = arr => arr.reduce((acc, r) => acc + r["核定經費_千元"], 0) / 100000;

  if ($("kpiTotalCnt")) $("kpiTotalCnt").textContent = `案件數: ${deduplicatedRecords.length.toLocaleString()} 筆`;
  if ($("kpiTotalAmt")) $("kpiTotalAmt").textContent = `核定經費: ${sumAmt(deduplicatedRecords).toFixed(2)} 億元`;

  const eng = deduplicatedRecords.filter(r => getMajorCategory(r["類別"]) === "工程類");
  const engG = eng.filter(r => r["類別"] === "工程" || r["類別"] === "維修改善工程");
  const engD = eng.filter(r => r["類別"] === "委託設計/監造");
  if ($("kpiEngCnt")) $("kpiEngCnt").textContent = `案件數: ${eng.length.toLocaleString()} 筆`;
  if ($("kpiEngAmt")) $("kpiEngAmt").textContent = `核定經費: ${sumAmt(eng).toFixed(2)} 億元`;
  if ($("kpiEngSub")) $("kpiEngSub").innerHTML = `├─ 一般工程: ${engG.length} 筆 / ${sumAmt(engG).toFixed(2)} 億元<br>└─ 委託設計/監造: ${engD.length} 筆 / ${sumAmt(engD).toFixed(2)} 億元`;

  const land = deduplicatedRecords.filter(r => getMajorCategory(r["類別"]) === "用地類");
  const landP = land.filter(r => r["類別"] === "用地先期作業");
  const landA = land.filter(r => r["類別"] === "用地取得");
  if ($("kpiLandCnt")) $("kpiLandCnt").textContent = `案件數: ${land.length.toLocaleString()} 筆`;
  if ($("kpiLandAmt")) $("kpiLandAmt").textContent = `核定經費: ${sumAmt(land).toFixed(2)} 億元`;
  if ($("kpiLandSub")) $("kpiLandSub").innerHTML = `├─ 用地先期作業: ${landP.length} 筆 / ${sumAmt(landP).toFixed(2)} 億元<br>└─ 用地取得: ${landA.length} 筆 / ${sumAmt(landA).toFixed(2)} 億元`;

  const sub = deduplicatedRecords.filter(r => getMajorCategory(r["類別"]) === "補助類");
  const subB = sub.filter(r => r["類別"] === "橋梁改建/補助");
  const subR = sub.filter(r => r["類別"] === "逕流分擔/補助");
  const subO = sub.filter(r => r["類別"] !== "橋梁改建/補助" && r["類別"] !== "逕流分擔/補助");
  if ($("kpiSubCnt")) $("kpiSubCnt").textContent = `案件數: ${sub.length.toLocaleString()} 筆`;
  if ($("kpiSubAmt")) $("kpiSubAmt").textContent = `核定經費: ${sumAmt(sub).toFixed(2)} 億元`;
  if ($("kpiSubSub")) {
    $("kpiSubSub").innerHTML = [
      `├─ 橋梁改建/補助: ${subB.length} 筆 / ${sumAmt(subB).toFixed(2)} 億元`,
      `├─ 逕流分擔/補助: ${subR.length} 筆 / ${sumAmt(subR).toFixed(2)} 億元`,
      `└─ 補助案件/其他: ${subO.length} 筆 / ${sumAmt(subO).toFixed(2)} 億元`
    ].join("<br>");
  }

  const cMapAmt = {}, cMapCnt = {};
  deduplicatedRecords.forEach(r => {
    const p = extractPrimaryCounty(r["縣市"]);
    cMapAmt[p] = (cMapAmt[p] || 0) + r["核定經費_千元"];
    cMapCnt[p] = (cMapCnt[p] || 0) + 1;
  });
  const sortedC = Object.keys(cMapAmt).sort((a, b) => cMapAmt[b] - cMapAmt[a]);
  const topLines = sortedC.slice(0, 4).map((c, idx) => {
    const prefix = idx === Math.min(3, sortedC.length - 1) ? "└─ " : "├─ ";
    return `${prefix}${c}: ${cMapCnt[c]}筆 / ${(cMapAmt[c] / 100000).toFixed(2)}億元`;
  });
  if ($("kpiCountyCnt")) $("kpiCountyCnt").textContent = `案件數: ${deduplicatedRecords.length.toLocaleString()} 筆`;
  if ($("kpiCountyAmt")) $("kpiCountyAmt").textContent = `核定經費: ${sumAmt(deduplicatedRecords).toFixed(2)} 億元`;
  if ($("kpiCountySub")) $("kpiCountySub").innerHTML = topLines.join("<br>");
}

function formatIntThousand(val) {
  return Math.round(Number(val) || 0).toLocaleString();
}

function escapeHtmlAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCollapsibleCell(rawVal, thresholdLen, alignCenter = false) {
  const text = String(rawVal || "").trim();
  const alignCls = alignCenter ? "text-center" : "text-left";
  if (!text || text === "-") {
    return `<div class="w-full text-center text-slate-400">-</div>`;
  }
  const safeText = escapeHtmlAttr(text);
  const isLong = text.length > thresholdLen;
  if (!isLong) {
    return `<div class="w-full truncate ${alignCls}" title="${safeText}">${safeText}</div>`;
  }
  return `
    <div class="relative group w-full flex items-center gap-0.5">
      <div class="cell-preview truncate flex-1 ${alignCls}" title="${safeText}">${safeText}</div>
      <button type="button" onclick="toggleCellExpand(this)" title="展開/收合全文" aria-label="展開或收合全文" class="shrink-0 p-0.5 rounded text-slate-400 hover:text-[#ED6D35] hover:bg-[#FAF3E0] transition">
        <svg class="w-3 h-3 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div class="hidden group-hover:block absolute left-0 bottom-full mb-1.5 z-40 w-64 max-w-[85vw] p-2.5 rounded-md bg-[#1D3557] text-white text-xs leading-relaxed shadow-lg whitespace-normal break-words pointer-events-none text-left">
        ${safeText}
      </div>
    </div>
  `;
}

function renderConcernCell(rawVal) {
  const text = String(rawVal || "").trim();
  if (!text || text === "-") {
    return `<div class="w-full text-center text-slate-400">-</div>`;
  }
  const safeText = escapeHtmlAttr(text);
  return `
    <div class="w-full truncate text-center" title="${safeText}">
      <span class="inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-[#FAF3E0] text-[#004E89] border border-[#004E89]/25 font-medium text-[11px]">${safeText}</span>
    </div>
  `;
}

function toggleCellExpand(btn) {
  const wrap = btn.parentElement;
  if (!wrap) return;
  const preview = wrap.querySelector(".cell-preview");
  const svg = btn.querySelector("svg");
  if (!preview) return;
  const expanded = preview.classList.toggle("truncate");
  if (!expanded) {
    preview.classList.add("whitespace-normal", "break-words");
    if (svg) svg.style.transform = "rotate(180deg)";
  } else {
    preview.classList.remove("whitespace-normal", "break-words");
    if (svg) svg.style.transform = "";
  }
}

function renderDetailTable() {
  const isAdmin = Boolean(adminPasscode);
  const thAct = $("thActionCol");
  const colAct = $("colActionWidth");
  if (thAct) thAct.classList.toggle("hidden", !isAdmin);
  if (colAct) colAct.style.width = isAdmin ? "44px" : "0px";

  if (typeof syncExecAuthUI === "function") {
    syncExecAuthUI();
  }

  let displayRows = filteredRecords;
  if (detailAuditMode === "merged") {
    displayRows = mergedDuplicateRecords;
  } else if (detailAuditMode === "zero") {
    displayRows = zeroBudgetRecords;
  }

  const sumEl = $("lblDetailSummary");
  if (sumEl) {
    if (detailAuditMode === "merged") {
      sumEl.textContent = `目前檢視：跨年度延續合併排除明細（共 ${mergedDuplicateRecords.length.toLocaleString()} 筆）`;
    } else if (detailAuditMode === "zero") {
      sumEl.textContent = `目前檢視：核定經費 0 元案件明細（共 ${zeroBudgetRecords.length.toLocaleString()} 筆）`;
    } else {
      sumEl.textContent = `共篩選出 ${filteredRecords.length.toLocaleString()} 筆歷史紀錄（頂部統計實計 ${deduplicatedRecords.length.toLocaleString()} 筆）`;
    }
  }

  const auditEl = $("detailAuditLinks");
  if (auditEl) {
    const links = [];
    if (detailAuditMode !== "all") {
      links.push(`<button type="button" onclick="setDetailAuditMode('all')" class="text-[#ED6D35] hover:underline font-medium">返回全部 (${filteredRecords.length})</button>`);
    } else {
      if (mergedDuplicateRecords.length > 0) {
        links.push(`<button type="button" onclick="setDetailAuditMode('merged')" class="text-[#004E89] hover:text-[#ED6D35] underline decoration-[#004E89]/40 underline-offset-2">跨年合併 (${mergedDuplicateRecords.length})</button>`);
      }
      if (zeroBudgetRecords.length > 0) {
        links.push(`<button type="button" onclick="setDetailAuditMode('zero')" class="text-[#004E89] hover:text-[#ED6D35] underline decoration-[#004E89]/40 underline-offset-2">0元案件 (${zeroBudgetRecords.length})</button>`);
      }
    }
    auditEl.innerHTML = links.join("｜");
  }

  if (typeof renderMobileDetailCards === "function") {
    renderMobileDetailCards(displayRows);
  }

  const tbody = $("tbodyDetail");
  if (!tbody) return;

  tbody.innerHTML = displayRows.map((r, idx) => {
    const bg = idx % 2 === 0 ? "bg-[#F7F5F0]/75" : "bg-white";
    const natureText = typeof formatAppendixToNature === "function" ? formatAppendixToNature(r["附表"]) : r["附表"];
    const editBtn = isAdmin
      ? `<td class="px-1.5 py-1.5 text-center">
           <button onclick='openEditModal(${JSON.stringify(r).replace(/'/g, "&#39;")})' title="編輯" aria-label="編輯" class="inline-flex items-center justify-center p-1 rounded text-[#004E89] hover:bg-[#FAF3E0] hover:text-[#ED6D35] transition">
             <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
               <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
               <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
             </svg>
           </button>
         </td>`
      : "";
    return `
      <tr class="${bg} hover:bg-[#FAF3E0]/75">
        <td class="px-1.5 py-1.5 text-center whitespace-nowrap text-[#1D3557]">${r["年度"]}</td>
        <td class="px-1.5 py-1.5 text-[#1D3557]">${renderCollapsibleCell(natureText, 6, true)}</td>
        <td class="px-1.5 py-1.5 text-[#1D3557]">${renderCollapsibleCell(r["類別"], 4, true)}</td>
        <td class="px-1.5 py-1.5 text-center font-medium whitespace-nowrap text-[#1D3557]">${r["分署"] || "-"}</td>
        <td class="px-1.5 py-1.5 text-[#1D3557]">${renderCollapsibleCell(r["縣市"], 3, true)}</td>
        <td class="px-1.5 py-1.5 text-[#1D3557]">${renderCollapsibleCell(r["水系"], 4, true)}</td>
        <td class="px-2 py-1.5 font-medium text-[#1D3557] truncate" title="${escapeHtmlAttr(r["案件名稱"])}">${r["案件名稱"]}</td>
        <td class="px-1.5 py-1.5 text-right whitespace-nowrap text-[#1D3557]">${formatIntThousand(r["核定經費_千元"])}</td>
        <td class="px-1.5 py-1.5 text-right whitespace-nowrap text-[#1D3557]">${formatIntThousand(r["可支用經費_千元"])}</td>
        <td class="px-1.5 py-1.5 text-[#1D3557]/80">${renderCollapsibleCell(r["工程編號"], 18, true)}</td>
        <td class="px-1.5 py-1.5 text-[#1D3557]/75">${renderCollapsibleCell(r["備註資訊"], 12, false)}</td>
        <td class="px-1.5 py-1.5">${renderConcernCell(r["地方關切"])}</td>
        ${editBtn}
      </tr>
    `;
  }).join("");
}

function sortDetailTable(field) {
  if (isResizingCol) return;
  detailSortAsc[field] = !detailSortAsc[field];
  const asc = detailSortAsc[field];
  const targetArr = detailAuditMode === "merged"
    ? mergedDuplicateRecords
    : (detailAuditMode === "zero" ? zeroBudgetRecords : filteredRecords);

  targetArr.sort((a, b) => {
    if (typeof a[field] === "number") return asc ? a[field] - b[field] : b[field] - a[field];
    if (field === "分署") {
      const oa = CHINESE_NUM_ORDER[a[field]] || 99;
      const ob = CHINESE_NUM_ORDER[b[field]] || 99;
      return asc ? oa - ob : ob - oa;
    }
    return asc ? String(a[field] || "").localeCompare(String(b[field] || "")) : String(b[field] || "").localeCompare(String(a[field] || ""));
  });
  renderDetailTable();
}

function switchTab(tab) {
  ["Detail", "County", "Trend", "Branch", "Exec"].forEach(name => {
    const view = $(`view${name}`);
    const btn = $(`tabBtn${name}`);
    if (view) view.classList.add("hidden");
    if (btn) {
      btn.classList.remove("bg-[#ED6D35]", "text-white", "border-transparent", "shadow-xs");
      btn.classList.add("bg-white", "text-[#1D3557]", "border-[#1D3557]/15");
    }
  });

  const cap = tab.charAt(0).toUpperCase() + tab.slice(1);
  const activeView = $(`view${cap}`);
  const activeBtn = $(`tabBtn${cap}`);
  if (activeView) activeView.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.classList.remove("bg-white", "text-[#1D3557]", "border-[#1D3557]/15");
    activeBtn.classList.add("bg-[#ED6D35]", "text-white", "border-transparent", "shadow-xs");
  }

  // 方案 A：切至「執行管考」自動隱藏右上方歷年查詢面板，切回其餘頁籤自動恢復
  const filterBar = $("globalFilterBar");
  if (filterBar) {
    const isExec = tab === "exec";
    filterBar.classList.toggle("hidden", isExec);
    filterBar.classList.toggle("grid", !isExec);
  }

  if (tab === "exec" && typeof onEnterExecTab === "function") {
    onEnterExecTab();
    return;
  }

  setTimeout(() => {
    if (typeof renderActiveCharts === "function") renderActiveCharts();
  }, 30);
}
