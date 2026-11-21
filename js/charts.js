let chartCountyTrend = null;
let chartTrend = null;
let chartBranch = null;
let selectedBranchForChart = "【全部分署】";
let trendChartMode = "total"; // "total" | "structure"

function initCharts() {
  chartCountyTrend = echarts.init(document.getElementById("chartCountyTrend"));
  chartTrend = echarts.init(document.getElementById("chartTrend"));
  chartBranch = echarts.init(document.getElementById("chartBranch"));

  window.addEventListener("resize", () => {
    chartCountyTrend && chartCountyTrend.resize();
    chartTrend && chartTrend.resize();
    chartBranch && chartBranch.resize();
  });
}

function setTrendChartMode(mode) {
  trendChartMode = mode === "structure" ? "structure" : "total";
  const btnTotal = document.getElementById("btnTrendModeTotal");
  const btnStruct = document.getElementById("btnTrendModeStructure");
  if (btnTotal && btnStruct) {
    if (trendChartMode === "structure") {
      btnStruct.classList.add("bg-[#1f538d]", "text-white");
      btnStruct.classList.remove("text-slate-700");
      btnTotal.classList.remove("bg-[#1f538d]", "text-white");
      btnTotal.classList.add("text-slate-700");
    } else {
      btnTotal.classList.add("bg-[#1f538d]", "text-white");
      btnTotal.classList.remove("text-slate-700");
      btnStruct.classList.remove("bg-[#1f538d]", "text-white");
      btnStruct.classList.add("text-slate-700");
    }
  }
  renderTrendChart();
}

function getCountyTableAxisList() {
  const list = [...STD_22_COUNTIES];
  const hasUnassigned = deduplicatedRecords.some(r => !STD_22_COUNTIES.includes(extractPrimaryCounty(r["縣市"])));
  if (hasUnassigned) {
    list.push("全國性或未分配");
  }
  return list;
}

function formatBranchDisplayName(rawBranch) {
  const b = String(rawBranch || "").trim();
  if (!b) return "未分類";
  if (b.includes("水規")) return "水規分署";
  return b.length === 1 ? `${b}分署` : b;
}

function getSortedBranchEntries() {
  const mapAmt = {}, mapCnt = {};
  deduplicatedRecords.forEach(r => {
    const key = formatBranchDisplayName(r["分署"]);
    mapAmt[key] = (mapAmt[key] || 0) + r["核定經費_千元"];
    mapCnt[key] = (mapCnt[key] || 0) + 1;
  });

  const keys = Object.keys(mapAmt).sort((a, b) => {
    const rawA = a.replace("分署", "");
    const rawB = b.replace("分署", "");
    const oa = CHINESE_NUM_ORDER[a] || CHINESE_NUM_ORDER[rawA] || 99;
    const ob = CHINESE_NUM_ORDER[b] || CHINESE_NUM_ORDER[rawB] || 99;
    return oa - ob;
  });

  return keys.map(k => ({
    name: k,
    count: mapCnt[k] || 0,
    amountYi: (mapAmt[k] || 0) / 100000
  }));
}

function renderCountyTable() {
  const cntMap = {}, amtMap = {};
  STD_22_COUNTIES.forEach(c => { cntMap[c] = 0; amtMap[c] = 0; });
  let unCnt = 0, unAmt = 0;

  deduplicatedRecords.forEach(r => {
    const p = extractPrimaryCounty(r["縣市"]);
    if (STD_22_COUNTIES.includes(p)) {
      cntMap[p] += 1;
      amtMap[p] += r["核定經費_千元"];
    } else {
      unCnt += 1;
      unAmt += r["核定經費_千元"];
    }
  });

  let totCnt = unCnt, totAmt = unAmt / 100000;
  const rows = STD_22_COUNTIES.map((c, idx) => {
    const a = amtMap[c] / 100000;
    totCnt += cntMap[c];
    totAmt += a;
    const selectedClass = selectedCountyForChart === c ? "bg-sky-100 font-bold" : (idx % 2 === 0 ? "bg-slate-50" : "bg-white");
    return `
      <tr onclick="selectCountyForTrend('${c}')" class="${selectedClass} hover:bg-sky-50 cursor-pointer">
        <td class="p-2 text-center">${String(idx + 1).padStart(2, "0")}</td>
        <td class="p-2 text-center">${c}</td>
        <td class="p-2 text-right font-mono">${cntMap[c].toLocaleString()}</td>
        <td class="p-2 text-right font-mono">${a.toFixed(2)}</td>
      </tr>
    `;
  });

  rows.push(`
    <tr onclick="selectCountyForTrend('全國性或未分配')" class="${selectedCountyForChart === "全國性或未分配" ? "bg-sky-100 font-bold" : "bg-white"} hover:bg-sky-50 cursor-pointer">
      <td class="p-2 text-center">23</td>
      <td class="p-2 text-center">全國性或未分配</td>
      <td class="p-2 text-right font-mono">${unCnt.toLocaleString()}</td>
      <td class="p-2 text-right font-mono">${(unAmt / 100000).toFixed(2)}</td>
    </tr>
  `);

  rows.push(`
    <tr onclick="resetCountyChartToTotal()" class="${selectedCountyForChart === "【全臺合計】" ? "bg-amber-100 font-bold" : "bg-amber-50/70 font-bold"} cursor-pointer">
      <td class="p-2 text-center">24</td>
      <td class="p-2 text-center">【全臺合計】</td>
      <td class="p-2 text-right font-mono">${totCnt.toLocaleString()}</td>
      <td class="p-2 text-right font-mono">${totAmt.toFixed(2)}</td>
    </tr>
  `);

  document.getElementById("tbodyCounty").innerHTML = rows.join("");
}

