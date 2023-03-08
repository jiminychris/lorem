import mustache from "./mustache.js";
import DOMPurify from "./purify.es.js";
import html2canvas from "./html2canvas.esm.js";
import { parse } from "./csv-parse.js";

const USE_LOCAL_STORAGE = false;
const CLIENT_ID = "982296921783-eqg8jqgjsvvm8ph1bg69jbnjk78vle7g.apps.googleusercontent.com";
const APP_ID = "982296921783";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TEMPLATE_FILE_ID = "1swinIhPd5SQorMGfDRSacra_i4Z98gcH";
const pickers = document.getElementsByClassName("picker");
const renders = document.getElementsByClassName("render");
let accessToken;
let pendingActions = [];
const frame = document.getElementById("frame");
const divSplash = document.getElementById("splash");
const divMain = document.getElementById("main");
const buttonLogin = document.getElementById("login");
const buttonSave = document.getElementById("save");
const buttonExport = document.getElementById("export");
const buttonPickTemplate = document.getElementById("template-picker");
const buttonChooseMatrixConnectionApplication = document.getElementById("choose-matrix-connection-application");
const buttonChooseMyHealthStory = document.getElementById("choose-my-health-story");
const buttonToggle = document.getElementById("toggle");
const buttonReload = document.getElementById("reload");
const buttonChooseData = document.getElementById("choose-data");
const textAreaRawDataDisplay = document.getElementById("raw-data-display");
const textAreaDataDisplay = document.getElementById("data-display");
const inputPreparer = document.getElementById("preparer");
const ulHistory = document.getElementById("history");
let isPendingAccessToken = false;
let renderWithData = true;

function requestAccessToken(callback, args) {
    pendingActions.push({callback,args});
    if (!isPendingAccessToken) {
        isPendingAccessToken = true;
        tokenClient.requestAccessToken();
    }
}

gapi.load("picker", onPickerApiLoad);
function onPickerApiLoad() {
    for (let picker of pickers) picker.disabled = false;
}

function tokenClientCallback(response) {
    isPendingAccessToken = false;
    if (response.error !== undefined) {
        throw (response);
    }
    accessToken = response.access_token;
    while (pendingActions.length > 0) {
        const action = pendingActions.pop();
        action.callback(...action.args);
    }
}

const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: tokenClientCallback,
    prompt: "",
});

window.DOMPurify = DOMPurify;
window.html2canvas = html2canvas;
const jsPDF = window.jspdf.jsPDF;

let template;
let rawData;
let data;
let rendered;
let matrixConnectionApplicationData;
let myHealthStoryData;

function tryRender() {
    if (template && data) {
        if (renderWithData) {
            rendered = mustache.render(template, data);
        } else {
            rendered = template;
        }
        frame.srcdoc = rendered;
        for (let render of renders) render.disabled = false;
    }
}

function setTemplate(contents) {
    template = contents;
    tryRender();
}

function setData(contents) {
    rawData = contents;
    const now = new Date();
    const meta = {
        preparer: inputPreparer.value,
        today: `${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()}`,
    };
    textAreaRawDataDisplay.value = JSON.stringify(rawData, undefined, 4);
    data = loremTransform(rawData, meta);
    textAreaDataDisplay.value = JSON.stringify(data, undefined, 4);
    tryRender();
}

function trySetData() {
    if (matrixConnectionApplicationData && myHealthStoryData) {
        setData({
            ...matrixConnectionApplicationData,
            ...myHealthStoryData,
        });
    }
}

function setMatrixConnectionApplicationData(contents) {
    matrixConnectionApplicationData = contents;
    trySetData();
}

function setMyHealthStoryData(contents) {
    myHealthStoryData = contents;
    trySetData();
}

function onExportComplete(xhr) {
    const listItem = document.createElement("li");
    const now = new Date();
    const timestamp = now.toString();
    listItem.innerHTML = `${timestamp} <a href="https://drive.google.com/file/d/${xhr.response.id}/view">Export Complete.</a>`
    ulHistory.appendChild(listItem);
}

function callApi(xhr, payload, success, retry, retryArgs = []) {
    if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        xhr.onreadystatechange = function(e) {
            if (xhr.readyState === 4 && xhr.status === 200) {
                success(xhr);
            } else if (xhr.readyState === 4 && xhr.status === 401) {
                requestAccessToken(retry, retryArgs);
            }
        }
        xhr.send(payload);
    } else {
        requestAccessToken(retry, retryArgs);
    }
}

function onPdfRenderedUpload(doc) {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://www.googleapis.com/upload/drive/v3/files?uploadType=media`, true);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.responseType = "json";
    callApi(xhr, doc.output("blob"), onExportComplete, tryExport);
}

function onPdfRenderedSave(doc) {
    doc.save();
}

function renderPdf(callback) {
    const doc = new jsPDF({
        format: "letter",
    });
    html2canvas(frame.contentWindow.document.body, {
        scale: 1
    }).then(canvas => {
        doc.addImage(canvas, "JPEG", 0, 0);
        callback(doc);
    });
}

