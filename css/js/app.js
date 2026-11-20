let allRecords = [];
let filteredRecords = [];
let deduplicatedRecords = [];
let adminPasscode = "";
let selectedCountyForChart = "【全臺合計】";
let pendingImportRecords = [];
let detailSortAsc = {};

window.addEventListener("DOMContentLoaded", () => {
  initCategoryCheckboxes();
  initCharts();

  document.addEventListener("click", (e) => {
    const menuWrap = document.getElementById("topMenuContainer");
    if (menuWrap && !menuWrap.contains(e.target)) {
      closeTopMenu();
    }
    const catWrap = document.getElementById("categoryDropdownWrapper");
    if (catWrap && !catWrap.contains(e.target)) {
      document.getElementById("categoryDropdownPanel").classList.add("hidden");
    }
  });

  loadAllData(false);
});

function toggleTopMenu(e) {
  e.stopPropagation();
  document.getElementById("topMenuDropdown").classList.toggle("hidden");
}

function closeTopMenu() {
  document.getElementById("topMenuDropdown").classList.add("hidden");
}

function toggleCategoryDropdown(e) {
  e.stopPropagation();
  document.getElementById("categoryDropdownPanel").classList.toggle("hidden");
}

function initCategoryCheckboxes() {
  const container = document.getElementById("categoryCheckboxes");
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
  const lbl = document.getElementById("lblCategorySummary");
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
  document.querySelectorAll(".cat-chk").forEach(el => el.checked = checked);
  updateCategoryDropdownLabel();
  applyFilters();
}

function onSingleCategoryChange() {
  const chks = Array.from(document.querySelectorAll(".cat-chk"));
  document.getElementById("chkAll").checked = chks.every(c => c.checked);
  updateCategoryDropdownLabel();
  applyFilters();
}

async function loadAllData(forceNotify) {
  const tip = document.getElementById("syncStatusTooltip");
  const icon = document.getElementById("iconSyncCloud");
  tip.textContent = "雲端同步中...";
  icon.classList.add("animate-pulse", "text-amber-300");
  icon.classList.remove("text-emerald-300", "text-rose-400");

  try {
    const res = await fetch(GAS_API_URL);
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
    icon.classList.remove("animate-pulse", "text-amber-300");
    icon.classList.add("text-emerald-300");
    tip.textContent = `已同步 (${allRecords.length} 筆)`;
    if (forceNotify) alert(`雲端資料同步完成，共載入 ${allRecords.length} 筆紀錄！`);
  } catch (err) {
    icon.classList.remove("animate-pulse", "text-amber-300");
    icon.classList.add("text-rose-400");
    tip.textContent = "連線失敗 (請確認 GAS_API_URL)";
    console.error(err);
  }
}

function populateDropdownOptions() {
  const years = Array.from(new Set(allRecords.map(r => String(r["年度"])).filter(Boolean))).sort();
  const yearList = years.length ? years : ["110", "111", "112", "113", "114", "115"];

  const selStart = document.getElementById("selYearStart");
  const selEnd = document.getElementById("selYearEnd");
  selStart.innerHTML = yearList.map(y => `<option value="${y}">${y}</option>`).join("");
  selEnd.innerHTML = yearList.map(y => `<option value="${y}">${y}</option>`).join("");
  selStart.value = yearList[0];
  selEnd.value = yearList[yearList.length - 1];

  onDimensionChange();
}

function onYearChange() {
  const s = document.getElementById("selYearStart");
  const e = document.getElementById("selYearEnd");
  if (parseInt(s.value, 10) > parseInt(e.value, 10)) {
    e.value = s.value;
  }
  applyFilters();
}

