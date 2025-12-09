
let changeDisabled = true;
let autoCloseComment = false;
let autoCloseAlumnes = false;

let studentCode = "";
let studentName = "";

let codeModule = "";
let codeRA = "";

document.addEventListener("DOMContentLoaded", initExtension);

async function initExtension() {
  const tab = await getActiveTab();
  cargarInfoApp();
  extraerInformacionDesdeEsfera(tab.id);
  generarAvaluacions();
  await cargarOpciones();
  inicializarUIOpciones();
  wireSettingsUI();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function cargarInfoApp() {
  let savedData = "";
  chrome.storage.local.get(["notes"], (result) => {
    savedData = result.notes || "";
    document.getElementById("userNotesText").value = savedData;
  });

  chrome.storage.local.get(["av"], (result) => {
    savedData = result.av;
    document.getElementById("evaluation").value = savedData;
  });
}

async function cargarOpciones() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["changeDisabled", "autoCloseComment", "autoCloseAlumnes"], (result) => {
      changeDisabled = result.changeDisabled ?? true;
      autoCloseComment = result.autoCloseComment ?? false;
      autoCloseAlumnes = result.autoCloseAlumnes ?? false;
      resolve();
    });
  });
}

function inicializarUIOpciones() {
  const elChange = document.getElementById("optChangeDisabled");
  const elComment = document.getElementById("optAutoCloseComment");
  const elAlumnes = document.getElementById("optAutoCloseAlumnes");
  if (elChange) elChange.checked = !!changeDisabled;
  if (elComment) elComment.checked = !!autoCloseComment;
  if (elAlumnes) elAlumnes.checked = !!autoCloseAlumnes;
}

function wireSettingsUI() {
  const btn = document.getElementById("settingsBtn");
  const panel = document.getElementById("settingsPanel");
  if (btn && panel) {
    btn.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
  }

  const elChange = document.getElementById("optChangeDisabled");
  const elComment = document.getElementById("optAutoCloseComment");
  const elAlumnes = document.getElementById("optAutoCloseAlumnes");
  if (elChange) {
    elChange.addEventListener("change", () => {
      changeDisabled = elChange.checked;
      chrome.storage.sync.set({ changeDisabled });
    });
  }
  if (elComment) {
    elComment.addEventListener("change", () => {
      autoCloseComment = elComment.checked;
      chrome.storage.sync.set({ autoCloseComment });
    });
  }
  if (elAlumnes) {
    elAlumnes.addEventListener("change", () => {
      autoCloseAlumnes = elAlumnes.checked;
      chrome.storage.sync.set({ autoCloseAlumnes });
    });
  }
}

function extraerInformacionDesdeEsfera(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    function: extractInfoEsfera
  }, manejarResultadosEsfera);
}

function mostrarInfoRA({ moduleCode, raCode }) {
  codeModule = moduleCode;
  codeRA = raCode;
  document.getElementById("info").innerHTML = `<strong>Mòdul</strong>: ${codeModule} - ${codeRA}`;
  document.getElementById("viewBtnUserNotes").style.display = "none";
  document.getElementById("viewBtnRANotes").style.display = "flex";
}

function mostrarInfoEstudiant({ idalu, nom }) {
  studentCode = idalu;
  studentName = nom;
  document.getElementById("info").innerHTML = `<strong>Nom:</strong> ${studentName} - <strong>IdAlu:</strong> ${studentCode}`;
  document.getElementById("viewBtnUserNotes").style.display = "flex";
  document.getElementById("viewBtnRANotes").style.display = "none";
}

function manejarResultadosEsfera(results) {
  if (!results || !results[0] || !results[0].result) return;
  const data = results[0].result;

  if (data.type === "RA") {
    mostrarInfoRA(data);
  } else if (data.type === "ST") { mostrarInfoEstudiant(data); }
}

document.getElementById("clearButton").addEventListener("click", () => {
  document.getElementById("userNotesText").value = "";
  chrome.storage.local.set({ "notes": "" });
});