function tryExport() {
    renderPdf(onPdfRenderedUpload);
}

function trySave() {
    renderPdf(onPdfRenderedSave);
}

function tryGetFile(fileId, success, action, responseType="") {
    const xhr = new XMLHttpRequest();
    xhr.responseType = responseType;
    xhr.open("GET", `https://www.googleapis.com/drive/v3/files/${fileId}${action}`, true);
    callApi(xhr, null, () => success(xhr), tryGetFile, arguments);
}

function tryReadFile(fileId, success, responseType="") {
    tryGetFile(fileId, success, "?alt=media", responseType);
}

function tryExportFile(fileId, success, mimeType) {
    tryGetFile(fileId, success, `/export?mimeType=${mimeType}`);
}

function downloadSpreadsheet(id, mimeType) {
    switch (mimeType) {
        case "application/vnd.google-apps.spreadsheet": {
            tryExportFile(id, parseSpreadsheet, "text/csv");
        } break;

        case "application/vnd.ms-excel":
        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
            tryReadFile(id, parseSpreadsheet, "arraybuffer");
        } break;
    }
}

function onSpreadsheetChosen(data, prefix) {
    if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
        let doc = data[google.picker.Response.DOCUMENTS][0];
        const id = doc[google.picker.Document.ID];
        const mimeType = doc[google.picker.Document.MIME_TYPE];
        localStorage.setItem(`${prefix}.id`, id);
        localStorage.setItem(`${prefix}.mimeType`, mimeType);
        downloadSpreadsheet(id, mimeType);
    }
}

function onMatrixConnectionApplicationChosen(data) {
    onSpreadsheetChosen(data, "matrixConnectionApplication");
}

function onMyHealthStoryChosen(data) {
    onSpreadsheetChosen(data, "myHealthStory");
}

const FORMS = {
    "My Health Story": {
        groups: {
            "EMERGENCY CONTACT": 6,
        },
        ignores: [
            "PERSONAL INFORMATION",
            "Contact information",
            "General Statistics",
            "Specific mental health questions",
            "GYNECOLOGICAL TESTING",
            "MENSTRUAL HISTORY",
            "OCCUPATION",
        ]
    },
    "Matrix Connection Application": {
        groups: {},
        ignores: [
            "Personal Information",
            "Contact information",
            "BOWELS",
            "SLEEP",
            "STRESS FACTORS",
            "ADDICTIVE SUBSTANCES",
        ]
    }
};

// TODO(chris): Do all this in the "platform-specific" code.
function extractData(formType, rows) {
    const result = {};
    let groupedKeysRemaining = 0;
    let group = result;
    let list;
    let table;
    let previousKey;
    const form = FORMS[formType];
    for (let rowIndex = 0; rowIndex < rows.length; ++rowIndex) {
        const row = rows[rowIndex];
        if (row.every(x => !x)) {
            list = table = undefined;
        } else if (list) {
            if (list.columns) {
                const record = {};
                list.group[list.key].push(record);
                for (let columnIndex = 0; columnIndex < list.columns.length; ++columnIndex) {
                    record[list.columns[columnIndex]] = row[4 + columnIndex];
                }
            } else {
                list.group[list.key].push(row[4]);
            }
        } else if (table) {
            const record = table.group[table.key][row[3]] = {};
            for (let columnIndex = 0; columnIndex < table.columns.length; ++columnIndex) {
                record[table.columns[columnIndex]] = row[4 + columnIndex];
            }
        } else {
            const key = row[0];
            const keyUpper = key.toUpperCase();
            if (form.ignores.includes(key)) {
            } else if (Object.keys(form.groups).includes(key)) {
                group = {};
                result[key] = group;
                groupedKeysRemaining = form.groups[key];
            } else {
                const value = row[1];
                if (value === "Go to column D") {
                    if (row.slice(2).every(x => !x)) {
                        list = {
                            group,
                            key,
                        };
                        group[key] = [];
                        groupedKeysRemaining--;
                    } else if (rowIndex + 1 < rows.length && rows[rowIndex + 1][3]) {
                        if (!row[4]) row[4] = "applicable";
                        table = {
                            group,
                            key,
                            columns: row.slice(4).filter(x => x),
                        };
                        group[key] = {};
                        groupedKeysRemaining--;
                    } else {
                        list = {
                            group,
                            key,
                            columns: row.slice(4).filter(x => x),
                        };
                        group[key] = [];
                        groupedKeysRemaining--;
                    }
                } else if (keyUpper.startsWith("IF YES,") || keyUpper.startsWith("IF NO,")) {
                    group[previousKey] = {
                        yesno: group[previousKey],
                        [key]: value
                    };
                } else {
                    group[key] = value;
                    groupedKeysRemaining--;
                }
                previousKey = key;
            }
        }
        if (groupedKeysRemaining <= 0) {
            group = result;
            groupedKeysRemaining = 0;
        }
    }
    return result;
}
    