function renderBranchTable() {
  const tbody = document.getElementById("tbodyBranch");
  if (!tbody) return;

  const entries = getSortedBranchEntries();
  let totCnt = 0;
  let totAmt = 0;

  const rows = entries.map((item, idx) => {
    totCnt += item.count;
    totAmt += item.amountYi;
    const selectedClass = selectedBranchForChart === item.name
      ? "bg-sky-100 font-bold"
      : (idx % 2 === 0 ? "bg-slate-50" : "bg-white");
    return `
      <tr onclick="selectBranchForTrend('${item.name}')" class="${selectedClass} hover:bg-sky-50 cursor-pointer">
        <td class="p-2 text-center">${String(idx + 1).padStart(2, "0")}</td>
        <td class="p-2 text-center">${item.name}</td>
        <td class="p-2 text-right font-mono">${item.count.toLocaleString()}</td>
        <td class="p-2 text-right font-mono">${item.amountYi.toFixed(2)}</td>
      </tr>
    `;
  });

  rows.push(`
    <tr onclick="resetBranchChartToTotal()" class="${selectedBranchForChart === "【全部分署】" ? "bg-amber-100 font-bold" : "bg-amber-50/70 font-bold"} cursor-pointer">
      <td class="p-2 text-center">${String(entries.length + 1).padStart(2, "0")}</td>
      <td class="p-2 text-center">【全臺合計】</td>
      <td class="p-2 text-right font-mono">${totCnt.toLocaleString()}</td>
      <td class="p-2 text-right font-mono">${totAmt.toFixed(2)}</td>
    </tr>
  `);

  tbody.innerHTML = rows.join("");
}

function toggleCountyTablePanel() {
  const tblPanel = document.getElementById("countyTablePanel");
  const chartPanel = document.getElementById("countyChartPanel");
  const lbl = document.getElementById("lblToggleCountyTable");
  if (!tblPanel || !chartPanel) return;

  const isCollapsed = tblPanel.classList.toggle("hidden");
  if (isCollapsed) {
    chartPanel.classList.remove("lg:col-span-8");
    chartPanel.classList.add("lg:col-span-12");
    if (lbl) lbl.textContent = "展開左側表";
  } else {
    chartPanel.classList.remove("lg:col-span-12");
    chartPanel.classList.add("lg:col-span-8");
    if (lbl) lbl.textContent = "收合左側表";
  }
  setTimeout(() => {
    if (chartCountyTrend) {
      chartCountyTrend.resize();
      renderCountyTrendChart();
    }
  }, 30);
}

function toggleBranchTablePanel() {
  const tblPanel = document.getElementById("branchTablePanel");
  const chartPanel = document.getElementById("branchChartPanel");
  const lbl = document.getElementById("lblToggleBranchTable");
  if (!tblPanel || !chartPanel) return;

  const isCollapsed = tblPanel.classList.toggle("hidden");
  if (isCollapsed) {
    chartPanel.classList.remove("lg:col-span-8");
    chartPanel.classList.add("lg:col-span-12");
    if (lbl) lbl.textContent = "展開左側表";
  } else {
    chartPanel.classList.remove("lg:col-span-12");
    chartPanel.classList.add("lg:col-span-8");
    if (lbl) lbl.textContent = "收合左側表";
  }
  setTimeout(() => {
    if (chartBranch) {
      chartBranch.resize();
      renderBranchComparisonChart();
    }
  }, 30);
}