document.getElementById("userNotesText").addEventListener("input", () => {
  try {
    savedData = document.getElementById("userNotesText").value;
    chrome.storage.local.set({ "notes": savedData });
  } catch (error) {
    alert(error);
    console.error("Error al guardar", error);
  }
});

document.getElementById("evaluation").addEventListener("change", () => {
  try {
    savedData = document.getElementById("evaluation").value;
    chrome.storage.local.set({ "av": savedData });
  } catch (error) {
    alert(error);
    console.error("Error al Av", error);
  }
});


document.getElementById("pendingBtn").addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["setselects.js"]
  }).then(() => {
    chrome.tabs.sendMessage(tab.id, { action: "setSelects", state: "string:PDT", force: getForcePending(), changeDisabled: changeDisabled }, (response) => {
      document.getElementById("results").textContent = response.resultado;
    });
  }
  ).catch(err => {
    console.error("Error:", err);
  });
});

document.getElementById("processBtn").addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["setselects.js"]
  }).then(() => {
    chrome.tabs.sendMessage(tab.id, { action: "setSelects", state: "string:EP", force: getForceProcess(), changeDisabled: changeDisabled }, (response) => {
      document.getElementById("results").textContent = response.resultado;
    });
  }
  ).catch(err => {
    console.error("Error:", err);
  });
});


document.getElementById("setUserNotes").addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["setuserqualifications.js"]
  }).then(() => {
    chrome.tabs.sendMessage(tab.id, {
      action: "setUserNotes",
      jsonText: getJsonText(),
      studentCode: studentCode,
      force: getForceUserQualifications(),
      changeDisabled: changeDisabled,
      av: getAv(),
      autoCloseComment: autoCloseComment,
      autoCloseAlumnes: autoCloseAlumnes
    }, (response) => {
      document.getElementById("results").textContent = response.resultado;
    });
  }
  ).catch(err => {
    console.error("Error:", err);
  });
});


document.getElementById("setRANotes").addEventListener("click", () => {
  let forceRANotes = document.getElementById("forceRANotes").checked;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: setRANotes,
      args: [getJsonText(), codeModule, codeRA, forceRANotes]
    });
  });
});

function getForcePending() {
  return document.getElementById("forcePending").checked;
}

function getForceUserQualifications() {
  return document.getElementById("forceUserNotes").checked;
}

function getForceProcess() {
  return document.getElementById("forceProcess").checked;
}

function getAv() {
  return document.getElementById("evaluation").value;
}

function getJsonText() {
  return document.getElementById("userNotesText").value;
}


