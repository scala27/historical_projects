function exportCurrentExcel() {
  if (!filteredRecords.length) {
    alert("目前畫面上無可匯出的數據！");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(filteredRecords.map(({ id, ...rest }) => rest));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "工程統計明細");
  XLSX.writeFile(wb, `防洪工程統計明細${getYearRangeLabel()}.xlsx`);
}

function openAdminModal() {
  document.getElementById("modalAdmin").classList.remove("hidden");
  document.getElementById("inputAdminPass").focus();
}

function closeAdminModal() {
  document.getElementById("modalAdmin").classList.add("hidden");
}

async function submitAdminLogin() {
  const pass = document.getElementById("inputAdminPass").value.trim();
  if (!pass) return;
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "verify_admin", passcode: pass })
    });
    const json = await res.json();
    if (json.status === "success") {
      adminPasscode = pass;
      document.getElementById("menuAdminLogin").classList.add("hidden");
      document.getElementById("menuAdminLogout").classList.remove("hidden");
      document.getElementById("menuImportExcel").classList.remove("hidden");
      document.getElementById("adminIndicatorDot").classList.remove("hidden");
      closeAdminModal();
      renderDetailTable();
    } else {
      alert(json.message || "密碼錯誤");
    }
  } catch (err) {
    alert("驗證連線失敗：" + err.message);
  }
}

function logoutAdmin() {
  adminPasscode = "";
  document.getElementById("inputAdminPass").value = "";
  document.getElementById("menuAdminLogin").classList.remove("hidden");
  document.getElementById("menuAdminLogout").classList.add("hidden");
  document.getElementById("menuImportExcel").classList.add("hidden");
  document.getElementById("adminIndicatorDot").classList.add("hidden");
  renderDetailTable();
}

function openEditModal(rec) {
  document.getElementById("editId").value = rec.id;
  document.getElementById("editYear").value = rec["年度"];
  document.getElementById("editBranch").value = rec["分署"];
  document.getElementById("editCounty").value = rec["縣市"];
  document.getElementById("editWater").value = rec["水系"];
  document.getElementById("editName").value = rec["案件名稱"];
  document.getElementById("editApproved").value = rec["核定經費_千元"];
  document.getElementById("editUsable").value = rec["可支用經費_千元"];
  document.getElementById("editCode").value = rec["工程編號"];
  document.getElementById("editCoords").value = rec["座標點位"];
  document.getElementById("editRemark").value = rec["備註資訊"];
  document.getElementById("modalEdit").classList.remove("hidden");
}

async function saveEditedProject() {
  const id = document.getElementById("editId").value;
  const orig = allRecords.find(r => r.id === id) || {};
  const updated = {
    ...orig,
    id,
    "年度": normalizeText(document.getElementById("editYear").value),
    "分署": normalizeText(document.getElementById("editBranch").value).replace("水規所", "水規分署"),
    "縣市": normalizeText(document.getElementById("editCounty").value).replace(/台/g, "臺"),
    "水系": normalizeText(document.getElementById("editWater").value),
    "案件名稱": normalizeText(document.getElementById("editName").value),
    "核定經費_千元": parseFloat(document.getElementById("editApproved").value) || 0,
    "可支用經費_千元": parseFloat(document.getElementById("editUsable").value) || 0,
    "工程編號": normalizeText(document.getElementById("editCode").value),
    "座標點位": normalizeText(document.getElementById("editCoords").value),
    "備註資訊": normalizeText(document.getElementById("editRemark").value)
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update_project", passcode: adminPasscode, record: updated })
    });
    const json = await res.json();
    if (json.status === "success") {
      document.getElementById("modalEdit").classList.add("hidden");
      alert("已成功更新至 Google 試算表！");
      loadAllData(false);
    } else {
      alert(json.message);
    }
  } catch (err) {
    alert("更新失敗：" + err.message);
  }
}

function triggerExcelInput() {
  document.getElementById("fileExcelInput").click();
}

function handleExcelFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const yearMatch = file.name.match(/(1\d{2})/);
  const defaultYear = yearMatch ? yearMatch[1] : String(new Date().getFullYear() - 1911);

  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
    const parsed = [];

    wb.SheetNames.forEach(sheetName => {
      if (sheetName.includes("總表") || sheetName.includes("目錄")) return;
      let cat = "工程";
      if (sheetName.includes("委託") || sheetName.includes("設計")) cat = "委託設計/監造";
      else if (sheetName.includes("先期")) cat = "用地先期作業";
      else if (sheetName.includes("用地") || sheetName.includes("土地")) cat = "用地取得";
      else if (sheetName.includes("橋梁")) cat = "橋梁改建/補助";
      else if (sheetName.includes("逕流")) cat = "逕流分擔/補助";

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
      rows.forEach(row => {
        const pName = normalizeText(row["案件名稱"] || row["工程名稱"]);
        const bName = normalizeText(row["分署"] || row["執行單位"]).replace("水規所", "水規分署");
        if (!pName || !bName || pName.includes("合計") || pName.includes("小計")) return;

        parsed.push({
          "年度": normalizeText(row["年度"] || defaultYear),
          "類別": normalizeCategoryName(row["類別"] || cat),
          "附表": normalizeText(row["附表"] || sheetName),
          "分署": bName,
          "縣市": normalizeText(row["縣市"]).replace(/台/g, "臺"),
          "水系": normalizeText(row["水系"]),
          "案件名稱": pName,
          "核定經費_千元": parseFloat(row["核定經費_千元"] || row["核定經費(千元)"] || row["核定經費"] || 0) || 0,
          "可支用經費_千元": parseFloat(row["可支用經費_千元"] || row["可支用經費(千元)"] || row["可支用經費"] || 0) || 0,
          "工程編號": normalizeText(row["工程編號"]),
          "座標點位": normalizeText(row["座標點位"]),
          "堤防_m": parseFloat(row["堤防_m"] || 0) || 0,
          "護岸_m": parseFloat(row["護岸_m"] || 0) || 0,
          "水門_座": parseInt(row["水門_座"] || 0, 10) || 0,
          "水防道路_m2": parseFloat(row["水防道路_m2"] || 0) || 0,
          "其他結構說明": normalizeText(row["其他結構說明"]),
          "備註資訊": normalizeText(row["備註資訊"] || row["備註"])
        });
      });
    });

    pendingImportRecords = parsed;
    document.getElementById("lblImportSummary").textContent = `檔案《${file.name}》共解析出 ${parsed.length} 筆有效案件（寫入時將自動依「年度＋分署＋工程編號／案件名稱」執行防重複合併）：`;
    document.getElementById("tbodyImportPreview").innerHTML = parsed.slice(0, 100).map(r => `
      <tr>
        <td class="p-1.5 text-center">${r["年度"]}</td>
        <td class="p-1.5 text-center">${r["分署"]}</td>
        <td class="p-1.5 text-center">${r["類別"]}</td>
        <td class="p-1.5">${r["案件名稱"]}</td>
        <td class="p-1.5 text-right font-mono">${r["核定經費_千元"].toLocaleString()}</td>
        <td class="p-1.5 text-center">${r["工程編號"] || "-"}</td>
      </tr>
    `).join("");
    document.getElementById("modalImportPreview").classList.remove("hidden");
    event.target.value = "";
  };
  reader.readAsArrayBuffer(file);
}

async function confirmUploadImportRecords() {
  if (!pendingImportRecords.length) return;
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "upsert_batch", passcode: adminPasscode, records: pendingImportRecords })
    });
    const json = await res.json();
    if (json.status === "success") {
      document.getElementById("modalImportPreview").classList.add("hidden");
      alert(json.message);
      loadAllData(false);
    } else {
      alert(json.message);
    }
  } catch (err) {
    alert("雲端寫入失敗：" + err.message);
  }
}