function selectCountyForTrend(countyName) {
  selectedCountyForChart = countyName;
  renderCountyTable();
  renderCountyTrendChart();
}

function resetCountyChartToTotal() {
  selectedCountyForChart = "【全臺合計】";
  renderCountyTable();
  renderCountyTrendChart();
}

function selectBranchForTrend(branchName) {
  selectedBranchForChart = branchName;
  renderBranchTable();
  renderBranchComparisonChart();
}

function resetBranchChartToTotal() {
  selectedBranchForChart = "【全部分署】";
  renderBranchTable();
  renderBranchComparisonChart();
}

function renderCountyTrendChart() {
  if (selectedCountyForChart === "【全臺合計】") {
    const orderedKeys = getCountyTableAxisList();
    const amtMap = {}, cntMap = {};
    orderedKeys.forEach(k => { amtMap[k] = 0; cntMap[k] = 0; });

    deduplicatedRecords.forEach(r => {
      const p = extractPrimaryCounty(r["縣市"]);
      const key = STD_22_COUNTIES.includes(p) ? p : (orderedKeys.includes("全國性或未分配") ? "全國性或未分配" : p);
      if (amtMap[key] !== undefined) {
        amtMap[key] += r["核定經費_千元"];
        cntMap[key] += 1;
      }
    });

    const budgets = orderedKeys.map(k => Number((amtMap[k] / 100000).toFixed(2)));
    const counts = orderedKeys.map(k => cntMap[k]);
    const totalB = budgets.reduce((a, b) => a + b, 0);
    const totalC = counts.reduce((a, b) => a + b, 0);

    chartCountyTrend.setOption(buildDualLayerOption(
      `各縣市核定經費比較圖${getYearRangeLabel()}`,
      `合計核定：${totalB.toFixed(2)} 億元   ｜   總案件數：${totalC.toLocaleString()} 筆   ｜   縣市數：${orderedKeys.length} 項`,
      orderedKeys,
      budgets,
      counts,
      "#0d9488",
      true
    ), true);
    return;
  }

  const years = getAllYearsInRange();
  const targetData = selectedCountyForChart === "全國性或未分配"
    ? deduplicatedRecords.filter(r => !STD_22_COUNTIES.includes(extractPrimaryCounty(r["縣市"])))
    : deduplicatedRecords.filter(r => extractPrimaryCounty(r["縣市"]) === selectedCountyForChart);

  const budgets = years.map(y => Number((targetData.filter(r => String(r["年度"]) === y).reduce((a, b) => a + b["核定經費_千元"], 0) / 100000).toFixed(2)));
  const counts = years.map(y => targetData.filter(r => String(r["年度"]) === y).length);

  const totalB = budgets.reduce((a, b) => a + b, 0);
  const totalC = counts.reduce((a, b) => a + b, 0);

  chartCountyTrend.setOption(buildDualLayerOption(
    `${selectedCountyForChart}年度經費趨勢圖${getYearRangeLabel()}`,
    `區間總核定：${totalB.toFixed(2)} 億元   ｜   總案件數：${totalC.toLocaleString()} 筆`,
    years.map(y => `${y}年`),
    budgets,
    counts,
    "#0d9488",
    false
  ), true);
}