function setRANotes(jsonText, codeModule, raCode, force) {
  //document.querySelector('a[data-ng-click^="canviAlumne(\'next\')"]').click(); //Hacer clic

  let changeDisabled = true;

  let jsonData;
  try {
    jsonData = JSON.parse(jsonText); // Parseamos el JSON
  } catch (error) {
    return "Error en analitzar el JSON. Assegura't que estigui en el format correcte.";
  }

  const table = document.querySelector('table[data-st-table="dummyStudents"]');
  if (!table) return "Error a llegir la informació de l'Esfer@";

  table.querySelectorAll("tr").forEach(tr => {
    let tds = tr.querySelectorAll("td");
    if (tds.length < 7) return;

    let idalu = tds[0].textContent.trim();
    let select = tds[5].querySelector('select');
    let input = tds[5].querySelector('input');

    if (select) select.id = "s_" + idalu;
    if (input) input.id = "i_" + idalu + "_T";

  });

  jsonData.forEach((entry) => {
    const { idalu, nomalu, notes } = entry;


    select = document.getElementById("s_" + idalu);

    if (select != null && select.hasAttribute("disabled") && !changeDisabled) return;
    if (!select || select == null) return;

    let nota = notes.find(notaAlu => notaAlu.mod == codeModule && notaAlu.ra == raCode).nota;
    if (!nota) return;

    // console.log(idalu);
    console.log(idalu + '-' + nota);

    let value = nota === "" ? (raCode === "T" ? "string:PQ" : "string:PDT") :
      raCode === "T" ? "" :
        nota === "P" ? "string:EP" :
          nota < 5 ? "string:NA" : `string:A${nota}`;


    let isEdiableSelect = !select.value || select.value == 'string:EP' || select.value == 'string:PDT';
    if (raCode == "T" && nota != "") {

      let optionExists = Array.from(select.options).some(option => option.value === value);
      if (optionExists && (isEdiableSelect || force)) {
        select.value = value;
        select.dispatchEvent(new Event('change'));
      }

      input = document.getElementById("i_" + idalu)

      if (input && (!input.value || force)) {
        input.value = nota;
        input.dispatchEvent(new Event('change'));
      }

    } else if (raCode == "T") {

      if ((isEdiableSelect || force)) {
        select.value = "string:PQ";
        select.dispatchEvent(new Event('change'));
      }

      input = document.getElementById("i_" + modCode + "_" + raCode)
      if (input && force) {
        select.value = value;
        input.dispatchEvent(new Event('change'));
      }

    } else {

      let optionExists = Array.from(select.options).some(option => option.value === value);
      if (optionExists && (isEdiableSelect || force)) {
        select.value = value;
        select.dispatchEvent(new Event('change'));
      }
    }
  });

};


function extractInfoEsfera() {

  const breadcrumbItems = document.querySelectorAll('.breadcrumb-wrapper ol.breadcrumb li');
  const lastItem = breadcrumbItems[breadcrumbItems.length - 1];
  if (!lastItem) return "No trobat";

  const lastItemText = lastItem.textContent.trim();
  const parts = lastItemText.split('-');
  const part1 = parts[0].trim();
  const part2 = parts[1].trim();
  let type = "";

  if (part1.split('_').length == 1) {
    type = "ST";
    let idalu = part1;
    let nom = part2;
    return { type, idalu, nom };
  } else {
    let moduleRA = part1.split("_");
    let moduleCode = moduleRA[0];
    let raCode = moduleRA.length > 2 ? moduleRA[2] : "T";
    type = "RA";
    return { type, moduleCode, raCode };
  }
}

function generarAvaluacions() {
  // Obtenim el mes actual
  const currentMonth = new Date().getMonth() + 1; // Els mesos van de 0 a 11, per això sumem 1

  // Opcions de les avaluacions possibles
  const evaluations = [
    { label: "Seleciona una avaluació", value: 0 },
    { label: "Primera avaluació (1)", value: 1 },
    { label: "Segona avaluació (2)", value: 2 },
    { label: "Avaluació final (3)", value: 3 },
    { label: "Avaluació extraordinària (4)", value: 4 }
  ];

  const selectElement = document.getElementById('evaluation');

  // Avaluació per defecte segons el mes actual
  // let defaultEvaluation = 1; // Valor per defecte (primera avaluació)
  // if (currentMonth >= 9 && currentMonth <= 11) {
  //     defaultEvaluation = 1; // Primera avaluació (per exemple, setembre-novembre)
  // } else if (currentMonth >= 12 || currentMonth <= 3) {
  //     defaultEvaluation = 2; // Segona avaluació (desembre-març)
  // } else if (currentMonth >= 4 && currentMonth <= 5) {
  //     defaultEvaluation = 3; // Tercera avaluació (abril-maig)
  // } else {
  //     defaultEvaluation = 4; // Avaluació extraordinària (juny-agost)
  // }

  // Afegir les opcions al select
  evaluations.forEach((evaluation) => {
    const option = document.createElement('option');
    option.value = evaluation.value;
    option.textContent = evaluation.label;
    if (evaluation.value === 0) {
      option.selected = true; // Marca l'opció per defecte
    }
    selectElement.appendChild(option);
  });
}