function onDimensionChange() {
  const dim = document.getElementById("selDimension").value;
  const branches = Array.from(new Set(allRecords.map(r => r["分署"]).filter(Boolean)))
    .sort((a, b) => (CHINESE_NUM_ORDER[a] || 99) - (CHINESE_NUM_ORDER[b] || 99));

  const selTarget = document.getElementById("selTarget");
  const selSub = document.getElementById("selSubFilter");

  if (dim === "branch") {
    document.getElementById("lblTarget").textContent = "分署別：";
    document.getElementById("lblSubFilter").textContent = "縣市別：";
    selTarget.innerHTML = ["【全部分署】", ...branches].map(v => `<option value="${v}">${v}</option>`).join("");
    selSub.innerHTML = ["【全部縣市】", ...STD_22_COUNTIES].map(v => `<option value="${v}">${v}</option>`).join("");
  } else {
    document.getElementById("lblTarget").textContent = "縣市別：";
    document.getElementById("lblSubFilter").textContent = "分署別：";
    selTarget.innerHTML = ["【全部縣市】", ...STD_22_COUNTIES].map(v => `<option value="${v}">${v}</option>`).join("");
    selSub.innerHTML = ["【全部分署】", ...branches].map(v => `<option value="${v}">${v}</option>`).join("");
  }
  applyFilters();
}

function getYearRangeLabel() {
  const s = document.getElementById("selYearStart").value;
  const e = document.getElementById("selYearEnd").value;
  return s === e ? `(${s}年度)` : `(${s}-${e}年度)`;
}

function getAllYearsInRange() {
  const s = parseInt(document.getElementById("selYearStart").value, 10);
  const e = parseInt(document.getElementById("selYearEnd").value, 10);
  const list = [];
  for (let y = s; y <= e; y++) list.push(String(y));
  return list;
}

function applyFilters() {
  const sY = parseInt(document.getElementById("selYearStart").value, 10);
  const eY = parseInt(document.getElementById("selYearEnd").value, 10);
  const dim = document.getElementById("selDimension").value;
  const target = document.getElementById("selTarget").value;
  const sub = document.getElementById("selSubFilter").value;
  const kw = normalizeText(document.getElementById("txtKeyword").value).toLowerCase();
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
  renderCountyTable();
  renderActiveCharts();
}

function updateKpiCards() {
  const sumAmt = arr => arr.reduce((acc, r) => acc + r["核定經費_千元"], 0) / 100000;

  document.getElementById("kpiTotalCnt").textContent = `案件數: ${deduplicatedRecords.length.toLocaleString()} 筆`;
  document.getElementById("kpiTotalAmt").textContent = `核定經費: ${sumAmt(deduplicatedRecords).toFixed(2)} 億元`;

  const eng = deduplicatedRecords.filter(r => getMajorCategory(r["類別"]) === "工程類");
  const engG = eng.filter(r => r["類別"] === "工程" || r["類別"] === "維修改善工程");
  const engD = eng.filter(r => r["類別"] === "委託設計/監造");
  document.getElementById("kpiEngCnt").textContent = `案件數: ${eng.length.toLocaleString()} 筆`;
  document.getElementById("kpiEngAmt").textContent = `核定經費: ${sumAmt(eng).toFixed(2)} 億元`;
  document.getElementById("kpiEngSub").innerHTML = `├─ 一般工程: ${engG.length} 筆 / ${sumAmt(engG).toFixed(2)} 億元<br>└─ 委託設計/監造: ${engD.length} 筆 / ${sumAmt(engD).toFixed(2)} 億元`;

  const land = deduplicatedRecords.filter(r => getMajorCategory(r["類別"]) === "用地類");
  const landP = land.filter(r => r["類別"] === "用地先期作業");
  const landA = land.filter(r => r["類別"] === "用地取得");
  document.getElementById("kpiLandCnt").textContent = `案件數: ${land.length.toLocaleString()} 筆`;
  document.getElementById("kpiLandAmt").textContent = `核定經費: ${sumAmt(land).toFixed(2)} 億元`;
  document.getElementById("kpiLandSub").innerHTML = `├─ 用地先期作業: ${landP.length} 筆 / ${sumAmt(landP).toFixed(2)} 億元<br>└─ 用地取得: ${landA.length} 筆 / ${sumAmt(landA).toFixed(2)} 億元`;

  const sub = deduplicatedRecords.filter(r => getMajorCategory(r["類別"]) === "補助類");
  const subB = sub.filter(r => r["類別"] === "橋梁改建/補助");
  const subR = sub.filter(r => r["類別"] === "逕流分擔/補助");
  document.getElementById("kpiSubCnt").textContent = `案件數: ${sub.length.toLocaleString()} 筆`;
  document.getElementById("kpiSubAmt").textContent = `核定經費: ${sumAmt(sub).toFixed(2)} 億元`;
  document.getElementById("kpiSubSub").innerHTML = `├─ 橋梁改建/補助: ${subB.length} 筆 / ${sumAmt(subB).toFixed(2)} 億元<br>└─ 逕流分擔/補助: ${subR.length} 筆 / ${sumAmt(subR).toFixed(2)} 億元`;

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
  document.getElementById("kpiCountyCnt").textContent = `案件數: ${deduplicatedRecords.length.toLocaleString()} 筆`;
  document.getElementById("kpiCountyAmt").textContent = `核定經費: ${sumAmt(deduplicatedRecords).toFixed(2)} 億元`;
  document.getElementById("kpiCountySub").innerHTML = topLines.join("<br>");
}

