/*
Quan l'usuari fa clic al botó "Posar nota alumne", 
el sistema emplena automàticament la nota de l'alumne utilitzant la informació extreta del fitxer JSON 
(notes enganxades a la zona de text de l'extensió).
Per defecte, només es modificaran aquells Resultats d'Aprenentatge (RA) que estiguin buits, en procés o pendents.
Si l'usuari marca l'opció "Forçar" abans de fer clic, totes les avaluacions, independentment del valor que tinguessin prèviament, 
s'actualitzaran amb les dades de l'extensió.

Notes:
-Totes les qualificacions buides (“”), és a dir, sense nota assignada, s'actualitzaran a l'Esfer@ a l'estat "pendent".
-Totes les qualificacions amb "P" (pendent) s'actualitzaran a l'Esfer@ a l'estat "en procés",
tant a les avaluacions actuals com a les posteriors.
-S'emplenen les notes de l'avaluació actual i de les avaluacions anteriors que encara no tinguin valor (notes pendents).
-Si un alumne ja té una nota en una avaluació posterior (per motius com convalidacions, etc.), 
aquesta nota es marcarà com pendent.

Comentaris:
-Els comentaris associats es copiaran al camp de comentaris generals del mòdul.
- Només s'afegiran els comentaris dels Resultats d'Aprenentatge (RA) de l'avaluació actual i els comentaris dels RAs en procés.

*/


