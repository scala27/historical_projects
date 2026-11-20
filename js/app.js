let allRecords = [];
let filteredRecords = [];
let deduplicatedRecords = [];
let adminPasscode = "";
let selectedCountyForChart = "【全臺合計】";
let pendingImportRecords = [];
let detailSortAsc = {};

function $(id) {
  return document.getElementById(id);
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    initCategoryCheckboxes();
  } catch (err) {
    console.error("initCategoryCheckboxes 錯誤:", err);
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
    <label class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-100 cursor-pointer text-slate-700">
      <input type="checkbox" class="cat-chk rounded text-blue-700" value="${cat}" checked onchange="onSingleCategoryChange()" />
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
    icon.classList.add("animate-pulse", "text-amber-300");
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
      "核定經費_千元": parseFloat(r["核定經費_千元"]) || 0,
      "可支用經費_千元": parseFloat(r["可支用經費_千元"]) || 0
    }));

    populateDropdownOptions();
    applyFilters();

    if (icon) {
      icon.classList.remove("animate-pulse", "text-amber-300");
      icon.classList.add("text-emerald-300");
    }
    if (tip) tip.textContent = `已同步 (${allRecords.length} 筆)`;
    if (forceNotify) alert(`雲端資料同步完成，共載入 ${allRecords.length} 筆紀錄！`);
  } catch (err) {
    if (icon) {
      icon.classList.remove("animate-pulse", "text-amber-300");
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
  selStart.value = yearList[0];
  selEnd.value = yearList[yearList.length - 1];

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

function applyFilters() {
  const sY = parseInt($("selYearStart") ? $("selYearStart").value : "0", 10);
  const eY = parseInt($("selYearEnd") ? $("selYearEnd").value : "999", 10);
  const dim = $("selDimension") ? $("selDimension").value : "branch";
  const target = $("selTarget") ? $("selTarget").value : "【全部分署】";
  const sub = $("selSubFilter") ? $("selSubFilter").value : "【全部縣市】";
  const kw = normalizeText($("txtKeyword") ? $("txtKeyword").value : "").toLowerCase();
  const selectedCats = Array.from(document.querySelectorAll(".cat-chk:checked")).map(c => c.value);

  filteredRecords = allRecords.filter(r => {
    const yr = parseInt(r["年度"], 10);
    if (yr < sY || yr > eY) return false;
    if (!selectedCats.includes(r["類別"])) return false;

    if (dim === "branch") {
      if (target !== "【全部分署】" && r["分署"] !== target) return false;
      if (sub !== "【全部縣市】" && !r["縣市"].includes(sub)) return false;
    } else {
      if (target !== "【全部縣市】" && !r["縣市"].includes(target)) return false;
      if (sub !== "【全部分署】" && r["分署"] !== sub) return false;
    }

    if (kw) {
      const hay = `${r["案件名稱"]} ${r["水系"]} ${r["工程編號"]} ${r["備註資訊"]}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const valid = filteredRecords.filter(r => r["核定經費_千元"] > 0);
  if (sY !== eY) {
    const sorted = [...valid].sort((a, b) => {
      if (a["分署"] !== b["分署"]) return a["分署"].localeCompare(b["分署"]);
      if (a["案件名稱"] !== b["案件名稱"]) return a["案件名稱"].localeCompare(b["案件名稱"]);
      if (b["年度"] !== a["年度"]) return parseInt(b["年度"]) - parseInt(a["年度"]);
      return b["核定經費_千元"] - a["核定經費_千元"];
    });
    const seen = new Set();
    deduplicatedRecords = sorted.filter(r => {
      const key = `${r["分署"]}__${r["案件名稱"]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else {
    deduplicatedRecords = valid;
  }

  updateKpiCards();
  renderDetailTable();
  if (typeof renderCountyTable === "function") renderCountyTable();
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
  if ($("kpiSubCnt")) $("kpiSubCnt").textContent = `案件數: ${sub.length.toLocaleString()} 筆`;
  if ($("kpiSubAmt")) $("kpiSubAmt").textContent = `核定經費: ${sumAmt(sub).toFixed(2)} 億元`;
  if ($("kpiSubSub")) $("kpiSubSub").innerHTML = `├─ 橋梁改建/補助: ${subB.length} 筆 / ${sumAmt(subB).toFixed(2)} 億元<br>└─ 逕流分擔/補助: ${subR.length} 筆 / ${sumAmt(subR).toFixed(2)} 億元`;

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

function renderDetailTable() {
  const isAdmin = Boolean(adminPasscode);
  const thAct = $("thActionCol");
  if (thAct) thAct.classList.toggle("hidden", !isAdmin);

  const sumEl = $("lblDetailSummary");
  if (sumEl) {
    sumEl.textContent =
      `共篩選出 ${filteredRecords.length.toLocaleString()} 筆歷史紀錄（頂部統計已排除核定經費 0 元及跨年度重複案件，實計 ${deduplicatedRecords.length.toLocaleString()} 筆）`;
  }

  const tbody = $("tbodyDetail");
  if (!tbody) return;

  tbody.innerHTML = filteredRecords.map((r, idx) => {
    const bg = idx % 2 === 0 ? "bg-slate-50/70" : "bg-white";
    const editBtn = isAdmin
      ? `<td class="p-2 text-center">
           <button onclick='openEditModal(${JSON.stringify(r).replace(/'/g, "&#39;")})' title="編輯" aria-label="編輯" class="inline-flex items-center justify-center p-1 rounded text-blue-700 hover:bg-blue-100 transition">
             <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
               <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
               <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
             </svg>
           </button>
         </td>`
      : "";
    return `
      <tr class="${bg} hover:bg-sky-50">
        <td class="p-2 text-center">${r["年度"]}</td>
        <td class="p-2 text-center">${r["類別"]}</td>
        <td class="p-2 text-center font-medium">${r["分署"] || "-"}</td>
        <td class="p-2 text-center">${r["縣市"] || "-"}</td>
        <td class="p-2 text-center">${r["水系"] || "-"}</td>
        <td class="p-2 font-medium text-slate-800">${r["案件名稱"]}</td>
        <td class="p-2 text-right">${formatIntThousand(r["核定經費_千元"])}</td>
        <td class="p-2 text-right">${formatIntThousand(r["可支用經費_千元"])}</td>
        <td class="p-2 text-center">${r["工程編號"] || "-"}</td>
        <td class="p-2 text-center">${r["座標點位"] || "-"}</td>
        <td class="p-2 text-slate-600 max-w-[240px] truncate" title="${r["備註資訊"] || ""}">${r["備註資訊"] || "-"}</td>
        <td class="p-2 text-center">${r["附表"] || "-"}</td>
        ${editBtn}
      </tr>
    `;
  }).join("");
}

function sortDetailTable(field) {
  detailSortAsc[field] = !detailSortAsc[field];
  const asc = detailSortAsc[field];
  filteredRecords.sort((a, b) => {
    if (typeof a[field] === "number") return asc ? a[field] - b[field] : b[field] - a[field];
    if (field === "分署") {
      const oa = CHINESE_NUM_ORDER[a[field]] || 99;
      const ob = CHINESE_NUM_ORDER[b[field]] || 99;
      return asc ? oa - ob : ob - oa;
    }
    return asc ? String(a[field]).localeCompare(String(b[field])) : String(b[field]).localeCompare(String(a[field]));
  });
  renderDetailTable();
}

function switchTab(tab) {
  ["Detail", "County", "Trend", "Branch"].forEach(name => {
    const view = $(`view${name}`);
    const btn = $(`tabBtn${name}`);
    if (view) view.classList.add("hidden");
    if (btn) {
      btn.classList.remove("bg-[#1f538d]", "text-white");
      btn.classList.add("bg-slate-200", "text-slate-700");
    }
  });

  const cap = tab.charAt(0).toUpperCase() + tab.slice(1);
  const activeView = $(`view${cap}`);
  const activeBtn = $(`tabBtn${cap}`);
  if (activeView) activeView.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.classList.remove("bg-slate-200", "text-slate-700");
    activeBtn.classList.add("bg-[#1f538d]", "text-white");
  }

  setTimeout(() => {
    if (typeof renderActiveCharts === "function") renderActiveCharts();
  }, 30);
}
