import mustache from "./mustache.js";
import DOMPurify from "./purify.es.js";
import html2canvas from "./html2canvas.esm.js";

const CLIENT_ID = "982296921783-eqg8jqgjsvvm8ph1bg69jbnjk78vle7g.apps.googleusercontent.com";
const APP_ID = "982296921783";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const pickers = document.getElementsByClassName("picker");
let accessToken;
let pendingAction;
let pendingActionArgs = [];
const frame = document.getElementById("frame");
const buttonExport = document.getElementById("export");
const buttonPickTemplate = document.getElementById("template-picker");
const buttonPickSpreadsheet = document.getElementById("spreadsheet-picker");

gapi.load("picker", onPickerApiLoad);
function onPickerApiLoad() {
    for (let picker of pickers) picker.disabled = false;
}
function tokenClientCallback(response) {
    if (response.error !== undefined) {
        throw (response);
    }
    accessToken = response.access_token;
    pendingAction(...pendingActionArgs);
}
const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: tokenClientCallback,
});

window.DOMPurify = DOMPurify;
window.html2canvas = html2canvas;
const jsPDF = window.jspdf.jsPDF;

let template;
let rendered;
const data = {name: "Christopher LaBauve"};

function setTemplate(t) {
    template = t;
    rendered = mustache.render(template, data);
    frame.srcdoc = rendered;
    buttonExport.disabled = false;
}

function callApi(xhr, payload, success, retry, retryArgs = []) {
    if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
        xhr.onreadystatechange = function(e) {
            if (xhr.readyState === 4 && xhr.status === 200) {
                success();
            } else if (xhr.readyState === 4 && xhr.status === 401) {
                pendingAction = retry;
                pendingActionArgs = retryArgs;
                tokenClient.requestAccessToken();
            }
        }
        xhr.send(payload);
    } else {
        pendingAction = retry;
        pendingActionArgs = retryArgs;
        tokenClient.requestAccessToken();
    }
}

function tryExport() {
    const doc = new jsPDF();
    doc.html(rendered, {
        callback: function (doc) {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://www.googleapis.com/upload/drive/v3/files?uploadType=media`, true);
            xhr.setRequestHeader("Content-Type", "application/pdf");
            callApi(xhr, doc.output("blob"), () => alert("Done!"), tryExport);
        },
        x: 10,
        y: 10
    });
}

function tryReadFile(fileId, success) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, true);
    callApi(xhr, null, () => success(xhr.responseText), tryReadFile, arguments);
}

// A simple callback implementation.
function pickerCallback(data) {
    if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
        let doc = data[google.picker.Response.DOCUMENTS][0];
        tryReadFile(doc[google.picker.Document.ID], setTemplate);
    }
}

function showPicker() {
    const picker = new google.picker.PickerBuilder()
          .addView(new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes("text/html"))
          .setOAuthToken(accessToken)
          .setAppId(APP_ID)
          .setCallback(pickerCallback)
          .build();
    picker.setVisible(true);
}

function tryPicker() {
    pendingAction = showPicker;
    tokenClient.requestAccessToken();
}

buttonExport.onclick = tryExport;
buttonPickTemplate.onclick = tryPicker;
//buttonPickSpreadsheet.onclick = tryPicker;
