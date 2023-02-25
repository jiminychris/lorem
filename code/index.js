import mustache from "./mustache.js";
import DOMPurify from "./purify.es.js";
import html2canvas from "./html2canvas.esm.js";

window.DOMPurify = DOMPurify;
window.html2canvas = html2canvas;
const jsPDF = window.jspdf.jsPDF;

const template = "<html><body><p>Hello, {{name}}!</p></body></html>";
const data = {name: "Chris"};
const rendered = mustache.render(template, data);

async function exportPDF() {
    const doc = new jsPDF();
    doc.html(rendered, {
	callback: function (doc) {
            const pdfBlob = doc.output("blob");
	    const pdfUrl = URL.createObjectURL(pdfBlob);
	    const oauthRequest = new XMLHttpRequest();
	    oauthRequest.open("GET", "https://accounts.google.com/o/oauth2/v2/auth?client_id=982296921783-eqg8jqgjsvvm8ph1bg69jbnjk78vle7g.apps.googleusercontent.com&redirect_uri=http://localhost:8000&response_type=token&scope=https://www.googleapis.com/auth/drive.file", true);
	    oauthRequest.send(null);
	    oauthRequest.onreadystatechange = function() {
		const request = new XMLHttpRequest();
		request.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=media&key=AIzaSyAzPD3fES78OQKeTyfLdbSG3AdzEq2zDPw", true);
		request.setRequestHeader("Content-Type", "application/pdf");
		request.send(pdfBlob);
		request.onreadystatechange = function() {
		    if (request.readyState == 4 && request.status == 200) {
			alert("Done!");
		    }
		}
	    }
	},
	x: 10,
	y: 10
    });
}

const frame = document.getElementById("frame");
const buttonExport = document.getElementById("export");
frame.srcdoc = rendered;
buttonExport.onclick = exportPDF;
