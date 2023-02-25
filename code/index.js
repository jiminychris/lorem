import mustache from "./mustache.js";
import DOMPurify from "./purify.es.js";
import html2canvas from "./html2canvas.esm.js";

window.DOMPurify = DOMPurify;
window.html2canvas = html2canvas;
const jsPDF = window.jspdf.jsPDF;

const template = "<html><body><p>Hello, {{name}}!</p></body></html>";
const data = {name: "Chris"};
const rendered = mustache.render(template, data);

const CLIENT_ID = "982296921783-eqg8jqgjsvvm8ph1bg69jbnjk78vle7g.apps.googleusercontent.com";
const REDIRECT_URI = location.hostname === "localhost" ? "http://localhost:8000" : "http://jiminychris.com/lorem";

var fragmentString = location.hash.substring(1);

const params = new URLSearchParams(fragmentString);
history.replaceState(null, "", window.location.pathname + window.location.search);
if (params.has("access_token")) {
    localStorage.setItem("access_token", params.get("access_token"));
}
if (params.has("state")) {
    const state = params.get("state");
    const parts = state.split(":");
    if (parts.length == 2) {
        const operation = parts[0];
        const nonce = parts[1];
        if (nonce === sessionStorage.getItem("nonce")) {
            sessionStorage.removeItem("nonce");
            switch (operation) {
                case "export": {
                    tryExport();
                } break;
            }
        }
    } else {
        console.error(`Expected state to be of the format '<operation>:<nonce>'. Got ${state}.`);
    }
}

// If there's an access token, try an API request.
// Otherwise, start OAuth 2.0 flow.
function tryExport() {
    const doc = new jsPDF();
    doc.html(rendered, {
        callback: function (doc) {
            const accessToken = localStorage.getItem("access_token");
            if (accessToken) {
                var xhr = new XMLHttpRequest();
                const pdfBlob = doc.output("blob");
                const pdfUrl = URL.createObjectURL(pdfBlob);
                xhr.open("POST", `https://www.googleapis.com/upload/drive/v3/files?uploadType=media&access_token=${accessToken}`, true);
                xhr.setRequestHeader("Content-Type", "application/pdf");
                xhr.onreadystatechange = function(e) {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        alert("Done!");
                    } else if (xhr.readyState === 4 && xhr.status === 401) {
                        oauth2SignIn("export");
                    }
                }
                xhr.send(pdfBlob);
            } else {
                oauth2SignIn("export");
            }
        },
        x: 10,
        y: 10
    });
}

/*
 * Create form to request access token from Google's OAuth 2.0 server.
 */
function oauth2SignIn(operation) {
    // Google's OAuth 2.0 endpoint for requesting an access token
    var oauth2Endpoint = "https://accounts.google.com/o/oauth2/v2/auth";

    // Create element to open OAuth 2.0 endpoint in new window.
    var form = document.createElement("form");
    form.setAttribute("method", "GET"); // Send as a GET request.
    form.setAttribute("action", oauth2Endpoint);

    const nonce = btoa(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem("nonce", nonce);

    // Parameters to pass to OAuth 2.0 endpoint.
    var params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": "https://www.googleapis.com/auth/drive.file",
        "state": `${operation}:${nonce}`,
        "include_granted_scopes": "true",
        "response_type": "token"
    };

    // Add form parameters as hidden input values.
    for (var p in params) {
        var input = document.createElement("input");
        input.setAttribute("type", "hidden");
        input.setAttribute("name", p);
        input.setAttribute("value", params[p]);
        form.appendChild(input);
    }

    // Add form to page and submit it to open the OAuth 2.0 endpoint.
    document.body.appendChild(form);
    form.submit();
}

const frame = document.getElementById("frame");
const buttonExport = document.getElementById("export");
frame.srcdoc = rendered;
buttonExport.onclick = tryExport;