function renderDetailTable() {
  const isAdmin = Boolean(adminPasscode);
  document.getElementById("thActionCol").classList.toggle("hidden", !isAdmin);
  document.getElementById("lblDetailSummary").textContent =
    `共篩選出 ${filteredRecords.length.toLocaleString()} 筆歷史紀錄（頂部統計已排除核定經費 0 元及跨年度重複案件，實計 ${deduplicatedRecords.length.toLocaleString()} 筆）`;

  const tbody = document.getElementById("tbodyDetail");
  tbody.innerHTML = filteredRecords.map((r, idx) => {
    const bg = idx % 2 === 0 ? "bg-slate-50/70" : "bg-white";
    const editBtn = isAdmin
      ? `<td class="p-2 text-center"><button onclick='openEditModal(${JSON.stringify(r).replace(/'/g, "&#39;")})' class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded text-[11px]">編輯</button></td>`
      : "";
    return `
      <tr class="${bg} hover:bg-sky-50">
        <td class="p-2 text-center">${r["年度"]}</td>
        <td class="p-2 text-center">${r["類別"]}</td>
        <td class="p-2 text-center">${r["附表"] || "-"}</td>
        <td class="p-2 text-center font-medium">${r["分署"] || "-"}</td>
        <td class="p-2 text-center">${r["縣市"] || "-"}</td>
        <td class="p-2 text-center">${r["水系"] || "-"}</td>
        <td class="p-2 font-medium text-slate-800">${r["案件名稱"]}</td>
        <td class="p-2 text-right font-mono">${r["核定經費_千元"].toLocaleString(undefined, { minimumFractionDigits: 3 })}</td>
        <td class="p-2 text-right font-mono">${r["可支用經費_千元"].toLocaleString(undefined, { minimumFractionDigits: 3 })}</td>
        <td class="p-2 text-center">${r["工程編號"] || "-"}</td>
        <td class="p-2 text-center">${r["座標點位"] || "-"}</td>
        <td class="p-2 text-slate-600 max-w-[240px] truncate" title="${r["備註資訊"] || ""}">${r["備註資訊"] || "-"}</td>
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
    document.getElementById(`view${name}`).classList.add("hidden");
    const btn = document.getElementById(`tabBtn${name}`);
    btn.classList.remove("bg-[#1f538d]", "text-white");
    btn.classList.add("bg-slate-200", "text-slate-700");
  });

  const cap = tab.charAt(0).toUpperCase() + tab.slice(1);
  document.getElementById(`view${cap}`).classList.remove("hidden");
  const activeBtn = document.getElementById(`tabBtn${cap}`);
  activeBtn.classList.remove("bg-slate-200", "text-slate-700");
  activeBtn.classList.add("bg-[#1f538d]", "text-white");

  setTimeout(() => {
    renderActiveCharts();
  }, 30);
}