// --- CONSTANTS ---
{
  const SELECTORS = {
    MAIN_TABLE: "#mainView table.smart-table",
    TABLE_ROWS: "tr",
    TABLE_CELLS: "td",
    SELECT: "select",
    INPUT: "input",
    COMMENTS_MODAL_TRIGGER: 'a[data-ng-click^="showCommentsModal()"]',
    COMMENTS_TEXTAREA: 'textarea[data-ng-model^="comentariGeneral.comentari"]',
    SAVE_COMMENT_BTN: 'a[data-ng-click^="saveComentariGeneral()"]'
  };

  const TABLE_CONFIG = {
    MIN_COLUMNS: 6,
    GRADES_COLUMN_INDEX: 4
  };

  const VALUES = {
    PENDING: "string:PDT",
    IN_PROCESS: "string:EP",
    QUALIFIED: "string:PQ",
    NOT_EVALUATED: "string:NA",
    APPROVED_PREFIX: "string:A"
  };

  const MESSAGES = {
    JSON_ERROR: "Error en analitzar el JSON. Assegura't que estigui en el format correcte.",
    TABLE_ERROR: "Error a llegir la informació de l'Esfer@",
    STUDENT_NOT_FOUND: "Alumne no trobat",
    VERIFICATION_FAILED: "Verificació fallida. Revisa la consola per a més detalls.",
    SUCCESS: (name) => `Notes de l'alumne ${name} assignades`,
    UNKNOWN_ERROR: "Error desconegut durant l'assignació de notes."
  };

  const LOG_PREFIX = "[EsferaExtensionFP]";
  const DELAY_MS = 300;

  // --- INITIALIZATION ---

  if (!window.__listenerRegistradoUserQualificacions) {
    window.__listenerRegistradoUserQualificacions = true;
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  /**
   * Gestiona els missatges entrants de la finestra emergent de l'extensió.
   * @param {object} message - L'objecte del missatge.
   * @param {object} sender - L'objecte del remitent.
   * @param {function} sendResponse - Funció per enviar una resposta de tornada.
   * @returns {boolean} - Retorna true per indicar la gestió de resposta asíncrona.
   */
  function handleMessage(message, sender, sendResponse) {
    if (message.action === "setUserNotes") {
      const { jsonText, studentCode, force, changeDisabled, av, autoCloseComment, autoCloseAlumnes, validationText } = message;

      setUserNotes(jsonText, studentCode, force, changeDisabled, av, autoCloseComment, autoCloseAlumnes, validationText)
        .then(resultado => {
          sendResponse({ resultado });
        })
        .catch(error => {
          console.error(LOG_PREFIX, error);
          sendResponse({ resultado: error.message || MESSAGES.UNKNOWN_ERROR });
        });

      return true; // Necesario para respuestas async
    }
  }

  // --- MAIN FUNCTIONS ---

  /**
   * Funció principal per processar i assignar les notes de l'usuari.
   * @param {string} jsonText - La cadena JSON que conté les notes.
   * @param {string} studentCode - El codi d'identificació de l'alumne.
   * @param {boolean} force - Si cal forçar la sobreescriptura de les notes existents.
   * @param {boolean} changeDisabled - Si es permet canviar camps deshabilitats.
   * @param {string} av - L'avaluació actual (av).
   * @param {boolean} autoCloseComment - Si cal tancar automàticament el modal de comentaris.
   * @param {boolean} autoCloseAlumnes - Si cal tancar automàticament la vista d'alumnes (no implementat).
   * @returns {Promise<string>} - El missatge de resultat.
   */
  async function setUserNotes(jsonText, studentCode, force, changeDisabled, av, autoCloseComment, autoCloseAlumnes, validationText) {
    console.group(`${LOG_PREFIX} Iniciant assignació de notes`);

    const jsonData = parseJSON(jsonText);
    if (!jsonData) {
      console.warn(`${LOG_PREFIX} ${MESSAGES.JSON_ERROR}`, jsonData);
      console.groupEnd();
      return MESSAGES.JSON_ERROR;
    }

    const table = getQualificacionsTable();
    if (!table) {
      console.warn(`${LOG_PREFIX} ${MESSAGES.TABLE_ERROR}`);
      console.groupEnd();
      return MESSAGES.TABLE_ERROR;
    }

    const student = jsonData.find(al => al.idalu == studentCode);
    if (!student) {
      console.warn(`${LOG_PREFIX} ${MESSAGES.STUDENT_NOT_FOUND}`, studentCode);
      console.groupEnd();
      return MESSAGES.STUDENT_NOT_FOUND;
    }

    console.log(`${LOG_PREFIX} Alumne trobat:`, student.nomalu);

    // 1. Map Table Elements
    const elementMap = mapTableElements(table);

    // 2. Verification Phase
    const verification = verifyElements(elementMap, student.notes);
    if (!verification.success) {
      console.warn(`${LOG_PREFIX} ⚠️ ${MESSAGES.VERIFICATION_FAILED}`);
      console.table(verification.missing);
      // Continuem encara que hi hagi errors, com demanat.
    } else {
      console.log(`${LOG_PREFIX} ✅ Verificació completada correctament.`);
    }

    // 3. Application Phase
    applyGrades(elementMap, student.notes, force, changeDisabled, av, validationText);

    // 4. Comments Phase
    await aplicarComentaris(student.notes, av, autoCloseComment, validationText);

    if (autoCloseAlumnes) {
      cerrarAlumnes();
    }

    console.log(`${LOG_PREFIX} ${MESSAGES.SUCCESS(student.nomalu)}`);
    console.groupEnd();
    return MESSAGES.SUCCESS(student.nomalu);
  }

  /**
   * Analitza de manera segura una cadena JSON.
   * @param {string} jsonText - La cadena JSON.
   * @returns {object|null} - L'objecte analitzat o null si falla.
   */
  function parseJSON(jsonText) {
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      return null;
    }
  }

  /**
   * Troba la taula de qualificacions al DOM.
   * @returns {HTMLElement|null} - L'element taula o null.
   */
  function getQualificacionsTable() {
    const table = document.querySelector(SELECTORS.MAIN_TABLE);
    if (table) {
      table.classList.add('qualificacions-table-id');
    }
    return table;
  }

  // --- HELPER FUNCTIONS ---

  /**
   * Mapa els elements DOM de la taula a un objecte estructurat indexat per mòdul i RA.
   * @param {HTMLElement} table - L'element taula per iterar.
   * @returns {object} - Mapa de { "MOD_RA": { select, input, ... } }
   */
  function mapTableElements(table) {
    const map = {};

    table.querySelectorAll(SELECTORS.TABLE_ROWS).forEach((tr, index) => {
      const tds = tr.querySelectorAll(SELECTORS.TABLE_CELLS);

      if (tds.length < TABLE_CONFIG.MIN_COLUMNS) return;

      const parts = tds[0].textContent.trim().split("_");
      const moduleCode = parts[0];
      let raCode = "T";

      if (parts.length > 2) {
        raCode = parts[2];
      } else if (parts.length === 2) {
        // Heurística: si té 2 parts:
        // Si la segona comença per "RA" o "EM", és el RA específic.
        // Si no (ex: AGA0), assumim que és el Total (T).
        const part2 = parts[1];
        if (part2.startsWith("RA") || part2.startsWith("EM")) {
          raCode = part2;
        } else {
          raCode = "T";
        }
      }

      // Key format: "MOD_RA"
      const key = `${moduleCode}_${raCode}`;

      const select = tds[TABLE_CONFIG.GRADES_COLUMN_INDEX].querySelector(SELECTORS.SELECT);
      const input = tds[TABLE_CONFIG.GRADES_COLUMN_INDEX].querySelector(SELECTORS.INPUT);

      if (select) { // Only map if there is a select element
        map[key] = { select, input, moduleCode, raCode, rowIndex: index };
      }
    });

    return map;
  }

  /**
   * Verifica que totes les notes del JSON tinguin un element corresponent al mapa del DOM.
   * @param {object} elementMap - El mapa d'elements DOM.
   * @param {Array} notes - Array d'objectes nota del JSON.
   * @returns {object} - { success: boolean, missing: Array }
   */
  function verifyElements(elementMap, notes) {
    console.group("Verificació d'elements DOM");
    const missingInDom = [];
    const noteKeys = new Set();

    // 1. Check notes against DOM (Missing in DOM)
    notes.forEach(note => {
      const key = `${note.mod}_${note.ra}`;
      noteKeys.add(key);

      if (!elementMap[key]) {
        missingInDom.push(note);
      }
    });

    // 2. Check DOM against notes (Extra in DOM)
    const extraInDom = Object.keys(elementMap).filter(domKey => !noteKeys.has(domKey));

    // Log results separately
    if (missingInDom.length > 0) {
      console.warn("⚠️ Elements del JSON no trobats al DOM:", missingInDom);
    }

    if (extraInDom.length > 0) {
      console.warn("❌ Elements al DOM no presents al JSON:", extraInDom);
      const msg = `Atenció: Hi ha ${extraInDom.length} elements en pantalla no definits al JSON:\n${extraInDom.join(", ")}`;
      alert(msg);
    }

    if (missingInDom.length === 0 && extraInDom.length === 0) {
      console.log("✅ Tots els elements coincideixen correctament.");
    }

    console.groupEnd();
    return { success: missingInDom.length === 0, missing: missingInDom };
  }

  /**
   * Aplica les notes als elements mapats.
   * @param {object} elementMap - El mapa d'elements DOM.
   * @param {Array} notes - Array d'objectes nota del JSON.
   * @param {boolean} force - Indicador de forçar sobreescriptura.
   * @param {boolean} changeDisabled - Si es permet canviar camps deshabilitats.
   * @param {string} currentAv - Període d'avaluació actual.
   */
  function applyGrades(elementMap, notes, force, changeDisabled, currentAv, validationText) {
    console.group("Aplicant Notes");

    notes.forEach(note => {
      const key = `${note.mod}_${note.ra}`;
      const elementData = elementMap[key];

      if (!elementData) return; // Should not happen if verification passed, but safe guard.

      const { select, input } = elementData;
      const { av, mod, ra, nota, comment } = note;

      if (select.hasAttribute("disabled") && !changeDisabled) {
        console.log(`🔒 Saltant ${key}: Element deshabilitat.`);
        return;
      }

      const valorNota = calcularValorNota(nota, ra);
      const isEditable = !select.value || [VALUES.IN_PROCESS, VALUES.PENDING, VALUES.QUALIFIED].includes(select.value);

      // console.log(`Processant ${key}: Nota=${nota}, Valor=${valorNota}, Editable=${isEditable}`);

      if (ra === "T") {
        aplicarNotaModul(select, input, nota, valorNota, force, isEditable, currentAv, av, comment, validationText);
      } else {
        aplicarNotaRA(select, valorNota, force, isEditable, currentAv, av, comment, validationText);
      }
    });
    console.groupEnd();
  }

  /**
   * Calcula la cadena de valor interna per a una nota donada.
   * @param {string|number} nota - El valor de la nota.
   * @param {string} ra - El codi del Resultat d'Aprenentatge.
   * @returns {string} - La cadena de valor interna (ex: "string:A7").
   */
  function calcularValorNota(nota, ra) {
    if (nota === "") return ra === "T" ? VALUES.QUALIFIED : VALUES.PENDING;
    if (ra === "T") return "";
    if (nota === "P") return VALUES.IN_PROCESS;
    return nota < 5 ? VALUES.NOT_EVALUATED : `${VALUES.APPROVED_PREFIX}${nota}`;
  }

  /**
   * Aplica la nota a un mòdul sencer (T).
   */
  function aplicarNotaModul(select, input, nota, valor, force, editable, currentAv, av, comment, validationText) {
    const tieneConv = comment?.includes(validationText);
    const valorNotaActual = input ? input.value : "";

    if ((nota === "" && (editable || force) && (!valorNotaActual || force)) || av > currentAv) {
      updateElementValue(select, VALUES.QUALIFIED);
    }

    if (nota == "") return;

    // Forzamos Angular a sincronitzar el input
    if (tieneConv && (editable || force) && (!valorNotaActual || force)) {
      updateElementValue(select, valor);
      if (input) updateElementValue(input, nota);
      return;
    }

    if ((av == "" || currentAv == "" || av > currentAv)) return;

    if ((nota !== "" && (editable || force) && (!valorNotaActual || force))) {
      updateElementValue(select, valor);
      if (input) updateElementValue(input, nota);
    }
  }

  /**
   * Aplica la nota a un RA específic.
   */
  function aplicarNotaRA(select, valor, force, editable, currentAv, av, comment, validationText) {
    if (av === "") return;
    const optionExists = Array.from(select.options).some(option => option.value === valor);
    const tieneConv = comment?.includes(validationText);

    if ((optionExists && (editable || force))) {
      if ((av > currentAv && valor != VALUES.IN_PROCESS) && !tieneConv) {
        valor = VALUES.PENDING;
      }
      updateElementValue(select, valor);
    }
  }

  /**
   * Actualitza el valor d'un element DOM i dispara els esdeveniments de canvi.
   * @param {HTMLElement} element - L'element input o select.
   * @param {string} value - El nou valor.
   */
  function updateElementValue(element, value) {
    if (element.value !== value) {
      element.value = value;
      element.dispatchEvent(new Event("change"));
      element.dispatchEvent(new Event("input"));
    }
  }

  /**
   * Aplica els comentaris a la secció de comentaris generals.
   * @param {Array} notes - Array de notes.
   * @param {string} av - Avaluació actual.
   * @param {boolean} autoCloseComment - Indicador de tancament automàtic.
   */
  async function aplicarComentaris(notes, av, autoCloseComment, validationText) {
    console.group("Aplicant Comentaris");

    const comentarios = notes
      .filter(entry =>
        ((entry.av == av || entry.nota == 'P') && entry.comment?.trim() && !entry.comment?.includes(validationText)) ||
        (entry.comment?.includes(validationText) && entry.ra === 'T')
      )
      .map(
        entry => {
          const raText = entry.ra === 'T' ? '' : ` ${entry.ra}`;
          return `Mòdul ${entry.mod}${raText}: ${entry.comment}`;
        }
      )
      .join("\n");

    if (!comentarios) {
      console.log("No hi ha comentaris per aplicar.");
      console.groupEnd();
      return;
    }

    let showCommentsModal = document.querySelector(SELECTORS.COMMENTS_MODAL_TRIGGER);
    if (showCommentsModal) {
      console.log("Obrint modal de comentaris...");
      showCommentsModal.click();
    } else {
      console.warn("No s'ha trobat el botó per obrir comentaris.");
    }

    // Wait a bit for modal to open
    await delay(DELAY_MS);

    let textarea = document.querySelector(SELECTORS.COMMENTS_TEXTAREA);
    if (textarea) {
      console.log("Escrivint comentaris...");
      textarea.value = comentarios;
      textarea.dispatchEvent(new Event("change"));
    } else {
      console.warn("No s'ha trobat el textarea dels comentaris.");
    }

    await delay(DELAY_MS);

    if (autoCloseComment) {
      const saveBtn = document.querySelector(SELECTORS.SAVE_COMMENT_BTN);
      if (saveBtn) {
        console.log("Guardant i tancant comentaris...");
        saveBtn.click();
      }
    }
    console.groupEnd();
  }

  function cerrarAlumnes() {
    console.log(`${LOG_PREFIX} Tancant alumnes (no implementat)`);
    // Por implementar
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}