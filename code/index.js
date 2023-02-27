import mustache from "./mustache.js";
import DOMPurify from "./purify.es.js";
import html2canvas from "./html2canvas.esm.js";

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
const buttonPickSpreadsheet = document.getElementById("spreadsheet-picker");
const buttonReload = document.getElementById("reload");
const ulHistory = document.getElementById("history");
let isPendingAccessToken = false;

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
let rendered;
let data;

function tryRender() {
    if (template && data) {
        rendered = mustache.render(template, data);
        frame.srcdoc = rendered;
        for (let render of renders) render.disabled = false;
    }
}

function setTemplate(contents) {
    template = contents;
    tryRender();
}

function setSpreadsheet(contents) {
    const rows = contents.split("\n");
    data = {};
    for (let row of rows) {
        const columns = row.split(",");
        data[columns[0]] = columns[1];
    }
    tryRender();
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

function tryGetFile(fileId, success, action) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://www.googleapis.com/drive/v3/files/${fileId}${action}`, true);
    callApi(xhr, null, () => success(xhr.responseText), tryGetFile, arguments);
}

function tryReadFile(fileId, success) {
    tryGetFile(fileId, success, "?alt=media");
}

function tryExportFile(fileId, success, mimeType) {
    tryGetFile(fileId, success, `/export?mimeType=${mimeType}`);
}

function onSpreadsheetPicked(data) {
    if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
        let doc = data[google.picker.Response.DOCUMENTS][0];
        localStorage.setItem("spreadsheetId", doc[google.picker.Document.ID]);
        tryExportFile(doc[google.picker.Document.ID], setSpreadsheet, "text/csv");
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

function tryPickSpreadsheet() {
    const builder = new google.picker.PickerBuilder()
          .addView(new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes("application/vnd.google-apps.spreadsheet"))
          .setCallback(onSpreadsheetPicked);
    tryPickFile(builder);
}

function onTemplateLoaded(contents) {
    divSplash.hidden = true;
    divMain.hidden = false;
    setTemplate(contents);
}

function load() {
    tryReadFile(TEMPLATE_FILE_ID, onTemplateLoaded);
    const spreadsheetId = localStorage.getItem("spreadsheetId");
    if (spreadsheetId) {
        tryExportFile(spreadsheetId, setSpreadsheet, "text/csv");
    }
}

function login() {
    buttonLogin.disabled = true;
    load();
}

buttonLogin.onclick = login;
buttonExport.onclick = tryExport;
buttonReload.onclick = load;
buttonSave.onclick = trySave;
//buttonPickTemplate.onclick = tryPicker;
buttonPickSpreadsheet.onclick = tryPickSpreadsheet;