function parseSpreadsheet(xhr) {
    switch (xhr.responseType) {
        case "":
        case "text": {
            const result = {};
            const rows = parse(xhr.responseText);
            for (let row of rows) result[row[0]] = row[1];
            setData(result);
        } break;

        case "arraybuffer": {
            const workbook = XLSX.read(xhr.response);
            const formInformation = workbook.Sheets[workbook.SheetNames[0]];
            const formInformationRows = parse(XLSX.utils.sheet_to_csv(formInformation));
            const type = formInformationRows[0][1];
            const worksheet = workbook.Sheets[workbook.SheetNames[1]];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            const rows = parse(csv);
            const extracted = extractData(type, rows);
            switch (type) {
                case "Matrix Connection Application": {
                    setMatrixConnectionApplicationData(extracted);
                } break;
                
                case "My Health Story": {
                    setMyHealthStoryData(extracted);
                } break;
            }
        } break;
    }
}

function showPicker(builder) {
    const picker = builder.setOAuthToken(accessToken)
        .setAppId(APP_ID)
        .build();
    picker.setVisible(true);
}

function tryPickFile(builder) {
    requestAccessToken(showPicker, [builder]);
}

function chooseSpreadsheet(callback) {
    const builder = new google.picker.PickerBuilder()
          .addView(new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes("application/vnd.google-apps.spreadsheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
          .setCallback(callback);
    tryPickFile(builder);
}

function onDataChosen(data) {
    if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
        let doc = data[google.picker.Response.DOCUMENTS][0];
        const id = doc[google.picker.Document.ID];
        localStorage.setItem("data.id", id);
        tryReadFile(id, onDataLoaded);
    }
}

function chooseData() {
    const builder = new google.picker.PickerBuilder()
          .addView(new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes("application/json"))
          .setCallback(onDataChosen);
    tryPickFile(builder);
}

function chooseMatrixConnectionApplication() {
    chooseSpreadsheet(onMatrixConnectionApplicationChosen);
}

function chooseMyHealthStory() {
    chooseSpreadsheet(onMyHealthStoryChosen);
}

function onTemplateLoaded(xhr) {
    divSplash.hidden = true;
    divMain.hidden = false;
    setTemplate(xhr.responseText);
}

function onDataLoaded(xhr) {
    setData(JSON.parse(xhr.responseText));
}

function loadTestResource(path, success, responseType = "") {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", ["test", path].join("/"), true);
    xhr.responseType = responseType;
    xhr.onreadystatechange = function(e) {
        if (xhr.readyState === 4 && xhr.status === 200) {
            success(xhr);
        }
    }
    xhr.send();
}

function readLocalStorage(key) {
    if (USE_LOCAL_STORAGE) {
        return localStorage.getItem(key);
    }
    return null;
}

function load() {
    if (location.hostname === "localhost" && location.hash === "#test") {
        loadTestResource("template.html", onTemplateLoaded);
        loadTestResource("data.json", onDataLoaded);
    } else if (location.hostname === "localhost" && location.hash === "#test-import") {
        loadTestResource("template.html", onTemplateLoaded);
        loadTestResource("20220510_Danielle LaBauve_Form_Matrix Connection Application.xlsx", parseSpreadsheet, "arraybuffer")
        loadTestResource("20220526_Danielle LaBauve_Form_My Health Story.xlsx", parseSpreadsheet, "arraybuffer")
    } else {
        tryReadFile(TEMPLATE_FILE_ID, onTemplateLoaded);

        const dataId = readLocalStorage("data.id");
        if (dataId) {
            tryReadFile(dataId, onDataLoaded);
        }
        /*
        const spreadsheets = ["matrixConnectionApplication", "myHealthStory"];
        for (let spreadsheet of spreadsheets) {
            const spreadsheetId = readLocalStorage(`${spreadsheet}.id`);
            const spreadsheetMimeType = readLocalStorage(`${spreadsheet}.mimeType`);
            if (spreadsheetId && spreadsheetMimeType) {
                downloadSpreadsheet(spreadsheetId, spreadsheetMimeType);
            }
        }
        */
    }
}

function login() {
    const preparerName = inputPreparer.value;
    if (preparerName) {
        localStorage.setItem("preparerName", preparerName);
        buttonLogin.disabled = true;
        load();
    }
}

function toggleRenderWithData() {
    renderWithData = !renderWithData;
    tryRender();
}

function onPreparerInput() {
    buttonLogin.disabled = !inputPreparer.value;
}

buttonLogin.onclick = login;
buttonExport.onclick = tryExport;
buttonReload.onclick = load;
buttonSave.onclick = trySave;
buttonToggle.onclick = toggleRenderWithData;
//buttonPickTemplate.onclick = tryPicker;
buttonChooseMatrixConnectionApplication.onclick = chooseMatrixConnectionApplication;
buttonChooseMyHealthStory.onclick = chooseMyHealthStory;
buttonChooseData.onclick = chooseData;
inputPreparer.oninput = onPreparerInput;

inputPreparer.value = readLocalStorage("preparerName");
onPreparerInput();