function renderTrendChart() {
  const years = getAllYearsInRange();
  const targetLbl = document.getElementById("selTarget").value;

  if (trendChartMode === "structure") {
    const xLabels = years.map(y => `${y}年`);
    const engData = [];
    const landData = [];
    const subData = [];
    const engCnt = [];
    const landCnt = [];
    const subCnt = [];

    years.forEach(y => {
      const yRows = deduplicatedRecords.filter(r => String(r["年度"]) === y);
      const eRows = yRows.filter(r => getMajorCategory(r["類別"]) === "工程類");
      const lRows = yRows.filter(r => getMajorCategory(r["類別"]) === "用地類");
      const sRows = yRows.filter(r => getMajorCategory(r["類別"]) === "補助類");

      engData.push(Number((eRows.reduce((a, b) => a + b["核定經費_千元"], 0) / 100000).toFixed(2)));
      landData.push(Number((lRows.reduce((a, b) => a + b["核定經費_千元"], 0) / 100000).toFixed(2)));
      subData.push(Number((sRows.reduce((a, b) => a + b["核定經費_千元"], 0) / 100000).toFixed(2)));

      engCnt.push(eRows.length);
      landCnt.push(lRows.length);
      subCnt.push(sRows.length);
    });

    const totEng = engData.reduce((a, b) => a + b, 0);
    const totLand = landData.reduce((a, b) => a + b, 0);
    const totSub = subData.reduce((a, b) => a + b, 0);
    const grandTotal = totEng + totLand + totSub;

    const pct = v => (grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) : "0.0");

    chartTrend.setOption({
      backgroundColor: "#ffffff",
      title: {
        text: `年度案件性質經費結構圖${getYearRangeLabel()}`,
        subtext: `查詢範圍：${targetLbl}   ｜   工程類 ${totEng.toFixed(2)}億 (${pct(totEng)}%)   ｜   用地類 ${totLand.toFixed(2)}億 (${pct(totLand)}%)   ｜   補助類 ${totSub.toFixed(2)}億 (${pct(totSub)}%)`,
        left: "center",
        top: 10,
        itemGap: 8,
        textStyle: { fontSize: 17, fontWeight: "bold", color: "#0f294a" },
        subtextStyle: { fontSize: 12, fontWeight: "600", color: "#475569" }
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        borderWidth: 0,
        textStyle: { color: "#f8fafc", fontSize: 12 },
        formatter: params => {
          if (!params || !params.length) return "";
          const idx = params[0].dataIndex;
          const yrTotal = engData[idx] + landData[idx] + subData[idx];
          const pYr = val => (yrTotal > 0 ? ((val / yrTotal) * 100).toFixed(1) : "0.0");
          return [
            `<div style="font-weight:bold;margin-bottom:4px;">${params[0].axisValue}（合計 ${yrTotal.toFixed(2)} 億元）</div>`,
            `<div>● 工程類：<b>${engData[idx].toFixed(2)}</b> 億元（${pYr(engData[idx])}% / ${engCnt[idx]} 筆）</div>`,
            `<div>● 用地類：<b>${landData[idx].toFixed(2)}</b> 億元（${pYr(landData[idx])}% / ${landCnt[idx]} 筆）</div>`,
            `<div>● 補助類：<b>${subData[idx].toFixed(2)}</b> 億元（${pYr(subData[idx])}% / ${subCnt[idx]} 筆）</div>`
          ].join("");
        }
      },
      legend: {
        top: 62,
        itemWidth: 14,
        itemHeight: 10,
        textStyle: { fontSize: 12, fontWeight: "600", color: "#334155" }
      },
      grid: { left: 74, right: 28, top: 102, bottom: 44 },
      xAxis: {
        type: "category",
        data: xLabels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#94a3b8" } },
        axisLabel: { fontWeight: "600", fontSize: 12, color: "#1e293b" }
      },
      yAxis: {
        type: "value",
        name: "核定經費 (億元)",
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 48,
        nameTextStyle: { color: "#334155", fontSize: 11.5, fontWeight: "bold" },
        axisLabel: { color: "#64748b", fontSize: 11 },
        splitLine: { lineStyle: { type: "dashed", color: "#e2e8f0" } }
      },
      series: [
        {
          name: "工程類",
          type: "bar",
          stack: "total",
          barMaxWidth: 52,
          itemStyle: { color: "#2b6cb0" },
          label: {
            show: true,
            position: "inside",
            color: "#ffffff",
            fontWeight: "600",
            fontSize: 11,
            formatter: p => (p.value >= 1 ? `${p.value.toFixed(1)}億` : "")
          },
          data: engData
        },
        {
          name: "用地類",
          type: "bar",
          stack: "total",
          barMaxWidth: 52,
          itemStyle: { color: "#d97706" },
          label: {
            show: true,
            position: "inside",
            color: "#ffffff",
            fontWeight: "600",
            fontSize: 11,
            formatter: p => (p.value >= 1 ? `${p.value.toFixed(1)}億` : "")
          },
          data: landData
        },
        {
          name: "補助類",
          type: "bar",
          stack: "total",
          barMaxWidth: 52,
          itemStyle: { color: "#0d9488", borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: "inside",
            color: "#ffffff",
            fontWeight: "600",
            fontSize: 11,
            formatter: p => (p.value >= 1 ? `${p.value.toFixed(1)}億` : "")
          },
          data: subData
        }
      ]
    }, true);
    return;
  }

  const budgets = years.map(y => Number((deduplicatedRecords.filter(r => String(r["年度"]) === y).reduce((a, b) => a + b["核定經費_千元"], 0) / 100000).toFixed(2)));
  const counts = years.map(y => deduplicatedRecords.filter(r => String(r["年度"]) === y).length);
  const totalB = budgets.reduce((a, b) => a + b, 0);
  const totalC = counts.reduce((a, b) => a + b, 0);

  chartTrend.setOption(buildDualLayerOption(
    `年度趨勢圖${getYearRangeLabel()}`,
    `查詢範圍：${targetLbl}   ｜   區間總核定：${totalB.toFixed(2)} 億元   ｜   總案件數：${totalC.toLocaleString()} 筆`,
    years.map(y => `${y}年`),
    budgets,
    counts,
    "#d97706",
    false
  ), true);
}

function renderBranchComparisonChart() {
  if (selectedBranchForChart && selectedBranchForChart !== "【全部分署】") {
    const years = getAllYearsInRange();
    const targetData = deduplicatedRecords.filter(r => formatBranchDisplayName(r["分署"]) === selectedBranchForChart);
    const budgets = years.map(y => Number((targetData.filter(r => String(r["年度"]) === y).reduce((a, b) => a + b["核定經費_千元"], 0) / 100000).toFixed(2)));
    const counts = years.map(y => targetData.filter(r => String(r["年度"]) === y).length);
    const totalB = budgets.reduce((a, b) => a + b, 0);
    const totalC = counts.reduce((a, b) => a + b, 0);

    chartBranch.setOption(buildDualLayerOption(
      `${selectedBranchForChart}年度經費趨勢圖${getYearRangeLabel()}`,
      `區間總核定：${totalB.toFixed(2)} 億元   ｜   總案件數：${totalC.toLocaleString()} 筆`,
      years.map(y => `${y}年`),
      budgets,
      counts,
      "#0d9488",
      false
    ), true);
    return;
  }

  const entries = getSortedBranchEntries();
  const labels = entries.map(e => e.name);
  const budgets = entries.map(e => Number(e.amountYi.toFixed(2)));
  const counts = entries.map(e => e.count);
  const totalB = budgets.reduce((a, b) => a + b, 0);
  const totalC = counts.reduce((a, b) => a + b, 0);

  chartBranch.setOption(buildDualLayerOption(
    `各分署經費比較圖${getYearRangeLabel()}`,
    `合計核定：${totalB.toFixed(2)} 億元   ｜   總案件數：${totalC.toLocaleString()} 筆   ｜   單位數：${entries.length} 個`,
    labels,
    budgets,
    counts,
    "#0d9488",
    false
  ), true);
}

function toVerticalChineseLabel(text) {
  const clean = text === "全國性或未分配" ? "未分配" : String(text || "");
  return clean.split("").join("\n");
}

function buildDualLayerOption(mainTitle, subTitle, xLabels, budgets, counts, lineColor, verticalX = false) {
  const totalB = budgets.reduce((a, b) => a + b, 0);
  const nonZeroBudgets = budgets.filter(v => v > 0);
  const avgB = nonZeroBudgets.length ? totalB / nonZeroBudgets.length : 0;
  const maxB = Math.max(...budgets, 0);
  const isDense = xLabels.length > 14;

  const barBlueGrad = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: "#3182ce" },
    { offset: 1, color: "#1e3a8a" }
  ]);
  const barPeakGrad = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: "#f59e0b" },
    { offset: 1, color: "#c2410c" }
  ]);

  return {
    backgroundColor: "#ffffff",
    title: {
      text: mainTitle,
      subtext: subTitle,
      left: "center",
      top: 10,
      itemGap: 8,
      textStyle: { fontSize: 17, fontWeight: "bold", color: "#0f294a" },
      subtextStyle: { fontSize: 12.5, fontWeight: "600", color: "#475569" }
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      borderWidth: 0,
      textStyle: { color: "#f8fafc", fontSize: 12 }
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [
      { left: 74, right: 24, top: 84, height: "41%" },
      { left: 74, right: 24, top: "61%", height: "20%" }
    ],
    xAxis: [
      { type: "category", data: xLabels, gridIndex: 0, axisTick: { show: false }, axisLine: { lineStyle: { color: "#cbd5e1" } }, axisLabel: { show: false } },
      {
        type: "category",
        data: xLabels,
        gridIndex: 1,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#94a3b8" } },
        axisLabel: {
          interval: 0,
          rotate: 0,
          margin: 8,
          lineHeight: 13,
          fontWeight: "600",
          fontSize: isDense ? 11 : 12,
          color: "#1e293b",
          formatter: val => (verticalX ? toVerticalChineseLabel(val) : val)
        }
      }
    ],
    yAxis: [
      {
        type: "value",
        name: "核定經費 (億元)",
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 48,
        nameTextStyle: { color: "#334155", fontSize: 11.5, fontWeight: "bold" },
        gridIndex: 0,
        max: maxB > 0 ? Math.ceil(maxB * 1.25) : 10,
        axisLabel: { color: "#64748b", fontSize: 11 },
        splitLine: { lineStyle: { type: "dashed", color: "#e2e8f0" } }
      },
      {
        type: "value",
        name: "案件數 (筆)",
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 48,
        nameTextStyle: { color: "#334155", fontSize: 11.5, fontWeight: "bold" },
        gridIndex: 1,
        axisLabel: { color: "#64748b", fontSize: 11 },
        splitLine: { lineStyle: { type: "dashed", color: "#f1f5f9" } }
      }
    ],
    series: [
      {
        name: "核定經費 (億元)",
        type: "bar",
        xAxisIndex: 0,
        yAxisIndex: 0,
        barMaxWidth: isDense ? 24 : 42,
        data: budgets.map(v => ({
          value: v,
          itemStyle: {
            color: (v === maxB && budgets.length > 1 && maxB > 0) ? barPeakGrad : barBlueGrad,
            borderRadius: [4, 4, 0, 0]
          }
        })),
        label: {
          show: true,
          position: "top",
          fontWeight: "600",
          fontSize: isDense ? 9.5 : 11,
          color: "#1e3a8a",
          formatter: p => {
            if (!p.value) return "";
            const pct = totalB > 0 ? ((p.value / totalB) * 100).toFixed(1) : "0.0";
            return budgets.length > 1 ? `${p.value.toFixed(2)}億\n(${pct}%)` : `${p.value.toFixed(2)}億`;
          }
        },
        markLine: budgets.length > 1 && maxB > 0 ? {
          symbol: "none",
          lineStyle: { type: "dashed", color: "#64748b", width: 1.3 },
          label: { formatter: `平均 ${avgB.toFixed(2)} 億`, position: "insideEndTop", color: "#334155", fontSize: 11 },
          data: [{ yAxis: Number(avgB.toFixed(2)) }]
        } : undefined
      },
      {
        name: "案件數 (筆)",
        type: "line",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: counts,
        symbol: "circle",
        symbolSize: isDense ? 6 : 7.5,
        lineStyle: { color: lineColor, width: 2.2 },
        itemStyle: { color: lineColor, borderColor: "#ffffff", borderWidth: 1.5 },
        areaStyle: { color: lineColor, opacity: 0.14 },
        label: {
          show: true,
          position: "top",
          fontWeight: "600",
          fontSize: isDense ? 9.5 : 11,
          color: "#0f766e",
          formatter: p => (p.value > 0 ? `${p.value} 筆` : "")
        }
      }
    ]
  };
}

function renderActiveCharts() {
  if (!document.getElementById("viewCounty").classList.contains("hidden")) {
    chartCountyTrend.resize();
    renderCountyTrendChart();
  }
  if (!document.getElementById("viewTrend").classList.contains("hidden")) {
    chartTrend.resize();
    renderTrendChart();
  }
  if (!document.getElementById("viewBranch").classList.contains("hidden")) {
    renderBranchTable();
    chartBranch.resize();
    renderBranchComparisonChart();
  }
}

async function copyChartToClipboard(chartInstance, chartTitle) {
  try {
    const dataUrl = chartInstance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    alert(`《${chartTitle}》已複製為高畫質圖片！\n請直接切換至 PowerPoint / Word 按下 Ctrl + V 貼上即可。`);
  } catch (err) {
    alert("瀏覽器剪貼簿複製受限（請確認網址為 HTTPS），建議改用右側「另存 PNG」功能。");
  }
}

function downloadChartPng(chartInstance, filename) {
  const dataUrl = chartInstance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${filename}${getYearRangeLabel()}.png`;
  a.click();
}
